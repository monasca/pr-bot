// (C) Copyright 2017-2018 Hewlett Packard Enterprise Development LP
//
// Licensed under the Apache License, Version 2.0 (the "License"); you may
// not use this file except in compliance with the License. You may obtain
// a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
// WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
// License for the specific language governing permissions and limitations
// under the License.

// @flow

import * as config from '../config';
import * as datastore from '../datastore';
import * as queue from '../queue';

import { HttpError, Dispatcher, sanitizeRepository } from './common';

import AddRepositoryTask from '../task/add-repository';
import Module from '../module';
import Repository from '../repository/repository';
import Task from '../task/task';
import UpdateCheckTask from '../task/update-check';

import type { $Request, $Response } from 'express';

const dispatcher = new Dispatcher();

dispatcher.on('getRepository', (req: $Request) => {
  const name: string = req.body.name;
  return datastore.get().get(Repository, name);
});

dispatcher.on('listRepositories', async (_req: $Request) => {
  const repos = await datastore.get().list(Repository);
  await Promise.all(repos.map(repo => repo.settle()));

  return repos.map(r => r.dump());
});

dispatcher.on('getRepositoryByRemote', async (req: $Request) => {
  const remote: string = req.body.remote;
  const repos: Repository[] = await datastore.get().list(Repository);

  return repos.find(r => r.providesRemote(remote));
});

dispatcher.on('listDependents', async (req: $Request) => {
  // TODO: optimize me
  const { repoName, moduleName } = req.body;

  const ds = datastore.get();

  const repo: Repository = await ds.get(Repository, repoName);
  const mod = repo.getModule(moduleName);
  if (!mod) {
    throw new HttpError('unauthorized', 401);
  }
  
  const modules = await ds.list(Module);
  return modules.filter(m => m.dependsOn(repo, mod));
});

dispatcher.on('getModule', async (req: $Request) => {
  const id = req.body.id;
  const ds = datastore.get();

  return ds.get(Module, id);
});

dispatcher.on('addRepository', async (req: $Request) => {
  const { name, type, remote, parent, room } = req.body;
  const task = new AddRepositoryTask({
    data: { name, type, remote, parent, room }
  });

  await queue.get().enqueue(task);

  return {
    message: 'task has been created',
    taskId: task.id()
  };
});

dispatcher.on('removeRepository', async (req: $Request) => {
  // TODO: this should be a task
  const name = req.body.name;

  const ds = datastore.get();
  const repo = await ds.get(Repository, name);
  await repo.settle();

  await Promise.all(repo.modules.map(m => ds.delete(m)));
  await ds.delete(repo);

  return {
    'message': 'okay'
  };
});

dispatcher.on('softUpdateRepository', async (req: $Request) => {
  const name: string = req.body.name;
  const task = new UpdateCheckTask({
    data: { repositoryName: name }
  });

  await queue.get().enqueue(task);

  return {
    message: 'update task has been created',
    taskId: task.id()
  };
});

dispatcher.on('getTask', async (req: $Request) => {
  const taskId = req.body.id;

  const ds = datastore.get();
  const task = await ds.get(Task, taskId);

  return task;
});

dispatcher.on('retryTask', async (req: $Request) => {
  const taskId = req.body.id;
  const ds = datastore.get();
  const task = await ds.get(Task, taskId);
  if (!task) {
    throw new HttpError(`task not found with id=${taskId}`, 404);
  }

  if (task.retries <= 0) {
    task.retries = 1;
  }

  const clone = task.retry();
  if (!clone) {
    throw new HttpError(`could not retry task with id=${taskId}`, 500);
  }

  await clone.store();
  await queue.get().enqueue(clone);

  return {
    message: 'task has been rescheduled',
    previousId: taskId,
    taskId: clone.id()
  };
});

function verifyToken(req: $Request): void {
  const cfg = config.get();
  if (!cfg.tokens.find(t => t === req.body.token)) {
    throw new HttpError('unauthorized', 401);
  }
}

function sanitizeSingle(object) {
  if (object instanceof Repository) {
    return sanitizeRepository(object);
  } else if (typeof object.dump === 'function') {
    return object.dump();
  } else {
    return object;
  }
}

function sanitizeIfNecessary(object: any): any {
  if (Array.isArray(object)) {
    return Promise.all(object.map(sanitizeSingle));
  } else {
    return sanitizeSingle(object);
  }
}

export async function handle(req: $Request, _res: $Response): Promise<any> {
  // GCF doesn't seem to allow JSON bodies for GET, and doesn't give us
  // PATH_INFO ... so we'll have to handle everything in POST
  // so maybe it's less REST and more "httpie friendly", but whatever

  if (req.get('content-type') !== 'application/json') {
    throw new HttpError('content-type must be application/json', 406);
  }

  if (req.method !== 'POST') {
    throw new HttpError(`method not allowed: ${req.method}`, 405);
  }

  verifyToken(req);

  const action = req.body.action;
  const response = await dispatcher.handle(req, action);
  return sanitizeIfNecessary(response);
}

process.on('unhandledRejection', (reason) => {
  console.log('unhandled rejection!', reason.stack);
});

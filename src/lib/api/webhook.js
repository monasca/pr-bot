// (C) Copyright 2017 Hewlett Packard Enterprise Development LP
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

import crypto from 'crypto';

import * as config from '../config';
import * as datastore from '../datastore';
import * as queue from '../queue';

import PullRequest from '../pullrequest';
import PullRequestUpdateTask from '../task/pull-request-update';
import Repository from '../repository/repository';
import UpdateCheckTask from '../task/update-check';

import { HttpError, Dispatcher } from './common';

import type { $Request, $Response } from 'express';

import type { TemplateEnvironment } from '../template-util';

const dispatcher = new Dispatcher();

/**
 * Finds the configured GitHub block that verifies against this request's
 * secret. If no matching secret is found, an HttpError is raised.
 * @param {object} req the incoming request
 * @param {object} res the response object
 * @param {object} buf a Buffer containing the original request contents
 */
export function verifySecret(req: $Request, res: $Response, buf: Buffer) {
  const sig = req.get('X-Hub-Signature');
  if (!sig) {
    return;
  }

  // NOTE: does not work on GCF
  const cfg = config.get();
  
  let githubs = cfg.github;
  if (!Array.isArray(githubs)) {
    githubs = [githubs];
  }

  for (let gh of githubs) {
    const secret = gh.secret;
    if (!secret) {
      continue;
    }
    const digest = crypto.createHmac('sha1', secret)
        .update(buf)
        .digest('hex');

    if (sig === `sha1=${digest}`) {
      // $FlowFixMe: monkeypatching things a bit
      req.github = gh;
      return;
    }
  }

  throw new HttpError('unauthorized', 401);
}

function safeNotify(
      template: string,
      env: TemplateEnvironment,
      repo: Repository) {
  return repo.notifyTemplate(template, env).catch(err => {
    console.log('error sending notification: ', err);
  });
}

dispatcher.on('ping', (_req: $Request): Promise<string> => {
  return Promise.resolve('hello world');
});

dispatcher.on('push', (_req: $Request): Promise<void> => {
  // this may only be necessary if we want to support direct dependencies on
  // git repos at some point
  // right now we only depend on indirect artifacts e.g. github-pages, builds
  // uploaded to dockerhub, etc
  console.log('handlePush()');

  return Promise.resolve();
});

dispatcher.on('status', async (req: $Request): Promise<any> => {
  const parentRemote = req.body.repository.html_url;
  const parent = await Repository.getByRemote(parentRemote);
  if (!parent) {
    throw new HttpError(
      `no repository found with parent remote: ${parentRemote}`,
      500);
  }

  if (req.body.state === 'pending') {
    // don't care about pending (~= CI ack)
    return Promise.resolve();
  } else if (req.body.state === 'success') {
    // notify of the success regardless of branch (will apply to PRs)
    // note that we can't currently link back to PRs, see:
    // https://github.com/monasca/pr-bot/issues/8

    // TODO rethink status notifications per
    // https://github.com/monasca/pr-bot/issues/24

    // TODO include link to pull request in status env
    await safeNotify('status', { payload: req.body }, parent);

    const master = req.body.branches.find(b => b.name === 'master');
    if (master) {
      // run an update if the master branch was updated (i.e. only on
      // merges that build successfully)
      const repos = await Repository.listByParent(parent.name);
      const tasks = repos.map(repo => new UpdateCheckTask({
        data: { repositoryName: repo.name }
      }));

      await queue.get().enqueue(...tasks);

      return {
        message: `updates scheduled: ${tasks.length}`,
        repositories: repos.map(r => r.name),
        taskIds: tasks.map(t => t.id())
      };
    }
  } else {
    // failure or error... we'll treat both the same
    // no updates to do on our end, just notify about the failure
    // https://github.com/monasca/pr-bot/issues/24
    await safeNotify('status', { payload: req.body }, parent);
  }

  return {
    message: 'no updates scheduled',
    repositories: [],
    taskIds: []
  };

  // TODO: test this to figure out semantics for the 'branches' object
  // we only care about status updates on master
  // this function should work more or less the same as handlePageBuild
  // (we can treat this as the parent repository and only update children,
  // assuming that no CI/CD processes are making direct automatic commits to
  // master...)
  // this event should work for artifacts published from existing CI/CD infra
  // like travis ci (docker hub publishing from monasca-docker)
});

dispatcher.on('page_build', async (req: $Request): Promise<any> => {
  // page builds are supported for helm repositories, but incidentally come from
  // git-type repositories
  // we can support this relationship by assuming the git repository that
  // spawned this event is marked as the parent repository
  const status = req.body.build.status;
  if (status !== 'built') {
    console.log(
      `page_build did not succeed, skipping: ${req.body.repository.name}`);
    return Promise.resolve();
  }

  const parentRemote = req.body.repository.html_url;
  const parent = await Repository.getByRemote(parentRemote);
  if (!parent) {
    throw new HttpError(
      `no repository found with parent remote: ${parentRemote}`,
      500);
  }

  const repos = await Repository.listByParent(parent.name);
  const tasks = repos.map(repo => new UpdateCheckTask({
    data: { repositoryName: repo.name }
  }));

  await queue.get().enqueue(...tasks);

  return {
    message: `updates scheduled: ${tasks.length}`,
    repositories: repos.map(r => r.name),
    taskIds: tasks.map(t => t.id())
  };
});

dispatcher.on('pull_request', async (req: $Request): Promise<any> => {
  // TODO: maybe self-close PRs if another user posts a PR that manually
  // updates?

  if (req.body.action !== 'opened' || req.body.action !== 'synchronize') {
    // TODO: handle close events (delete our tracked PR)
    return;
  }

  const parentRemote = req.body.repository.html_url;
  const parent = await Repository.getByRemote(parentRemote);
  if (!parent) {
    throw new HttpError(
      `no repository found with parent remote: ${parentRemote}`,
      500);
  }

  const number: number = req.body.pull_request.number;

  const ds = datastore.get();

  let pr: PullRequest;
  try {
    pr = await ds.first(PullRequest, [
      { f: 'repository', op: '=', val: parent.name },
      { f: 'number', op: '=', val: number }
    ]);
    console.debug(`found existing pr: ${parent.name}#${number}`);

    const sha = req.body.pull_request.head.sha;
    if (pr.commits.includes(sha)) {
      return { message: 'already up to date' };
    }

    pr.commits.push(sha);
    await pr.store();

    return { message: `saved commit ${sha} to pr ${parent.name}#${number}` };
  } catch (err) {
    console.log(`new pr: ${parent.name}#${number}`);
    pr = new PullRequest({
      repository: parent.name,
      number: number
    });

    await pr.store();

    const task = new PullRequestUpdateTask({
      data: { repositoryName: parent.name, pullRequestNumber: number }
    });

    await queue.get().enqueue(task);

    return {
      message: `tracking new pull request ${parent.name}#${number}`,
      taskId: task.id()
    };
  }
});

dispatcher.on('pull_request_review', async (_req: $Request): Promise<any> => {
  // TODO
  return Promise.resolve();
});

dispatcher.on('pull_request_review_comment', async (_req: $Request): Promise<any> => {
  // TODO
  return Promise.resolve();
});

// eslint-disable-next-line no-unused-vars
export function handle(req: $Request, res: $Response) {
  if (req.get('content-type') !== 'application/json') {
    throw new HttpError('content-type must be application/json', 406);
  }

  if (req.method !== 'POST') {
    throw new HttpError('method not allowed', 405);
  }

  // TODO: it isn't currently possible to get the raw request body in GCF, so
  // we can't reliably verify the request
  // workaround is to use a random endpoint name for now
  // see also: https://issuetracker.google.com/issues/36252545
  //const gh = verifySecret(req);
  const event = req.get('X-GitHub-Event');
  console.log('event:', event);
  console.log('payload:', req.body);

  if (!event) {
    throw new HttpError('an event type is required', 400);
  }

  return dispatcher.handle(req, event);
}

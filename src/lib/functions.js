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

import * as datastore from './datastore';
import * as mutation from './mutation';
import * as queue from './queue';
import * as repository from './repository';

import AddRepositoryTask from './task/add-repository';
import { ExtendableError } from './util';
import Module from './module';
import Repository from './repository/repository';
import Task from './task/task';
import Update from './update';

import type { AddRepositoryData } from './task/add-repository';

class PRBotError extends ExtendableError {
  constructor(m) {
    super(m);
  }
}

export async function addRepository(options: AddRepositoryData): Promise<any> {
  const { name, type, remote, parent, room } = options;
  const task = new AddRepositoryTask({
    data: { name, type, remote, parent, room }
  });

  await queue.get().enqueue(task);

  return {
    message: 'task has been created',
    taskId: task.id()
  };
}

export function sanitizeRepository(repo: Repository) {
  return repo.settle().then(settled => ({
    repository: settled.dump(),
    modules: settled.modules.map(m => m.dump())
  }));
}

export function getRepository(name: string): Promise<Repository> {
  const ds = datastore.get();

  return ds.get(Repository, name);
}

export function removeRepository(name: string): Promise<any> {
  const ds = datastore.get();

  return ds.get(Repository, name)
      .then(repo => repo.settle())
      .then(repo => {
        return Promise.all(repo.modules.map(m => ds.delete(m))).then(() => {
          return ds.delete(repo);
        });
      });
}

export function listRepositories(): Promise<Repository[]> {
  const ds = datastore.get();

  return ds.list(Repository).then(repos => {
    return Promise.all(repos.map(r => r.settle()));
  });
}

export async function getRepositoryByRemote(
      remote: string): Promise<?Repository> {
  const ds = datastore.get();

  return ds.list(Repository).then(repos => {
    return repos.find(r => r.providesRemote(remote));
  });
}

export function getRepositoriesByParent(
      parentName: string): Promise<Repository[]> {
  const ds = datastore.get();

  return ds.list(Repository, [
    { f: 'parent', op: '=', val: parentName }
  ]);
}

export async function listDependents(
      repoName: string,
      moduleName: string): Promise<Module[]> {
  const ds = datastore.get();

  let repoPromise: Promise<Repository>;
  if (repoName instanceof Repository) {
    repoPromise = Promise.resolve(repoName);
  } else {
    repoPromise = ds.get(Repository, repoName);
  }

  if (moduleName instanceof Module) {
    moduleName = moduleName.name;
  }

  const repo = await repoPromise;
  await repo.settle();

  const mod = repo.modules.find(m => m.name === moduleName);
  if (!mod) {
    throw new PRBotError(`Module not found: ${repoName} - ${moduleName}`);
  }

  const mods = await ds.list(Module);
  return mods.filter(m => m.dependsOn(repo, mod));
}

export async function updateDependents(
      repo: Repository,
      moduleName: string,
      toVersion: string): Promise<Update<any>[]> {
  const mod = repo.getModule(moduleName);
  if (!mod) {
    throw new PRBotError(
      `module not found: repo=${repo.name} module=${moduleName}`);
  }

  const moduleType = mod.type;

  const dependents: Module[] = await listDependents(repo.name, moduleName);
  console.log('dependents:', dependents, repo.name, moduleName, moduleType);

  const updates = [];
  for (let dependent of dependents) {
    const dependency = dependent.getDependency(moduleName, moduleType);
    if (!dependency) {
      console.warn(`dependent lacks dependency, skipping: ${dependent.name}`);
      continue;
    }

    if (dependency.version === toVersion) {
      continue;
    }

    const update = new Update({
      srcRepository: repo.name,
      srcModule: moduleName,
      destRepository: dependent.repository,
      destModule: dependent.name,
      fromVersion: dependency.version,
      toVersion: toVersion,
      _meta: {}
    });

    console.log('update: ', update);
    updates.push(update);
  }

  return updates;
}

/**
 * Performs a soft update of the repository with the given name.
 * 
 * A soft update will only affect modules that depend on changes that were
 * detected (as compared to our known versions) in this update cycle. Modules
 * that are already out of date (e.g. were out of date when the repository was
 * first added) will not be updated by this function.
 * 
 * @param {string} name 
 */
export async function softUpdateRepository(name: string): Promise<any> {
  const ds = datastore.get();
  const repo = await ds.get(Repository, name);

  return repo.settle().then(repo => repo.settle()).then(repo => {
    // TODO: make sure newly added modules are handled correctly (or at all...)

    // changes in module dependencies don't result in any updates, but we still
    // need to keep track of them
    const ddiffPromise = repo.diffDependencies();

    // changes to (current) module versions should trigger updates to dependent
    // modules
    const vdiffPromise = repo.diffVersions();

    return Promise.all([ddiffPromise, vdiffPromise]).then(diffs => {
      const [ ddiff, vdiff ] = diffs;
      repo.applyModulePatches(ddiff);
      repo.applyModulePatches(vdiff);
      const storePromise = repo.store();

      console.log('version changes detected:', vdiff);

      const updates = [];
      for (let changed of vdiff) {
        // we only care if the 'current' version changes
        // usually that happens implicitly (e.g. in  helm), but if not we should
        // honor the field in case there is some release strategy and/or beta
        // versions
        const current = changed.patches.find(p => {
          return p.op === 'replace' && p.path === '/current';
        });

        if (current) {
          updates.push(updateDependents(repo, changed.name, current.value));
        }
      }

      console.log(`generated ${updates.length} updates`);

      return storePromise.then(() => Promise.all(updates)).then(nested => {
        return [].concat(...nested);
      });
    });
  }).then(updates => {
    console.log(`applying ${updates.length} updates`);
    const promises = [];

    for (let update of updates) {
      promises.push(update.dsLoad().then(update => {
        return Promise.all([
          update.srcRepository.settle(),
          update.destRepository.settle()
        ]);
      }).then(settled => {
        const [src, dest] = settled;
        const srcType = src.getModule(update.srcModule).type;
        const destType = dest.getModule(update.destModule).type;

        const mut = mutation.get(dest.type(), srcType, destType);
        if (!mut) {
          // in case we detect a dependency that doesn't have a mutation plugin
          // yet
          console.warn('WARNING: no mutation plugin found matching '
              + `destRepo=${dest.type()} src=${srcType} dest=${destType}`);
          return Promise.resolve();
        }

        console.log('applying mutation plugin for types:',
            dest.type(), srcType, destType,
            'mutation plugin: ', mut.constructor.name);

        return mut.apply(update);
      }));
    }

    return Promise.all(promises);
  });
}

export async function getTask(taskId: string): Promise<Task> {
  const ds = datastore.get();
  const task = await ds.get(Task, taskId);

  return task;
}

// TODO: hard update: compare all modules (or some specific module) to their
// dependencies and update if out of date
// soft update only tries to update dependents of modules that changed in that
// event whereas hard update can affect modules that didn't change in this event

//function updateModule(repoName, moduleName) {
//  // TODO
//}

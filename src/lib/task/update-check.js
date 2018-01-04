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

import * as datastore from '../datastore';
import * as queue from '../queue';

import Module from '../module';
import Repository from '../repository/repository';
import Task, { TaskError } from './task';
import Update from '../update';
import UpdateApplyTask from './update-apply';

import type { TaskOptions } from './task';

export default class UpdateCheckTask extends Task {
  constructor(options: TaskOptions) {
    super({
      type: 'update-check',
      retries: 3,
      ...options
    });
  }

  load(): Promise<Repository> {
    const { repositoryName } = this.data;
    const ds = datastore.get();

    return ds.get(Repository, repositoryName).then(repo => repo.settle());
  }

  async listDependents(
        repo: Repository,
        mod: Module): Promise<Module[]> {
    const ds = datastore.get();

    // TODO: optimize me
    const mods = await ds.list(Module);
    return mods.filter(m => m.dependsOn(repo, mod));
  }

  async generateUpdates(
        repo: Repository,
        moduleName: string,
        toVersion: string): Promise<Update<any>[]> {
    const mod = repo.getModule(moduleName);
    if (!mod) {
      throw new TaskError(
        `module not found: repo=${repo.name} module=${moduleName}`);
    }

    const dependents: Module[] = await this.listDependents(repo, mod);
    console.log('dependents:', dependents, repo.name, moduleName, mod.type);

    const updates: Update<any>[] = [];
    for (let dependent of dependents) {
      const dependency = dependent.getDependency(moduleName, mod.type);
      if (!dependency) {
        console.warn(`dependent lacks dependency, skipping: ${dependent.name}`);
        continue;
      }

      if (dependency.version === toVersion) {
        continue;
      }

      updates.push(new Update({
        srcRepository: repo.name,
        srcModule: moduleName,
        destRepository: dependent.repository,
        destModule: dependent.name,
        fromVersion: dependency.version,
        toVersion: toVersion,
        _meta: {}
      }));
    }

    // store all the new update instances
    await Promise.all(updates.map(update => update.store()));

    return updates;
  }

  async execute(repo: Repository): Promise<mixed> {
    // apply module updates first else we won't pick up any changes until 
    // the next event
    const mdiff = await repo.diffModules();
    repo.applyPatches(mdiff);

    const created = mdiff.filter(p => p.type === 'create');
    const deleted = mdiff.filter(p => p.type === 'deleted');
    console.log(
      'refreshed modules, created:', created,
      'deleted:', deleted);

    await repo.store();

    // changes in module dependencies don't result in any updates, but we still
    // need to keep track of them
    const ddiff = await repo.diffDependencies();

    // changes to (current) module versions should trigger updates to dependent
    // modules
    const vdiff = await repo.diffVersions();

    repo.applyModulePatches(ddiff);
    repo.applyModulePatches(vdiff);
    await repo.store();

    const updates: Update<any>[] = [];
    for (let changed of vdiff) {
      // we only care if the 'current' version changes
      // usually that happens implicitly (e.g. in  helm), but if not we should
      // honor the field in case there is some release strategy and/or beta
      // versions
      const current = changed.patches.find(p => {
        return p.op === 'replace' && p.path === '/current';
      });

      if (current) {
        const ups = await this.generateUpdates(
            repo, changed.name, current.value);

        updates.push(...ups);
      }
    }

    console.log(`generated ${updates.length} updates`);

    const tasks: UpdateApplyTask[] = [];
    for (let update of updates) {
      if (!update._meta || !update._meta.id) {
        throw new TaskError('invalid updateId');
      }

      tasks.push(new UpdateApplyTask({
        data: {
          updateId: update._meta.id
        }
      }));
    }

    await queue.get().enqueue(...tasks);

    return {
      dependencies: ddiff.length,
      versions: vdiff.length,
      updates: updates.length
    };
  }
}

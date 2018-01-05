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

import * as hipchat from '../hipchat';

import { ExtendableError } from '../util';
import Module from '../module';

import type DatastoreBackend from '../datastore/backend';
import type { HipChatMessage } from '../hipchat';
import type { ModuleUpdate } from '../module';
import type { TemplateEnvironment } from '../template-util';

export class RepositoryError extends ExtendableError {
  constructor(m: string) {
    super(m);
  }
}

export type RepositoryOptions = {
  type: string,
  name: string,
  parent: ?string,
  remote: string,
  room?: ?string,
  _meta?: ?mixed
};

export type ModulePatch = {
  type: 'create' | 'delete',
  name: string,
  moduleType?: string,
  modulePath?: string | null
};

export type IntermediateModule = {
  name: string,
  type: string,
  path?: string | null
};

export default class Repository {
  name: string;
  parent: ?string;
  remote: string;
  room: ?string;
  _meta: ?mixed;
  modules: Module[];
  promises: Promise<any>[];

  constructor(options: RepositoryOptions) {
    this.name = options.name;

    // name of parent Repository, if applicable
    // (e.g. parent of docker repo monasca/api is monasca-docker)
    this.parent = options.parent || null;

    this.remote = options.remote;
    this.room = options.room || null;
    this._meta = options._meta || {};

    this.modules = [];

    this.promises = [];
    if (this._meta.id) {
      const dsLoad = this.loadDatastoreModules();
      this.promises.push(dsLoad);
      dsLoad.then(modules => {
        this.modules = modules;
      });
    }
  }

  providesRemote(remote: string): boolean {
    return remote === this.remote;
  }

  getModule(name: string): ?Module {
    return this.modules.find(m => m.name === name);
  }

  loadDatastoreModules(): Promise<Module[]> {
    return require('../datastore').get().list(Module, [
      { f: 'repository', op: '=', val: this.name }
    ]).then(modules => {
      for (let mod of modules) {
        mod._meta.repository = this;
      }

      return modules;
    });
  }

  loadParent(): Promise<?Repository> {
    if (!this.parent) {
      return Promise.resolve(null);
    } else {
      return require('../datastore').get().get(Repository, this.parent);
    }
  }

  loadModules(): Promise<IntermediateModule[]> {
    throw new RepositoryError('loadModules() not implemented');
  }

  diffModules(): Promise<ModulePatch[]> {
    // we don't use jsonpatch here because we only care about unordered
    // create/delete of modules
    return this.loadModules().then(modules => {
      const remaining = new Set(modules.map(m => m.name));
      const patches: ModulePatch[] = [];

      for (let mod of modules) {
        remaining.delete(mod.name);

        let current = this.modules.find(m => m.name === mod.name);
        if (!current) {
          patches.push({
            type: 'create',
            name: mod.name,
            moduleType: mod.type,
            modulePath: mod.path || null
          });
        }
      }

      for (let name of remaining) {
        patches.push({ type: 'delete', name });
      }

      return patches;
    });
  }

  applyPatches(patches: ModulePatch[]) {
    for (let patch of patches) {
      if (patch.type === 'create') {
        // this is dumb
        const type: string = (patch.moduleType: any);

        this.modules.push(new Module({
          repository: this.name,
          name: patch.name,
          type: type,
          path: patch.modulePath,
          _meta: { repository: this }
        }));
      } else if (patch.type === 'delete') {
        const index = this.modules.findIndex(m => m.name === patch.name);
        if (index >= 0) {
          this.modules.splice(index, 1);
        }
      }
    }
  }

  refreshModules() {
    return this.diffModules().then(patches => {
      this.applyPatches(patches);
      return patches;
    });
  }

  diffVersions() {
    return Promise.all(this.modules.map(mod => mod.diffVersions()));
  }

  diffDependencies() {
    return Promise.all(this.modules.map(mod => mod.diffDependencies()));
  }

  applyModulePatches(updates: ModuleUpdate[]) {
    for (let update of updates) {
      const module = this.modules.find(mod => mod.name === update.name);
      if (!module) {
        throw new RepositoryError(`invalid name in update: ${update.name}`);
      }

      module.applyPatches(update.patches);
    }
  }

  refreshVersions() {
    return this.diffVersions().then(p => this.applyModulePatches(p));
  }

  refreshDependencies() {
    return this.diffDependencies().then(p => this.applyModulePatches(p));
  }

  refresh() {
    return this.refreshModules()
        .then(() => this.refreshVersions())
        .then(() => this.refreshDependencies());
  }

  notify(message: string | HipChatMessage) {
    const room = this.room;
    if (!room) {
      return Promise.resolve();
    }

    const hip = hipchat.get(room);
    if (!hip) {
      console.log(`warning: no configured HipChat room matching: ${room}`);
      return Promise.resolve();
    }

    return hip.send(message);
  }

  notifyTemplate(name: string, env: TemplateEnvironment) {
    const room = this.room;
    if (!room) {
      return Promise.resolve();
    }

    const hip = hipchat.get(room);
    if (!hip) {
      console.log(`warning: no configured HipChat room matching: ${room}`);
      return Promise.resolve();
    }

    return hip.sendTemplate(name, env);
  }

  type() {
    throw new RepositoryError('type() not implemented');
  }

  ready(): boolean {
    return true;
  }

  static kind() {
    return 'Repository';
  }

  id() {
    return this.name;
  }

  settle(): Promise<any> {
    return Promise.all(this.promises).then(() => this);
  }

  dump(): RepositoryOptions {
    return {
      type: this.type(),
      name: this.name,
      parent: this.parent,
      remote: this.remote,
      room: this.room
    };
  }

  async store(ds: DatastoreBackend | null = null): Promise<any> {
    if (!ds) {
      ds = require('../datastore').get();
    }

    await Promise.all(this.modules.map(m => m.store(ds)));
    return ds.store(this);
  }

  static load(data): Repository {
    return require('./index').create(data);
  }

  static get(
      name: string,
      ds: DatastoreBackend | null = null): Promise<Repository> {
    if (!ds) {
      ds = require('../datastore').get();
    }

    return ds.get(Repository, name);
  }

  static list(ds: DatastoreBackend | null = null): Promise<Repository[]> {
    if (!ds) {
      ds = require('../datastore').get();
    }

    return ds.list(Repository);
  }

  static async getByRemote(
      remote: string,
      ds: DatastoreBackend | null = null): Promise<?Repository> {
    if (!ds) {
      ds = require('../datastore').get();
    }

    const repos = await ds.list(Repository);
    return repos.find(r => r.providesRemote(remote));
  }

  static listByParent(
      parentName: string,
      ds: DatastoreBackend | null = null): Promise<Repository[]> {
    if (!ds) {
      ds = require('../datastore').get();
    }

    return ds.list(Repository, [
      { f: 'parent', op: '=', val: parentName }
    ]);
  }

}

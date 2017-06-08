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

const { ExtendableError } = require('../util');
const { Module } = require('../module');

class RepositoryError extends ExtendableError {
  constructor(m) {
    super(m);
  }
}

class Repository {
  constructor(options = {}) {
    this.name = options.name;

    // name of parent Repository, if applicable
    // (e.g. parent of docker repo monasca/api is monasca-docker)
    this.parent = options.parent || null;

    this.remote = options.remote;
    this._meta = options._meta || {};

    this.modules = [];

    this.promises = [];
    if (options.modules) {
      const dsLoad = this.loadDatastoreModules(options.modules);
      this.promises.push(dsLoad);
      dsLoad.then(modules => {
        this.modules = modules;
      });
    }
  }

  providesRemote(remote) {
    return remote === this.remote;
  }

  getModule(name) {
    return this.modules.find(m => m.name === name);
  }

  loadDatastoreModules() {
    return require('../datastore').get().list(Module, [
      { f: 'repository', op: '=', val: this.name }
    ]).then(modules => {
      for (let mod of modules) {
        mod._meta.repository = this;
      }

      return modules;
    });
  }

  loadParent() {
    if (!this.parent) {
      return Promise.resolve(null);
    } else {
      return require('../datastore').get().get(Repository, this.parent);
    }
  }

  loadModules() {
    throw new RepositoryError('loadModules() not implemented');
  }

  diffModules() {
    // we don't use jsonpatch here because we only care about unordered
    // create/delete of modules
    return this.loadModules().then(modules => {
      const remaining = new Set(modules.map(m => m.name));
      const patches = [];

      for (let mod of modules) {
        remaining.delete(mod.name);

        let current = this.modules.find(m => m.name === mod.name);
        if (!current) {
          patches.push({
            type: 'create',
            name: mod.name,
            moduleType: mod.type
          });
        }
      }

      for (let name of remaining) {
        patches.push({ type: 'delete', name });
      }

      return patches;
    });
  }

  applyPatches(patches) {
    for (let patch of patches) {
      if (patch.type === 'create') {
        this.modules.push(new Module({
          repository: this.name,
          name: patch.name,
          type: patch.moduleType,
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

  applyModulePatches(updates) {
    for (let update of updates) {
      const module = this.modules.find(mod => mod.name === update.name);
      module.applyPatches(update.patches);
    }
  }

  refreshVersions() {
    return this.diffVersions().then(p => this.applyModulePatches(p));
  }

  refreshDependencies() {
    return this.diffDependencies().then(p => this.applyModulePatches(p));
  }

  type() {
    throw new RepositoryError('type() not implemented');
  }

  ready() {
    return true;
  }

  static kind() {
    return 'Repository';
  }

  id() {
    return this.name;
  }

  settle() {
    return Promise.all(this.promises).then(() => this);
  }

  dump() {
    return {
      type: this.type(),
      name: this.name,
      parent: this.parent,
      remote: this.remote,
      modules: this.modules.map(m => m.name)
    };
  }

  store(ds = null) {
    if (!ds) {
      ds = require('../datastore').get();
    }

    const promises = this.modules.map(m => m.store(ds));
    return Promise.all(promises).then(() => ds.store(this));
  }

  static load(data) {
    return require('./index').create(data);
  }
}

module.exports = {
  RepositoryError,
  Repository
};
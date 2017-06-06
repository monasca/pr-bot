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

const jsonpatch = require('fast-json-patch');

const { ExtendableError } = require('./util');

const check = require('./check');

class ModuleError extends ExtendableError {
  constructor(m) {
    super(m);
  }
}

class Module {
  constructor(options = {}) {
    this.repository = options.repository;
    this.name = options.name;
    this.type = options.type;
    this.versions = options.versions || [];
    this.current = options.current || null;
    this.dependencies = options.dependencies || [];
    
    this._meta = options._meta || {};
  }

  dependsOn(otherRepo, otherModule) {
    for (let dep of this.dependencies) {
      if (dep.name !== otherModule.name) {
        continue;
      }

      if (dep.type !== otherModule.type) {
        continue;
      }

      if (!otherRepo.providesRemote(dep.remote)) {
        continue;
      }

      return true;
    }

    return false;
  }

  loadRepository() {
    if (this._meta.repository) {
      return Promise.resolve(this._meta.repository);
    } else {
      const datastore = require('./datastore');
      const { Repository } = require('./repository/repository');
      
      return datastore.get().get(Repository, this.repository).then(repo => {
        this._meta.repository = repo;
        return repo;
      });
    }
  }

  diffVersions() {
    return this.loadRepository().then(repo => {
      return check.get(repo.type(), this.type).check(repo, this.name);
    }).then(result => {
      const clone = this.dump();
      clone.versions = result.versions;
      clone.current = result.current;
      return {
        name: this.name,
        patches: jsonpatch.compare(this.dump(), clone)
      };
    });
  }

  diffDependencies() {
    return this.loadRepository().then(repo => {
      return check.get(repo.type(), this.type).dependencies(repo, this.name);
    }).then(dependencies => {
      const clone = this.dump();
      clone.dependencies = dependencies;
      return {
        name: this.name,
        patches: jsonpatch.compare(this.dump(), clone)
      };
    });
  }

  applyPatches(patches) {
    jsonpatch.apply(this, patches);
  }

  static kind() {
    return 'Module';
  }

  id() {
    return null;
  }

  dump() {
    return {
      name: this.name,
      type: this.type,
      repository: this.repository,
      versions: this.versions,
      current: this.current,
      dependencies: this.dependencies
    };
  }

  store(ds = null) {
    if (!ds) {
      ds = require('./datastore').get();
    }

    ds.store(this);
  }
}

module.exports = {
  ModuleError,
  Module
};

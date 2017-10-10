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

import jsonpatch from 'fast-json-patch';

import * as check from './check';
import { ExtendableError } from './util';

import type Repository from './repository/repository';

export class ModuleError extends ExtendableError {
  constructor(m: string) {
    super(m);
  }
}

export type ModuleDependency = {
  name: string,
  version: string,
  type: string,
  remote: string
};

type ModuleMetadata = {
  id?: mixed,
  repository?: Repository
}

export type ModuleOptions = {
  repository: string,
  name: string,
  type: string,
  alias?: ?string,
  versions?: ?string[],
  current?: ?string,
  dependencies?: ?ModuleDependency[],
  path?: ?string,

  _meta?: ?ModuleMetadata
};

export type ModuleUpdate = {
  name: string,
  patches: mixed[]
};

export default class Module {
  repository: string;
  name: string;
  type: string;
  alias: ?string;
  versions: string[];
  current: ?string;
  dependencies: ModuleDependency[];
  path: ?string;

  _meta: ModuleMetadata;

  constructor(options: ModuleOptions) {
    this.repository = options.repository;
    this.name = options.name;
    this.type = options.type;
    this.alias = options.alias || null;
    this.versions = options.versions || [];
    this.current = options.current || null;
    this.dependencies = options.dependencies || [];
    this.path = options.path || null;
    
    this._meta = options._meta || {};
  }

  matches(name: string): boolean {
    if (this.alias !== null) {
      return this.alias === name || this.name === name;
    } else {
      return this.name === name;
    }
  }

  dependsOn(otherRepo: Repository, otherModule: Module): boolean {
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

  getDependency(name: string, type: string): ?ModuleDependency {
    return this.dependencies.find(d => d.name === name && d.type === type);
  }

  loadRepository(): Promise<Repository> {
    if (this._meta.repository) {
      return Promise.resolve(this._meta.repository);
    } else {
      const datastore = require('./datastore');
      const Repository = require('./repository/repository').default;
      
      return datastore.get().get(Repository, this.repository).then(repo => {
        this._meta.repository = repo;
        return repo;
      });
    }
  }

  async diffVersions(): Promise<ModuleUpdate> {
    const repo = await this.loadRepository();
    const plugin = check.get(repo.type(), this.type);
    const result = await plugin.check(repo, this.name);

    const clone = this.dump();
    clone.versions = result.versions;
    clone.current = result.current;
    return {
      name: this.name,
      patches: jsonpatch.compare(this.dump(), clone)
    };
  }

  async diffDependencies(): Promise<ModuleUpdate> {
    const repo = await this.loadRepository();
    const plugin = check.get(repo.type(), this.type);
    const dependencies = plugin.dependencies(repo, this.name);

    const clone = this.dump();
    clone.dependencies = dependencies;
    return {
      name: this.name,
      patches: jsonpatch.compare(this.dump(), clone)
    };
  }

  applyPatches(patches: mixed[]): void {
    jsonpatch.applyPatch(this, patches);
  }

  static kind(): string {
    return 'Module';
  }

  id(): ?string {
    return null;
  }

  dump() {
    return {
      name: this.name,
      type: this.type,
      repository: this.repository,
      alias: this.alias,
      versions: this.versions,
      current: this.current,
      dependencies: this.dependencies
    };
  }

  store(ds = null) {
    if (!ds) {
      ds = require('./datastore').get();
    }

    return ds.store(this);
  }
}

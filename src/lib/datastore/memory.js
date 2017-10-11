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

import fs from 'fs';

import uuid from 'uuid/v4';
import yaml from 'js-yaml';

import * as config from '../config';

import DatastoreBackend, { DatastoreError } from './backend';
import Module from '../module';
import Repository from '../repository/repository';
import Update from '../update';

import type { Filter, Storable } from './backend';

const TYPES = [ Module, Repository, Update ];

const OPERATORS = {
  '=': (a, b) => a === b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '<': (a, b) => a < b,
  '<=': (a, b) => b <= b
};

export default class MemoryDatastore extends DatastoreBackend {
  datastore: Map<string, any>;
  file: ?string;

  constructor() {
    super();

    this.datastore = new Map();
  }

  init() {
    const cfg = config.get();
    if (cfg.datastore.config) {
      if (cfg.datastore.config.blob) {
        this.preload(cfg.datastore.config.blob);
      } else if (cfg.datastore.config.file) {
        const path = ((cfg.datastore.config.file: any): string);

        const content = fs.readFileSync(path);
        const blob = yaml.safeLoad(content);
        this.preload(blob);
        this.file = path;
      }
    }
  }

  _deserialize<T>(type: Class<T>, id: mixed, entity: {}): T {
    const data = {
      ...entity,
      _meta: { id }
    };

    if (typeof type.load === 'function') {
      return type.load(data);
    } else {
      return new type(data);
    }
  }

  list<T>(type: Class<T>, filters: Filter[] = []): Promise<T[]> {
    const typeMap = this.datastore.get(type.kind());
    
    let ids = Array.from(typeMap.keys());
    for (let filter of filters) {
      ids = ids.filter(id => {
        const ent = typeMap.get(id);
        const field = ent[filter.f];

        return OPERATORS[filter.op](field, filter.val);
      });
    }

    const objects = ids.map(id => this._deserialize(type, id, typeMap.get(id)));
    return Promise.resolve(objects);
  }

  get<T, U, V: Storable<T, U>>(type: Class<T>, id: mixed): Promise<T> {
    if (typeof type.kind !== 'function') {
      throw new DatastoreError(`invalid kind: ${type.name}`);
    }

    const typeMap = this.datastore.get(type.kind());
    if (typeMap && typeMap.has(id)) {
      return Promise.resolve(this._deserialize(type, id, typeMap.get(id)));
    } else {
      return Promise.reject(`could not find entity with id: ${id}`);
    }
  }

  store<T, U>(
        object: Storable<T, U>,
        settle: boolean = true): Promise<boolean> {
    if (settle && typeof object.settle === 'function') {
      return object.settle().then(o => this.store(o, false));
    }

    const kind = object.constructor.kind();
    let typeMap = this.datastore.get(kind);
    if (!typeMap) {
      typeMap = new Map();
      this.datastore.set(kind, typeMap);
    }

    let id = object._meta.id;
    if (!id) {
      id = object.id() || uuid();
    }

    typeMap.set(id, object.dump());

    return Promise.resolve(true);
  }

  delete<T, U>(object: Storable<T, U>): Promise<boolean> {
    const typeMap = this.datastore.get(object.constructor.kind());
    if (!typeMap) {
      throw new DatastoreError(`invalid kind: ${object.constructor.kind()}`);
    }

    const id = object._meta.id || object.id();
    if (typeMap.has(id)) {
      typeMap.delete(id);
      return Promise.resolve(true);
    } else {
      return Promise.resolve(false);
    }
  }

  preload(blob: any) {
    if (!blob) {
      return;
    }

    for (let type of TYPES) {
      let typeMap = this.datastore.get(type.kind());
      if (!typeMap) {
        typeMap = new Map();
        this.datastore.set(type.kind(), typeMap);
      }

      if (typeof blob[type.kind()] === 'undefined') {
        continue;
      }

      const entities = blob[type.kind()];
      for (let id of Object.keys(entities)) {
        typeMap.set(id, entities[id]);
      }
    }
  }

  dump() {
    const output = {};
    for (let [k, v] of this.datastore.entries()) {
      const typeObject = {};
      for (let [entId, ent] of v.entries()) {
        typeObject[entId] = ent;
      }

      output[k] = typeObject;
    }

    if (this.file) {
      fs.writeFileSync(this.file, yaml.safeDump(output));
    } else {
      console.log(yaml.safeDump(output));
    }
  }
}

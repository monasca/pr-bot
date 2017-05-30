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

const fs = require('fs');

const uuid = require('uuid/v4');
const yaml = require('js-yaml');

const config = require('../config');

const { DatastoreBackend } = require('./backend');
const { Module } = require('../module');
const { Repository } = require('../repository/repository');
const { Update } = require('../update');

const TYPES = [ Module, Repository, Update ];
console.log('TYPES:', TYPES);
console.log('repository:', require('../repository/repository'));

const OPERATORS = {
  '=': (a, b) => a === b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '<': (a, b) => a < b,
  '<=': (a, b) => b <= b
};

class MemoryDatastore extends DatastoreBackend {
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
        const content = fs.readFileSync(cfg.datastore.config.file);
        const blob = yaml.safeLoad(content);
        this.preload(blob);
        this.file = cfg.datastore.config.file;
      }
    }
  }

  _deserialize(type, id, entity) {
    const data = Object.assign({}, entity, {
      _meta: { id }
    });

    if (typeof type.load === 'function') {
      return type.load(data);
    } else {
      return new type(data);
    }
  }

  list(type, filters = []) {
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

  get(type, id) {
    const typeMap = this.datastore.get(type.kind());
    if (typeMap && typeMap.has(id)) {
      return Promise.resolve(this._deserialize(type, id, typeMap.get(id)));
    } else {
      return Promise.reject(`could not find entity with id: ${id}`);
    }
  }

  store(object, settle = true) {
    if (settle && typeof object.settle === 'function') {
      return object.settle().then(o => this.store(o, false));
    }

    const kind = object.constructor.kind();
    if (!this.datastore.has(kind)) {
      this.datastore.set(kind, new Map());
    }

    let id = object._meta.id;
    if (!id) {
      id = object.id() || uuid();
    }

    const typeMap = this.datastore.get(kind);
    typeMap.set(id, object.dump());

    return Promise.resolve(true);
  }

  delete(object) {
    const typeMap = this.datastore.get(object.constructor.kind());
    const id = object._meta.id || object.id();
    if (typeMap.has(id)) {
      typeMap.delete(id);
      return Promise.resolve(true);
    } else {
      return Promise.resolve(false);
    }
  }

  preload(blob) {
    if (!blob) {
      return;
    }

    for (let type of TYPES) {
      if (!this.datastore.has(type.kind())) {
        this.datastore.set(type.kind(), new Map());
      }

      if (typeof blob[type.kind()] === 'undefined') {
        continue;
      }

      const typeMap = this.datastore.get(type.kind());

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

module.exports = {
  MemoryDatastore
};

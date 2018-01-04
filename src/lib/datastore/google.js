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

import Datastore from '@google-cloud/datastore';

import * as config from '../config';

import DatastoreBackend, { DatastoreError } from './backend';

import type { Filter, Storable } from './backend';

const OPERATORS = {
  '=': '=',
  '>': '>',
  '>=': '>=',
  '<': '<',
  '<=': '<=',
  'in': '='
};

export default class GoogleDatastore extends DatastoreBackend {
  datastore: Datastore;
  keyConstructor: any;

  constructor() {
    super();

    const cfg = config.get();
    const options = Object.assign({}, cfg.datastore.config || {});

    this.datastore = Datastore(options);

    // welp
    this.keyConstructor = this.datastore.key(['Test', 123]).constructor;
  }

  init() {

  }

  _deserialize<T>(type: Class<T>, entity: { [string]: mixed }): T {
    const data = {
      ...entity,
      _meta: { id: entity[this.datastore.KEY] }
    };

    // $FlowFixMe: flow can't handle static interface properties
    if (typeof type.load === 'function') {
      return type.load(data);
    } else {
      // $FlowFixMe: flow can't handle this
      return new type(data);
    }
  }

  list<T>(type: Class<T>, filters: Filter[] = []): Promise<T[]> {
    // $FlowFixMe: this class gets insane to type properly
    let query = this.datastore.createQuery(type.name);
    for (let filter of filters) {
      const op = OPERATORS[filter.op];
      query = query.filter(filter.f, op, filter.val);
    }

    return this.datastore
        .runQuery(query)
        .then(ents => {
          return ents[0].map(ent => this._deserialize(type, ent));
        });
  }

  get<T>(type: Class<T>, id: mixed): Promise<T> {
    let key: any;
    if (id instanceof this.keyConstructor) {
      key = id;
    } else {
      // $FlowFixMe: flow static interface methods
      key = this.datastore.key([type.kind(), id]);
    }

    return this.datastore.get(key).then(ent => {
      if (typeof ent[0] === 'undefined') {
        let msgKey = key.name || id;

        // $FlowFixMe: just coerce to string
        throw new DatastoreError(`not found: kind=${key.kind} id=${msgKey}`);
      }

      return this._deserialize(type, ent[0]);
    });
  }

  store<T, U>(object: Storable<T, U>, settle: boolean = true): Promise<any> {
    if (settle && typeof object.settle === 'function') {
      return object.settle().then(() => this.store(object, false));
    }

    let meta = object._meta;
    if (!meta) {
      meta = {};
      object._meta = meta;
    }

    let key;
    if (typeof meta.id === 'undefined') {
      const id = object.id();
      const kind = object.constructor.kind();

      if (id !== null) {
        key = this.datastore.key([kind, object.id()]);
      } else {
        key = this.datastore.key([kind]);
      }
      
      meta.id = key;
    } else {
      key = meta.id;
    }
    
    const data = object.dump();
    return this.datastore.save({ key, data });
  }

  delete<T, U>(object: Storable<T, U>): Promise<any> {
    if (!object._meta) {
      return Promise.reject(new DatastoreError('object requires _meta'));
    }

    if (object._meta.id) {
      return this.datastore.delete(object._meta.id);
    } else {
      // $FlowFixMe: flow doesn't understand static interface methods
      let kind = object.kind();
      let id = object.id();
      if (!id) {
        // $FlowFixMe: flow doesn't understand static interface methods
        const msg = `object of kind ${object.kind()} does not have an id`;
        return Promise.reject(new DatastoreError(msg));
      }

      let key = this.datastore.key([kind, id]);
      return this.datastore.delete(key);
    }
  }
}

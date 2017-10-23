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

import fs from 'fs-extra';
import path from 'path';

import Datastore from 'nedb';
import uuid from 'uuid';

import * as config from '../config';

import DatastoreBackend from './backend';

import type { Filter, Storable } from './backend';

const OPERATORS = {
  '=': value => value,
  '>': value => ({ $gt: value }),
  '>=': value => ({ $gte: value }),
  '<': value => ({ $lt: value }),
  '<=': value => ({ $lte: value })
};

export default class NeDBDatastore extends DatastoreBackend {
  db: { [string]: Datastore };
  dir: string | null;

  constructor() {
    super();

    this.db = {};

    const cfg = config.get();
    const options = Object.assign({}, cfg.datastore.config || {});
    
    if (options.dir) {
      this.dir = options.dir;
      fs.ensureDirSync(options.dir);
    } else {
      console.log('no `dir` set for datastore, data will not be persisted!');
      this.dir = null;
    }
  }

  init() {

  }

  _db<T>(type: string | Class<T>) {
    // $FlowFixMe: static interface properties
    if (typeof type.kind === 'function') {
      type = type.kind();
    }

    if (this.db[type]) {
      return this.db[type];
    } else {
      let db;
      if (this.dir) {
        db = new Datastore({
          filename: path.join(this.dir, `${type}.nedb`),
          autoload: true
        });
      } else {
        db = new Datastore();
      }

      this.db[type] = db;
      return db;
    }
  }

  _deserialize<T>(type: Class<T>, doc: any): T {
    const data = Object.assign({}, doc, {
      _meta: { id: doc._id }
    });

    // $FlowFixMe: flow can't handle static interface properties
    if (typeof type.load === 'function') {
      return type.load(data);
    } else {
      // $FlowFixMe: flow can't handle static interface properties
      return new type(data);
    }
  }

  list<T>(type: Class<T>, filters: Filter[] = []): Promise<T[]> {
    const query = {};
    for (let filter of filters) {
      query[filter.f] = OPERATORS[filter.op](filter.val);
    }

    return new Promise((resolve, reject) => {
      this._db(type).find(query, (err, docs) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(docs.map(doc => this._deserialize(type, doc)));
      });
    });
  }

  get<T>(type: Class<T>, id: mixed): Promise<T> {
    return new Promise((resolve, reject) => {
      this._db(type).findOne({ _id: id }, (err, doc) => {
        if (err) {
          reject(err);
          return;
        }

        if (doc === null) {
          // $FlowFixMe: flow can't handle static interface properties
          const typeName = typeof type.kind === 'function' ? type.kind() : type;

          // $FlowFixMe
          reject(`not found: type=${typeName}, id=${id}`);
          return;
        }

        resolve(this._deserialize(type, doc));
      });
    });
  }

  store<T, U>(
        object: Storable<T, U>,
        settle: boolean = true): Promise<any> {
    if (settle && typeof object.settle === 'function') {
      return object.settle().then(o => this.store(o, false));
    }

    if (typeof object._meta === 'undefined') {
      object._meta = {};
    }

    let id;
    if (typeof object._meta.id === 'undefined') {
      id = object.id();
      if (id === null) {
        id = uuid();

        // $FlowFixMe: this was defined above...
        object._meta.id = id;
      }
    } else {
      id = object._meta.id;
    }

    const data = {
      ...object.dump(),
      _id: id
    };

    return new Promise((resolve, reject) => {
      const kind = object.constructor.kind();
      const query = { _id: id };
      const opts = { upsert: true };

      this._db(kind).update(query, data, opts, (err, count) => {
        if (err) {
          reject(err);
        } else {
          resolve(count);
        }
      });
    });
  }

  delete<T, U>(object: Storable<T, U>): Promise<any> {
    return new Promise((resolve, reject) => {
      const kind = object.constructor.kind();

      if (!object._meta) {
        return Promise.reject(`object of kind ${kind} does not have an id`);
      }
      const id = object._meta.id || object.id();

      this._db(kind).remove({ _id: id }, {}, (err, count) => {
        if (err) {
          reject(err);
        } else {
          resolve(count);
        }
      });
    });
  }
}

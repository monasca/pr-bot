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

import Repository from './repository/repository';

import type { Storable } from './datastore/backend';

type UpdateOptions = {
  srcRepository: string,
  destRepository: string,
  srcModule: string,
  destModule: string,
  fromVersion: string,
  toVersion: string,
  _meta: ?mixed
};

export default class Update<DestType: Repository>
      implements Storable<UpdateOptions, Update<DestType>> {

  srcRepositoryName: string;
  srcRepository: ?Repository;
  destRepositoryName: string;
  destRepository: ?DestType;
  srcModule: string;
  destModule: string;
  fromVersion: string;
  toVersion: string;
  _meta: ?mixed;
  dsPromise: Promise<Update<DestType>>;

  constructor(options: UpdateOptions) {
    this.srcRepositoryName = options.srcRepository;
    this.destRepositoryName = options.destRepository;
    this.srcModule = options.srcModule;
    this.destModule = options.destModule;
    this.fromVersion = options.fromVersion;
    this.toVersion = options.toVersion;
    this._meta = options._meta || {};

    const ds = datastore.get();
    const promises = [];

    this.srcRepository = null;
    promises.push(ds.get(Repository, this.srcRepositoryName).then(r => {
      this.srcRepository = r;
    }));

    this.destRepository = null;
    promises.push(ds.get(Repository, this.destRepositoryName).then(r => {
      this.destRepository = r;
    }));

    this.dsPromise = Promise.all(promises).then(() => this);
  }

  dsLoad() {
    return this.dsPromise;
  }

  static kind(): string {
    return 'Update';
  }

  id(): string | null {
    return null;
  }

  dump() {
    return {
      srcRepository: this.srcRepositoryName,
      srcModule: this.srcModule,
      destRepository: this.destRepositoryName,
      destModule: this.destModule,
      fromVersion: this.fromVersion,
      toVersion: this.toVersion
    };
  }

  store(ds = null): void {
    if (!ds) {
      ds = require('./datastore').get();
    }

    ds.store(this);
  }
}

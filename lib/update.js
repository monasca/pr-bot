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

const datastore = require('./datastore');

const { Repository } = require('./repository/repository');

class Update {
  constructor(options) {
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

  static kind() {
    return 'Update';
  }

  id() {
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

  store(ds = null) {
    if (!ds) {
      ds = require('./datastore').get();
    }

    ds.store(this);
  }
}

module.exports = { Update };

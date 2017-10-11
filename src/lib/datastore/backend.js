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

const util = require('../util');

class DatastoreError extends util.ExtendableError {
  constructor(m) {
    super(m);
  }
}

class DatastoreBackend {
  constructor() {

  }

  // eslint-disable-next-line no-unused-vars
  init() {
    throw new DatastoreError('init not implemented');
  }

  // eslint-disable-next-line no-unused-vars
  list(type, filters = []) {
    throw new DatastoreError('list not implemented');
  }

  first(type, filters = []) {
    return this.list(type, filters).then(ents => {
      if (ents.length === 0) {
        throw new DatastoreError('not matching entities found');
      }

      return ents[0];
    });
  }

  // eslint-disable-next-line no-unused-vars
  get(type, key) {
    throw new DatastoreError('get not implemented');
  }

  // eslint-disable-next-line no-unused-vars
  store(object) {
    throw new DatastoreError('store not implemented');
  }

  // eslint-disable-next-line no-unused-vars
  delete(object) {
    throw new DatastoreError('delete not implemented');
  }
}

module.exports = {
  DatastoreError,
  DatastoreBackend
};
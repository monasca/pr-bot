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

const config = require('../config');

const { DatastoreError } = require('./backend');

let instance = null;

function createDatastore(type) {
  // datastore implementations are require()'d dynamically to avoid any
  // circular dependency weirdness
  switch (type) {
    case 'gcloud': {
      const { GoogleDatastore } = require('./google');
      return new GoogleDatastore();
    }
    case 'memory': {
      const { MemoryDatastore } = require('./memory');
      return new MemoryDatastore();
    }
    case 'nedb': {
      const { NeDBDatastore } = require('./nedb');
      return new NeDBDatastore();
    }
    default: {
      throw new DatastoreError('invalid datastore type: ' + type);
    }
  }
}

function init() {
  const cfg = config.get();
  const datastore = createDatastore(cfg.datastore.type);
  datastore.init();
  return datastore;
}

module.exports = {
  get: function() {
    if (instance === null) {
      instance = init();
    }

    return instance;
  }
};

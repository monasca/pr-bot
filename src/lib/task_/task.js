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

const uuid = require('uuid/v4');

const { ExtendableError } = require('../util');

class TaskError extends ExtendableError {
  constructor(m) {
    super(m);
  }
}

class Task {
  constructor(options = {}) {
    this.id = options.id || uuid();
    this.type = options.type;
    this.timestamp = options.timestamp || +(new Date());
    this.data = options.data || {};
    this.status = options.status || 'pending';
    this.result = options.result || null;
    this.retries = options.retries || 0;
  }

  execute() {
    throw new TaskError('execute() not implemented');
  }

  static kind() {
    return 'Task';
  }

  id() {
    return this.id;
  }

  dump() {
    return {
      id: this.id,
      type: this.type,
      timestamp: this.timestamp,
      data: this.data,
      status: this.status,
      result: this.result,
      retries: this.retries
    };
  }

  store(ds = null) {
    if (!ds) {
      ds = require('../datastore').get();
    }

    ds.store(this);
  }

  static load(data) {
    // make sure to instantiate the correct class instance
    return require('./index').create(data);
  }
}

module.exports = { TaskError, Task };

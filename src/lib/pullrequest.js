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

const { Update } = require('./update');

class PullRequest {
  constructor(options = {}) {
    this.owner = options.owner;
    this.repo = options.repo;

    if (options.update) {
      this.update = options.update;
      this.dsPromise = Promise.resolve(this);
    } else if (options.updateKey) {
      this.update = null;
      this.updateKey = options.updateKey;
      this.dsPromise = datastore.get()
          .get(Update, this.updateKey)
          .then(update => {
            this.update = update;
            return this;
          });
    }

    this._meta = options._meta || {};
  }

  applyUpdate(update) {
    
  }

  dsLoad() {
    return this.dsPromise;
  }

  static kind() {
    return 'PullRequest';
  }

  id() {
    return null;
  }

  dump() {
    return {
      owner: this.owner,
      repo: this.repo,
      updateKey: this.updateKey,

    };
  }

  store(ds = null) {
    if (!ds) {
      ds = datastore.get();
    }

    return ds.store(this);
  }
}

module.exports = { PullRequest };

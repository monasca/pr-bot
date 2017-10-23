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

import Update from './update';

import type DatastoreBackend, { Storable } from './datastore/backend';

export type PullRequestOptions = {
  owner: string,
  repo: string,
  updateKey: ?mixed,
  update?: Update<any>
};

export default class PullRequest
      implements Storable<PullRequestOptions, PullRequest> {

  owner: string;
  repo: string;
  updateKey: ?mixed;
  update: Update<any> | null;
  dsPromise: ?Promise<any>;
  _meta: ?mixed;

  constructor(options: PullRequestOptions) {
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

  applyUpdate(update: Update<any>) {
    
  }

  dsLoad() {
    return this.dsPromise;
  }

  static kind(): string {
    return 'PullRequest';
  }

  id(): string | null {
    return null;
  }

  dump(): PullRequestOptions {
    return {
      owner: this.owner,
      repo: this.repo,
      updateKey: this.updateKey
    };
  }

  settle(): Promise<any> {
    return Promise.resolve();
  }

  store(ds: DatastoreBackend | null = null): Promise<any> {
    if (!ds) {
      ds = datastore.get();
    }

    return ds.store(this);
  }
}

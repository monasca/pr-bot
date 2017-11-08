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

import type DatastoreBackend, { Storable } from './datastore/backend';

export type PROptions = {
  repository: string,
  number: number,
  commits?: ?string[]
};

/**
 * Represents a GitHub pull request and helps us associate incoming status
 * events with a particular pull request number (since GitHub does not expose
 * this in the webhook payload or via the API)
 */
export default class PullRequest implements Storable<PROptions, PullRequest> {
  repository: string;
  number: number;
  commits: string[];
  _meta: ?mixed;

  constructor(options: PROptions) {
    this.repository = options.repository;
    this.number = options.number;
    this.commits = options.commits || [];

    this._meta = options._meta || {};
  }

  static kind(): string {
    return 'PullRequest';
  }

  id(): string | null {
    return null;
  }

  dump(): PROptions {
    return {
      repository: this.repository,
      number: this.number,
      commits: this.commits
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

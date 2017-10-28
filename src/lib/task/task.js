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

import uuid from 'uuid/v4';

import { ExtendableError } from '../util';

import type DatastoreBackend from '../datastore/backend';

export class TaskError extends ExtendableError {
  constructor(m: string) {
    super(m);
  }
}

export type TaskOptions = {
  previousId?: string,
  type?: string,
  data?: { [string]: mixed },
  status?: string,
  result?: mixed,
  retries?: number,
  createdAt?: number,
  startedAt?: number,
  endedAt?: number
};

export default class Task {
  _id: string;
  _meta: any;
  previousId: string | null;
  type: string;
  data: { [string]: mixed };
  status: string;
  result: mixed;
  retries: number;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;

  constructor(options: TaskOptions) {
    if (!options.type) {
      throw new TaskError('type field is required');
    }

    this.previousId = options.previousId || null;
    this.type = options.type;
    this.data = options.data || {};
    this.status = options.status || 'pending';
    this.result = options.result || null;
    this.retries = options.retries || 0;
    this.createdAt = options.createdAt || +(new Date());
    this.startedAt = options.startedAt || null;
    this.endedAt = options.endedAt || null;

    this._meta = options._meta || {};
    if (this._meta.id) {
      const idString: string = (this._meta.id: any);
      this._id = idString;
    } else {
      this._id = uuid();
    }
  }

  load(): Promise<any> {
    return Promise.resolve();
  }

  execute(data: any): Promise<mixed> { // eslint-disable-line no-unused-vars
    throw new TaskError('execute() not implemented');
  }

  retry(): Task | null {
    if (this.retries <= 0) {
      return null;
    }

    const clone = this.dump();
    clone.status = 'pending';
    clone.result = null;
    clone.createdAt = +(new Date());
    clone.startedAt = null;
    clone.endedAt = null;
    clone.retries -= 1;
    clone.previousId = this._id;
    return Task.load(clone);
  }

  static kind(): string {
    return 'Task';
  }

  id(): string {
    return this._id;
  }

  dump() {
    return {
      previousId: this.previousId,
      type: this.type,
      data: this.data,
      status: this.status,
      result: this.result,
      retries: this.retries,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      endedAt: this.endedAt
    };
  }

  settle(): Promise<any> {
    return Promise.resolve();
  }

  store(ds: DatastoreBackend | null = null): Promise<any> {
    if (!ds) {
      ds = require('../datastore').get();
    }

    return ds.store(this);
  }

  static load(data) {
    // make sure to instantiate the correct class instance
    return require('./index').create(data);
  }
}

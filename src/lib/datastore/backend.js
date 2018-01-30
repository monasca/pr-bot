// (C) Copyright 2017-2018 Hewlett Packard Enterprise Development LP
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

import { ExtendableError } from '../util';

export class DatastoreError extends ExtendableError {
  constructor(m: string) {
    super(m);
  }
}

export type FilterOperator = '=' | '>' | '>=' | '<' | '<=' | 'in';

export type Filter = {
  f: string,
  op: FilterOperator,
  val: mixed
};

export type QueryOptions = {
  sort: string,
  direction?: 'asc' | 'desc',
  offset?: number,
  limit?: number
};

export interface Storable<T, U> {
  id(): string | null;
  dump(): T;
  store(DatastoreBackend | null): Promise<any>;
  settle(): Promise<any>;

  _meta?: any;

  static kind(): string;
  static load?: (T) => U;
}

export default class DatastoreBackend {
  constructor() {

  }

  init() {
    throw new DatastoreError('init not implemented');
  }

  list<T>(
      type: Class<T>, filters: Filter[] = [],
      _options: ?QueryOptions = null): Promise<T[]> {
    throw new DatastoreError('list not implemented');
  }

  first<T>(
      type: Class<T>, filters: Filter[] = [],
      _options: ?QueryOptions = null): Promise<T> {
    return this.list(type, filters, _options).then(ents => {
      if (ents.length === 0) {
        throw new DatastoreError('no matching entities found');
      }

      return ents[0];
    });
  }

  get<T>(_type: Class<T>, _key: mixed): Promise<T> {
    throw new DatastoreError('get not implemented');
  }

  store<T, U>(object: Storable<T, U>, _settle: boolean = true): Promise<any> {
    throw new DatastoreError('store not implemented');
  }

  delete<T, U>(_object: Storable<T, U>): Promise<any> {
    throw new DatastoreError('delete not implemented');
  }
}

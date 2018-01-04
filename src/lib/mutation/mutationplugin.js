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

import { ExtendableError } from '../util';

import type Repository from '../repository/repository';
import type Update from '../update';

export type MutationPluginType = {
  srcModule: string,
  destRepository: string,
  destModule: string
};

export type MutationResult<T: Repository> = {
  update: Update<T>,
  pr: mixed,
  id: string,
  link: string,
  title: string
}

export class MutationException extends ExtendableError {
  constructor(m: string) {
    super(m);
  }
}

export default class MutationPlugin<T: Repository> {
  constructor() {

  }

  type(): MutationPluginType {
    throw new MutationException('type() not implemented');
  }

  // eslint-disable-next-line no-unused-vars
  apply(update: Update<T>): Promise<MutationResult<T>> {
    throw new MutationException('apply() not implemented');
  }
}

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

import type Task from '../task/task';

export class TaskQueueError extends ExtendableError {
  constructor(m: string) {
    super(m);
  }
}

export default class TaskQueue {
  constructor() {

  }

  init() {

  }

  await(): Promise<any> {
    throw new TaskQueueError('await() not implemented');
  }

  // eslint-disable-next-line no-unused-vars
  enqueue(...tasks: Task[]): Promise<void> {
    throw new TaskQueueError('enqueue() not implemented');
  }
}

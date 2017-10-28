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

import Task, { TaskError } from './task';

import type { TaskOptions } from './task';

export default class DummyTask extends Task {
  constructor(options: TaskOptions) {
    super({
      type: 'dummy',
      ...options
    });
  }

  execute(): Promise<mixed> {
    let delay: number = (this.data.delay: any);
    let fail: boolean = (this.data.fail: any);

    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (fail) {
          reject(new TaskError('oops'));
        } else {
          resolve();
        }
      }, delay || 5000);
    });
  }
}

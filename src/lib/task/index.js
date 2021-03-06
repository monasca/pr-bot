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

import type Task, { TaskOptions } from './task';

let initialized: boolean = false;
let taskTypes: Map<string, Class<Task>> = new Map();

function init(): void {
  taskTypes = new Map();
  taskTypes.set('add-repository', require('./add-repository').default);
  taskTypes.set('notify', require('./notify').default);
  taskTypes.set('pull-request-update', require('./pull-request-update').default);
  taskTypes.set('update-apply', require('./update-apply').default);
  taskTypes.set('update-check', require('./update-check').default);
  taskTypes.set('dummy', require('./dummy').default);

  initialized = true;
}

export function create(data: TaskOptions): Task {
  if (!initialized) {
    init();
  }

  const type = data.type;
  if (!type) {
    throw new Error('task data.type must not be null');
  }

  const clazz: ?Class<Task> = taskTypes.get(type);
  if (!clazz) {
    const TaskError = require('./task').TaskError;
    throw new TaskError(`invalid task type: ${type}`);
  }

  return new clazz(data);
}

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

import type { $Request } from 'express';

export class HttpError extends ExtendableError {
  code: number;

  constructor(m: string, code: number) {
    super(m);

    this.code = code;
  }
}

export class Dispatcher {
  actions: { [string]: ($Request) => Promise<any> };

  constructor() {
    this.actions = {};
  }

  on(name: string, func: ($Request) => Promise<any>) {
    this.actions[name] = func;
  }

  handle(req: $Request) {
    const action = req.body.action;
    if (!action) {
      throw new HttpError('an `action` is required', 400);
    }

    const func = this.actions[action];
    if (!func) {
      throw new HttpError(`invalid action: ${action}`, 400);
    }

    return func(req);
  }
}

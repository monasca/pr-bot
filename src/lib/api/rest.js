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

import * as config from '../config';
import functions from '../functions';

import { HttpError } from './common';
import Repository from '../repository/repository';

import type { $Request, $Response } from 'express';

process.on('unhandledRejection', (reason) => {
  console.log('unhandled rejection!', reason.stack);
});

function verifyToken(req: $Request) {
  const cfg = config.get();
  if (!cfg.tokens.find(t => t === req.body.token)) {
    throw new HttpError('unauthorized', 401);
  }

  return Promise.resolve(req);
}

function doPost(req: $Request) {
  // GCF doesn't seem to allow JSON bodies for GET, and doesn't give us
  // PATH_INFO ... so we'll have to handle everything in POST
  // so maybe it's less REST and more "httpie friendly", but whatever
  const action = req.body.action;
  if (!action) {
    throw new HttpError('`action` must be provided', 400);
  }

  switch (action) {
    case 'getRepository':
      return functions.getRepository(req.body.name);
    case 'listRepositories':
      return functions.listRepositories();
    case 'getRepositoryByRemote':
      return functions.getRepositoryByRemote(req.body.remote);
    case 'listDependents':
      return functions.listDependents(
        req.body.repoName,
        req.body.moduleName);
    case 'addRepository':
      return functions.addRepository(req.body).then(() => 'okay');
    case 'removeRepository':
      return functions.removeRepository(req.body.name).then(() => 'okay');
    case 'softUpdateRepository':
      return functions.softUpdateRepository(req.body.name).then(() => 'okay');
    default:
      throw new HttpError(`invalid action: ${action}`, 400);
  }
}

function sanitizeSingle(object) {
  if (object instanceof Repository) {
    return functions.sanitizeRepository(object);
  } else {
    return object;
  }
}

function sanitizeIfNecessary(object: any): any {
  if (Array.isArray(object)) {
    return Promise.all(object.map(sanitizeSingle));
  } else {
    return sanitizeSingle(object);
  }
}

export function handle(req: $Request, res: $Response): Promise<any> {
  if (req.get('content-type') !== 'application/json') {
    throw new HttpError('content-type must be application/json', 406);
  }

  if (req.method !== 'POST') {
    throw new HttpError(`method not allowed: ${req.method}`, 405);
  }

  return verifyToken(req).then(doPost).then(sanitizeIfNecessary);
}

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

const config = require('../config');
const functions = require('../functions');

const { HttpError } = require('./common');
const { Repository } = require('../repository/repository');

process.on('unhandledRejection', (reason) => {
  console.log('unhandled rejection!', reason.stack);
});

function verifyToken(req) {
  const cfg = config.get();
  if (!cfg.tokens.find(t => t === req.body.token)) {
    throw new HttpError('unauthorized', 401);
  }

  return Promise.resolve(req);
}

function doGet(req) {
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
        req.body.moduleName,
        req.body.moduleType);
    default:
      throw new HttpError(`invalid action: ${action}`, 400);
  }
}

function doPost(req) {
  const action = req.body.action;
  if (!action) {
    throw new HttpError('`action` must be provided', 400);
  }

  switch (action) {
    case 'addRepository':
      return functions.addRepository(
        req.body.name,
        req.body.type,
        req.body.remote,
        req.body.parent || null);
    case 'removeRepository':
      return functions.removeRepository(req.body.name);
    case 'softUpdateRepository':
      return functions.softUpdateRepository(req.body.name);
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

function sanitizeIfNecessary(object) {
  if (Array.isArray(object)) {
    return object.map(sanitizeSingle);
  } else {
    return sanitizeSingle(object);
  }
}

function handle(req, res) {
  if (req.get('content-type') !== 'application/json') {
    res.send(406).send('content-type must be application/json');
    return;
  }

  let func;
  if (req.method === 'GET') {
    func = doGet;
  } else if (req.method === 'POST') {
    func = doPost;
  } else {
    func = () => {
      return Promise.reject(new HttpError(
        `method not allowed: ${req.method}`, 405));
    };
  }

  return verifyToken(req).then(func).then(sanitizeIfNecessary);
}

module.exports = { handle };

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

import 'source-map-support/register';

import exitHook from 'async-exit-hook';
import bodyParser from 'body-parser';
import express from 'express';

import * as rest from './lib/api/rest';
import * as webhook from './lib/api/webhook';
import * as queue from './lib/queue';

import { HttpError } from './lib/api/common';

import type { $Request, $Response, NextFunction } from 'express';

const app = express();
app.use(bodyParser.json({
  verify: webhook.verifySecret
}));

function handleError(err: Error, res: $Response) {
  if (err instanceof HttpError) {
    res.status(err.code).send(err.message).end();
  } else {
    console.log('unhandled error:', err);
    res.status(500).send(err.message).end();
  }
}

app.post('/', async (req: $Request, res: $Response) => {
  let func;
  if (typeof req.get('X-GitHub-Event') !== 'undefined') {
    if (typeof req.get('X-Hub-Signature') === 'undefined') {
      throw new HttpError('unauthorized: signature required', 401);
    }

    func = webhook.handle;
  } else {
    func = rest.handle;
  }

  try {
    let response = await func(req, res);
    res.status(200).send(response).end();
  } catch (err) {
    handleError(err, res);
  }
});

app.use((err: Error, req: $Request, res: $Response, next: NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }

  handleError(err, res);
});

app.listen(3000, () => {
  console.log('listening on port 3000');
});

exitHook((callback) => {
  console.log('waiting for queue to flush');
  queue.get().await().then(() => {
    callback();
    console.log('queue has flushed');
  }).catch(err => {
    console.error('uncaught error on shutdown:', err);
  });
});

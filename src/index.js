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

import * as googlePubsub from './lib/api/google-pubsub';
import * as rest from './lib/api/rest';
import * as webhook from './lib/api/webhook';

import { HttpError } from './lib/api/common';

import type { $Request, $Response } from 'express';
import type { CloudFunctionsEvent } from './lib/api/google-pubsub';

function wrap(func) {
  try {
    return Promise.resolve(func());
  } catch (e) {
    return Promise.reject(e);
  }
}

export async function bot(req: $Request, res: $Response) {
  try {
    let handler;
    if (typeof req.get('X-GitHub-Event') !== 'undefined') {
      handler = webhook.handle;

      // see also: https://issuetracker.google.com/issues/36252545#comment29
      // $FlowFixMe: rawBody is a custom property in GCF
      webhook.verifySecret(req, res, req.rawBody);
    } else {
      handler = rest.handle;
    }

    const response = await wrap(() => handler(req, res));
    res.status(200).send(response).end();
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.code).send(error.message).end();
    } else {
      console.error('unhandled error:', error);
      res.status(500).send(error.message).end();
    }
  }
}

export async function pubsub(event: CloudFunctionsEvent, callback: Function) {
  googlePubsub.handlePubSub(event, callback);
}

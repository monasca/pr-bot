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

const rest = require('./lib/api/rest');
const webhook = require('./lib/api/webhook');

const { HttpError } = require('./lib/api/common');

// can use when GCF is able to validate requests properly
//function handle(req, res) {
//  const event = req.get('X-GitHub-Event');
//  if (typeof event === 'undefined') {
//    return rest.handle(req, res);
//  } else {
//    return webhook.handle(req, res);
//  }
//}

function bot(req, res) {
  // once GCF can validate requests properly, we can combine the endpoints
  //handle(req, res)
  //    .then(response => {
  //      res.status(200).send(response).end();
  //    })
  //    .catch(error => {
  //      if (error instanceof HttpError) {
  //        res.status(error.code).send(error.message).end();
  //      } else {
  //        console.log('unhandled error:', error);
  //        res.status(500).send(error.message).end();
  //      }
  //    });

  rest.handle(req, res).then(response => {
    res.status(200).send(response).end();
  }).catch(error => {
    if (error instanceof HttpError) {
      res.status(error.code).send(error.message).end();
    } else {
      console.log('unhandled error:', error);
      res.status(500).send(error.message).end();
    }
  });
}

function webhook_asdf1234(req, res) {
  webhook.handle(req, res).then(response => {
    res.status(200).send(response).end();
  }).catch(error => {
    if (error instanceof HttpError) {
      res.status(error.code).send(error.message).end();
    } else {
      console.log('unhandled error:', error);
      res.status(500).send(error.message).end();
    }
  });
}

module.exports = { bot, webhook_asdf1234 };

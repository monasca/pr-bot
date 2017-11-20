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

// The Google Cloud Functions emulator doesn't really handle PubSub functions
// That is, it provides an entrypoint to manually call functions with fake
// data, but won't call functions for you when you publish to a topic in the
// PubSub emulator
// We can roll our own by subscribing to the topic in the emulator and using
// a MemoryTaskQueue to process tasks as they come in

import 'source-map-support/register';

import exitHook from 'async-exit-hook';
import PubSub from '@google-cloud/pubsub';

import * as config from './lib/config';
import * as datastore from './lib/datastore';

import MemoryTaskQueue from './lib/queue/memory';
import Task from './lib/task/task';

const queue = new MemoryTaskQueue();
let sub;

const cfg = config.get();
if (cfg.queue.type !== 'google') {
  throw new Error('queue must be of type "google"');
}

function wait() {
  setTimeout(wait, 1000);
}

async function start() {
  const authConfig = cfg.queue.config.auth || {};
  const topicName = cfg.queue.config.topic;
  
  const client = PubSub(authConfig);
  const topic = client.topic(topicName);
  const response = await topic.createSubscription('bot-pubsub-emulator');
  sub = response[0];
  
  sub.on('message', async (message) => {
    console.log('got message: ', message);
    const taskId = Buffer.from(message.data, 'base64').toString('utf-8');
    console.log('got message, taskId: ', taskId);
  
    const task = await datastore.get().get(Task, taskId);
    console.log('got task: ', task);
    await queue.enqueue(task);
  });

  wait();
}

exitHook((callback) => {
  console.log('waiting for queue to flush');
  
  let promise;
  if (sub) {
    promise = sub.delete();
  } else {
    promise = Promise.resolve();
  }

  promise.then(() => queue.await()).then(() => {
    console.log('queue has flushed');
    callback();
  }).catch(err => {
    console.error('uncaught error on shutdown:', err);
    callback();
  });
});

start().then(() => {
  console.log('started');
});

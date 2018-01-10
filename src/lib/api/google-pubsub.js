// (C) Copyright 2017-2018 Hewlett Packard Enterprise Development LP
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

// Google Cloud PubSub entrypoint

import * as datastore from '../datastore';
import * as queue from '../queue';

import Task, { TaskError } from '../task/task';


export type PubSubMessage = {
  data: string,
  attributes: { [string]: any }
};

export type CloudFunctionsEvent = {
  data: PubSubMessage
};

async function handleError(task: Task, error: Error): Promise<void> {
  console.log(`task id=${task._id} failed:`, error);
  task.status = 'error';
  task.result = error.message;
  task.endedAt = +(new Date());
  await task.store();

  if (error instanceof TaskError && !error.retriable) {
    console.log(`task failed due to non-retriable error: ${error.message}`);
    return Promise.resolve();
  }

  const retry = task.retry();
  if (retry !== null) {
    console.log(`will retry task ${task._id}, new id=${retry._id}, `
        + `${retry.retries} attempts remain`);
    
    await retry.store();
    await queue.get().enqueue(retry);
  } else {
    console.log(`task ${task._id} failed with no retries remaining`);
  }
}

async function processTask(task: Task): Promise<void> {
  // TODO: move this to some common utils file since this implementation is
  // mostly compatible with the memory queue
  console.log(`processing task: type=${task.type} id=${task._id}`);

  task.status = 'running';
  task.startedAt = +(new Date());
  await task.store();

  try {
    const data = await task.load();
    const result = await task.execute(data);

    task.status = 'success';
    task.result = result;
    task.endedAt = +(new Date());
    await task.store();
  } catch (err) {
    await handleError(task, err);
  }
}

export function handlePubSub(
    event: CloudFunctionsEvent,
    callback: Function): void {
  const pubSubMessage = event.data;
  if (!pubSubMessage.data) {
    throw new Error('invalid PubSub message');
  }

  const taskId = Buffer.from(pubSubMessage.data, 'base64').toString('utf-8');
  const ds = datastore.get();

  ds.get(Task, taskId).then(task => {
    return processTask(task).catch(err => {
      console.error(`an unknown error occurred processing ${taskId}:`, err);
    });
  }).catch(err => {
    console.error(`could not get task with id: ${taskId}: ${err}`);
  }).then(() => callback());
}

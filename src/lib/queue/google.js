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

import PubSub from '@google-cloud/pubsub';

import * as config from '../config';

import TaskQueue, { TaskQueueError } from './taskqueue';

import type Task from '../task/task';

export default class GoogleTaskQueue extends TaskQueue {
  client: PubSub;
  topicName: string;
  topic: any;
  publisher: any;

  constructor() {
    super();

    const cfg = config.get();
    const authConfig = cfg.queue.config.auth || {};
    const topic = cfg.queue.config.topic;
    if (!topic) {
      throw new TaskQueueError('GoogleTaskQueue requires a topic name!');
    }

    this.topicName = topic;

    this.client = PubSub(authConfig);
  }

  async _init(): Promise<any> {
    const topic = this.client.topic(this.topicName);
    
    const getResponse = await topic.get({ autoCreate: true });
    this.topic = getResponse[0];

    this.publisher = this.topic.publisher({
      // we don't send enough messages to warrant batching
      // (plus we want to flush immediately)
      batching: { maxMessages: 1 }
    });
  }

  async _enqueue(...tasks: Task[]): Promise<void> {
    if (!this.publisher) {
      throw new TaskQueueError('publisher has not been initialized');
    }

    for (let task of tasks) {
      const data = Buffer.from(task.id());

      await task.store();
      await this.publisher.publish(data);
    }
  }

  async _await(): Promise<any> {
    // nothing to do in this implementation
    return null;
  }

}

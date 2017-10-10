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

const { TaskQueue } = require('./taskqueue');

class MemoryTaskQueue extends TaskQueue {
  constructor() {
    super();

    this.queue = [];
    this.active = false;
    this.promise = null;
    this.callback = null;
  }

  _handleError(task, e) {
    console.log(`task id=${task._id} failed:`, e);
    task.status = 'error';
    task.result = e.message;
    task.endedAt = +(new Date());

    return task.store().then(() => {
      const retry = task.retry();

      if (retry !== null) {
        console.log(`will retry task ${task._id}, new id=${retry._id}, `
            + `${retry.retries} attempts remain`);
        return retry.store().then(() => this.enqueue(retry));
      } else {
        console.log(`task ${task._id} failed with no retries remaining`);
        return Promise.resolve();
      }
    });
  }

  _process(task) {
    console.log(`processing task: type=${task.type} id=${task._id}`);
    this.active = true;

    task.status = 'running';
    task.startedAt = +(new Date());

    let p = task.store();
    try {
      p = p.then(() => task.load()).then(data => {
        return task.execute(data);
      }).then(result => {
        task.status = 'success';
        task.result = result;
        task.endedAt = +(new Date());

        return task.store();
      }).catch(e => this._handleError(task, e));;
    } catch (e) {
      p = this._handleError(task, e);
    }
    
    return p.catch(err => {
      console.log('task processing failed unexpectedly: ', err);
    }).then(() => {
      if (this.queue.length > 0) {
        return this._process(this.queue.shift());
      } else {
        console.log('task queue has been emptied');
        this.active = false;

        if (this.callback !== null) {
          this.callback(true);
        }
      }
    });
  }

  enqueue(...tasks) {
    this.queue.push(...tasks);

    if (!this.active) {
      console.log(`beginning task processing, ${this.queue.length} items`);
      this.promise = new Promise((resolve) => {
        this.callback = resolve;
      });

      this._process(this.queue.shift());
    }
  }

  await() {
    return this.promise || Promise.resolve(true);
  }
}

module.exports = { MemoryTaskQueue };

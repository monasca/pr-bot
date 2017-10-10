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

const hipchat = require('../hipchat');

const { Task } = require('./task');

class NotifyTask extends Task {
  constructor(options = {}) {
    super(Object.assign({
      type: 'notify',
      retries: 3
    }, options));
  }

  execute() {
    const { room, template, env } = this.data;

    let instance;
    if (room) {
      instance = hipchat.get(room);
      if (!instance) {
        console.log(`room ${room} not configured, will not notify`);
        return Promise.resolve();
      }
    } else {
      instance = hipchat.getDefault();
      if (!instance) {
        console.log('default room not configured, will not notify');
      }
    }

    return instance.sendTemplate(template, env);
  }
}

module.exports = { NotifyTask };

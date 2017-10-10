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

const datastore = require('../datastore');
const mutation = require('../mutation');
const queue = require('../queue');

const { Task } = require('./task');
const { Repository } = require('../repository/repository');
const { Update } = require('../update');

class UpdateApplyTask extends Task {
  constructor(options = {}) {
    super(Object.assign({
      type: 'update-apply',
      retries: 3
    }, options));
  }

  load() {
    const { updateId } = this.data;
    const ds = datastore.get();

    return ds.get(Update, updateId).then(up => up.dsLoad()).then(update => {
      const repoPromises = [
        update.srcRepository.settle(),
        update.destRepository.settle()
      ];

      return Promise.all(repoPromises).then(settled => {
        const [src, dest] = settled;
        return { update, src, dest };
      });
    });
  }

  execute(data) {
    const { update, src, dest } = data;

    
  }
}

module.exports = { UpdateApplyTask };

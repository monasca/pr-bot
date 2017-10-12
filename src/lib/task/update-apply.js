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

import * as datastore from '../datastore';
import * as mutation from '../mutation';
import * as queue from '../queue';

import Task from './task';
import Repository from '../repository/repository';
import Update from '../update';

import type { TaskOptions } from './task';

type UpdateApplyData = {
  update: Update,
  src: Repository,
  dest: Repository
};

export default class UpdateApplyTask extends Task {
  constructor(options: TaskOptions) {
    super({
      type: 'update-apply',
      retries: 3,
      ...options
    });
  }

  load(): Promise<UpdateApplyData> {
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

  execute(data: UpdateApplyData): Promise<mixed> {
    const { update, src, dest } = data;

    // TODO!
    return Promise.reject('TODO');
  }
}

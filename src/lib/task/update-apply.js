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

import NotifyTask from './notify';
import Task, { TaskError } from './task';
import Repository from '../repository/repository';
import Update from '../update';

import type { TaskOptions } from './task';
import type { MutationResult } from '../mutation/mutationplugin';

type UpdateApplyData = {
  update: Update<any>,
  src: Repository,
  dest: Repository
};

export default class UpdateApplyTask extends Task {
  constructor(options: TaskOptions) {
    super({
      type: 'update-apply',
      retries: 1,
      ...options
    });
  }

  async load(): Promise<UpdateApplyData> {
    const { updateId } = this.data;
    const ds = datastore.get();

    const update = await ds.get(Update, updateId).then(up => up.dsLoad());

    const src = await update.srcRepository.settle();
    const dest = await update.destRepository.settle();

    return { update, src, dest };
  }

  async execute(data: UpdateApplyData): Promise<mixed> {
    const { update, src, dest } = data;

    const srcMod = src.getModule(update.srcModule);
    if (!srcMod) {
      throw new TaskError(
        `repository ${src.name} is missing module: ${update.srcModule}`);
    }

    const destMod = dest.getModule(update.destModule);
    if (!destMod) {
      throw new TaskError(
        `repository ${dest.name} is missing module: ${update.destModule}`);
    }

    const mut = mutation.get(dest.type(), srcMod.type, destMod.type);
    if (!mut) {
      // in case we detect a dependency that doesn't have a mutation plugin
      // yet
      console.warn('WARNING: no mutation plugin found matching '
        + `destRepo=${dest.type()} src=${srcMod.type} dest=${destMod.type}`);
      return Promise.resolve();
    }

    console.log('applying mutation plugin for types:',
      dest.type(), srcMod.type, destMod.type,
      'mutation plugin: ', mut.constructor.name);

    const result: MutationResult<any> = await mut.apply(update);
    const sanitizedResult = {
      id: result.pr.head.sha,
      link: result.pr.html_url,
      title: result.pr.title,
      update: result.update.dump(),
      pr: {
        number: result.pr.number,
        html_url: result.pr.html_url
      }
    };

    if (dest.room) {
      await queue.get().enqueue(new NotifyTask({
        data: {
          room: dest.room,
          template: 'update',
          env: { result: sanitizedResult }
        }
      }));
    }
    
    return update.dump();
  }
}

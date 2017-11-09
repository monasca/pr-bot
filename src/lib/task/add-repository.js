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
import * as repository from '../repository';

import Repository from '../repository/repository';
import Task, { TaskError } from './task';

import type { TaskOptions } from './task';

export type AddRepositoryData = {
  name: string,
  type: string,
  remote: string,
  parent: string | null,
  room?: ?string,
};

export default class AddRepositoryTask extends Task {
  constructor(options: TaskOptions) {
    super({
      type: 'add-repository',
      retries: 0,
      ...options
    });
  }

  async load(): Promise<AddRepositoryData> {
    return this.data;
  }

  async execute(data: AddRepositoryData): Promise<mixed> {
    const { name, type, remote, parent, room } = data;

    const clazz = repository.get(type);
    if (!clazz) {
      throw new TaskError(`Invalid repository type: ${type}`, false);
    }

    console.log('adding repository:', { name, type, remote, parent });

    const ds = datastore.get();

    let found: boolean;
    try {
      await ds.get(Repository, name);
      found = true;
    } catch (err) {
      found = false;
    }

    if (found) {
      throw new TaskError(
        `repository already exists with name: ${name}`, false);
    }

    if (parent) {
      try {
        await ds.get(Repository, parent);
      } catch (err) {
        throw new TaskError(
          `parent repository not found: ${parent}: ${err}`, false);
      }
    }

    const repo = repository.create({ name, type, remote, parent, room });
    await repo.refreshModules();
    await repo.refreshVersions();
    await repo.refreshDependencies();
    await repo.store();

    return {
      name, type, remote,
      modules: repo.modules.length
    };
  }
}

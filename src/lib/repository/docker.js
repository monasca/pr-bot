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

//import rp from 'request-promise-native';

import Repository from './repository';

// TODO: all of this

import type { RepositoryOptions, IntermediateModule } from './repository';

/**
 * A `docker` repository for docker private docker registries like
 * library/registry or library/distribution. Notably *not* docker hub.
 */
export default class DockerRepository extends Repository {
  modulesPromise: Promise<any> | null;

  constructor(options: RepositoryOptions) {
    super(options);

    this.modulesPromise = null;
  }

  type() {
    return 'docker';
  }

  loadModules(): Promise<IntermediateModule[]> {
    if (this.modulesPromise)  {
      return this.modulesPromise;
    }

    throw new Error('TODO: not implemented yet');
  }
}

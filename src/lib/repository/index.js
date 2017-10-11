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

import DockerHubRepository from './dockerhub';
import GitRepository from './git';
import HelmRepository from './helm';

import type Repository, { RepositoryOptions } from './repository';

let initialized: boolean = false;
const repositoryTypes: Map<string, Class<Repository>> = new Map();

function init() {
  //repositoryTypes.set('docker', DockerRepository);
  repositoryTypes.set('dockerhub', DockerHubRepository);
  repositoryTypes.set('git', GitRepository);
  repositoryTypes.set('helm', HelmRepository);

  initialized = true;
}

export function get(type: string): ?Class<Repository> {
  if (!initialized) {
    init();
  }

  return repositoryTypes.get(type);
}

export function create(data: RepositoryOptions) {
  if (!initialized) {
    init();
  }

  const clazz = repositoryTypes.get(data.type);
  if (!clazz) {
    throw new Error(`invalid repository type: ${data.type}`);
  }

  return new clazz(data);
}

// (C) Copyright 2018 Hewlett Packard Enterprise Development LP
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

import fs from 'fs-extra';
import path from 'path';

import yaml from 'js-yaml';

import CheckPlugin, { simpleScan } from './checkplugin';
import {
  parseDockerTag,
  dockerTagToRemote,
  findComposeDependencies,
  loadComposeEnvironment
} from '../docker-util';
import { interpolate } from '../util';

import type GitRepository from '../repository/git';
import type { CheckPluginType, CheckPluginResult } from './checkplugin';
import type { IntermediateModule } from '../repository/repository';
import type { ModuleDependency } from '../module';

const COMPOSE_FILE_NAME = 'docker-compose.yml';
const DEFAULT_ENV_FILE = '.env';

export default class DockerComposeGitCheckPlugin extends CheckPlugin<GitRepository> {
  constructor() {
    super();
  }

  type(): CheckPluginType {
    return { repository: 'git', module: 'docker-compose' };
  }

  async matches(
      repository: GitRepository,
      moduleName: string): Promise<boolean> {
    const modulePath = await repository.modulePath(moduleName);

    return fs.exists(path.join(modulePath, COMPOSE_FILE_NAME));
  }

  check(): Promise<CheckPluginResult> {
    // docker-compose.yml is unversioned
    return Promise.resolve({
      versions: ['git'],
      current: 'git'
    });
  }

  async dependencies(
      repository: GitRepository,
      moduleName: string): Promise<ModuleDependency[]> {
    const modulePath = await repository.modulePath(moduleName);
    const composePath = path.join(modulePath, COMPOSE_FILE_NAME);
    const envPath = path.join(modulePath, DEFAULT_ENV_FILE);

    const composeContent = await fs.readFile(composePath);
    const compose = yaml.safeLoad(composeContent);

    let env: { [string]: string };
    if (await fs.exists(envPath)) {
      env = await loadComposeEnvironment(envPath);
    } else {
      env = {};
    }

    const dependencies: ModuleDependency[] = [];
    for (let ref of findComposeDependencies(compose)) {
      const fullImage = interpolate(ref.value.image, env);
      const parsedTag = parseDockerTag(fullImage);

      dependencies.push({
        name: parsedTag.image,
        version: parsedTag.tag,
        type: 'docker',
        remote: dockerTagToRemote(parsedTag)
      });
    }

    return dependencies;
  }

  async scan(
      repository: GitRepository,
      localPath: string): Promise<IntermediateModule[]> {
    const modules = await simpleScan(repository, this, localPath);

    // explicitly support top-level modules here
    if (await fs.exists(path.join(localPath, COMPOSE_FILE_NAME))) {
      modules.push({
        name: repository.name,
        type: 'docker-compose',
        path: '.'
      });
    }

    return modules;
  }
}

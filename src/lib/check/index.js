// (C) Copyright 2017-2018 Hewlett Packard Enterprise Development LP
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

import DockerComposeGitCheckPlugin from './docker-compose-git';
import DockerGitCheckPlugin from './docker-git';
import DockerHubCheckPlugin from './dockerhub';
import HelmCheckPlugin from './helm';
import HelmGitCheckPlugin from './helm-git';
import LandscaperGitCheckPlugin from './landscaper-git';

import type CheckPlugin from './checkplugin';
import type Repository, { IntermediateModule } from '../repository/repository';

let initialized: boolean = false;
let plugins: CheckPlugin<any>[] = [];

function init() {
  plugins = [
    new DockerComposeGitCheckPlugin(),
    new DockerGitCheckPlugin(),
    new DockerHubCheckPlugin(),
    new HelmCheckPlugin(),
    new HelmGitCheckPlugin(),
    new LandscaperGitCheckPlugin()
  ];
}

export function get(repoType: string, moduleType: string) {
  if (!initialized) {
    init();
  }

  for (let plugin of plugins) {
    let pType = plugin.type();
    if (pType.repository === repoType && pType.module === moduleType) {
      return plugin;
    }
  }

  return null;
}

export async function resolve(repository: Repository, moduleName: string) {
  if (!initialized) {
    init();
  }

  for (let plugin of plugins) {
    if (plugin.type().repository !== repository.type()) {
      continue;
    }

    let match = await plugin.matches(repository, moduleName);
    if (match) {
      return plugin.type().repository;
    }
  }

  return null;
}

/**
 * Scans a local repository mirror for modules. While related to `resolve()`,
 * this allows many differently-typed modules to coexist in a single repository,
 * so long as the repository can be fully mirrored to the local filesystem.
 * @param {Repository} repository the repository to scan
 * @param {string} localPath path to a local mirror of the repository
 * @returns {Promise<object>} a list of { name, type } objects for each detected
 *                            module
 */
export async function scan(
      repository: Repository,
      localPath: string): Promise<IntermediateModule[]> {
  if (!initialized) {
    init();
  }

  let modules: IntermediateModule[] = [];
  for (let plugin of plugins) {
    let result: IntermediateModule[] = await plugin.scan(repository, localPath);
    modules.push(...result);
  }

  return modules;
}

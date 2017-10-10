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

import fs from 'fs-extra';
import path from 'path';

import parser from 'docker-file-parser';

import CheckPlugin, { simpleScan } from './checkplugin';
import { parseDockerTag, dockerTagToRemote } from '../docker-util';

import type GitRepository from '../repository/git';
import type { CheckPluginType, CheckPluginResult } from './checkplugin';
import type { IntermediateModule } from '../repository/repository';
import type { ModuleDependency } from '../module';

export default class DockerGitCheckPlugin extends CheckPlugin<GitRepository> {
  constructor() {
    super();
  }

  type(): CheckPluginType {
    return { repository: 'git', module: 'docker' };
  }

  matches(repository: GitRepository, moduleName: string): Promise<boolean> {
    return repository.clone()
        .then(() => repository.modulePath(moduleName))
        .then(modulePath => fs.exists(path.join(modulePath, 'Dockerfile')));
  }

  // eslint-disable-next-line no-unused-vars
  check(repository: GitRepository, moduleName: string): Promise<CheckPluginResult> {
    // docker sources are effectively unversioned, since tags are often
    // generated at build/release time (timestamps or otherwise)
    // since dependents only care about binary versions, we don't need real
    // values here
    return Promise.resolve({
      versions: ['git'],
      current: 'git'
    });
  }

  dependencies(repository: GitRepository, moduleName: string): Promise<ModuleDependency[]> {
    // future improvement: we can determine OS-level dependencies here too,
    // e.g. filter for RUN calls, use shell-quote to find apk calls
    // determining versions would be interesting though...
    // note: does not fully support multi-stage builds!
    return repository.clone()
        .then(() => repository.modulePath(moduleName))
        .then(modulePath => fs.readFile(path.join(modulePath, 'Dockerfile'), 'utf-8'))
        .then(contents => {
          const dockerfile = parser.parse(contents);
          const from = dockerfile.find(line => line.name === 'FROM');
          const tag = parseDockerTag(from.args);

          return [{
            name: tag.image,
            version: tag.tag,
            type: 'docker',
            remote: dockerTagToRemote(tag)
          }];
        });
  }

  scan(repository: GitRepository, localPath: string): Promise<IntermediateModule[]> {
    return simpleScan(repository, this, localPath);
  }
}

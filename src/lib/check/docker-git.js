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

import fs from 'fs-extra';
import path from 'path';

import parser from 'docker-file-parser';

import CheckPlugin, { simpleScan } from './checkplugin';
import { parseDockerTag, dockerTagToRemote, loadDBuildVariant } from '../docker-util';
import { interpolate } from '../util';

import type GitRepository from '../repository/git';
import type { CheckPluginType, CheckPluginResult } from './checkplugin';
import type { IntermediateModule } from '../repository/repository';
import type { ModuleDependency } from '../module';

const DBUILD_PREFERRED_VARIANTS = ['latest', 'master'];

/**
 * Hacky support for named multi-stage builds.
 *
 * `docker-file-parse` reads multistage FROM instructions as
 * `container as name`. If we encounter an ' as ', discard it and all content
 * to the right.
 * @param {string} string
 */
function normalizeFromArgs(string: string): string {
  const index = string.indexOf(' as ');
  if (index > -1) {
    return string.substring(0, index);
  } else {
    return string;
  }
}

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

  check(_repo: GitRepository, _mod: string): Promise<CheckPluginResult> {
    // docker sources are effectively unversioned, since tags are often
    // generated at build/release time (timestamps or otherwise)
    // since dependents only care about binary versions, we don't need real
    // values here
    return Promise.resolve({
      versions: ['git'],
      current: 'git'
    });
  }

  async dependencies(
      repository: GitRepository,
      moduleName: string): Promise<ModuleDependency[]> {
    // future improvement: we can determine OS-level dependencies here too,
    // e.g. filter for RUN calls, use shell-quote to find apk calls
    // determining versions would be interesting though...
    const modulePath = await repository.modulePath(moduleName);

    // TODO: this is a bit hacky, this should be configurable with issue #17
    // (right now we just hope the correct variant is latest or master)
    let vars: { [string]: string } = {};
    const variant = await loadDBuildVariant(
      modulePath,
      DBUILD_PREFERRED_VARIANTS,
      true);
    if (variant && variant.args) {
      vars = variant.args;
    }

    const dockerfilePath = path.join(modulePath, 'Dockerfile');
    const contents = await fs.readFile(dockerfilePath, 'utf-8');
    const dockerfile = parser.parse(contents);
    const froms = dockerfile.filter(line => line.name === 'FROM');

    const dependencies: ModuleDependency[] = [];
    for (let from of froms) {
      // FROM commands often have lots of extra stuff to worry about, e.g.
      //  - ' AS ...' for multistage builds, since docker-file-parse doesn't
      //    fully support this feature
      //  - interpolated variables from ARGs: ${VERSION}
      //    (we load these values from the dbuild manifest)
      // a worst case example: FROM alpine:${ALPINE_VERSION} as go-builder
      // if $ALPINE_VERSION is 3.6, that should be our dependency

      from = normalizeFromArgs(from.args);
      from = interpolate(from, vars);
      const tag = parseDockerTag(from);

      dependencies.push({
        name: tag.image,
        version: tag.tag,
        type: 'docker',
        remote: dockerTagToRemote(tag)
      });
    }

    return dependencies;
  }

  scan(
      repository: GitRepository,
      localPath: string): Promise<IntermediateModule[]> {
    return simpleScan(repository, this, localPath);
  }
}

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

import yaml from 'js-yaml';

import CheckPlugin, { simpleScan } from './checkplugin';

import { parseDockerTag, dockerTagToRemote } from '../docker-util';
import { findDockerDependencies } from '../helm-util';

import type GitRepository from '../repository/git';
import type { CheckPluginResult, CheckPluginType } from './checkplugin';
import type { IntermediateModule } from '../repository/repository';
import type { ModuleDependency } from '../module';

export default class HelmGitCheckPlugin extends CheckPlugin<GitRepository> {
  constructor() {
    super();
  }

  type(): CheckPluginType {
    return { repository: 'git', module: 'helm' };
  }

  matches(repository: GitRepository, moduleName: string): Promise<boolean> {
    return repository.clone()
        .then(() => repository.modulePath(moduleName))
        .then(modulePath => fs.exists(path.join(modulePath, 'Chart.yaml')));
  }

  check(repository: GitRepository, moduleName: string): Promise<CheckPluginResult> {
    return repository.clone()
        .then(() => repository.modulePath(moduleName))
        .then(modulePath => fs.readFile(path.join(modulePath, 'Chart.yaml')))
        .then(content => yaml.safeLoad(content))
        .then(chart => ({
          versions: [chart.version],
          current: chart.version
        }));
  }

  dependencies(
        repository: GitRepository,
        moduleName: string): Promise<ModuleDependency[]> {

    const pathPromise = repository.clone()
        .then(() => repository.modulePath(moduleName));

    // helm -> helm dependencies
    const requirementsPromise = pathPromise.then(modulePath => {
      const requirementsPath = path.join(modulePath, 'requirements.yaml');

      return fs.exists(requirementsPath).then(exists => {
        if (!exists) {
          return [];
        }

        return fs.readFile(requirementsPath)
            .then(content => yaml.safeLoad(content))
            .then(reqs => reqs ? reqs : { dependencies: [] })
            .then(reqs => reqs.dependencies.map(dep => ({
              name: dep.name,
              version: dep.version,
              type: 'helm',
              remote: dep.repository
            })));
      });
    });

    // helm -> docker dependencies
    const valuesPromise = pathPromise.then(modulePath => {
      const valuesPath = path.join(modulePath, 'values.yaml');

      return fs.exists(valuesPath).then(exists => {
        if (!exists) {
          return [];
        }

        return fs.readFile(valuesPath, 'utf-8')
            .then(content => yaml.safeLoad(content))
            .then(values => {
              return findDockerDependencies(values).map(dep => {
                const fullTag = `${dep.value.repository}:${dep.value.tag}`;
                const parsed = parseDockerTag(fullTag);

                return {
                  name: parsed.image,
                  version: parsed.tag,
                  remote: dockerTagToRemote(parsed),
                  type: 'docker'
                };
              });
            });
      });
    });

    // TODO find docker dependencies too, something like...
    // const helmPromise = ...
    // const dockerPromise = ...
    // return Promise.all([helmPromise, dockerPromise]).then(...)

    return Promise.all([requirementsPromise, valuesPromise]).then(nested => {
      // flatten
      return [].concat(...nested);
    });
  }

  scan(repository: GitRepository,
        localPath: string): Promise<IntermediateModule[]> {
    return simpleScan(repository, this, localPath);
  }
}

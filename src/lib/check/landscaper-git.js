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

import glob from 'glob';
import jsonpath from 'jsonpath';
import yaml from 'js-yaml';

import CheckPlugin from './checkplugin';

import type GitRepository from '../repository/git';
import type { CheckPluginType, CheckPluginResult } from './checkplugin';
import type { IntermediateModule } from '../repository/repository';
import type { ModuleDependency } from '../module';

/**
 * YAML fields that must exist to be considered a landscaper file
 */
const LANDSCAPER_TESTS: string[] = [
  '$.name',
  '$.configuration',
  '$.release.chart',
  '$.release.version'
];

async function testLandscaper(yamlPath: string) {
  const rawYaml = fs.readFile(yamlPath, 'utf-8');

  let obj;
  try {
    obj = yaml.safeLoad(rawYaml); 
  } catch (e) {
    return false;
  }

  if (typeof obj !== 'object') {
    return false;
  }
  
  for (let test of LANDSCAPER_TESTS) {
    const value = jsonpath.value(obj, test);
    if (typeof value === 'undefined') {
      return false;
    }
  }

  return true;
}

export function scanLandscaper(
      baseDir: string): Promise<IntermediateModule[]> {
  return new Promise((resolve, reject) => {
    // TODO: .yaml.tpl?
    glob(path.join(baseDir, '**/*.yaml'), (err, matches) => {
      if (err) {
        reject(err);
      } else {
        resolve(matches);
      }
    });
  }).then(matches => {
    const promises = matches.map(match => {
      return testLandscaper(match).then(result => {
        if (result) {
          // remove baseDir and .yaml
          let name = match.slice(baseDir.length, -5);
          if (name.startsWith('/')) {
            name = name.slice(1);
          }

          // TODO: consider stripping .yaml (see matches() TODO)
          return { name, type: 'landscaper' };
        } else {
          return null;
        }
      });
    });

    // filter nulls to leave list[list[object]]
    return Promise.all(promises).then(rs => rs.filter(r => r !== null));
  }).then(lists => {
    // flatten
    return lists.reduce((acc, cur) => acc.concat(cur), [])
  });
}

/**
 * Attempt to load a landscaper helm repository mapping 'repos.txt' from the
 * root of the checked out repository. A repository mapping contains lines of
 * the form "<name> <URL>" where <name> and <URL> refer to a Helm repository
 * referenced in a landscaper file's `.release.chart` field.
 * @param {Repository} repository 
 */
async function helmRepoMap(
      repository: GitRepository,
      repoName: string): Promise<string | null> {
  const localPath: string = await repository.clone();
  const reposPath = path.join(localPath, 'repos.txt');

  const exists = await fs.exists(reposPath);
  if (!exists) {
    return null;
  }

  const contents = await fs.readFile(reposPath, 'utf-8');
  const map: Map<string, string> = new Map();
  for (let line of contents.split('\n')) {
    const [name, remote] = line.trim().split(' ');
    map.set(name, remote);
  }

  return map.get(repoName) || null;
}

export type LandscaperChart = {
  release: {
    chart: string,
    version: string
  }
};

/**
 * Detects landscaper (https://github.com/Eneco/landscaper) repositories and
 * modules.
 */
export default class LandscaperGitCheckPlugin 
      extends CheckPlugin<GitRepository> {
  constructor() {
    super();
  }

  type(): CheckPluginType {
    return { repository: 'git', module: 'landscaper' };
  }

  scan(repository: GitRepository, localPath: string): Promise<IntermediateModule[]> {
    return scanLandscaper(localPath);
  }

  async matches(
        repository: GitRepository,
        moduleName: string): Promise<boolean> {
    const modulePath = await repository.modulePath(`${moduleName}.yaml`);

    return testLandscaper(modulePath);
  }

  async check(
        repository: GitRepository,
        moduleName: string): Promise<CheckPluginResult> {
    const modulePath = await repository.modulePath(`${moduleName}.yaml`);
    const contents = await fs.readFile(modulePath, 'utf-8');

    const obj: LandscaperChart = yaml.safeLoad(contents);
    return {
      versions: [obj.release.version],
      current: obj.release.version
    };
  }

  async dependencies(
        repository: GitRepository,
        moduleName: string): Promise<ModuleDependency[]> {
    const modulePath = await repository.modulePath(`${moduleName}.yaml`);
    const contents = await fs.readFile(modulePath, 'utf-8');
    const obj: LandscaperChart = yaml.safeLoad(contents);

    const [chartRef, version] = obj.release.chart.split(':');
    const [repo, name] = chartRef.split('/');

    const remote = await helmRepoMap(repository, repo);

    // TODO: handle null remotes better
    if (!remote) {
      console.warn('remote not found for module in landscaper repo: ',
          repository.name, moduleName);
      return [];
    }

    return [{
      name, version, remote,
      type: 'helm',
    }];
  }
}

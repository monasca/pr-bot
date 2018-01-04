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

import * as util from '../util';
import { filterDirectories } from '../fs-util';

import type { ModuleDependency } from '../module';
import type Repository, { IntermediateModule } from '../repository/repository';

const EXCLUDE_DIRECTORIES: string[] = ['.git', '.idea'];

export class CheckException extends util.ExtendableError {
  constructor(m: string) {
    super(m);
  }
}

/**
 * Performs a local scan of the repository, returning a Module instance for
 * each non-blacklisted subdirectory under localPath.
 * @param {Repository} repository the repository instance to scan
 * @param {CheckPlugin} plugin the plugin to check against
 * @param {string} localPath path to a local mirror of the repository
 * 
 * @return {Promise} a Promise returning a list of Modules
 */
export function simpleScan<T: Repository>(
      repository: T,
      plugin: CheckPlugin<T>,
      localPath: string): Promise<IntermediateModule[]> {
  return fs.readdir(localPath)
      .then(filterDirectories(localPath, ...EXCLUDE_DIRECTORIES))
      .then(dirs => Promise.all(dirs.map(dir => {
        return plugin.matches(repository, dir).then(match => {
          if (match) {
            return { name: dir, type: plugin.type().module };
          } else {
            return null;
          }
        });
      })))
      .then(modules => modules.filter(m => m !== null));
}

export type CheckPluginType = {
  repository: string,
  module: string
};

export type CheckPluginResult = {
  versions: string[],
  current: string | null
};

export default class CheckPlugin<T: Repository> {
  constructor() {

  }

  type(): CheckPluginType {
    throw new CheckException('type() not implemented');
  }
  
  // eslint-disable-next-line no-unused-vars
  matches(repository: T, module: string): Promise<boolean> {
    throw new CheckException('matches() not implemented');
  }

  /**
   * Scans a local copy of a repository for modules. Since this requires a local
   * mirror it generally is only used with git repositories.
   * @param {Repository} repository 
   * @return {Promise} a promise returning detected Module instances
   */
  scan(repository: T,
        localPath: string): Promise<IntermediateModule[]> { // eslint-disable-line no-unused-vars
    throw new CheckException('scan() not implemented');
  }

  // eslint-disable-next-line no-unused-vars
  check(repository: T, module: string): Promise<CheckPluginResult> {
    throw new CheckException('check() not implemented');
  }

  // eslint-disable-next-line no-unused-vars
  dependencies(repository: T, module: string): Promise<ModuleDependency[]> {
    throw new CheckException('dependencies() not implemented');
  }
}

export function ensureReady(repository: Repository) {
  if (!repository.ready()) {
    throw new CheckException('repository must be checked out');
  }
}

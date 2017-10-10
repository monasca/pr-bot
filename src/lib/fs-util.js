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

import path from 'path';

import fs from 'fs-extra';

export function filterDirectories(
      baseDir: string,
      ...excludes: string[]): (string[]) => Promise<string[]> {
  return async (files: string[]): Promise<string[]> => {
    files = files.filter(f => !excludes.includes(f));

    let promises: Promise<string | null>[] = files.map((file: string) => {
      return fs.stat(path.join(baseDir, file)).then(stat => {
        if (stat.isDirectory()) {
          return file;
        } else {
          return null;
        }
      });
    });

    let maybeDirs: (string | null)[] = await Promise.all(promises);
    let dirs: string[] = [];
    for (let dir of maybeDirs) {
      if (dir) {
        dirs.push(dir);
      }
    }

    return dirs;
  };
}

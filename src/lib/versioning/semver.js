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

import semver from 'semver';

import VersioningPolicy from './versioningpolicy';

export default class SemanticVersioningPolicy extends VersioningPolicy {
  constructor() {
    super();
  }

  current(versions: string[]): string {
    return versions.sort(semver.rcompare)[0];
  }
}

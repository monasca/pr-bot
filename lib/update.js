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

class Update {
  constructor(options) {
    this.repository = options.repository;
    this.module = options.module;
    this.fromVersion = options.fromVersion;
    this.toVersion = options.toVersion;
    this._meta = options._meta || {};

  }

  static kind() {
    return 'Update';
  }

  id() {
    return null;
  }

  dump() {
    return {
      repository: this.repository,
      module: this.module,
      fromVersion: this.fromVersion,
      toVersion: this.toVersion
    };
  }
}

module.exports = { Update };

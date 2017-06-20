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

const { CheckPlugin } = require('./checkplugin');

class HelmCheckPlugin extends CheckPlugin {
  constructor() {
    super();
  }

  type() {
    return { repository: 'helm', module: 'helm' };
  }

  // eslint-disable-next-line no-unused-vars
  matches(repository, moduleName) {
    // no-op for specialized repos like docker, helm
    return Promise.resolve(true);
  }

  check(repository, moduleName) {
    return repository.loadIndex().then(index => ({
      versions: index.entries[moduleName].map(v => v.version),
      current: index.entries[moduleName][0].version
    }));
  }

  // eslint-disable-next-line no-unused-vars
  dependencies(repository, moduleName) {
    // helm only supports reverse dependencies (without downloading/gunzipping
    // the chart)
    return Promise.resolve([]);
  }
}

module.exports = {
  HelmCheckPlugin
};

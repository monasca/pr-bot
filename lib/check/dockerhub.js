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

const {
  parseDockerTag,
  loadTagHashes,
  selectCurrentTag
} = require('../docker-util');

class DockerHubCheckPlugin extends CheckPlugin {
  constructor() {
    super();
  }

  type() {
    return { repository: 'dockerhub', module: 'docker' };
  }

  // eslint-disable-next-line no-unused-vars
  matches(repository, moduleName) {
    // always true for specialized repositories
    return Promise.resolve(true);
  }

  check(repository, moduleName) {
    const { namespace } = repository;
    const parsedTag = parseDockerTag(`${namespace}/${moduleName}`);

    return loadTagHashes(parsedTag).then(taggedHashes => {
      if (taggedHashes.length === 0) {
        return { versions: [], current: null };
      }

      return {
        versions: taggedHashes.map(o => o.name),
        current: selectCurrentTag(taggedHashes)
      };
    });
  }

  // eslint-disable-next-line no-unused-vars
  dependencies(repository, moduleName) {
    // binary docker dependencies are self contained and have no dependencies
    return Promise.resolve([]);
  }
}

module.exports = { DockerHubCheckPlugin };
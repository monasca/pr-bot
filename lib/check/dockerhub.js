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

const { DOCKER_HUB_URL, loadDockerHubResults } = require('../docker-util');

// don't include common non-unique tags
const CURRENT_IGNORED_TAGS = [
  'latest',
  'master'
];

function selectCurrent(tags) {
  // tags come sorted by last update date (descending), so we can guess at the
  // current version based on order (but we don't want latest, etc since we
  // can't easily detect changes, plus it's a bad convention)
  // TODO: this logic is really flawed and we need a better way to determine
  // dependency relationships, it will generate lots of false positives and 
  // handle multiple tag updates/branches poorly
  const preferred = tags.filter(t => !CURRENT_IGNORED_TAGS.includes(t));

  if (preferred.length > 0) {
    return preferred[0];
  } else {
    // if only master/latest are tagged...
    return tags[0];
  }
}

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
    const url = `${DOCKER_HUB_URL}/${namespace}/${moduleName}/tags/`;

    return loadDockerHubResults(url).then(tagObjects => {
      const tags = tagObjects.map(o => o.name);

      return {
        versions: tags,
        current: selectCurrent(tags)
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

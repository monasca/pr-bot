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

const { Repository } = require('./repository');

const {
  DOCKER_HUB_URL,
  loadDockerHub,
  loadDockerHubResults
} = require('../util');

/**
 * Docker Hub uses a different API, go figure. Might as well take advantage of
 * the proper namespacing, though.
 */
class DockerHubRepository extends Repository {
  constructor(options = {}) {
    super(options);

    const [ namespace, image ] = this.remote.split('/');
    this.namespace = namespace;
    this.image = image || null;

    this.modulesPromise = null;
  }

  type() {
    return 'dockerhub';
  }

  loadModules() {
    if (this.modulesPromise)  {
      return this.modulesPromise;
    }

    if (this.image) {
      const url = `${DOCKER_HUB_URL}/${this.namespace}/${this.image}/`;
      this.modulesPromise = loadDockerHub(url).then(image => {
        return { name: image.name, type: 'docker' };
      });

      return this.modulesPromise;
    } else {
      const url = `${DOCKER_HUB_URL}/${this.namespace}`;
      this.modulesPromise = loadDockerHubResults(url).then(images => {
        return images.map(image => ({ name: image.name, type: 'docker' }));
      });

      return this.modulesPromise;
    }
  }
}

module.exports = {
  DOCKER_HUB_URL,
  DockerHubRepository
};

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

const rp = require('request-promise-native');

const config = require('./config');

const DOCKER_HUB_URL = 'https://hub.docker.com/v2/repositories';

function loadDockerHub(uri) {
  const options = { uri, json: true };

  const cfg = config.get();
  if (cfg.docker && cfg.docker.proxy) {
    options.proxy = cfg.docker.proxy;
  }

  return rp(options);
}

/**
 * Load paginated docker hub results.
 * @param {string} uri 
 * @param {object[]} results 
 */
function loadDockerHubResults(uri, results = []) {
  return loadDockerHub(uri).then(response => {
    results = results.concat(response.results);

    if (response.next) {
      return loadDockerHubResults(response.next, results);
    } else {
      return results;
    }
  });
}

function parseDockerTag(string) {
  // NOTE: will not properly parse images with no namespace on a private
  // registry (refs become ambiguous enough that it isn't worth trying)
  let [ registry, namespace, image, tag ] = [ null, null, null, null ];

  const parts = string.split('/');
  if (parts.length === 1) {
    [ image ] = parts;
  } else if (parts.length === 2) {
    [ namespace, image ] = parts;
  } else if (parts.length === 3) {
    [ registry, namespace, image ] = parts;
  }

  if (image.includes(':')) {
    [ image, tag ] = image.split(':');
  }

  return { registry, namespace, image, tag };
}

function dockerTagToRemote(tag) {
  let namespace = tag.namespace;
  if (namespace === null) {
    namespace = 'library';
  }

  if (tag.registry) {
    return `${tag.registry}/${namespace}`;
  } else {
    return namespace;
  }
}

module.exports = {
  parseDockerTag,
  dockerTagToRemote,
  DOCKER_HUB_URL,
  loadDockerHub,
  loadDockerHubResults
};

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
const DOCKER_REGISTRY_URL = 'https://registry.hub.docker.com/v2';
const MANIFEST_CONTENT_TYPE = 'application/vnd.docker.distribution.manifest.v2+json';

const DOCKER_AUTH_URL = 'https://auth.docker.io/token';
const DOCKER_AUTH_SERVICE = 'registry.docker.io';

function loadDockerHub(uri, options = {}) {
  options = Object.assign({}, { uri, json: true }, options);

  const cfg = config.get();
  if (cfg.docker && cfg.docker.proxy) {
    options.proxy = cfg.docker.proxy;
  }

  return rp(options);
}

/**
 * Load paginated docker hub results. Unlike the registry API, this API
 * gives date stamps.
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

/**
 * Docker hub tags are datestamped and ordered, unlike docker registry API tags.
 * We'd need to make 2 calls to get similar data from the registry API.
 * @param {object} parsedTag 
 */
function loadDockerHubTags(parsedTag) {
  const repo = dockerTagToRepository(parsedTag);
  const url = `${DOCKER_HUB_URL}/${repo}/tags/`;
  return loadDockerHubResults(url);
}

function loadRegistryToken(repository) {
  // todo support querying private registries
  const options = {
    qs: {
      service: DOCKER_AUTH_SERVICE,
      scope: `repository:${repository}:pull`
    }
  };

  return loadDockerHub(DOCKER_AUTH_URL, options).then(response => {
    return response.token;
  });
}

/**
 * Loads tags for a particular repository. Note that these tags are neither
 * datestamped nor ordered.
 * @param {object} parsedTag the tag as parsed by parseDockerTag
 * @param {string} token auth token if available
 */
function loadTags(parsedTag, token = null) {
  const repo = dockerTagToRepository(tag);
  let tokenPromise;
  if (token === null) {
    tokenPromise = loadRegistryToken(repo);
  } else {
    tokenPromise = Promise.resolve(token);
  }

  return tokenPromise.then(token => {
    const url = `${DOCKER_REGISTRY_URL}/${repo}/tags/list`;
    return loadDockerHub(url, {
      auth: { bearer: token }
    }).then(response => {
      return response.tags;
    });
  });
}

/**
 * Loads an image digest from the appropriate docker registry
 * @param {object} tag 
 * @param {string} token 
 */
function loadHash(tag, token = null) {
  const repo = dockerTagToRepository(tag);
  let tokenPromise;
  if (token === null) {
    tokenPromise = loadRegistryToken(repo);
  } else {
    tokenPromise = Promise.resolve(token);
  }

  return tokenPromise.then(token => {
    const url = `${DOCKER_REGISTRY_URL}/${repo}/manifests/${tag.tag}`;
    return loadDockerHub(url, {
      headers: { Accept: MANIFEST_CONTENT_TYPE },
      auth: { bearer: token },
    }).then(response => {
      return response.config.digest;
    });
  });
}

/**
 * Load tag hashes for a particular repository while minimizing token requests.
 * Note that this method loads only the most recent tags within `within` ms of
 * the most recent tag.
 * 
 * @param {*} parsedTag parsed tag object from parseDockerTag
 * @param {*} within time in ms for tags to load, defaults to 1hr
 */
function loadTagHashes(parsedTag, within = 1800000*2) {
  const repo = dockerTagToRepository(parsedTag);

  return loadDockerHubTags(parsedTag).then(tags => {
    tags = tags.map(tag => {
      return { name: tag.name, updated: +new Date(tag.last_updated) };
    });

    console.log('first:', tags[0].updated)
    const oldestDateStamp = tags[0].updated - within;
    console.log('max:', oldestDateStamp);
    tags = tags.filter(tag => tag.updated >= oldestDateStamp);

    return loadRegistryToken(repo).then(token => {
      return Promise.all(tags.map(tag => {
        const tagObject = Object.assign({}, parsedTag, { tag: tag.name });

        return loadHash(tagObject, token).then(hash => ({
          tag: tag.name,
          hash
        }));
      }));
    });
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

function dockerTagToRepository(tag) {
  if (tag.namespace) {
    return `${tag.namespace}/${tag.image}`;
  } else {
    return tag.image;
  }
}

module.exports = {
  parseDockerTag,
  dockerTagToRemote,
  DOCKER_HUB_URL,
  loadDockerHub,
  loadDockerHubResults,
  loadRegistryToken,
  loadHash,
  loadTagHashes
};

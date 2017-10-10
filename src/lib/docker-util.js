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

import rp from 'request-promise-native';

import config from './config';

import { ExtendableError } from './util';

export const DOCKER_HUB_URL = 'https://hub.docker.com/v2/repositories';
export const DOCKER_REGISTRY_URL = 'https://registry.hub.docker.com/v2';
export const MANIFEST_CONTENT_TYPE = 'application/vnd.docker.distribution.manifest.v2+json';

export const DOCKER_AUTH_URL = 'https://auth.docker.io/token';
export const DOCKER_AUTH_SERVICE = 'registry.docker.io';

// a list of version formats in order of preference
// 'latest' aliases will already be sorted be recency, but if one or more tags
// matches any of the following, they will be considered instead
// if there are multiple matches or no matches, the tag witih the longest length
// will be selected
// this could be improved by assigning priorities and comparison functions to
// each supported version format, but this seems to give the desired results
// for now
const VERSION_FORMATS = [
  /^master-\d{8}-\d{6}$/, // datestamped master
  /^\d+\.\d+\.\d(?:-[\w-.]+)?$/ // semver with optional tag
];

export type DockerTag = {
  registry: ?string,
  namespace: ?string,
  image: string,
  tag: string
}

export type DockerTagHash = {
  tag: string,
  hash: string
};

export type DockerHubResult = {[string]: string};
export type DockerHubTagResult = {
  name: string,
  last_updated: string | number
};

export type DockerHubResponse = {
  results: DockerHubResult[],
  next: string
};

export type DockerHubTag = {
  name: string,
  updated: number
};

export async function loadDockerHub(
      uri: string,
      options: {[string]: mixed} = {}): Promise<any> {
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
export async function loadDockerHubResults(
      uri: string,
      results: DockerHubResult[] = []): Promise<DockerHubResult[]> {
  const response = await loadDockerHub(uri);
  results = results.concat(response.results);

  if (response.next) {
    return loadDockerHubResults(response.next, results);
  } else {
    return results;
  }
}

/**
 * Docker hub tags are datestamped and ordered, unlike docker registry API tags.
 * We'd need to make 2 calls to get similar data from the registry API.
 * @param {object} parsedTag
 */
export async function loadDockerHubTags(
      parsedTag: DockerTag): Promise<DockerHubTag[]> {
  const repo = dockerTagToRepository(parsedTag);
  const url = `${DOCKER_HUB_URL}/${repo}/tags/`;

  const rawTags = await loadDockerHubResults(url);

  // tags should already be sorted last_update descending (i.e. most recent
  // first)
  const tags = rawTags.map((tag: DockerHubResult) => {
    return ({ name: tag.name, updated: +new Date(tag.last_updated) });
  });

  return tags.filter(tag => tag.updated > 0);
}

/**
 * Requests a public read-only token from DOCKER_REGISTRY_URL scoped to the
 * given repository.
 * @param {string} repository the repository for which to request a token
 */
export async function loadRegistryToken(repository: string): Promise<string> {
  // TODO: support querying private registries
  // should just use parsedTag like everything else here...
  const options = {
    qs: {
      service: DOCKER_AUTH_SERVICE,
      scope: `repository:${repository}:pull`
    }
  };

  let response = await loadDockerHub(DOCKER_AUTH_URL, options);
  return response.token;
}

/**
 * Loads tags for a particular repository. Note that these tags are neither
 * datestamped nor ordered.
 *
 * TODO: not used yet, will be necessary to support private docker registries
 * but is not ideal for dockerhub (requires 2 api calls per tag)
 * @param {object} parsedTag the tag as parsed by parseDockerTag
 * @param {string} token auth token if available
 */
export async function loadTags(
      parsedTag: DockerTag,
      token: ?string = null): Promise<mixed> {
  const repo = dockerTagToRepository(parsedTag);
  let tokenPromise: Promise<string>;
  if (token) {
    tokenPromise = Promise.resolve(token);
  } else {
    tokenPromise = loadRegistryToken(repo);
  }

  const fetchedToken = await tokenPromise;
  const url = `${DOCKER_REGISTRY_URL}/${repo}/tags/list`;
  const response = await loadDockerHub(url, {
    auth: { bearer: fetchedToken }
  });

  return response.tags;
}

/**
 * Loads an image digest from the appropriate docker registry
 * @param {object} tag the tag as parsed by `parseDockerTag`
 * @param {string} token a token, one will be requested if not provided
 */
export function loadHash(tag: DockerTag, token: ?string = null): Promise<?string> {
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
      if (response.config && response.config.digest) {
        return response.config.digest;
      } else {
        // some really old images don't have v2 digests
        // we'll just ignore those...
        return null;
      }
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
export async function loadTagHashes(
      parsedTag: DockerTag,
      within: number = 3600000): Promise<DockerTagHash[]> {
  const repo = dockerTagToRepository(parsedTag);
  let tags = await loadDockerHubTags(parsedTag);

  // try to use latest if it exists, otherwise use the most recently updated
  let withinTag = tags.find(t => t.name === 'latest');
  if (!withinTag) {
    withinTag = tags[0];
  }

  const oldest = withinTag.updated - within;
  const latest = withinTag.updated + within;
  tags = tags.filter(tag => tag.updated >= oldest && tag.updated <= latest);

  const token = await loadRegistryToken(repo);
  const tagHashes: DockerTagHash[] = [];
  for (let tag of tags) {
    const tagObject = Object.assign({}, parsedTag, { tag: tag.name });
    const hash = await loadHash(tagObject, token);

    if (hash) {
      tagHashes.push({ tag: tag.name, hash });
    }
  }

  return tagHashes;
}

/**
 * Given a list of tags with hashes (as returned by loadTagHashes), attempt to
 * select the best 'absolute' or 'current' tag. The input list of tags should be
 * sorted by recency (most recent first, i.e. what loadTagHashes returns), and
 * the tags should be pre-filtered to only include those updated near the time
 * 'latest' was last updated
 *
 * The returned tag is determined as follows:
 *  - filter `tags` for shas equal to that of 'latest'
 *  - if no 'latest' tag exists, treat the whole group of tags as equal to
 *    latest
 *  - if 'latest' does not share a hash with any other tags, the most recent tag
 *    is returned (not ideal!)
 *  - otherwise, compare each tag to regexes in VERSION_FORMATS and return the
 *    first match
 *  - if no match, sort group by string length and return the longest
 * @param {object[]} tags
 */
export function selectCurrentTag(tags: DockerTagHash[]) {
  const latest = tags.find(t => t.tag === 'latest');

  let candidates: DockerTagHash[];
  if (latest) {
    candidates = tags.filter(t => t.hash === latest.hash);
  } else {
    candidates = tags;
  }

  if (candidates.length === 0) {
    // oh well
    return tags[0].tag;
  }

  const matches: string[] = [];
  for (let candidate of candidates) {
    for (let regex of VERSION_FORMATS) {
      if (candidate.tag.match(regex)) {
        matches.push(candidate.tag);
      }
    }
  }

  // fall back to including everything if there were no matches
  if (matches.length === 0) {
    matches.push(...candidates.map(c => c.tag));
  }

  // this does feel like a dumb way to determine which tag is unique, but it
  // actually should work surprisingly often...
  // would be marginally improved by using a stable sort
  return matches.sort((a: string, b: string) => b.length - a.length)[0];
}

export class DockerTagParseError extends ExtendableError {
  constructor(m: string) {
    super(m);
  }
}

export function parseDockerTag(string: string): DockerTag {
  // NOTE: will not properly parse images with no namespace on a private
  // registry (refs become ambiguous enough that it isn't worth trying)
  let registry: ?string = null;
  let namespace: ?string = null;
  let image: ?string = null;
  let tag: ?string = null;

  const parts: string[] = string.split('/');
  if (parts.length === 1) {
    [ image ] = parts;
  } else if (parts.length === 2) {
    [ namespace, image ] = parts;
  } else if (parts.length === 3) {
    [ registry, namespace, image ] = parts;
  }

  if (image && image.includes(':')) {
    [ image, tag ] = image.split(':');
  }

  if (!image) {
    throw new DockerTagParseError('an image is required');
  }

  if (!tag) {
    tag = 'latest';
  }

  return { registry, namespace, image, tag };
}

export function dockerTagToRemote(tag: DockerTag) {
  let namespace = tag.namespace || 'library';

  if (tag.registry) {
    return `${tag.registry}/${namespace}`;
  } else {
    return namespace;
  }
}

export function dockerTagToRepository(tag: DockerTag): string {
  if (tag.namespace) {
    return `${tag.namespace}/${tag.image}`;
  } else {
    return tag.image;
  }
}

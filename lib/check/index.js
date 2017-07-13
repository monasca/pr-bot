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

const { DockerGitCheckPlugin } = require('./docker-git');
const { DockerHubCheckPlugin } = require('./dockerhub');
const { HelmCheckPlugin } = require('./helm');
const { HelmGitCheckPlugin } = require('./helm-git');
const { LandscaperGitCheckPlugin } = require('./landscaper-git');

let plugins = null;

function init() {
  plugins = [
    new DockerGitCheckPlugin(),
    new DockerHubCheckPlugin(),
    new HelmCheckPlugin(),
    new HelmGitCheckPlugin(),
    new LandscaperGitCheckPlugin()
  ];
}

function get(repoType, moduleType) {
  if (!plugins) {
    init();
  }

  for (let plugin of plugins) {
    let pType = plugin.type();
    if (pType.repository === repoType && pType.module === moduleType) {
      return plugin;
    }
  }

  return null;
}

function resolve(repository, module) {
  if (!plugins) {
    init();
  }

  return Promise.all(plugins.map(plugin => {
    if (plugin.type().repository !== repository.type()) {
      return null;
    }

    return plugin.matches(repository, module).then(match => {
      if (match) {
        return plugin;
      } else {
        return null;
      }
    });
  })).then(matches => {
    const match = matches.find(m => m !== null);
    if (match) {
      return match.type().module;
    } else {
      return null;
    }
  });
}

/**
 * Scans a local repository mirror for modules. While related to `resolve()`,
 * this allows many differently-typed modules to coexist in a single repository,
 * so long as the repository can be fully mirrored to the local filesystem.
 * @param {Repository} repository the repository to scan
 * @param {string} localPath path to a local mirror of the repository
 * @returns {Promise<object>} a list of { name, type } objects for each detected
 *                            module
 */
function scan(repository, localPath) {
  if (!plugins) {
    init();
  }

  return Promise.all(plugins.map(plugin => {
    return plugin.scan(repository, localPath).then(ret => {
      return ret;
    });
  })).then(moduleLists => {
    return moduleLists.reduce((acc, cur) => acc.concat(cur), []);
  });
}

module.exports = {
  get,
  resolve,
  scan
};


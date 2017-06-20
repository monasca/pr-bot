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

const { HelmCheckPlugin } = require('./helm');
const { HelmGitCheckPlugin } = require('./helm-git');

let plugins = null;

function init() {
  plugins = [
    new HelmCheckPlugin(),
    new HelmGitCheckPlugin()
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

module.exports = {
  get,
  resolve
};


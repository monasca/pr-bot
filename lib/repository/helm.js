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

const url = require('url');

const rp = require('request-promise-native');
const yaml = require('js-yaml');

const { Repository } = require('./repository');

class HelmRepository extends Repository {
  constructor(options = {}) {
    super(options);

    this.index = null;
    this.indexPromise = null;
    this.modulesPromise = null;
  }

  loadIndex() {
    if (!this.indexPromise) {
      const parts = url.parse(this.remote);
      if (!parts.pathname.endsWith('/index.yaml')) {
        if (parts.pathname.endsWith('/')) {
          parts.pathname = `${parts.pathname}index.yaml`;
        } else {
          parts.pathname = `${parts.pathname}/index.yaml`;
        }
      }

      const indexUrl = url.format(parts);
      this.indexPromise = rp(indexUrl).then(content => {
        this.index = yaml.safeLoad(content);
        return this.index;
      });
    }

    return this.indexPromise;
  }

  loadModules() {
    this.modulesPromise = this.loadIndex().then(index => {
      const modules = [];
      for (let entry of Object.keys(index.entries)) {
        modules.push({ name: entry, type: 'helm' });
      }

      return modules;
    });

    this.promises.push(this.indexPromise, this.modulesPromise);

    return this.modulesPromise;
  }

  type() {
    return 'helm';
  }
}

module.exports = {
  HelmRepository
};

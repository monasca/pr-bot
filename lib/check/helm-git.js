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

const fs = require('fs-extra');
const path = require('path');

const yaml = require('js-yaml');

const { CheckPlugin } = require('./checkplugin');

class HelmGitCheckPlugin extends CheckPlugin {
  constructor() {
    super();
  }

  type() {
    return { repository: 'git', module: 'helm'};
  }

  matches(repository, moduleName) {
    return repository.clone()
        .then(() => repository.modulePath(moduleName))
        .then(modulePath => fs.exists(path.join(modulePath, 'Chart.yaml')));
  }

  check(repository, moduleName) {
    return repository.clone()
        .then(() => repository.modulePath(moduleName))
        .then(modulePath => fs.readFile(path.join(modulePath, 'Chart.yaml')))
        .then(content => yaml.safeLoad(content))
        .then(chart => ({
          versions: [chart.version],
          current: chart.version
        }));
  }

  dependencies(repository, moduleName) {
    return repository.clone()
        .then(() => repository.modulePath(moduleName))
        .then(modulePath => {
          const requirementsPath = path.join(modulePath, 'requirements.yaml');
          console.log('requirementsPath', requirementsPath);
          return fs.exists(requirementsPath).then(exists => {
            if (exists) {
              console.log('exists!')
              return fs.readFile(requirementsPath)
                  .then(content => yaml.safeLoad(content))
                  .then(reqs => reqs ? reqs : { dependencies: [] })
                  .then(reqs => reqs.dependencies.map(dep => ({
                    name: dep.name,
                    version: dep.version,
                    type: 'helm',
                    remote: dep.repository
                  })));
            } else {
              return [];
            }
          });
        });

    // TODO find docker dependencies too, something like...
    // const helmPromise = ...
    // const dockerPromise = ...
    // return Promise.all([helmPromise, dockerPromise]).then(...)
  }
}

module.exports = {
  HelmGitCheckPlugin
};

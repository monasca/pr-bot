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

const glob = require('glob');
const jsonpath = require('jsonpath');
const yaml = require('js-yaml');

const { CheckPlugin, simpleScan } = require('./checkplugin');

/**
 * YAML fields that must exist to be considered a landscaper file
 */
const LANDSCAPER_TESTS = [
  '$.name',
  '$.configuration',
  '$.release.chart',
  '$.release.version'
];

function testLandscaper(yamlPath) {
  return fs.readFile(yamlPath, 'utf-8').then(rawYaml => {
    let obj;
    try {
      obj = yaml.safeLoad(rawYaml); 
    } catch (e) {
      return false;
    }

    if (typeof obj !== 'object') {
      return false;
    }
    
    for (let test of LANDSCAPER_TESTS) {
      const value = jsonpath.value(obj, test);
      if (typeof value === 'undefined') {
        return false;
      }
    }

    return true;
  });
}

function scanLandscaper(baseDir) {
  return new Promise((resolve, reject) => {
    // TODO: .yaml.tpl?
    glob(path.join(baseDir, '**/*.yaml'), (err, matches) => {
      if (err) {
        reject(err);
      } else {
        resolve(matches);
      }
    });
  }).then(matches => {
    const promises = matches.map(match => {
      return testLandscaper(match).then(result => {
        if (result) {
          // remove baseDir and .yaml
          let name = match.slice(baseDir.length, -5);
          if (name.startsWith('/')) {
            name = name.slice(1);
          }

          // TODO consider stripping .yaml (see matches() TODO)

          return { name, type: 'landscaper' };
        } else {
          return null;
        }
      });
    });

    // filter nulls to leave list[list[object]]
    return Promise.all(promises).then(rs => rs.filter(r => r !== null));
  }).then(lists => {
    // flatten
    return lists.reduce((acc, cur) => acc.concat(cur), [])
  });
}

/**
 * Attempt to load a landscaper helm repository mapping 'repos.txt' from the
 * root of the checked out repository. A repository mapping contains lines of
 * the form "<name> <URL>" where <name> and <URL> refer to a Helm repository
 * referenced in a landscaper file's `.release.chart` field.
 * @param {Repository} repository 
 */
function helmRepoMap(repository, repoName) {
  return repository.clone().then(localPath => {
    const reposPath = path.join(localPath, 'repos.txt')
    return fs.exists(reposPath).then(exists => {
      if (exists) {
        return fs.readFile(reposPath, 'utf-8');
      } else {
        return null;
      }
    }).then(contents => {
      if (contents === null) {
        return null;
      }

      const map = new Map();
      for (let line of contents.split('\n')) {
        const [name, remote] = line.trim().split(' ');
        map.set(name, remote);
      }

      return map.get(repoName);
    });
  });
}

/**
 * Detects landscaper (https://github.com/Eneco/landscaper) repositories and
 * modules.
 */
class LandscaperGitCheckPlugin extends CheckPlugin {
  constructor() {
    super();
  }

  type() {
    return { repository: 'git', module: 'landscaper' };
  }

  scan(repository, localPath) {
    return scanLandscaper(localPath);
  }

  matches(repository, moduleName) {
    return repository.modulePath(`${moduleName}.yaml`).then(modulePath => {
      return testLandscaper(modulePath);
    });
  }

  check(repository, moduleName) {
    return repository.modulePath(`${moduleName}.yaml`)
        .then(modulePath => fs.readFile(modulePath, 'utf-8')
        .then(contents => {
          const obj = yaml.safeLoad(contents);
          return {
            versions: [obj.release.version],
            version: obj.release.version
          };
        }));
  }

  dependencies(repository, moduleName) {
    return repository.modulePath(`${moduleName}.yaml`)
        .then(modulePath => fs.readFile(modulePath, 'utf-8')
        .then(contents => {
          const obj = yaml.safeLoad(contents);
          const [chartRef, version] = obj.release.chart.split(':');
          const [repo, name] = chartRef.split('/');

          return helmRepoMap(repository, repo).then(remote => [{
            name, version,
            type: 'helm',

            // TODO remote can sometimes be null, we should handle this...
            // somehow
            remote: remote
          }]);
        }));
  }
}

module.exports = { scanLandscaper, LandscaperGitCheckPlugin };

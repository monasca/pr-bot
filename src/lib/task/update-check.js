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

const datastore = require('../datastore');
const queue = require('../queue');

const { Task } = require('./task');
const { Repository } = require('../repository/repository');

class UpdateCheckTask extends Task {
  constructor(options = {}) {
    super(Object.assign({
      type: 'update-check',
      retries: 3
    }, options));
  }

  load() {
    const { repositoryName } = this.data;
    const ds = datastore.get();

    return ds.get(Repository, repositoryName).then(repo => repo.settle());
  }

  execute(data) {
    const { repo } = data;

    // apply module updates first else we won't pick up any changes until 
    // the next event
    return repo.diffModules().then(mdiff => {
      repo.applyPatches(mdiff);

      const created = mdiff.filter(p => p.type === 'create');
      const deleted = mdiff.filter(p => p.type === 'deleted');
      console.log(
        'refreshed modules, created:', created,
        'deleted:', deleted);

      return repo.store();
    }).then(() => {
      // changes in module dependencies don't result in any updates, but we still
      // need to keep track of them
      const ddiffPromise = repo.diffDependencies();

      // changes to (current) module versions should trigger updates to dependent
      // modules
      const vdiffPromise = repo.diffVersions();

      return Promise.all([ddiffPromise, vdiffPromise]).then(diffs => {
        const [ddiff, vdiff] = diffs;
        repo.applyModulePatches(ddiff);
        repo.applyModulePatches(vdiff);
        const storePromise = repo.store();

        const updates = [];
        for (let changed of vdiff) {
          // we only care if the 'current' version changes
          // usually that happens implicitly (e.g. in  helm), but if not we should
          // honor the field in case there is some release strategy and/or beta
          // versions
          const current = changed.patches.find(p => {
            return p.op === 'replace' && p.path === '/current';
          });

          if (current) {
            // TODO: this needs to make a new UpdateApplyTask rather than call updateDependents
            //queue.get
            updates.push(updateDependents(repo, changed.name, current.value));
          }
        }
      });
    });
  }
}

module.exports = { UpdateCheckTask };

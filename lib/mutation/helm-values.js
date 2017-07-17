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

const path = require('path');

const YAWN = require('yawn-yaml/cjs');
const fs = require('fs-extra');

const { MutationPlugin, MutationException } = require('./mutationplugin');
const { parseDockerTag, dockerTagToRemote } = require('../docker-util');
const { findDockerDependencies } = require('../helm-util');
const { renderCommitMessage } = require('../template-util');

function updateValues(repository, update, values) {
  for (let dep of findDockerDependencies(values)) {
    const fullTag = `${dep.value.repository}:${dep.value.tag}`;
    const parsed = parseDockerTag(fullTag);

    const remote = dockerTagToRemote(parsed);
    if (!update.srcRepository.providesRemote(remote)) {
      continue;
    }

    if (parsed.image !== update.srcModule) {
      continue;
    }

    dep.value.tag = update.toVersion;
    return;
  }

  throw new MutationException(
    `No match found for ${update.srcRepository.remote}:${update.srcModule} in values`);
}

function formatBranch(up) {
  const cleanVersion = up.toVersion.replace(/[^a-zA-Z0-9]/gi, '');
  return `up-${up.destModule}-${up.srcModule}-${cleanVersion}`;
}

class HelmValuesMutationPlugin extends MutationPlugin {
  constructor() {
    super();
  }

  type() {
    return {
      destRepository: 'git',
      destModule: 'helm',
      srcModule: 'docker'
    };
  }

  apply(update) {
    const repository = update.destRepository;

    return repository.modulePath(update.destModule).then(modulePath => {
      const valuesPath = path.join(modulePath, 'values.yaml');
    
      return fs.readFile(valuesPath, 'utf-8').then(content => {
        const parsed = new YAWN(content);

        // copy the root object - yawn uses a setter on .json and won't detect
        // changes to children (or self assignment)
        const values = Object.assign({}, parsed.json);
        updateValues(repository, update, values);

        parsed.json = values;
        return fs.writeFile(valuesPath, parsed.yaml, 'utf-8');
      }).then(() => {
        return repository.getOrCreateFork();
      }).then(() => {
        const commitMessage = renderCommitMessage(update);
        // TODO: use renderPullRequest as well

        return repository.branch(formatBranch(update))
            .then(() => repository.add(valuesPath))
            .then(() => repository.commit(commitMessage))
            .then(() => repository.push())
            .then(() => repository.createPullRequest(commitMessage));
      });
    }).then(response => {
      const pr = response.data;
      return {
        update, pr,
        id: pr.head.sha,
        link: pr.html_url,
        title: pr.title
      };
    });
  }
}

module.exports = {
  HelmValuesMutationPlugin
};

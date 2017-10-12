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

import path from 'path';

import fs from 'fs-extra';
import yaml from 'js-yaml';

import MutationPlugin, { MutationException } from './mutationplugin';
import { helmRemoteEquals } from '../repository/helm';
import { renderCommitMessage } from '../template-util';

import type Repository from '../repository/repository';
import type Update from '../update'

function updateRequirements(repository, update, requirements) {
  for (let dep of requirements.dependencies) {
    if (!helmRemoteEquals(dep.repository, update.srcRepository.remote)) {
      continue;
    }

    if (dep.name !== update.srcModule) {
      continue;
    }

    dep.repository = update.srcRepository.remote;
    dep.version = update.toVersion;
    return;
  }

  throw new MutationException(
    `No match found for ${update.srcRepository.remote}:${update.srcModule} in reqs`);
}

function formatBranch(up) {
  const cleanVersion = up.toVersion.replace(/[^a-zA-Z0-9]/gi, '');
  return `up-${up.destModule}-${up.srcModule}-${cleanVersion}`;
}

export default class HelmRequirementsMutationPlugin extends MutationPlugin {
  constructor() {
    super();
  }

  type() {
    return { destRepository: 'git', srcModule: 'helm', destModule: 'helm' };
  }

  apply(update: Update) {
    const repository = update.destRepository;

    return repository.modulePath(update.destModule).then(modulePath => {
      return path.join(modulePath, 'requirements.yaml');
    }).then(reqsPath => {
      return fs.readFile(reqsPath).then(reqsStr => {
        const reqs = yaml.safeLoad(reqsStr);
        updateRequirements(repository, update, reqs);
        return fs.writeFile(reqsPath, yaml.safeDump(reqs));
      }).then(() => {
        return repository.getOrCreateFork();
      }).then(() => {
        const commitMessage = renderCommitMessage(update);
        // TODO: use renderPullRequest as well

        return repository.branch(formatBranch(update))
            .then(() => repository.add(reqsPath))
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

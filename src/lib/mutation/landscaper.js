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

import YAWN from 'yawn-yaml/cjs';
import fs from 'fs-extra';

import MutationPlugin, { MutationException } from './mutationplugin';
import { renderCommitMessage } from '../template-util';

import type Update from '../update';
import type GitRepository from '../repository/git';
import type { MutationPluginType, MutationResult } from './mutationplugin';

function formatBranch(up) {
  const cleanVersion = up.toVersion.replace(/[^a-zA-Z0-9]/gi, '');
  return `up-${up.destModule}-${up.srcModule}-${cleanVersion}`;
}

function updateLandscaper(repository, update, obj) {
  // too lazy to use the repos.txt map, so we'll just preserve the repository
  // ref
  const [ repo, chart ] = obj.release.chart.split('/');
  const name = chart.split(':')[0];

  if (update.srcModule !== name) {
    throw new MutationException(
      `module name mismatch: ${name} != ${update.srcModule}`);
  }

  obj.release.chart = `${repo}/${name}:${update.toVersion}`;
}

export default class LandscaperMutationPlugin extends MutationPlugin<GitRepository> {
  constructor() {
    super();
  }

  type(): MutationPluginType {
    return {
      srcModule: 'helm',
      destRepository: 'git',
      destModule: 'landcaper'
    };
  }

  apply(update: Update<GitRepository>): Promise<MutationResult<GitRepository>> {
    if (!update.destRepository) {
      throw new MutationException('dest repository is not ready');
    }

    const repository: GitRepository = update.destRepository;
    const realName = `${update.destModule}.yaml`;
    
    return repository.modulePath(realName).then(modulePath => {
      return fs.readFile(modulePath, 'utf-8').then(content => {
        const parsed = new YAWN(content);

        // copy the root object - yawn uses a setter on .json and won't detect
        // changes to children (or self assignment)
        const obj = Object.assign({}, parsed.json);
        updateLandscaper(repository, update, obj);

        parsed.json = obj;
        return fs.writeFile(modulePath, parsed.yaml, 'utf-8');
      }).then(() => {
        return repository.getOrCreateFork();
      }).then(() => {
        const commitMessage = renderCommitMessage(update);
        // TODO: use renderPullRequest as well

        return repository.unshallow()
            .then(() => repository.branch(formatBranch(update)))
            .then(() => repository.add(modulePath))
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

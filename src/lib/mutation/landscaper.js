// (C) Copyright 2017-2018 Hewlett Packard Enterprise Development LP
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
import { renderCommitMessage, renderPullRequest } from '../template-util';

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

  async apply(update: Update<GitRepository>): Promise<MutationResult<GitRepository>> {
    if (!update.destRepository) {
      throw new MutationException('dest repository is not ready');
    }

    const repository: GitRepository = update.destRepository;
    const realName = `${update.destModule}.yaml`;
    const modulePath = await repository.modulePath(realName);
    
    const content = await fs.readFile(modulePath, 'utf-8');
    const parsed = new YAWN(content);

    // copy the root object - yawn uses a setter on .json and won't detect
    // changes to children (or self assignment)
    const obj = Object.assign({}, parsed.json);
    updateLandscaper(repository, update, obj);

    parsed.json = obj;
    await fs.writeFile(modulePath, parsed.yaml, 'utf-8');

    await repository.getOrCreateFork();

    const commitMessage = renderCommitMessage(update);
    await repository.unshallow();
    await repository.branch(formatBranch(update));
    await repository.add(modulePath);
    await repository.commit(commitMessage);
    await repository.push();

    const { title, body } = renderPullRequest(update);
    const response = await repository.createPullRequest(title, body);
    const pr = response.data;
    return {
      update, pr,
      id: pr.head.sha,
      link: pr.html_url,
      title: pr.title
    };
  }
}

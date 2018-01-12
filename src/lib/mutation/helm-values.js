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

import path from 'path';

import YAWN from 'yawn-yaml/cjs';
import fs from 'fs-extra';

import MutationPlugin, { MutationException } from './mutationplugin';
import { parseDockerTag, dockerTagToRemote } from '../docker-util';
import { findDockerDependencies } from '../helm-util';
import { renderCommitMessage, renderPullRequest } from '../template-util';

import type GitRepository from '../repository/git';
import type Update from '../update';
import type { MutationPluginType, MutationResult } from './mutationplugin';

export type HelmValues = {
  [string]: any
};

function updateValues(
      repository: GitRepository,
      update: Update<GitRepository>, values) {
  const src = update.srcRepository;
  if (!src) {
    throw new MutationException('update was not fully loaded');
  }

  let updated = false;
  for (let dep of findDockerDependencies(values)) {
    const fullTag = `${dep.value.repository}:${dep.value.tag}`;
    const parsed = parseDockerTag(fullTag);

    const remote = dockerTagToRemote(parsed);
    if (!src.providesRemote(remote)) {
      continue;
    }

    if (parsed.image !== update.srcModule) {
      continue;
    }

    dep.value.tag = update.toVersion;
    updated = true;
  }

  if (!updated) {
    throw new MutationException(
      `No match found for ${src.remote}:${update.srcModule} in values`);
  }
}

function formatBranch(up: Update<GitRepository>): string {
  const cleanVersion = up.toVersion.replace(/[^a-zA-Z0-9]/gi, '');
  return `up-${up.destModule}-${up.srcModule}-${cleanVersion}`;
}

export default class HelmValuesMutationPlugin extends MutationPlugin<GitRepository> {
  constructor() {
    super();
  }

  type(): MutationPluginType {
    return {
      destRepository: 'git',
      destModule: 'helm',
      srcModule: 'docker'
    };
  }

  async apply(update: Update<GitRepository>): Promise<MutationResult<GitRepository>> {
    const repository = update.destRepository;
    if (!repository) {
      throw new MutationException(
        `destRepository not loaded: ${update.destRepositoryName}`);
    }

    const modulePath = await repository.modulePath(update.destModule);
    const valuesPath = path.join(modulePath, 'values.yaml');
    const content = await fs.readFile(valuesPath, 'utf-8');

    const parsed = new YAWN(content);

    // copy the root object - yawn uses a setter on .json and won't detect
    // changes to children (or self assignment)
    const values = Object.assign({}, parsed.json);
    updateValues(repository, update, values);

    parsed.json = values;
    await fs.writeFile(valuesPath, parsed.yaml, 'utf-8');
    await repository.getOrCreateFork();
    
    const commitMessage = renderCommitMessage(update);
    // TODO: use renderPullRequest as well

    await repository.unshallow();
    await repository.branch(formatBranch(update));
    await repository.add(valuesPath);
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

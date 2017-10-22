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

import type GitRepository from '../repository/git';
import type { HelmRequirements } from '../repository/helm';
import type Update from '../update';
import type { MutationPluginType, MutationResult } from './mutationplugin';

function updateRequirements(
      repository: GitRepository,
      update: Update<GitRepository>,
      requirements: HelmRequirements) {
  const src = update.srcRepository;
  if (!src) {
    throw new MutationException('update was not fully loaded');
  }

  for (let dep of requirements.dependencies) {
    if (!helmRemoteEquals(dep.repository, src.remote)) {
      continue;
    }
    
    if (dep.name !== update.srcModule) {
      continue;
    }

    dep.repository = src.remote;
    dep.version = update.toVersion;
    return;
  }

  throw new MutationException(
    `No match found for ${src.remote}:${update.srcModule} in reqs`);
}

function formatBranch(up: Update<GitRepository>): string {
  const cleanVersion = up.toVersion.replace(/[^a-zA-Z0-9]/gi, '');
  return `up-${up.destModule}-${up.srcModule}-${cleanVersion}`;
}

export default class HelmRequirementsMutationPlugin 
      extends MutationPlugin<GitRepository> {

  constructor() {
    super();
  }

  type(): MutationPluginType {
    return { destRepository: 'git', srcModule: 'helm', destModule: 'helm' };
  }

  async apply(update: Update<GitRepository>): Promise<MutationResult<GitRepository>> {
    const repository = update.destRepository;
    if (!repository) {
      throw new MutationException(
        `destRepository not loaded: ${update.destRepositoryName}`);
    }

    const modulePath = await repository.modulePath(update.destModule);
    const reqsPath = path.join(modulePath, 'requirements.yaml');
    const reqsStr = await fs.readFile(reqsPath);

    const reqs = yaml.safeLoad(reqsStr);
    updateRequirements(repository, update, reqs);
    await fs.writeFile(reqsPath, yaml.safeDump(reqs));

    await repository.getOrCreateFork();

    const commitMessage = renderCommitMessage(update);
    await repository.branch(formatBranch(update));
    await repository.add(reqsPath);
    await repository.commit(commitMessage);
    await repository.push();

    const response = await repository.createPullRequest(commitMessage);

    const pr = response.data;
    return {
      update, pr,
      id: pr.head.sha,
      link: pr.html_url,
      title: pr.title
    };
  }
}

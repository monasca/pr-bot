// (C) Copyright 2018 Hewlett Packard Enterprise Development LP
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
import {
  parseDockerTag,
  dockerTagToRemote,
  dockerTagToString,
  findComposeDependencies,
  loadComposeEnvironment,
  patchComposeEnvironment
} from '../docker-util';
import { renderCommitMessage } from '../template-util';

import type GitRepository from '../repository/git';
import type Update from '../update';
import type { MutationPluginType, MutationResult } from './mutationplugin';

const COMPOSE_FILE_NAME = 'docker-compose.yml';
const DEFAULT_ENV_FILE = '.env';

export async function updateCompose(update: Update<GitRepository>): Promise<string[]> {
  const srcRepository = update.srcRepository;
  if (!srcRepository) {
    throw new MutationException(
      `srcRepository not loaded: ${update.srcRepositoryName}`);
  }

  const destRepository = update.destRepository;
  if (!destRepository) {
    throw new MutationException(
      `destRepository not loaded: ${update.destRepositoryName}`);
  }

  const modulePath = await destRepository.modulePath(update.destModule);
  const composePath = path.join(modulePath, COMPOSE_FILE_NAME);
  const envPath = path.join(modulePath, DEFAULT_ENV_FILE);
  const modified: string[] = [];

  const composeContent = await fs.readFile(composePath, 'utf-8');
  const parsed = new YAWN(composeContent);
  const compose = Object.assign({}, parsed.json);
  let composeDirty = false;

  let env: { [string]: string };
  if (await fs.exists(envPath)) {
    env = await loadComposeEnvironment(envPath);
  } else {
    env = {};
  }

  const envPatches: { [string]: string } = {};

  for (let ref of findComposeDependencies(compose)) {
    const parsedTag = parseDockerTag(ref.value.image);
    const remote = dockerTagToRemote(parsedTag);
    if (remote !== srcRepository.remote) {
      continue;
    }

    if (parsedTag.image !== update.srcModule) {
      continue;
    }

    const isRef = parsedTag.tag.match(/\$\{([\w_]+)\}/);
    if (isRef) {
      // something like:
      // image: monasca/persister:${MON_PERSISTER_VERSION}
      const varName = isRef[1];
      if (!(varName in env)) {
        console.warn(
          `invalid variable ref: ${varName} is not defined`,
          `in .env for module ${update.destModule}`);
        continue;
      }

      envPatches[varName] = update.toVersion;
    } else {
      // something like:
      // image: alpine:3.6
      parsedTag.tag = update.toVersion;
      ref.value.image = dockerTagToString(parsedTag);
      composeDirty = true;
    }
  }

  if (composeDirty) {
    parsed.json = compose;
    await fs.writeFile(composePath, parsed.yaml, 'utf-8');
    modified.push(composePath);
  }

  if (Object.keys(envPatches).length > 0) {
    const patched = await patchComposeEnvironment(envPath, envPatches);
    await fs.writeFile(envPath, patched, 'utf-8');
    modified.push(envPath);
  }

  return modified;
}

function formatBranch(up: Update<GitRepository>): string {
  const cleanVersion = up.toVersion.replace(/[^a-zA-Z0-9]/gi, '');
  return `up-${up.destModule}-${up.srcModule}-${cleanVersion}`;
}

export default class DockerComposeMutationPlugin
    extends MutationPlugin<GitRepository> {
  constructor() {
    super();
  }

  type(): MutationPluginType {
    return {
      destRepository: 'git',
      srcModule: 'docker',
      destModule: 'docker-compose'
    };
  }

  async apply(update: Update<GitRepository>): Promise<MutationResult<GitRepository>> {
    const repository = update.destRepository;
    if (!repository) {
      throw new MutationException(
        `destRepository not loaded: ${update.destRepositoryName}`);
    }

    const modified = await updateCompose(update);

    await repository.getOrCreateFork();

    const commitMessage = renderCommitMessage(update);
    await repository.unshallow();
    await repository.branch(formatBranch(update));
    await repository.add(modified);
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

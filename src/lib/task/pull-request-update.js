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

import jsonpatch from 'fast-json-patch';

import * as datastore from '../datastore';
import * as github from '../github';
import * as queue from '../queue';

import PullRequest from '../pullrequest';
import Repository from '../repository/repository';
import Task, { TaskError } from './task';

import { safeParseURL } from '../util';

import type { TaskOptions } from './task';

type PullRequestUpdateData = {
  repository: Repository,
  pullRequest: PullRequest
};

export default class PullRequestUpdate extends Task {
  constructor(options: TaskOptions) {
    super({
      type: 'pull-request-update',
      retries: 1,
      ...options
    });
  }

  async load(): Promise<PullRequestUpdateData> {
    const { repositoryName, pullRequestNumber } = this.data;
    const ds = datastore.get();

    const repository = await ds.get(Repository, repositoryName);
    const pullRequest = await ds.first(PullRequest, [
      { f: 'repository', op: '=', val: repository.name },
      { f: 'number', op: '=', val: pullRequestNumber }
    ]);

    return { repository, pullRequest };
  }

  async execute(data: PullRequestUpdateData): Promise<mixed> {
    const { repository, pullRequest } = data;
    if (repository.type() !== 'git') {
      throw new TaskError(
        `repository ${repository.name} has invalid type: ${repository.type()}`);
    }

    const remoteParts = safeParseURL(repository.remote);
    const [owner, repo] = remoteParts.pathname.substring(1).split('/');
    const gh = github.get(remoteParts.hostname);

    const response = await gh.pullRequests.getCommits({
      owner, repo,
      number: pullRequest.number
    });

    const commits = response.data.map(commit => commit.sha);
    const diff = jsonpatch.compare(pullRequest.commits, commits);

    if (diff.length === 0) {
      console.log(`no changes to ${repository.name}#${pullRequest.number}`);
      return 0;
    } else {
      pullRequest.commits = commits;
      await pullRequest.store();

      return diff.length;
    }
  }
}

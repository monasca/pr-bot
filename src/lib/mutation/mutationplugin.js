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

import { ExtendableError } from '../util';

import type Repository from '../repository/repository';
import type Update from '../update';

export type MutationPluginType = {
  srcModule: string,
  destRepository: string,
  destModule: string
};

export type GitHubBranchRef = {
  label: string,
  ref: string,
  sha: string,
  user: any,
  repo: any
}

export type GitHubPullRequest = {
  id: number,
  url: string,
  html_url: string,
  diff_url: string,
  number: number,
  state: string,
  title: string,
  body: string,
  assignee: ?{ [string]: any },
  milestone: ?{ [string]: any },
  locked: boolean,
  created_at: string,
  updated_at: string,
  closed_at: ?string,
  merged_at: ?string,
  user: { [string]: any },
  base: GitHubBranchRef,
  head: GitHubBranchRef,
  // lots more properties not included here
}

export type MutationResult<T: Repository> = {
  update: Update<T>,
  pr: GitHubPullRequest,
  id: string,
  link: string,
  title: string
}

export class MutationException extends ExtendableError {
  constructor(m: string) {
    super(m);
  }
}

export default class MutationPlugin<T: Repository> {
  constructor() {

  }

  type(): MutationPluginType {
    throw new MutationException('type() not implemented');
  }

  // eslint-disable-next-line no-unused-vars
  apply(update: Update<T>): Promise<MutationResult<T>> {
    throw new MutationException('apply() not implemented');
  }
}

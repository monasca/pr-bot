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

import nunjucks from 'nunjucks';

import type Update from './update';

const TEMPLATE_DIRECTORY = path.resolve(__dirname, '../templates');

export type TemplateEnvironment = {
  [string]: mixed
};

const nj = nunjucks.configure(TEMPLATE_DIRECTORY, {
  lstripBlocks: true,
  trimBlocks: true
});

function wrap(str: string, kwargs: { length: number }) {
  const length = kwargs.length || 80;

  const tokens = str.split(/\s+/);
  let ret = '';
  let lineLength = 0;
  while (tokens.length > 0) {
    const next = tokens.shift();
    if (lineLength === 0) {
      ret = `${ret}${next}`;
      lineLength = next.length;
    } else if (lineLength + next.length + 1 > length) {
      ret = `${ret}\n${next}`;
      lineLength = next.length;
    } else {
      ret = `${ret} ${next}`;
      lineLength = lineLength + 1 + next.length;
    }
  }

  return ret;
}

nj.addFilter('wrap', wrap);

export function render(partialPath: string, env: TemplateEnvironment): string {
  return nj.render(partialPath, env);
}

export type CommitMessage = {
  title: string,
  body: string,
  raw: string
};

export function parseCommitMessage(message: string): CommitMessage {
  const lines = message.split('\n');
  const title = lines.shift();

  const firstContent = lines.findIndex(l => l.trim().length > 0);
  const body = lines.slice(firstContent).join('\n');

  return { title, body, raw: message };
}

export function renderCommitMessage(update: Update<any>) {
  // TODO support some overrides here, maybe based on dest module
  return render('commit/default.txt.njk', {
    up: update, update
  });
}

export type RenderedPullRequest = {
  title: string,
  body: string
};

export function renderPullRequest(update: Update<any>): RenderedPullRequest {
  const commit = parseCommitMessage(renderCommitMessage(update));
  const text = render('pr/default.md.njk', {
    commit, update, up: update
  });

  const lines = text.split('\n');
  const titleIndex = lines.findIndex(l => l.trim().length > 0);
  const bodyLines = lines.slice(titleIndex + 1);
  const bodyIndex = bodyLines.findIndex(l => l.trim().length > 0);

  return {
    title: lines[titleIndex],
    body: bodyLines.slice(bodyIndex).join('\n')
  };
}

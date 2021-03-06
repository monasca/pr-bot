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

import crypto from 'crypto';
import path from 'path';
import url from 'url';
import fs from 'fs-extra';

import * as check from '../check';
import * as config from '../config';
import * as github from '../github';

import { ExtendableError, exec, pipe, safeParseURL } from '../util';
import Module from '../module';
import Repository from './repository';

import type GitHub from 'github';
import type { ParsedURL, SubprocessOptions } from '../util';
import type { IntermediateModule } from './repository';

const repoBase = '/tmp/git';

export class GitError extends ExtendableError {
  constructor(m: string, err: string) {
    super(`${m}: err="${err}"`);
  }
}

function git(cwd: string, args: string | string[]) {
  const cfg = config.get();
  const options: SubprocessOptions = { cwd };
  if (cfg.git.proxy) {
    options['env'] = {
      'HTTP_PROXY': cfg.git.proxy,
      'HTTPS_PROXY': cfg.git.proxy
    };
  }

  // TODO: this is a workaround to reduce memory usage in GCF, we need to reduce
  // the number of child_process calls since each costs ~50 MiB
  // see also: https://issuetracker.google.com/issues/62723252
  let command;
  if (Array.isArray(args)) {
    command = args.map(cmd => `git ${cmd}`).join(' && ');
  } else {
    command = `git ${args}`;
  }

  return exec(command, options).catch(ret => {
    throw new GitError(`git command failed: ${command}`, ret.stderr.trim());
  });
}

function delay<T>(value: T, timeout: number = 5000): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(value);
    }, timeout);
  });
}

export function gitRemoteEquals(a: string, b: string) {
  const pa = safeParseURL(a);
  const pb = safeParseURL(b);

  if (pa.protocol !== 'git:' && pa.protocol !== 'https:') {
    return false;
  }

  if (pb.protocol !== 'git:' && pb.protocol !== 'https:') {
    return false;
  }

  if (pa.hostname.toLowerCase() !== pb.hostname.toLowerCase()) {
    return false;
  }

  const pathPartsA = pa.pathname.substring(1).split('/');
  const pathPartsB = pb.pathname.substring(1).split('/');

  const lastA = pathPartsA[pathPartsA.length - 1];
  if (lastA === '') {
    pathPartsA.pop();
  }

  const lastB = pathPartsB[pathPartsB.length - 1];
  if (lastB === '') {
    pathPartsB.pop();
  }

  if (pathPartsA.length !== pathPartsB.length) {
    return false;
  }

  for (let i = 0; i < pathPartsA.length; i++) {
    let partA = pathPartsA[i];
    let partB = pathPartsB[i];

    // last .git is optional
    if (i === pathPartsA.length - 1) {
      if (partA.endsWith('.git')) {
        partA = partA.substring(0, partA.length - 4);
      }

      if (partB.endsWith('.git')) {
        partB = partB.substring(0, partB.length - 4);
      }
    }

    if (partA !== partB) {
      return false;
    }
  }

  return true;
}

export type GitRepositoryOptions = {
  type: string,
  name: string,
  parent: ?string,
  remote: string,
  room: ?string,
  modules: string[],
  fork: ?string,
  auth: string | false,
  _meta: ?mixed
};

export default class GitRepository extends Repository {
  fork: string | null;
  auth: string | false;
  modulesPromise: Promise<any> | null;
  localPath: string | null;
  localBranch: string | null;
  remoteParts: ParsedURL; // can't import url.Url...
  forkParts: ParsedURL;
  github: GitHub;

  constructor(options: GitRepositoryOptions) {
    super(options);

    // name of fork in github user for this github domain (e.g. github.com)
    // and configured token
    this.fork = options.fork || null;

    if (typeof options.auth === 'undefined') {
      this.auth = false;
    } else {
      this.auth = options.auth;
    }

    this.modulesPromise = null;

    this.localPath = null;
    this.localBranch = null;
  }

  _git(args: string | string[]) {
    if (!this.localPath) {
      throw new GitError('repository not initialized', 'invalid localPath');
    }

    return git(this.localPath, args);
  }

  providesRemote(remote: string) {
    return gitRemoteEquals(this.remote, remote);
  }

  getOrCreateFork(): Promise<string> {
    if (this.fork) {
      return Promise.resolve(this.fork);
    }

    const parts = safeParseURL(this.remote);
    
    const [ owner, repo ] = parts.pathname.substring(1).split('/');
    const gh = github.get(parts.hostname);
    const getOpts = { visibility: 'public', affiliation: 'owner' };

    return gh.repos.getAll(getOpts).then(response => {
      const forks = response.data.filter(r => r.fork === true);

      // getAll doesn't return details about the fork's parent repo, so do a
      // hard get() to load the extra fields
      const promises = forks.map(f => gh.repos.get({
        owner: f.owner.login,
        repo: f.name
      }).then(resp => resp.data));

      return Promise.all(promises);
    }).then(forks => {
      const fork = forks.find(f => {
        return f.parent.name === repo && f.parent.owner.login === owner;
      });

      // TODO store this repo so we don't have to fetch the fork remote every
      // time

      if (fork) {
        return fork.clone_url;
      } else {
        console.log('creating new fork for repository: ' + this.remote);
        return gh.repos.fork({ owner, repo }).then(response => {
          return delay(response.data.clone_url);
        });
      }
    }).then(fork => {
      this.fork = fork;

      return fork;
    });
  }

  createPullRequest(title: string, body: mixed = null) {
    const fork = this.fork;
    if (!fork) {
      throw new GitError('cannot create pull request with no fork', 'n/a');
    }

    const localBranch = this.localBranch;
    if (!localBranch) {
      throw new GitError('repository must be checked out', 'n/a');
    }

    const remoteParts = safeParseURL(this.remote);
    const [ owner, repo ] = remoteParts.pathname.substring(1).split('/');

    const forkParts = safeParseURL(fork);
    const [ forkOwner ] = forkParts.pathname.substring(1).split('/');

    const gh = github.get(remoteParts.hostname);
    const options = {
      owner, repo, title, body,
      head: `${forkOwner}:${localBranch}`,
      base: 'master',
      maintainer_can_modify: true
    };
    console.log('pr options:', options);
    return gh.pullRequests.create(options);
  }

  type() {
    return 'git';
  }

  _auth(remote: string, force: boolean = false) {
    const parts = safeParseURL(remote);

    if (typeof this.auth === 'string') {
      parts.auth = this.auth;

      // $FlowFixMe: flow's typedef for url.format seems broken
      return url.format(parts);
    }

    if (force || this.auth === true) {
      const gh = github.get(parts.hostname);
      if (!gh) {
        throw new GitError(
            'GitHub remote not configured',
            parts.hostname || '');
      }

      parts.auth = gh.auth.token;

      // $FlowFixMe: flow's typedef for url.format seems broken
      return url.format(parts);
    }

    return remote;
  }

  clone(branch: string = 'master'): Promise<string> {
    if (this.localPath !== null) {
      return Promise.resolve(this.localPath);
    }

    const safeName = this.name.replace('/', '-').replace(/[^\w-]/g, '');
    const suffix = crypto.randomBytes(8).toString('hex');
    const localPath = path.join(repoBase, `${safeName}-${suffix}`);
    const remote = this._auth(this.remote);
    return fs.ensureDir(localPath)
        .then(() => fs.exists(path.join(localPath, '.git')))
        .then(exists => {
          if (exists) {
            return Promise.resolve();
          }

          const { name, email } = config.get().git;
          return git(localPath, [
            'init',
            `config user.name "${name}"`,
            `config user.email "${email}"`
          ]);
        })
        // don't use git() since it can leak credentials
        .then(() => exec(`git fetch "${remote}" "${branch}" --depth=1`, {
          cwd: localPath
        }))
        .then(() => git(localPath, `checkout -B "${branch}" FETCH_HEAD`))
        .then(() => {
          this.localBranch = branch;
          this.localPath = localPath;
          return localPath;
        });
  }

  async unshallow(): Promise<void> {
    const localPath = this.localPath;
    if (!localPath) {
      throw new GitError('repository not initialized', 'invalid localPath');
    }

    const remote = this._auth(this.remote);
    await exec(`git fetch --unshallow ${remote}`, {
      cwd: localPath
    });
  }

  clean(): Promise<void> {
    if (!this.localPath) {
      return Promise.resolve();
    }

    return fs.remove(this.localPath).then(() => {
      this.localPath = null;
    });
  }

  async add(files: string | string[]) {
    if (Array.isArray(files)) {
      for (let file of files) {
        await this._git(`add ${file}`);
      }
    } else {
      return this._git(`add "${files}"`);
    }
  }

  commit(message: string) {
    console.log('commit: ' + message);

    const localPath = this.localPath;
    if (!localPath) {
      throw new GitError('repository not initialized', 'invalid localPath');
    }

    return pipe(message, 'git commit -F -', {
      cwd: localPath
    });
  }

  branch(name: string): Promise<void> {
    return this._git(`checkout -B "${name}"`).then(() => {
      this.localBranch = name;
    });
  }

  push() {
    const branch = this.localBranch;
    const localPath = this.localPath;
    if (!branch || !localPath) {
      throw new GitError(
          'repository not initialized',
          'invalid local branch or path');
    }

    if (!this.fork) {
      throw new GitError('fork not initialized', 'invalid fork');
    }

    if (!this.localPath) {
      throw new GitError('', '');
    }

    const forkWithAuth = this._auth(this.fork, true);

    // don't use this._git since it could leak credentials if a GitError is
    // raised
    return exec(`git push "${forkWithAuth}" "${branch}"`, {
      cwd: localPath
    });
  }

  async modulePath(mod: Module | string): Promise<string> {
    const lp = await this.clone();

    let realModule: Module;
    if (typeof mod === 'string') {
      const maybeMod = this.getModule(mod);
      if (maybeMod) {
        realModule = maybeMod;
      } else {
        return path.join(lp, mod);
      }
    } else {
      realModule = mod;
    }

    if (realModule.path) {
      return path.join(lp, realModule.path);
    } else {
      return path.join(lp, realModule.name);
    }
  }

  async loadModules(): Promise<IntermediateModule[]> {
    const localPath = await this.clone();

    const promise = check.scan(this, localPath);
    this.modulesPromise = promise;
    this.promises.push(this.modulesPromise);

    return promise;
  }

  ready() {
    return this.localPath !== null;
  }

  dump() {
    return Object.assign({}, super.dump(), {
      fork: this.fork,
      auth: this.auth
    });
  }
}

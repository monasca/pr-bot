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

const crypto = require('crypto');
const path = require('path');
const url = require('url');

const fs = require('fs-extra');

const check = require('../check');
const config = require('../config');
const github = require('../github');

const { ExtendableError, exec, pipe } = require('../util');
const { Module } = require('../module');
const { Repository } = require('./repository');

const repoBase = '/tmp/git';

class GitError extends ExtendableError {
  constructor(m, err) {
    super(`${m}: err="${err}"`);
  }
}

function git(cwd, args) {
  const cfg = config.get();
  const options = { cwd };
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

function delay(value, timeout = 5000) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(value);
    }, timeout);
  });
}

function gitRemoteEquals(a, b) {
  const pa = url.parse(a);
  const pb = url.parse(b);

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

class GitRepository extends Repository {
  constructor(options = {}) {
    super(options);

    // name of fork in github user for this github domain (e.g. github.com)
    // and configured token
    this.fork = options.fork;

    if (typeof options.auth === 'undefined') {
      this.auth = false;
    } else {
      this.auth = options.auth;
    }

    this.modulesPromise = null;

    this.localPath = null;
    this.localBranch = null;
  }

  _git(args) {
    return git(this.localPath, args);
  }

  providesRemote(remote) {
    return gitRemoteEquals(this.remote, remote);
  }

  getOrCreateFork() {
    if (this.fork) {
      return Promise.resolve(this.fork);
    }

    const parts = url.parse(this.remote);
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
    });
  }

  createPullRequest(title, body = null) {
    const remoteParts = url.parse(this.remote);
    const [ owner, repo ] = remoteParts.pathname.substring(1).split('/');
    const forkParts = url.parse(this.fork);
    const [ forkOwner ] = forkParts.pathname.substring(1).split('/');

    const gh = github.get(remoteParts.hostname);
    const options = {
      owner, repo, title, body,
      head: `${forkOwner}:${this.localBranch}`,
      base: 'master',
      maintainer_can_modify: true
    };
    console.log('pr options:', options);
    return gh.pullRequests.create(options);
  }

  type() {
    return 'git';
  }

  _auth(remote, force = false) {
    const parts = url.parse(remote);

    if (typeof this.auth === 'string') {
      parts.auth = this.auth;
      return url.format(parts);
    }

    if (force || this.auth === true) {
      const gh = github.get(parts.hostname);
      parts.auth = gh.auth.token;
      return url.format(parts);
    }

    return remote;
  }

  clone(branch = 'master') {
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

  clean() {
    if (!this.localPath) {
      return Promise.resolve();
    }

    return fs.remove(this.localPath).then(() => {
      this.localPath = null;
    });
  }

  add(files) {
    if (Array.isArray(files)) {
      return files.reduce((p, file) => {
        return p.then(() => this._git(`add "${file}"`));
      }, Promise.resolve());
    } else {
      return this._git(`add "${files}"`);
    }
  }

  commit(message) {
    console.log('commit: ' + message);

    return pipe(message, 'git commit -F -', {
      cwd: this.localPath
    });
  }

  branch(name) {
    return this._git(`checkout -B "${name}"`).then(() => {
      this.localBranch = name;
    });
  }

  push() {
    const forkWithAuth = this._auth(this.fork, true);

    // don't use this._git since it could leak credentials if a GitError is
    // raised
    return exec(`git push "${forkWithAuth}" "${this.localBranch}"`, {
      cwd: this.localPath
    });
  }

  modulePath(mod) {
    let name;
    if (mod instanceof Module) {
      name = mod.name;
    } else {
      name = mod;
    }

    // TODO support flat repositories
    return this.clone().then(lp => path.join(lp, name));
  }

  loadModules() {
    this.modulesPromise = this.clone().then(localPath => {
      return check.scan(this, localPath);
    });

    this.promises.push(this.modulesPromise);
    return this.modulesPromise;
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

module.exports = {
  GitRepository,
  GitError,
  gitRemoteEquals
};

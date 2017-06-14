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

const path = require('path');
const url = require('url');

const fs = require('fs-extra');
const shell = require('shelljs');

const check = require('../check');
const config = require('../config');
const github = require('../github');

const { ExtendableError } = require('../util');
const { Module } = require('../module');
const { Repository } = require('./repository');

const repoBase = '/tmp/git';

class GitError extends ExtendableError {
  constructor(m, err) {
    super(`${m}: err="${err}"`);
  }
}

function git(args) {
  const cfg = config.get();
  const options = {};
  if (cfg.git.proxy) {
    options['env'] = {
      'HTTP_PROXY': cfg.git.proxy,
      'HTTPS_PROXY': cfg.git.proxy
    };
  }

  const ret = shell.exec(`git ${args}`, options);
  if (ret.code === 0) {
    return ret.stdout;
  } else {
    throw new GitError(`git command failed: git ${args}`, ret.stderr.trim());
  }
}

function isDirectory(path) {
  return fs.statSync(path).isDirectory();
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

    this.modulesPromise = null;

    this.localPath = null;
    this.localBranch = null;
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
    const getOpts = { visbility: 'public', affiliation: 'owner' };

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

  clone(branch = 'master') {
    if (this.localPath !== null) {
      return this.localPath;
    }

    const localPath = path.join(repoBase, this.name);
    shell.mkdir('-p', localPath);
    shell.pushd(localPath);
    if (!fs.existsSync(path.join(localPath, '.git'))) {
      // TODO make this safer in case origin/fork change?
      // possibly not worth it, though
      git('init');
      git(`remote add origin ${this.remote}`);
    }

    git(`fetch origin ${branch}`);
    git(`checkout -B ${branch} origin/${branch}`);

    this.localBranch = branch;
    this.localPath = localPath;
    shell.popd();
    return localPath;
  }

  add(files) {
    shell.pushd(this.localPath);
    if (Array.isArray(files)) {
      for (let file in files) {
        git(`add ${file}`);
      }
    } else {
      git(`add ${files}`);
    }
    shell.popd();
  }

  commit(message) {
    console.log('commit: ' + message);

    shell.pushd(this.localPath);
    const str = new shell.ShellString(message);
    str.exec('git commit -F -');
    shell.popd();
  }

  branch(name) {
    shell.pushd(this.localPath);
    git(`checkout -B ${name}`);
    this.localBranch = name;
    shell.popd();
  }

  push() {
    const parts = url.parse(this.fork);
    const gh = github.get(parts.hostname);
    parts.auth = gh.auth.token;
    const forkWithAuth = url.format(parts);

    shell.pushd(this.localPath);
    git(`push ${forkWithAuth}`);
    shell.popd();
  }

  modulePath(mod) {
    if (!this.ready()) {
      this.clone();
    }

    let name;
    if (mod instanceof Module) {
      name = mod.name;
    } else {
      name = mod;
    }

    // TODO support flat repositories
    return path.join(this.localPath, name);
  }

  loadModules() {
    if (!this.ready()) {
      this.clone();
    }

    this.modulesPromise = fs.readdir(this.localPath).then(files => {
      const modules = [];

      const dirs = files
          .filter(f => isDirectory(path.join(this.localPath, f)))
          .filter(f => f !== '.git');

      for (let dir of dirs) {
        const type = check.resolve(this, dir);
        if (!type) {
          console.log(`unknown module type: ${dir} in ${this.name}`);
          continue;
        }

        modules.push({ name: dir, type });
      }

      return modules;
    });

    this.promises.push(this.modulesPromise);
    return this.modulesPromise;
  }

  ready() {
    return this.localPath !== null;
  }
}

module.exports = {
  GitRepository,
  GitError,
  gitRemoteEquals
};

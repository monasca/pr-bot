const path = require('path');
const shell = require('shelljs');

const util = require('./util');

const repoBase = '/tmp/repositories';

class RepositoryError extends util.ExtendableError {
  constructor(m, err) {
    super(`${m}: err="${err}"`);
  }
}

function git(args) {
  const ret = shell.exec(`git ${args}`);
  if (ret.code === 0) {
    return ret.stdout;
  } else {
    throw new RepositoryError(`git command failed: git ${args}`);
  }
}

class Repository {
  constructor(options) {
    this.name = options.name;
    this.remote = options.remote;
    this.fork = options.fork;

    this.local = false;
    this.branch = null;
  }

  clone(branch = 'master') {
    const localPath = path.join(repoBase, this.name);
    if (this.local) {
      return localPath;
    }

    shell.mkdir('-p', localPath);
    shell.cd(localPath);
    git('init');
    git(`remote add origin ${this.remote}`);
    if (this.fork) {
      git(`remote add fork ${this.fork}`);
    }

    git(`fetch origin ${branch}`);
    git(`checkout origin/${branch}`);

    this.branch = branch;
    this.local = true;
    return localPath;
  }

  add(files) {
    if (Array.isArray(files)) {
      for (let file in files) {
        git(`add ${file}`);
      }
    } else {
      git(`add ${files}`);
    }
  }

  commit(message) {
    const str = new shell.ShellString(message);
    str.exec('git commit -F -');
  }

  branch(name) {
    git(`checkout -b ${name}`);
    this.branch = name;
  }

  push() {
    git(`push -u fork ${this.branch}`);
  }

  id() {
    return this.name;
  }

  dump() {
    return {
      name: this.name,
      remote: this.remote,
      fork: this.fork
    };
  }
}

module.exports = Repository;

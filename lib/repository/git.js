const path = require('path');

const fs = require('fs-extra');
const shell = require('shelljs');

const check = require('../check');

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
  const ret = shell.exec(`git ${args}`);
  if (ret.code === 0) {
    return ret.stdout;
  } else {
    throw new GitError(`git command failed: git ${args}`);
  }
}

function isDirectory(path) {
  return fs.statSync(path).isDirectory();
}

class GitRepository extends Repository {
  constructor(options = {}) {
    super(options);

    this.fork = options.fork;

    this.modulesPromise = null;

    this.localPath = null;
    this.branch = null;
  }

  type() {
    return 'git';
  }

  clone(branch = 'master') {
    const localPath = path.join(repoBase, this.name);
    if (this.localPath !== null) {
      return localPath;
    }

    shell.mkdir('-p', localPath);
    shell.pushd(localPath);
    console.log('pushd: ', process.cwd());
    git('init');
    git(`remote add origin ${this.remote}`);
    if (this.fork) {
      git(`remote add fork ${this.fork}`);
    }

    git(`fetch origin ${branch}`);
    git(`checkout origin/${branch}`);

    this.branch = branch;
    this.localPath = localPath;
    shell.popd();
    console.log('popd: ', process.cwd());
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
    shell.pushd(this.localPath);
    const str = new shell.ShellString(message);
    str.exec('git commit -F -');
    shell.popd();
  }

  branch(name) {
    shell.pushd(this.localPath);
    git(`checkout -b ${name}`);
    this.branch = name;
    shell.popd();
  }

  push() {
    shell.pushd(this.localPath);
    git(`push -u fork ${this.branch}`);
    shell.popd();
  }

  modulePath(module) {
    let name;
    if (module instanceof Module) {
      name = module.name;
    } else {
      name = module;
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
          console.log(`module did not match any checks: ${dir} in ${this.name}`);
          continue;
        }

        modules.push(new Module({
          name: dir,
          type: type,
          repository: this.name,
          _meta: { repository: this }
        }));
      }

      return modules;
    });

    // TODO merge discovered modules with db modules
    this.modulesPromise.then(modules => {
      this.modules = modules;
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
  GitError
};

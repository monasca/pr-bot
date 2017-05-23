const datastore = require('../datastore');

const { ExtendableError } = require('../util');
const { Module } = require('../module');

class RepositoryError extends ExtendableError {
  constructor(m) {
    super(m);
  }
}

class Repository {
  constructor(options = {}) {
    this.name = options.name;

    // name of parent Repository, if applicable
    // (e.g. parent of docker repo monasca/api is monasca-docker)
    this.parent = options.parent || null;

    this.remote = options.remote;

    if ('_meta' in options) {
      this._meta = options._meta;
    }

    this.modules = [];

    this.promises = [];
    if (options.modules) {
      const dsLoad = this.loadDatastoreModules(options.modules);
      this.promises.push(dsLoad);
      dsLoad.then(modules => {
        this.modules = modules;
      });
    }
  }

  loadDatastoreModules() {
    return datastore.get().list(Module, [
      { f: 'repository', op: '=', val: this.name }
    ]);
  }

  loadParent() {
    if (!this.parent) {
      return Promise.resolve(null);
    } else {
      return datastore.get().get(Repository, this.parent);
    }
  }

  loadModules() {
    throw new RepositoryError('loadModules() not implemented');
  }

  updateVersions() {
    return Promise.all(this.modules.map(mod => mod.updateVersions()));
  }

  updateDependencies() {
    return Promise.all(this.modules.map(mod => mod.updateDependencies()));
  }

  type() {
    throw new RepositoryError('type() not implemented');
  }

  kind() {
    return 'Repository';
  }

  id() {
    return this.name;
  }

  ready() {
    return true;
  }

  settle() {
    return Promise.all(this.promises).then(() => this);
  }

  dump() {
    return {
      type: this.type(),
      name: this.name,
      parent: this.parent,
      remote: this.remote,
      modules: this.modules.map(m => m.name)
    };
  }

  static load(data) {
    return require('./index').create(data);
  }
}

module.exports = {
  RepositoryError,
  Repository
};
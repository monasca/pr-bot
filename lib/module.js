const ExtendableError = require('./util').ExtendableError;

const check = require('./check');
const datastore = require('./datastore');

class ModuleError extends ExtendableError {
  constructor(m) {
    super(m);
  }
}

class Module {
  constructor(options = {}) {
    this.repository = options.repository;
    this.name = options.name;
    this.type = options.type;
    this.versions = options.versions || [];
    this.dependencies = options.dependencies || [];
    
    this._meta = options._meta || {};
  }

  loadRepository() {
    if (this._meta.repository) {
      return Promise.resolve(this._meta.repository);
    } else {
      return datastore.get().get(Module, this.repository).then(repo => {
        this._meta.repository = repo;
        return repo;
      });
    }
  }

  updateVersions() {
    return this.loadRepository().then(repo => {
      return check.get(repo.type(), this.type).check(repo, this.name);
    }).then(versions => {
      this.versions = versions;
      return versions;
    });
  }

  updateDependencies() {
    return this.loadRepository().then(repo => {
      return check.get(repo.type(), this.type).dependencies(repo, this.name);
    }).then(dependencies => {
      this.dependencies = dependencies;
      return dependencies;
    });
  }

  kind() {
    return this.constructor.name;
  }

  id() {
    return null;
  }

  dump() {
    return {
      name: this.name,
      type: this.type,
      repository: this.repository,
      versions: this.versions,
      dependencies: this.dependencies
    };
  }
}

module.exports = {
  ModuleError,
  Module
};

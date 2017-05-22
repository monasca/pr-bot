const ExtendableError = require('./util').ExtendableError;

const datastore = require('./datastore');

class ModuleError extends ExtendableError {
  constructor(m) {
    super(m);
  }
}

class Module {
  constructor(options) {
    this.repository = options.repository;
    this.name = options.name;
    this.type = options.type;
    
    if ('_meta' in options) {
      this._meta = options._meta;
    }
  }

  getRepository() {
    return datastore.get().get(Module, this.repository);
  }

  getVersion() {
    throw new ModuleError('getVersion not implemented');
  }

  id() {
    return this.name;
  }

  dump() {
    return {
      name: this.name,
      type: this.type,
      repository: this.repository
    };
  }
}

module.exports = Module;

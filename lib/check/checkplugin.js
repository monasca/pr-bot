const util = require('../util');

class CheckException extends util.ExtendableError {
  constructor(m) {
    super(m);
  }
}

class CheckPlugin {
  constructor() {

  }

  type() {
    throw new CheckException('type() not implemented');
  }
  
  // eslint-disable-next-line no-unused-vars
  matches(repository, module) {
    throw new CheckException('matches() not implemented');
  }

  // eslint-disable-next-line no-unused-vars
  check(repository, module) {
    throw new CheckException('check() not implemented');
  }

  // eslint-disable-next-line no-unused-vars
  dependencies(repository, module) {
    throw new CheckException('dependencies() not implemented');
  }
}

function ensureReady(repository) {
  if (!repository.ready()) {
    throw new CheckException('repository must be checked out');
  }
}

module.exports = {
  CheckException,
  CheckPlugin,
  ensureReady
};

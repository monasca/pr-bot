const util = require('../util');

class CheckException extends util.ExtendableError {
  constructor(m) {
    super(m);
  }
}

class CheckPlugin {
  getVersion() {

  }
}

module.exports = {
  CheckException,
  CheckPlugin
};

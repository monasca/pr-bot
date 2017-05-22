const util = require('../util');

class DatastoreError extends util.ExtendableError {
  constructor(m) {
    super(m);
  }
}

class DatastoreBackend {
  constructor() {

  }

  // eslint-disable-next-line no-unused-vars
  init() {
    throw new DatastoreError('init not implemented');
  }

  // eslint-disable-next-line no-unused-vars
  list(type) {
    throw new DatastoreError('list not implemented');
  }

  // eslint-disable-next-line no-unused-vars
  get(type, key) {
    throw new DatastoreError('get not implemented');
  }

  // eslint-disable-next-line no-unused-vars
  store(object) {
    throw new DatastoreError('store not implemented');
  }

}

module.exports = {
  DatastoreError,
  DatastoreBackend
};

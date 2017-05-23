const config = require('../config');

const { DatastoreError } = require('./backend');
const { GoogleDatastore } = require('./google');

let instance = null;

function createDatastore(type) {
  switch (type) {
    case 'gcloud':
      return new GoogleDatastore();
    default:
      throw new DatastoreError('invalid datastore type: ' + type);
  }
}

function init() {
  const cfg = config.get();
  return createDatastore(cfg.datastore.type);
}

module.exports = {
  get: function() {
    if (instance === null) {
      instance = init();
    }

    return instance;
  }
};

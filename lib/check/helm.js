const {
  CheckPlugin
} = require('./checkplugin');

class HelmCheckPlugin extends CheckPlugin {
  constructor() {
    super();
  }

  type() {
    return { repository: 'helm', module: 'helm' };
  }

  // eslint-disable-next-line no-unused-vars
  matches(repository, moduleName) {
    // no-op for specialized repos like docker, helm
    return true;
  }

  check(repository, moduleName) {
    return repository.indexPromise.then(index => {
      return index.entries[moduleName].map(v => v.version);
    });
  }

  // eslint-disable-next-line no-unused-vars
  dependencies(repository, moduleName) {
    // helm only supports reverse dependencies (without downloading/gunzipping
    // the chart)
    return Promise.resolve([]);
  }
}

module.exports = {
  HelmCheckPlugin
};

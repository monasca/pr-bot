const url = require('url');

const rp = require('request-promise-native');
const yaml = require('js-yaml');

const { Module } = require('../module');
const { Repository } = require('./repository');

class HelmRepository extends Repository {
  constructor(options = {}) {
    super(options);

    this.index = null;
    this.indexPromise = null;
    this.modulesPromise = null;
  }

  loadModules() {
    const parts = url.parse(this.remote);
    if (!parts.pathname.endsWith('/index.yaml')) {
      if (parts.pathname.endsWith('/')) {
        parts.pathname = `${parts.pathname}index.yaml`;
      } else {
        parts.pathname = `${parts.pathname}/index.yaml`;
      }
    }

    const indexUrl = url.format(parts);
    console.log('indexUrl: ', indexUrl);
    this.indexPromise = rp(indexUrl).then(content => {
      this.index = yaml.safeLoad(content);
      return this.index;
    });

    this.modulesPromise = this.indexPromise.then(index => {
      const modules = [];
      for (let entry of Object.keys(index.entries)) {
        modules.push(new Module({
          repository: this.name,
          name: entry,
          type: 'helm',
          _meta: { repository: this }
        }));
      }

      return modules;
    });

    // TODO merge discovered modules with db modules
    this.modulesPromise.then(modules => {
      this.modules = modules;
    });

    this.promises.push(this.indexPromise, this.modulesPromise);

    return this.modulesPromise;
  }

  type() {
    return 'helm';
  }
}

module.exports = {
  HelmRepository
};

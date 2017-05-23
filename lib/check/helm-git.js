const fs = require('fs-extra');
const path = require('path');

const yaml = require('js-yaml');

const {
  CheckPlugin,
  CheckException,
  ensureReady
} = require('./checkplugin');

class HelmGitCheckPlugin extends CheckPlugin {
  constructor() {
    super();
  }

  type() {
    return { repository: 'git', module: 'helm'};
  }

  matches(repository, moduleName) {
    ensureReady(repository);

    const modulePath = repository.modulePath(moduleName);
    return fs.existsSync(path.join(modulePath, 'Chart.yaml'));
  }

  check(repository, moduleName) {
    ensureReady(repository);

    const modulePath = repository.modulePath(moduleName);
    const chartPath = path.join(modulePath, 'Chart.yaml');

    return fs.readFile(chartPath)
        .then(content => yaml.safeLoad(content))
        .then(chart => [chart.version]);
  }

  dependencies(repository, moduleName) {
    ensureReady(repository);

    const modulePath = repository.modulePath(moduleName);
    const requirementsPath = path.join(modulePath, 'requirements.yaml');

    if (fs.existsSync(requirementsPath)) {
      return fs.readFile(requirementsPath)
          .then(content => yaml.safeLoad(content))
          .then(reqs => reqs ? reqs : { dependencies: [] })
          .then(reqs => reqs.dependencies.map(dep => ({
            name: dep.name,
            version: dep.version,
            type: 'helm'
          })));
    } else {
      return Promise.resolve([]);
    }

    // TODO find docker dependencies too, something like...
    // const helmPromise = ...
    // const dockerPromise = ...
    // return Promise.all([helmPromise, dockerPromise]).then(...)
  }
}

module.exports = {
  HelmGitCheckPlugin
};

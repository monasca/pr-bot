const { HelmCheckPlugin } = require('./helm');
const { HelmGitCheckPlugin } = require('./helm-git');

let plugins = null;

function init() {
  plugins = [
    new HelmCheckPlugin(),
    new HelmGitCheckPlugin()
  ];
}

function get(repoType, moduleType) {
  if (!plugins) {
    init();
  }

  for (let plugin of plugins) {
    let pType = plugin.type();
    if (pType.repository === repoType && pType.module === moduleType) {
      return plugin;
    }
  }

  return null;
}

function resolve(repository, module) {
  if (!plugins) {
    init();
  }

  for (let plugin of plugins) {
    if (plugin.type().repository !== repository.type()) {
      continue;
    }

    if (plugin.matches(repository, module)) {
      return plugin.type().module;
    }
  }
}

module.exports = {
  get,
  resolve
};


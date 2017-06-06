const path = require('path');

const fs = require('fs-extra');
const yaml = require('js-yaml');

const { MutationPlugin, MutationException } = require('./mutationplugin');
const { helmRemoteEquals } = require('../repository/helm');

function updateRequirements(repository, update, requirements) {
  for (let dep of requirements.dependencies) {
    if (!helmRemoteEquals(dep.repository, update.srcRepository.remote)) {
      continue;
    }

    if (dep.name !== update.srcModule) {
      continue;
    }

    dep.repository = update.srcRepository.remote;
    dep.version = update.toVersion;
    return;
  }

  throw new MutationException(
    `No match found for ${update.srcRepository.remote}:${update.srcModule} in reqs`);
}

function formatCommitMessage(up) {
  return `auto-update: ${up.destModule} ${up.fromVersion} -> ${up.toVersion}`;
}

function formatBranch(up) {
  const cleanVersion = up.toVersion.replace(/[^a-zA-Z0-9]/gi, '');
  return `up-${up.destModule}-${cleanVersion}`;
}

class HelmRequirementsMutationPlugin extends MutationPlugin {
  constructor() {
    super();
  }

  type() {
    return { repository: 'git', module: 'helm', type: 'requirements' };
  }

  apply(repository, update) {
    const modulePath = repository.modulePath(update.destModule);
    const reqsPath = path.join(modulePath, 'requirements.yaml');
    return fs.readFile(reqsPath).then(reqsStr => {
      const reqs = yaml.safeLoad(reqsStr);
      updateRequirements(repository, update, reqs);
      return fs.writeFile(reqsPath, yaml.safeDump(reqs));
    }).then(() => {
      repository.branch(formatBranch(update));
      repository.add(reqsPath);
      repository.commit(formatCommitMessage(update));
      // TODO start pushing things
      //repository.push();
    });
  }
}

module.exports = {
  HelmRequirementsMutationPlugin
};

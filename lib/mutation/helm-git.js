const path = require('path');

const fs = require('fs-extra');
const yaml = require('js-yaml');

const { MutationPlugin } = require('./mutationplugin');

function updateRequirements(repository, update, requirements) {
  for (let dep of requirements.dependencies) {
    if (dep.repository !== repository.remote) {
      continue;
    }

    if (dep.name !== update.srcModule) {
      continue;
    }

    // TODO this isn't working
    // probably need to return something useful if the module update fails,
    // in addition to fixing the bug

    dep.version = update.toVersion;
    break;
  }
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
      //repository.push();
    });
  }
}

module.exports = {
  HelmRequirementsMutationPlugin
};

const path = require('path');
const url = require('url');

const fs = require('fs-extra');
const yaml = require('js-yaml');

const { MutationPlugin, MutationException } = require('./mutationplugin');

function helmRemoteEquals(a, b) {
  const pa = url.parse(a);
  const pb = url.parse(b);

  if (pa.protocol !== pb.protocol) {
    return false;
  }

  if (pa.host.toLowerCase() !== pb.host.toLowerCase()) {
    return false;
  }

  const pathPartsA = pa.pathname.substring(1).split('/');
  const pathPartsB = pb.pathname.substring(1).split('/');

  const lastA = pathPartsA[pathPartsA.length - 1];
  if (lastA === 'index.yaml' || lastA === '') {
    pathPartsA.pop();
  }

  const lastB = pathPartsB[pathPartsB.length - 1];
  if (lastB === 'index.yaml' || lastB === '') {
    pathPartsB.pop();
  }

  if (pathPartsA.length !== pathPartsB.length) {
    return false;
  }

  for (let i = 0; i < pathPartsA.length; i++) {
    if (pathPartsA[i] !== pathPartsB[i]) {
      return false;
    }
  }

  return true;
}

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
      //repository.push();
    });
  }
}

module.exports = {
  HelmRequirementsMutationPlugin
};

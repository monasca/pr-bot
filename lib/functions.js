const datastore = require('./datastore');
const repository = require('./repository');

const { ExtendableError } = require('./util');
const { Module } = require('./module');
const { Repository } = require('./repository/repository');
const { Update } = require('./update');

class PRBotError extends ExtendableError {
  constructor(m) {
    super(m);
  }
}

function addRepository(name, type, remote, parent = null) {
  const clazz = repository.get(type);
  if (!clazz) {
    return Promise.reject(`Invalid repository type ${type}`);
  }

  const ds = datastore.get();

  const checks = [];
  const notExists = ds.get(Repository, name)
      .catch(() => null) // get() should raise an error if no match
      .then(r => {
        if (r !== null) {
          throw new PRBotError(`repository already exists with name: ${name}`);
        }
      });
  checks.push(notExists);

  if (parent !== null) {
    checks.push(ds.get(Repository, parent));
  }

  return Promise.all(checks).then(() => {
    const repo = repository.create({ name, type, remote, parent });
    return repo.refreshModules()
        .then(() => repo.refreshVersions())
        .then(() => repo.refreshDependencies())
        .then(() => repo.store());
  });
}

function removeRepository(name) {
  const ds = datastore.get();

  return ds.get(Repository, name).then(repo => {
    return Promise.all(repo.modules.map(m => ds.delete(m))).then(() => {
      return ds.delete(repo);
    });
  });
}

function getRepositoryByRemote(remote) {
  const ds = datastore.get();

  return ds.list(Repository).then(repos => {
    return repos.find(r => r.providesRemote(remote));
  });
}

function listDependents(repoName, moduleName, moduleType) {
  const ds = datastore.get();

  let repoPromise;
  if (repoName instanceof Repository) {
    repoPromise = Promise.resolve(repoName);
  } else {
    repoPromise = ds.get(Repository, repoName);
  }

  if (moduleName instanceof Module) {
    moduleName = moduleName.name;
  }

  return repoPromise.then(repo => repo.settle()).then(repo => {
    const mod = repo.modules.find(m => m.name === moduleName);
    if (!mod) {
      throw new PRBotError(`Module not found: ${repoName} - ${moduleName}`);
    }

    const filters = [{ f: 'type', op: '=', val: moduleType }];
    return ds.list(Module, filters).then(mods => {
      return mods.filter(m => m.dependsOn(repo, mod));
    });
  });
}

function updateDependents(repo, moduleName, toVersion) {
  const moduleType = repo.getModule(moduleName).type;

  return listDependents(repo.name, moduleName, moduleType).then(dependents => {
    const updates = [];

    for (let dependent of dependents) {
      const dependency = dependent.getDependency(moduleName, moduleType);
      if (dependency.version === toVersion) {
        continue;
      }

      const update = new Update({
        srcRepository: repo.name,
        srcModule: moduleName,
        destRepository: dependent.repository,
        destModule: dependent.name,
        fromVersion: dependency.version,
        toVersion: toVersion
      });

      updates.push(update);
    }

    return updates;
  });
}

/**
 * Performs a soft update of the repository with the given name.
 * 
 * A soft update will only affect modules that depend on changes that were
 * detected (as compared to our known versions) in this update cycle. Modules
 * that are already out of date (e.g. were out of date when the repository was
 * first added) will not be updated by this function.
 * 
 * @param {string} name 
 */
function softUpdateRepository(name) {
  const ds = datastore.get();

  return ds.get(Repository, name).then(repo => repo.settle()).then(repo => {
    // TODO: make sure newly added modules are handled correctly (or at all...)

    // changes in module dependencies don't result in any updates, but we still
    // need to keep track of them
    const ddiffPromise = repo.diffDependencies();

    // changes to (current) module versions should trigger updates to dependent
    // modules
    const vdiffPromise = repo.diffVersions();

    return Promise.all([ddiffPromise, vdiffPromise]).then(diffs => {
      const [ ddiff, vdiff ] = diffs;
      console.log('ddiff:', ddiff);
      console.log('vdiff:', vdiff);
      repo.applyModulePatches(ddiff);
      repo.applyModulePatches(vdiff);
      repo.store();

      const updates = [];
      for (let changed of vdiff) {
        // we only care if the 'current' version changes
        // usually that happens implicitly (e.g. in  helm), but if not we should
        // honor the field in case there is some release strategy and/or beta
        // versions
        console.log('changed:', changed)
        const current = changed.patches.find(p => {
          return p.op === 'replace' && p.path === '/current';
        });

        if (current) {
          updates.push(updateDependents(repo, changed.name, current.value));
        }
      }

      return Promise.all(updates).then(nested => {
        return [].concat(...nested);
      });
    });
  });
}

// TODO: hard update: compare all modules (or some specific module) to their
// dependencies and update if out of date
// soft update only tries to update dependents of modules that changed in that
// event whereas hard update can affect modules that didn't change in this event

function updateModule(repoName, moduleName) {
  // TODO
}

module.exports = {
  addRepository,
  removeRepository,
  softUpdateRepository,
  updateModule,
  getRepositoryByRemote,
  listDependents
};

const datastore = require('./datastore');
const repository = require('./repository');

const { Repository } = require('./repository/repository');
const { ExtendableError } = require('./util');

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
    console.log('created:', repo);
    return repo.refreshModules()
        .then(() => {
          console.log('refreshing versions');
          return repo.refreshVersions();
        })
        .then(() => {
          console.log('refreshing dependencies');
          return repo.refreshDependencies();
        })
        .then(() => {
          console.log('stored');
          return repo.store();
        });
  });
}

module.exports = { addRepository };


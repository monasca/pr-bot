const { GitRepository } = require('./git');

let repositoryTypes = null;

function init() {
  repositoryTypes = new Map();
  repositoryTypes.set('git', GitRepository);
}

function get(type) {
  if (!repositoryTypes) {
    init();
  }

  return repositoryTypes.get(type);
}

function create(data) {
  const clazz = repositoryTypes.get(data.type);
  return new clazz(data);
}

module.exports = {
  get,
  create
};

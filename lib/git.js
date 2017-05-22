const GitHub = require('github');
const shell = require('shelljs');

const config = require('./config');

let instance = null;

function configureGit(gitConfig) {
  const name = shell.exec('git config user.name').stdout;
  if (name.trim().length === 0) {
    console.log('updated git user.name');
    shell.exec(`git config user.name "${gitConfig.user}"`);
  }

  const email = shell.exec('git config user.email').stdout;
  if (email.trim().length === 0) {
    console.log('updated git user.email');
    shell.exec(`git config user.email "${gitConfig.git.email}"`);
  }
}

function init() {
  const cfg = config.get();
  configureGit(cfg.git);

  let options = {
    timeout: 2000,
    protocol: 'https'
  };

  if ('host' in cfg.github) {
    options['host'] = cfg.github.host;
  }

  if ('pathPrefix' in cfg.github ) {
    options['pathPrefix'] = cfg.github.pathPrefix;
  }

  let github = new GitHub(options);
  github.authenticate({
    type: 'oauth',
    token: cfg.github.token
  });

  return github;
}

module.exports = {
  get: function() {
    if (instance === null) {
      instance = init();
    }

    return instance;
  },
};

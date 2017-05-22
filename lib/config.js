const fs = require('fs');

const yaml = require('js-yaml');

let instance = null;

function init() {
  return yaml.safeLoad(fs.readFileSync('config.yml', 'utf8'));
}

module.exports = {
  get: function() {
    if (instance === null) {
      instance = init();
    }

    return instance;
  }
};

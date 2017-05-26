// (C) Copyright 2017 Hewlett Packard Enterprise Development LP
//
// Licensed under the Apache License, Version 2.0 (the "License"); you may
// not use this file except in compliance with the License. You may obtain
// a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
// WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
// License for the specific language governing permissions and limitations
// under the License.

const shell = require('shelljs');

const config = require('./config');

let initialized = false;

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
  if (initialized) {
    return;
  }

  const cfg = config.get();
  configureGit(cfg.git);
  initialized = true;
}

module.exports = { init };

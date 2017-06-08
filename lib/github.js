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

const GitHub = require('github');

const config = require('./config');

let clients = null;

function initClient(cfg) {
  if (!cfg.token) {
    return;
  }

  const options = {
    timeout: 2000,
    protocol: 'https'
  };

  options['host'] = cfg.host;

  if ('pathPrefix' in cfg) {
    options['pathPrefix'] = cfg.pathPrefix;
  }

  if ('proxy' in cfg) {
    options['proxy'] = cfg.proxy;
  }

  let client = new GitHub(options);
  client.authenticate({
    type: 'oauth',
    token: cfg.token
  });

  clients.set(cfg.domain, client);
}

function init() {
  clients = new Map();

  const cfg = config.get();
  const githubs = cfg.github;
  if (Array.isArray(githubs)) {
    githubs.forEach(initClient);
  } else {
    initClient(githubs);
  }
}

function get(domain) {
  if (!clients) {
    init();
  }

  return clients.get(domain);
}

function domains() {
  if (!clients) {
    init();
  }

  return Array.from(clients.keys);
}

module.exports = { get, domains };

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

const url = require('url');

const rp = require('request-promise-native');

const config = require('./config');

const { ExtendableError } = require('./util');

class HipChatError extends ExtendableError {
  constructor(m) {
    super(m);
  }
}

class HipChatClient {
  constructor(cfg) {
    this.url = cfg.url;
    if (typeof cfg.proxy !== 'undefined') {
      this.proxy = cfg.proxy;
    } else {
      this.proxy = null;
    }

    if (typeof cfg.default !== 'undefined') {
      this.default = cfg.default;
    } else {
      this.default = false;
    }

    if (typeof cfg.from !== 'undefined') {
      this.from = cfg.from;
    } else {
      this.from = null;
    }

    const parts = url.parse(cfg.url, true);
    const tokens = parts.pathname.split('/');
    const roomIndex = tokens.indexOf('room');
    if (roomIndex < 0) {
      throw new HipChatError('Invalid HipChat URL');
    }
    this.roomId = tokens[roomIndex + 1];

    if (typeof parts.query.auth_token === 'undefined') {
      throw new HipChatError('No auth_token set in HipChat URL');
    }
    this.token = parts.query.auth_token;
  }

  send(message) {
    console.log('sending message to room:', this.roomId);

    let body;
    if (typeof message === 'string') {
      body = {
        message_format: "text",
        message
      };
    } else {
      body = message;
    }

    if (typeof body.from === 'undefined' && this.from) {
      body.from = this.from;
    }

    const options = {
      uri: this.url,
      qs: { auth_token: this.token },
      method: 'POST',
      json: true,
      timeout: 7500,
      body
    };

    if (this.proxy !== null) {
      options.proxy = this.proxy;
    }

    return rp(options);
  }
}

let clients = null;

function init() {
  if (clients !== null) {
    return clients;
  }

  clients = [];

  const cfg = config.get();
  for (let entry of cfg.hipchat) {
    let client;
    if (typeof entry === 'string') {
      client = new HipChatClient({ url: entry });
    } else {
      client = new HipChatClient(entry);
    }

    clients.push(client);
  }

  return clients;
}

function getDefault() {
  const clients = init();
  for (let client of clients) {
    if (client.default) {
      return client;
    }
  }

  return null;
}

function get(roomId) {
  if (!roomId) {
    return getDefault();
  }

  roomId = roomId.toString(); // in case of int

  const clients = init();
  for (let client of clients) {
    if (client.roomId === roomId) {
      return client;
    }
  }

  return null;
}

module.exports = {
  HipChatClient,
  HipChatError,
  get,
  getDefault
};

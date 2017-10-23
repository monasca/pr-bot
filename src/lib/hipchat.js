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

// @flow

import path from 'path';
import url from 'url';

import  nunjucks from 'nunjucks';
import  rp from 'request-promise-native';
import  yaml from 'js-yaml';

import * as config from './config';

import { ExtendableError, safeParseURL } from './util';

import type { HipChatConfig } from './config';
import type { TemplateEnvironment } from './template-util';

const TEMPLATE_DIRECTORY = path.resolve(__dirname, '../templates/hipchat');

const nj = nunjucks.configure(TEMPLATE_DIRECTORY, {
  lstripBlocks: true,
  trimBlocks: true
});

function loadTemplate(name, env) {
  const rendered = nj.render(`${name}.yml.njk`, env);
  return yaml.safeLoad(rendered);
}

export class HipChatError extends ExtendableError {
  constructor(m: string) {
    super(m);
  }
}

export type HipChatMessage = {
  from?: string,
  message_format?: 'html' | 'text',
  notify?: boolean,
  color?: string,
  message: string,
  card?: {
    id: string,
    style: string,
    description?: {
      value: string,
      format: 'html' | 'text'
    },
    format?: 'compact' | 'medium',
    url?: string,
    title: string,
    activity?: {
      html: string,
      icon: { url: string, 'url@2x': string }
    },
    attributes?: {
      value: { url?: string, style?: string, label: string },
      label?: string
    }[]
  }
};

export class HipChatClient {
  url: string;
  proxy: string | null;
  default: boolean;
  from: string | null;
  roomId: string;
  token: string;

  constructor(cfg: HipChatConfig) {
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

    const parts = safeParseURL(cfg.url, true);
    const tokens = parts.pathname.split('/');
    const roomIndex = tokens.indexOf('room');
    if (roomIndex < 0) {
      throw new HipChatError('Invalid HipChat URL');
    }
    this.roomId = tokens[roomIndex + 1];

    if (!parts.query || typeof parts.query.auth_token === 'undefined') {
      throw new HipChatError('No auth_token set in HipChat URL');
    }

    this.token = parts.query.auth_token;
  }

  send(message: string | HipChatMessage) {
    console.log('sending message to room:', this.roomId);

    let body: HipChatMessage;
    if (typeof message === 'string') {
      body = {
        message_format: 'text',
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
      timeout: 10000,
      body
    };

    if (this.proxy !== null) {
      options.proxy = this.proxy;
    }

    return rp(options);
  }

  sendTemplate(templateName: string, env: TemplateEnvironment) {
    const loaded = loadTemplate(templateName, env);
    console.log('loaded:', loaded);
    return this.send(loaded);
  }
}

let initialized = false;
const clients: HipChatClient[]  = [];

function init() {
  if (initialized) {
    return clients;
  }

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

  initialized = true;
  return clients;
}

export function getDefault(): HipChatClient | null {
  const clients = init();
  for (let client of clients) {
    if (client.default) {
      return client;
    }
  }

  return null;
}

export function get(roomId: string | number): HipChatClient | null {
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

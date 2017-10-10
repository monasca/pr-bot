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

import fs from 'fs';

import yaml from 'js-yaml';

export type GitHubConfig = {
  domain: string,
  host: string,
  pathPrefix?: string,
  token: string,
  proxy?: string,
  secret?: string 
};

export type GitConfig = {
  name: string,
  email: string,
  proxy?: string
};

export type HelmConfig = {
  proxy?: string
};

export type DatastoreConfig = {
  type: string,
  config: { [string]: mixed }
};

export type HipChatConfig = string | {
  url: string,
  proxy?: string,
  default?: boolean
};

export type Config = {
  github: GitHubConfig[],
  git: GitConfig,
  helm?: HelmConfig,
  datastore: DatastoreConfig,
  tokens: string[],
};

let instance: ?Config = null;

function init(): Config {
  return yaml.safeLoad(fs.readFileSync('config.yml', 'utf8'));
}

export function get(): Config {
  if (instance != null) {
    return instance;
  } else {
    instance = init();
    return instance;
  }
}

//export function getSecret() {
//
//}

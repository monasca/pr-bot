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

import MutationPlugin from './mutationplugin';

import HelmRequirementsMutationPlugin from './helm-requirements';
import HelmValuesMutationPlugin from './helm-values';
import LandscaperMutationPlugin from './landscaper';

let initialized: boolean = false;
let plugins: MutationPlugin<any>[] = [];

function init() {
  plugins.push(new HelmRequirementsMutationPlugin());
  plugins.push(new HelmValuesMutationPlugin());
  plugins.push(new LandscaperMutationPlugin());

  initialized = true;
}

export function get(
    destRepoType: string,
    srcModuleType: string,
    destModuleType: string): ?MutationPlugin<any> {
  if (!initialized) {
    init();
  }

  for (let plugin of plugins) {
    let pType = plugin.type();
    if (pType.destRepository === destRepoType &&
        pType.srcModule === srcModuleType &&
        pType.destModule === destModuleType) {
      return plugin;
    }
  }

  return null;
}

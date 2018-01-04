// @flow

import type { DockerTagHash } from './lib/docker-util';

const example: DockerTagHash[] = [
  { tag: 'foo', hash: 'qwerty' },
  { tag: 'bar', hash: 'asdf' }
];

function test(): string[] {
  return example.map(entry => entry.tag);
}


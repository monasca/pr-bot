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

import child_process from 'child_process';
import os from 'os';

// see also: http://stackoverflow.com/a/32749533
export class ExtendableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = (new Error(message)).stack;
    }
  }
}

// copied from flowlib
export type ParsedURL = {
  protocol?: string;
  slashes?: boolean;
  auth?: string;
  host?: string;
  port?: string;
  hostname?: string;
  hash?: string;
  search?: string;
  query?: any; // null | string | Object
  pathname?: string;
  path?: string;
  href: string;
};

export type SubprocessReturnValue = {
  code: number,
  stdout: string,
  stderr: string
};

export function spawn(
      command: string,
      args: string[],
      options = {}): Promise<SubprocessReturnValue> {
  options.maxBuffer = options.maxBuffer || 8 * 1024;
  options.stdio = options.stdio || 'inherit';

  return new Promise((resolve, reject) => {
    const child = child_process.spawn(command, args, options);
    child.on('error', err => {
      reject(err);
    });

    child.on('close', code => {
      if (code === 0) {
        resolve({ code, stdout: 'nope', stderr: 'nope' });
      } else {
        reject({ code, stdout: 'nope', stderr: 'probably' });
      }
    });

    child.stdout.on('data', data => {
      console.log(data.toString());
    });

    child.stderr.on('data', data => {
      console.log(data.toString());
    });
  });
}

type ExecLogEntry = {
  code: ?number,
  command: string,
  usedStart: number,
  usedEnd: ?number,
  usedDiff: ?number,
  time: ?number
};

const execLogs: ExecLogEntry[] = [];

export function exec(
      command: string,
      options: {[string]: mixed} = {}): Promise<SubprocessReturnValue> {
  options.maxBuffer = options.maxBuffer || 8 * 1024;
  options.stdio = options.stdio || 'inherit';

  return new Promise((resolve, reject) => {
    const timeStart = +(new Date());
    const usedStart = (os.totalmem() - os.freemem()) / (1024 * 1024);
    const log = {
      usedStart,
      command: command.split(' ').slice(0, 2).join(' '),
      code: null, usedEnd: null, usedDiff: null, time: null
    };

    execLogs.push(log);

    child_process.exec(command, options, (error, stdout, stderr) => {
      let code: number;
      if (!error) {
        code = 0;
      } else if (typeof error.code === 'undefined') {
        code = 1;
      } else {
        code = (error.code: number);
      }

      // debugging utils for GCF child_process memory leak
      // see also: https://issuetracker.google.com/issues/62723252
      const usedEnd = (os.totalmem() - os.freemem()) / (1024 * 1024);

      log.code = code;
      log.usedEnd = usedEnd;
      log.usedDiff = usedEnd - usedStart;
      log.time = (+(new Date()) - timeStart) / 1000;

      console.log(
          `MEMORY: exec returned ${code} after ${log.time}s`,
          `and consumed ${log.usedDiff} MiB`);

      if (code === 0) {
        resolve({ code, stdout, stderr });
      } else {
        reject({ code, stdout, stderr });
      }
    });
  });
}

export function pipe(input, command, options = {}) {
  return new Promise((resolve, reject) => {
    const timeStart = +(new Date());
    const usedStart = (os.totalmem() - os.freemem()) / (1024 * 1024);
    const log = {
      usedStart,
      command: command.split(' ').slice(0, 2).join(' '),
      code: null, usedEnd: null, usedDiff: null, time: null
    };
    execLogs.push(log);

    const c = child_process.exec(command, options, (error, stdout, stderr) => {
      let code;
      if (!error) {
        code = 0;
      } else if (typeof error.code === 'undefined') {
        code = 1;
      } else {
        code = error.code;
      }

      const usedEnd = (os.totalmem() - os.freemem()) / (1024 * 1024);

      log.code = code;
      log.usedEnd = usedEnd;
      log.usedDiff = usedEnd - usedStart;
      log.time = (+(new Date()) - timeStart) / 1000;

      console.log(
          `MEMORY: pipe returned ${code} after ${log.time}s`,
          `and consumed ${log.usedDiff} MiB`);

      if (code === 0) {
        resolve({ code, stdout, stderr });
      } else {
        reject({ code, stdout, stderr });
      }
    });

    c.stdin.write(input);
    c.stdin.end();
  });
}

export function dumpMemoryLeakInfo() {
  const sum = execLogs.reduce((acc, val) => acc + val.usedDiff, 0);
  const mean = sum / execLogs.length;
  console.log(`${execLogs.length} processes, avg memory lost: ${mean} MiB`);
  for (let log of execLogs) {
    console.log(log);
  }
}

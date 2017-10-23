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
import url from 'url';

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

export type SubprocessOptions = {
  cwd?: string,
  env?: { [string]: mixed },
  shell?: boolean | string,
  stdio?: string | string[],
  uid?: number,
  gid?: number,
  maxBuffer?: number,
  timeout?: number,
  killSignal?: string | number,
  encoding?: string,
  detached?: boolean,
  argv0?: string
};

export function spawn(
      command: string,
      args: string[],
      options: SubprocessOptions = {}): Promise<SubprocessReturnValue> {
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
      options: SubprocessOptions = {}): Promise<SubprocessReturnValue> {
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

    // $FlowFixMe: flow's built-in typedef is bad
    child_process.exec(command, options, (error, stdout: string, stderr: string) => {
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

export function pipe(
      input: string,
      command: string,
      options: SubprocessOptions = {}): Promise<SubprocessReturnValue> {
  return new Promise((resolve, reject) => {
    const timeStart = +(new Date());
    const usedStart = (os.totalmem() - os.freemem()) / (1024 * 1024);
    const log = {
      usedStart,
      command: command.split(' ').slice(0, 2).join(' '),
      code: null, usedEnd: null, usedDiff: null, time: null
    };
    execLogs.push(log);

    // $FlowFixMe: flow's built-in typedef is bad
    const c = child_process.exec(command, options, (error, stdout: string, stderr: string) => {
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

export type SafeParsedURL = {
  protocol: string;
  slashes: ?boolean;
  auth: ?string;
  host: string;
  port: ?string;
  hostname: string;
  hash: ?string;
  search: ?string;
  query: ?any; // null | string | Object
  pathname: string;
  path: string;
  href: string;
}

export class SafeURLParseError extends ExtendableError {
  constructor(m: string) {
    super(m);
  }
}

/**
 * Parses a URL but guarantees a non-null protocol/host/hostname/path/pathname.
 * A SafeURLParseError will be thrown if any of these fields are unset.
 * @param {string} urlString 
 * @param {boolean} parseQueryString
 */
export function safeParseURL(
      urlString: string,
      parseQueryString: boolean = false): SafeParsedURL {
  const parsed = url.parse(urlString, parseQueryString);

  const protocol = parsed.protocol;
  if (!protocol) {
    throw new SafeURLParseError(`invalid protocol in url: ${urlString}`);
  }

  const host = parsed.host;
  if (!host) {
    throw new SafeURLParseError(`invalid host in url: ${urlString}`);
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    throw new SafeURLParseError(`invalid hostname in url: ${urlString}`);
  }

  const path = parsed.path;
  if (!path) {
    throw new SafeURLParseError(`invalid path in url: ${urlString}`);
  }

  const pathname = parsed.pathname;
  if (!pathname) {
    throw new SafeURLParseError(`invalid path in url: ${urlString}`);
  }

  return {
    protocol,
    host, hostname,
    path, pathname,
    slashes: parsed.slashes,
    auth: parsed.auth,
    port: parsed.port,
    hash: parsed.hash,
    search: parsed.search,
    query: parsed.query,
    href: parsed.href
  };
}

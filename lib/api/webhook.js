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

const crypto = require('crypto');

const config = require('../config');
const functions = require('../functions');

const { HttpError } = require('./common');

/**
 * Finds the configured GitHub block that verifies against this request's
 * secret. If no matching secret is found, an HttpError is raised.
 * @param {object} req the incoming request
 */
function verifySecret(req) {
  const cfg = config.get();
  
  let githubs = cfg.github;
  if (!Array.isArray(githubs)) {
    githubs = [githubs];
  }

  for (let gh of githubs) {
    if (typeof gh.secret === 'undefined') {
      continue;
    }

    console.log(JSON.stringify(req.body));

    const digest = crypto.createHmac('sha1', gh.secret)
        .update(JSON.stringify(req.body)) // <-- not reliable! :(
        .digest('hex');

    const sig = req.get('X-Hub-Signature');
    if (sig === `sha1=${digest}`) {
      return gh;
    }
  }

  throw new HttpError('unauthorized', 401);
}

function handlePush(req) {
  // this may only be necessary if we want to support direct dependencies on
  // git repos at some point
  // right now we only depend on indirect artifacts e.g. github-pages, builds
  // uploaded to dockerhub, etc
  console.log('handlePush()');
}

function handleStatus(req) {
  console.log('handleStatus()');
  if (req.body.state !== 'success') {
    console.log('commit status was not success, skipping update check: ' +
        req.body.repository.name);
    return Promise.resolve();
  }

  // TODO: test this to figure out semantics for the 'branches' object
  // we only care about status updates on master
  // this function should work more or less the same as handlePageBuild
  // (we can treat this as the parent repository and only update children,
  // assuming that no CI/CD processes are making direct automatic commits to
  // master...)
}

function handlePageBuild(req) {
  // page builds are supported for helm repositories, but incidentally come from
  // git-type repositories
  // we can support this relationship by assuming the git repository that
  // spawned this event is marked as the parent repository
  const status = req.body.build.status;
  if (status !== 'built') {
    console.log('pages build did not succeed, skipping: ' +
        req.body.repository.name);
    return Promise.resolve();
  }

  const parentRemote = req.body.repository.html_url;
  return functions.getRepositoryByRemote(parentRemote)
      .then(parent => functions.getRepositoriesByParent(parent.name))
      .then(repos => repos.map(repo => {
        console.log('updating repository: ', repo.name);
        return functions.softUpdateRepository(repo.name);
      }));
}

function handlePullRequest(req) {
  // TODO: maybe self-close PRs if another user posts a PR that manually
  // updates?
  console.log('handlePullReqest()');
}

function handlePullRequestReview(req) {
  console.log('handlePullRequestReview()');
}

function handlePullRequestReviewComment(req) {
  console.log('handlePullReqestReviewComment()');
}

const handlers = {
  'push': handlePush,
  'status': handleStatus,
  'page_build': handlePageBuild,
  'pull_request': handlePullRequest,
  'pull_request_review': handlePullRequestReview,
  'pull_request_review_comment': handlePullRequestReviewComment,
};

function handle(req, res) {
  if (req.get('content-type') !== 'application/json') {
    throw new HttpError('content-type must be application/json', 406);
  }

  if (req.method !== 'POST') {
    throw new HttpError('method not allowed', 405);
  }

  // TODO: it isn't currently possible to get the raw request body in GCF, so
  // we can't reliably verify the request
  // workaround is to use a random endpoint name for now
  // see also: https://issuetracker.google.com/issues/36252545
  //const gh = verifySecret(req);
  const event = req.get('X-GitHub-Event');
  console.log('event:', event);
  console.log('payload:', req.body);

  return handlers[event](req);
}

module.exports = { handle };

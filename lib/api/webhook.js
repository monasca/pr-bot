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
const hipchat = require('../hipchat');

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

function createUpdateMessage(result) {
  const src = result.update.srcRepositoryName;
  const srcMod = result.update.srcModule;
  const dest = result.update.destRepositoryName;
  const destMod = result.update.destModule;
  const from = result.update.fromVersion;
  const to = result.update.toVersion;
  const text = `An update to ${src}/${srcMod} triggered an automatic update `
      + `to ${dest}/${destMod} (version ${from} -> ${to}).`;

  const card = {
    id: result.id,
    style: 'application',
    format: 'medium',
    title: result.title,
    description: {
      format: 'text',
      value: text
    },
    attributes: [
      {
        label: 'Module',
        value: {
          label: `${dest}/${destMod}`,
          url: result.update.destRepository.remote
        }
      }, {
        label: 'Dependency',
        value: {
          label: `${src}/${srcMod}`,
          url: result.update.srcRepository.remote
        }
      },
      { label: 'Version', value: { label: to } },
    ]
  };

  if (result.link) {
    card.url = result.link;
  }

  if (result.pr) {
    card.attributes.push({
      label: 'PR',
      value: {
        label: `#${result.pr.number}`,
        url: result.pr.html_url
      }
    });
  }

  return {
    color: 'green',
    message: `${text} ${result.link}`,
    notify: true,
    card
  };
}

function createStatusMessage(payload) {
  const text = `Commit status was marked as ${payload.state} in `
      + `${payload.repository.full_name}\nContext: ${payload.context}`;

  const stateStyle = payload.state === 'success' ? 'success' : 'error';

  const card = {
    id: payload.id.toString(),
    style: 'application',
    format: 'medium',
    title: payload.description,
    description: {
      format: 'text',
      value: text
    },
    attributes: [
      {
        label: 'Commit',
        value: {
          label: payload.sha.substring(0, 8),
          url: payload.commit.html_url
        }
      }, {
        label: 'State',
        value: {
          label: payload.state,
          url: payload.target_url,
          style: `lozenge-${stateStyle}`
        }
      }
    ]
  };

  let color;
  if (payload.state === 'success') {
    color = 'green';
  } else {
    color = 'red';
  }

  if (payload.branches.length > 0) {
    card.attributes.push({
      label: 'Branches',
      value: {
        label: payload.branches.map(b => b.name).join(', ')
      }
    });
  }

  if (payload.target_url) {
    card.url = payload.target_url;
  }

  const commitMessage = payload.commit.commit.message;
  const prMatch = /pull request #(\d+)/.exec(commitMessage);
  if (prMatch) {
    const pr = prMatch[1];
    card.attributes.push({
      label: 'PR',
      value: {
        label: `#${pr}`,
        url: `${payload.repository.html_url}/pull/${pr}`
      }
    });
  }

  return {
    message: `${text} ${payload.target_url}`,
    notify: false,
    card, color
  };
}

function safeNotify(message, repo) {
  return repo.notify(message).catch(err => {
    console.log('error sending notification: ', err);
  });
}

function safeNotifyError(message, repo = null) {
  console.log('safeNotifyError for repo', repo);

  let promise;
  if (repo) {
    promise = repo.notify(message);
  } else {
    const hip = hipchat.getDefault();
    if (hip) {
      promise = hip.send(message);
    } else {
      promise = Promise.resolve();
    }
  }

  return promise.catch(err => {
    console.log('error sending error notification: ', err);
  });
}

function performSoftUpdate(repo) {
  console.log('updating repository: ', repo.name);

  return functions.softUpdateRepository(repo.name).then(ret => {
    console.log('successfully updated repository', repo.name);

    // sUR returns a list of update results per update, so flatten it 
    const results = [].concat(...ret);
    if (results.length === 0) {
      console.log('no updates were applied, will not notify');
      return Promise.resolve();
    } else {
      return Promise.all(results.map(result => {
        if (!result) {
          // result will be null/undefined if no mutation plugin was found
          return Promise.resolve();
        }

        console.log('publishing notification for result:', result);

        const message = createUpdateMessage(result);
        return safeNotify(message, repo);
      }));
    }
  }).catch(err => {
    console.log(`error in softUpdateRepository for ${repo.name}: `, err);

    // notify, then bubble up the error so we return a 500
    return safeNotifyError(`Error updating ${repo.name}: ${err}`)
        .then(() => { throw err; });
  });
}

function handlePing() {
  return Promise.resolve("hello world");
}

function handlePush(req) {
  // this may only be necessary if we want to support direct dependencies on
  // git repos at some point
  // right now we only depend on indirect artifacts e.g. github-pages, builds
  // uploaded to dockerhub, etc
  console.log('handlePush()');
}

function handleStatus(req) {
  const parentRemote = req.body.repository.html_url;
  return functions.getRepositoryByRemote(parentRemote).then(parent => {
    if (req.body.state === 'pending') {
      return Promise.resolve();
    } else if (req.body.state === 'success') {
      const message = createStatusMessage(req.body);

      // notify of the success regardless of branch (will apply to PRs)
      // note that we can't currently link back to PRs, see:
      // https://github.com/monasca/pr-bot/issues/8
      let ret = safeNotify(message, parent);

      const master = req.body.branches.find(b => b.name === 'master');
      if (master) {
        // run an update if the master branch was updated (i.e. only on
        // merges that build successfully)
        ret = ret
          .then(() => functions.getRepositoriesByParent(parent.name))
          .then(repos => Promise.all(repos.map(performSoftUpdate)));
      }

      return ret
          .then(() => 'success')
          .catch(err => {
            const message = `Error handling status for ${parentRemote}: ${err}`;
            return safeNotifyError(message).then(() => 'update failed');
          });
    } else {
      // failure or error... we'll treat both the same
      // no updates to do on our end, just notify about the failure
      const message = createStatusMessage(req.body);
      return safeNotify(message, parent);
    }
  }).catch(err => {
    console.log('could not load repo, may not be tracked:', parentRemote, err);
  });

  // TODO: test this to figure out semantics for the 'branches' object
  // we only care about status updates on master
  // this function should work more or less the same as handlePageBuild
  // (we can treat this as the parent repository and only update children,
  // assuming that no CI/CD processes are making direct automatic commits to
  // master...)
  // this event should work for artifacts published from existing CI/CD infra
  // like travis ci (docker hub publishing from monasca-docker)
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
      .then(repos => Promise.all(repos.map(performSoftUpdate)))
      .then(() => 'success')
      .catch(err => {
        const message = `Error handling page_build for ${parentRemote}: ${err}`;
        return safeNotifyError(message).then(() => 'update failed');
      });
}

function handlePullRequest(req) {
  // TODO: maybe self-close PRs if another user posts a PR that manually
  // updates?
  console.log('handlePullRequest()');
}

function handlePullRequestReview(req) {
  console.log('handlePullRequestReview()');
}

function handlePullRequestReviewComment(req) {
  console.log('handlePullRequestReviewComment()');
}

const handlers = {
  'ping': handlePing,
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

# pr-bot

An automatic version checker bot.

Tired of manually updating dependency for your Docker containers, Helm charts,
and Landscaper configurations?

The PR bot consumes modules from various types of artifact repositories (helm,
docker, and git), determines dependencies between components in each, and
automatically carries version changes down the dependency tree. It files pull
requests to the relevant GitHub repositories on your behalf and notifies you if
and when your CI workflow validates the changes.

Configuration
-------------

Copy `config.yml.dist` to `config.yml` and tweak as needed.

### Token Setup

#### API Tokens

The PR bot's API uses tokens for authentication. To generate a token, the
following can be used:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The resulting string can be added to the `tokens` list in `config.yml`.

#### GitHub

A new GitHub account should be created for machine use. The PR bot will use the
account to host forks of your Git repositories and create pull requests to
target repositories.

Create a new [personal access token][1] with the full `repo` permission. Then,
add an entry to `config.yml`:

```yaml
github:
  - domain: github.com
    host: api.github.com
    token: <NEW TOKEN HERE>
```

The `domain` should match the domain used in git remotes, while `host` refers to
the GitHub API host itself. A `pathPrefix` field can be optionally specified if
the GitHub API is not on the root domain, as may be the case for GitHub
Enterprise. If necessary, a `proxy` field can also be set to direct requests to
that particular GitHub instance over some HTTP proxy.

#### HipChat

HipChat rooms can optionally be added to deliver notifications when various
events occur. These are configured in the `hipchat:` list in `config.yml`.

Each entry should be a URL for a custom [HipChat integration][2]. These URLs
should end in `/notification?access_token=xyz`. If no additional options are
needed, a plain string for the URL can be specified, but a block like the
following is also allowed:

```yaml
url: https://my-hipchat-domain.com/v2/rooms/1234/notification?access_token=asdf
proxy: http://some-proxy:8080/
default: true
```

If `default` is `true`, additional messages may be delivered to the room
regarding various operational events for the PR bot itself. Otherwise,
notifications are only sent when a repository is added with the `room` parameter
set (where a valid room ID would be `1234` from the above example).

There is no explicit limit to the number of HipChat URLs or blocks that can be
added, though only the first block with `default: true` will be have operational
notifications delivered.

Deployment
----------

### Google Cloud Functions Emulator

The [GCF emulator][3] can be used to help in local testing. The 
[datastore emulator][4] can also be used to test against a "real" database
rather than the YAML-backed storage.

First, start the datastore emulator:
```
gcloud beta emulators datastore start --no-legacy --host-port 127.0.0.1:8080
```

Then, start the Cloud Functions emulator:
```
$(gcloud beta emulators datastore env-init)
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy
./node_modules/.bin/functions start
```

Note that any proxies set in the current environment should be unset as the
datastore library doesn't always honor `$NO_PROXY` properly and may be unable
to connect to the local emulator. Proxies for resources that actually require
them can be set for each component in `config.yml`.

Lastly, deploy the function:
```
./node_modules/.bin/functions deploy bot --trigger-http
```

The last step can be repeated as desired to make changes to the running code or
config file.

Google Cloud Functions Setup
----------------------------

Due to limitations with GCF and securely handling webhooks, 2 copies of the
function should be deployed.

The first copy can be deployed using a normal name. This endpoint will be used
to handle user requests to the REST API. It can be deployed by running:

```
gcloud beta functions deploy bot \
    --stage-bucket my-bot-bucket \
    --trigger-http \
    --memory 2048MB
```

The second copy should be deployed using a randomized name and with webhooks
enabled. Generate a random identifier and change the function name in
`index.js`:

```
id=$(< /dev/urandom tr -cd "a-zA-Z0-9" | head -c 32; echo)
echo $id
sed -i "s/webhook_asdf1234/webhook_${id}/g" index.js
```

Then deploy the function using the randomized webhook name:

```
gcloud beta functions deploy webhook_${id} \
    --stage-bucket my-pr-bot-webhook-bucket \
    --trigger-http \
    --memory 2048MB
```

The resulting webhook endpoint can be set in GitHub. The secret field can be set
if desired, but is not currently validated due to limitations in GCF. The
randomized webhook name should be kept secret and should only be used for GitHub
webhooks.

### Management

Once deployed, two endpoints should be available: `/bot` and `/webhook_...`.

#### Configure GitHub

First, add the `/webhook_*` endpoint as a webhook to all GitHub repositories of
interest and enable the following events: `push`, `page_build`, `status`,
`pull_request`, `pull_request_review`, `pull_request_review_comment`. If
everything is working, GitHub's initial `ping` event should return successfully
(and should show a "hello world" response if inspected).

#### Configure repositories via the API

API examples use [HTTPie][5], this is the recommended method for working with
the pr-bot API. The API is published at `/bot`. Once the function is deployed to
either the emulator or a public GCF endpoint, the URL will be printed. 

Due to limitations in GCF, all actions are handled via JSON blobs to in an HTTP
POST. This plays well with HTTPie but is probably less than ideal for other
clients (e.g. plain cURL).

Verify the API is working correctly by running:

```bash
http post http://localhost:8010/monasca-ci-testing/us-central1/bot \
    token=deadbeef \
    action=listRepositories
```
(be sure to change your endpoint and token as necessary).

If all is well, an empty JSON array should be returned. If deploying on public
GCF, you may get an error about the datastore not being initialized for the
current project. Follow the URL in the error message to resolve the issue (it
will try to ask you to create an entity, but the window can be closed at this
step - the datastore will already be initialized).

#### Add a Helm repository

The pr-bot needs to track the source repository as well as the 'downstream'
repository containing published artifacts.


```bash
http post http://localhost:8010/monasca-ci-testing/us-central1/bot \
    token=deadbeef \
    action=addRepository \
    type=git \
    name=my-helm-repo-git
    remote=https://github.com/my-org/my-helm-repo/
```

Then add the repository containing published helm charts:
```bash
http post http://localhost:8010/monasca-ci-testing/us-central1/bot \
    token=deadbeef \
    action=addRepository \
    type=helm \
    name=my-helm-repo
    parent=my-helm-repo-git \
    remote=https://myorg.github.io/my-helm-repo/
```

Note that repository remotes are (somewhat) lenient. For `helm`-typed
repositories, `/index.yaml` is optional and will be added automatically as
needed. Reverse lookups via remote should behave properly for all reasonable
forms of a remote.

(If HipChat rooms are configured, notifications can be enabled by setting
`room=[room number]` in each of the above `POST`s)

Note that Helm support has some limitations:
 * The `type=helm` repository must have `parent=` set to the correct `git`
   repository
 * Updates are triggered on a `page_build` event from GitHub in the parent
   repository. In other words, this assumes your Helm repository is being
   published via GitHub Pages. Generic CI should be supported "soon", as long as
   GitHub status events are published.
 * Module names in the child must match those in the parent. That is,
   subdirectory names in your Helm charts' git repository must match chart names
   published in your Helm repository.
 * Use of public / large repositories is not currently recommended. Support cor
   repository subsetting is necessary for this to work well. In other words,
   don't add any of the official Google Helm repositories!
 
#### Verify

The state of the pr-bot can be inspected using `action=listRepositories` or
`action=getRepository name=[repository name]`. All added repositories and
detected modules should be shown.


[1]: https://help.github.com/articles/creating-a-personal-access-token-for-the-command-line/
[2]: https://blog.hipchat.com/2015/02/11/build-your-own-integration-with-hipchat/
[3]: https://cloud.google.com/functions/docs/emulator
[4]: https://cloud.google.com/datastore/docs/tools/datastore-emulator
[5]: https://httpie.org/

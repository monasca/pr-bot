# pr-bot

An automatic version checker bot.

Tired of manually updating dependency for your Docker containers, Helm charts,
and Landscaper configurations?

The PR bot consumes modules from various types of artifact repositories (helm,
docker, and git), determines dependencies between components in each, and
automatically carries version changes down the dependency tree. It files pull
requests to the relevant GitHub repositories on your behalf and notifies you if
and when your CI workflow validates the changes.

Supported Repository and Module Types
-------------------------------------

The pr-bot reads module information for Docker and Helm artifacts, both in
source and binary (packaged) forms. Automatic updates are supported according to
this table:

<table>
  <tbody>
    <tr>
      <th></th>
      <th></th>
      <th colspan="3" align="center">Destination</th>
    </tr>
    <tr>
      <th></th>
      <th>Type</th>
      <th>Docker</th>
      <th>Helm</th>
      <th>Landscaper</th>
    </tr>
    <tr>
      <th rowspan="3">Source</th>
      <th>Docker</th>
      <td><i>soon</i></td>
      <td>yes, <code>values.yaml</code></td>
      <td>n/a</td>
    </tr>
    <tr>
      <th>Helm</th>
      <td>n/a</td>
      <td>yes, <code>requirements.yaml</code></td>
      <td><i>soon</i></td>
    </tr>
    <tr>
      <th>Landscaper</th>
      <td>n/a</td>
      <td>n/a</td>
      <td>n/a</td>
    </tr>
  </tbody>
</table>

(support for additional module types coming soon, including Landscaper)

The pr-bot aims to support development workflows resembling the following:
 1. Source for a Docker container `foo` is updated and pushed to GitHub
 2. CI/CD process pushes new container to Docker Hub, updates commit status in
    GitHub
 3. Helm chart `bar` depends on container `foo`, and should be updated to the
    latest version. A pull request that updates the required version is filed.
 4. A new version of Helm chart `bar` is released
 5. Helm chart `baz` depends on the other chart `bar` and should be updated to
    use the new version. A pull request is made to apply the update.
 6. A Landscaper configuration depends on `baz` and should be updated to include
    the new version. A pull request is made to apply the update.

The pr-bot automates steps #3, #5, and #6. Ideally human interaction after step
\#1 should be limited to approving pull requests once CI/CD passes.

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
    secret: <SHARED SECRET> # optional
```

The `domain` should match the domain used in git remotes, while `host` refers to
the GitHub API host itself. A `pathPrefix` field can be optionally specified if
the GitHub API is not on the root domain, as may be the case for GitHub
Enterprise. If necessary, a `proxy` field can also be set to direct requests to
that particular GitHub instance over some HTTP proxy.

If using the webhook handler, a `secret` value can be generated using the above
instructions for generating a random token. This value should be provided in the
"Secret" field when creating the webhook in GitHub's UI. Note that secrets are
currently verified only when using Docker deployments; an alternative
authentication method is used when deploying to Google Cloud Functions.

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

See the documentation for each deployment method:
 * [Google Cloud Functions][3] - for public cloud deployments
   * Designed to fit in free tier
 * [Docker][4] - for public cloud or on-premise deployments
   * Must be accessible to GitHub webhooks (public GitHub = public internet)

For Docker deployments, the (combined) endpoint is `http://localhost:3000`. For
Google Cloud Functions deployments, there are two endpoints: `/bot` for the REST
API and `/webhook_...` for handling GitHub webhooks; the full addresses will be
printed to the console during deployment.

### Configure repositories via the API

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

### Add a Helm repository

The pr-bot needs to track the source repository as well as the 'downstream'
repository containing published artifacts.

First add the source repository:
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
 
### Verify

The state of the pr-bot can be inspected using `action=listRepositories` or
`action=getRepository name=[repository name]`. All added repositories and
detected modules should be shown.

Other API Actions
-----------------

Note that the following all point to the REST endpoint. For 

### List repositories (`listRepositories`)

Lists all added repositories and their modules. Example:

Parameters: none

```
http post http://endpoint/ token=... action=listRepositories
```

### Get repository (`getRepository`)

List metadata and modules for a particular repository.

Parameters:
 * `name`: the repository name

### Get repository by remote (`getRepositoryByRemote`)

Like `getRepository`, but fetches based on the `remote` rather than the `name`.
Remote lookups use fuzzy comparison

### List dependents (`listDependents`)

List detected dependent modules for some module. In other words, "if I update
this module, what pull requests will be made?"

### Add repository (`addRepository`)

Parameters:
 * `name`
 * `type`: the named repository type
   * one of: `git`, `helm`, `dockerhub`
 * `remote`
 * `parent`: the name of the parent repository (optional)
   * note: required for most webhook handlers for binary push events
 * `room`: the HipChat room number to notify for updates (optional)

### Remove repository (`removeRepository`)

### Update repository (`softUpdateRepository`)

[1]: https://help.github.com/articles/creating-a-personal-access-token-for-the-command-line/
[2]: https://blog.hipchat.com/2015/02/11/build-your-own-integration-with-hipchat/
[3]: https://github.com/monasca/pr-bot/blob/master/docs/cloud-functions.md
[4]: https://github.com/monasca/pr-bot/blob/master/docs/docker.md
[5]: https://httpie.org/

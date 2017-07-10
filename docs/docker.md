Deploying in Docker
===================

The pr-bot can be deployed using Docker. This is ideal for on-premise
deployments that might work with a local GitHub Enterprise instance.

Quickstart
----------

```
docker run --name pr-bot \
  -v /etc/pr-bot.yaml:/bot/config.yml \
  -v /var/lib/pr-bot:/bot/nedb \
  -p 3000:3000 \
  monasca/pr-bot:latest
```

This assumes:
 * `/var/lib/pr-bot` exists and is empty (will be used for the bot's database)
 * `/etc/pr-bot.yml` contains a valid configuration (see below for
   recommendations)

Once the container starts, the API will be available on port 3000 and can be
administered using the configured tokens. Unlike Cloud Functions deployments,
both webhooks and the REST API are served from the same endpoint,
`http://host:3000`.

Recommended Configuration
-------------------------

NeDB should be used with a data directory on some persistent storage. Use the
following config snippet:

```
datastore:
  type: nedb
  config:
    dir: /bot/nedb
```

Other than the datastore, the configuration can be specified according to the
inline documentation from `config.yml.dist`.

Note that the standalone bot *does* verify signatures from GitHub hooks! The
`secret` field for `github:` config entries should be set to a random value
and copied exactly to the "Secret" field in the GitHub webhook settings.

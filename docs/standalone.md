# Standalone Server

The standalone server is the preferred method for local development and
testing. For standalone deployment, [Docker][1] is recommended versus manually
following the below instructions.

## Recommended Configuration

In `config.yml`:
```
queue:
  type: memory

datastore:
  type: nedb
  config:
    dir: /path/to/a/data/directory
```

Note that the usual other config entries (`github`, `git`, `tokens`, etc) are
still required in addition to the above.

## Building

Run the following:
```
yarn
```

## Running

```
node build/server.js
```

The server will start on port `3000`. The REST-ish interface and webhook
handlers are both exposed on the same `/` endpoint and will automatically 
do The Right Thing (tm) based on the `X-GitHub-Event` header and provided
token/signature.

[1]: ./docker.md

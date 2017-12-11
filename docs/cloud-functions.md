# Google Cloud Functions Deployment


## Emulator

> **Note:** the GCF emulator should only be used for testing GCF specifically!
> The [standalone server][1] is much simpler to run for most dev and standalone
> use.

The [GCF emulator][2] can be used to help in local testing. The 
[datastore emulator][3] can also be used to test against a "real" database
rather than the YAML-backed storage.

First, start the datastore emulator:
```
gcloud beta emulators datastore start --no-legacy --host-port 127.0.0.1:8080
```

Next, start the Google Cloud PubSub emulator: 
```
gcloud beta emulators pubsub start
```

Next, build the local sources:
```
yarn
```

In a dedicated shell, run the PubSub worker:
```
$(gcloud beta emulators datastore env-init)
$(gcloud beta emulators pubsub env-init)
node ./build/pubsub-emulator.js
```

It should connect to the PubSub emulator and start handling async tasks as they
come in, including repository updates, notifications, etc.


Next, in a dedicated shell, start the Cloud Functions emulator:
```
$(gcloud beta emulators datastore env-init)
$(gcloud beta emulators pubsub env-init)
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy
./node_modules/.bin/functions start
```

Note that any proxies set in the current environment should be unset as the
datastore library doesn't always honor `$NO_PROXY` properly and may be unable
to connect to the local emulator. Proxies for resources that actually require
them can be set for each component in `config.yml`.


Lastly, deploy the function:
```
yarn run functions deploy bot --trigger-http
```

(note that since functions are run in the emulator's environment, environment
variables for the emulator )

The last step can be repeated as desired to make changes to the running code or
config file.

## Google Cloud Functions Setup

The bot can be deployed using the `gcloud` tool:

```
yarn
cd build
gcloud beta functions deploy bot \
    --stage-bucket my-bot-bucket \
    --trigger-http \
    --memory 2048MB
```

The resulting webhook endpoint can be set in GitHub. The secret field **must**
be set or all webhooks will fail with a `401 Access Denied` error.

### Management

Once deployed, one endpoint should be available for the project: `/bot`

#### Configure GitHub

First, add the `/bot` endpoint as a webhook to all GitHub repositories of
interest and enable the following events:
 * `push`
 * `page_build`
 * `status`
 * `pull_request`
 * `pull_request_review`
 * `pull_request_review_comment`.
 
If everything is working, GitHub's initial `ping` event should return
successfully (and should show a "hello world" response if inspected).

[1]: ./standalone.md
[2]: https://cloud.google.com/functions/docs/emulator
[3]: https://cloud.google.com/datastore/docs/tools/datastore-emulator
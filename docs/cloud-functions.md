Google Cloud Functions Deployment
=================================

Emulator
--------

The [GCF emulator][1] can be used to help in local testing. The 
[datastore emulator][2] can also be used to test against a "real" database
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

[1]: https://cloud.google.com/functions/docs/emulator
[2]: https://cloud.google.com/datastore/docs/tools/datastore-emulator
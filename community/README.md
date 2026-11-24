# NOVA Community

Run `npm run community` with Node.js 24. The HTTP service starts on `127.0.0.1:8787` and stores votes in `community.sqlite`. Set `NOVA_COMMUNITY_DB` to a path on a persistent volume in production. `NOVA_COMMUNITY_HOST` and `PORT` configure the listener.

Point a test copy of NOVA to `NOVA_COMMUNITY_URL=http://127.0.0.1:8787`. To deploy the service on a host with Docker and a persistent volume:

```sh
docker build -t nova-community community
docker run -d --name nova-community --restart unless-stopped \
  -p 127.0.0.1:8787:8787 -v nova-community-data:/data nova-community
```

Put an HTTPS reverse proxy in front of the service and verify that `GET /v1/top` returns `{"ratings":[]}` on a fresh database. Publish the HTTPS origin in [endpoint.json](endpoint.json). NOVA checks this file on GitHub at startup, periodically while waiting for an endpoint, and when connectivity returns. It remembers the configured origin so an installation can still withdraw its votes if the GitHub file is temporarily unreachable. Keep the production origin stable.

GitHub stores the code and the public endpoint descriptor. The HTTP server and its database run on the deployment host.

- The app starts with sharing off. After explicit consent it syncs title IDs, scores from 1 to 10, and a random installation credential. The SQLite database stores the credential hash. Public responses return aggregate scores and counts for titles with at least three votes.
- Disabling sharing queues the removal of the installation's published votes. The app retries after a connection loss and keeps the user's scores on the device. The server retains the credential hash and last revision so a delayed upload can't restore withdrawn votes.
- A public deployment should use a reverse proxy with TLS and request-rate limits. The service counts one vote per title and installation. Back up the SQLite file using an SQLite-aware backup.

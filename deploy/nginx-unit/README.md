# NGINX Unit deployment

The current application is deployed as a Cloudflare Worker, so NGINX Unit must proxy to the Worker origin. It cannot run `.output/server/index.mjs` directly because the build uses the Cloudflare runtime (`cloudflare-module`).

The ready-to-apply Unit configuration is in `config.json`.

## Apply on the remote Linux server

Replace `DEPLOY_USER` and `REMOTE_SERVER` with the SSH user and hostname/IP of the server running NGINX Unit. Run these commands from the repository root in PowerShell:

```powershell
scp ".\deploy\nginx-unit\config.json" "DEPLOY_USER@REMOTE_SERVER:/tmp/tody-unit-config.json"

ssh "DEPLOY_USER@REMOTE_SERVER" "sudo sh -c 'curl --fail --silent --show-error -X GET --unix-socket /var/run/control.unit.sock http://localhost/config > /var/backups/unit-config-before-tody.json && curl --fail --silent --show-error -X PUT --data-binary @/tmp/tody-unit-config.json --unix-socket /var/run/control.unit.sock http://localhost/config && rm -f /tmp/tody-unit-config.json'"

ssh "DEPLOY_USER@REMOTE_SERVER" "curl --fail --silent --show-error --unix-socket /var/run/control.unit.sock http://localhost/config"
```

The first SSH command creates a backup, applies the configuration, and removes the temporary upload. It may ask for the remote sudo password. Replace `/var/run/control.unit.sock` if the remote installation uses a different Unit control socket.

For a Docker installation on the remote server, upload the file and apply it inside the Unit container instead:

```powershell
scp ".\deploy\nginx-unit\config.json" "DEPLOY_USER@REMOTE_SERVER:/tmp/tody-unit-config.json"

ssh "DEPLOY_USER@REMOTE_SERVER" "docker cp /tmp/tody-unit-config.json unit:/tmp/tody-unit-config.json && docker exec unit curl --fail --silent --show-error -X PUT --data-binary @/tmp/tody-unit-config.json --unix-socket /var/run/control.unit.sock http://localhost/config && rm -f /tmp/tody-unit-config.json"
```

Replace `unit` with the actual container name from `docker ps --format '{{.Names}}'`.

The config proxies:

- `/assets/*` and static file extensions to `https://tody-game-hub.bbailiaskk.workers.dev`
- all other requests to the same Worker origin
- static files with a one-week immutable browser cache policy

## HTTPS

The supplied config listens on HTTP so it can be tested without certificate values. For production, add a Unit HTTPS listener after installing a certificate for `files.aquamiral.org`:

```json
{
  "listeners": {
    "*:443": {
      "pass": "routes/site",
      "tls": {
        "certificate": "files.aquamiral.org"
      }
    }
  }
}
```

The certificate must first exist in Unit's certificate store. Do not expose the Unit control socket publicly.

## Important limitation

There is no NGINX Unit control socket on the current development machine, and port `8080` is occupied by Vite development mode. Therefore the configuration cannot be applied automatically from this workspace. Run the command above on the server where Unit is installed, then point DNS for `files.aquamiral.org` to that server.

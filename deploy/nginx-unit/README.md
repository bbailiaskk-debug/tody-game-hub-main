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

The config proxies all requests to `https://tody-game-hub.bbailiaskk.workers.dev` with:

- **`/sw.js`** — `Cache-Control: no-store, must-revalidate`. It gets its own rule and must stay above everything else. The worker is what purges stale precached pages on each deploy, so a browser that keeps a copy of `/sw.js` never receives that purge and keeps serving an old document — and the moment its stylesheet is gone, the site renders with only its inline critical sheet.
- **Hashed bundles** (`/assets/*.css`, `/assets/*.js`) — `Cache-Control: max-age=2592000, immutable` (30 days, safe because Vite content-hashes filenames). Matched by the `/assets/` prefix, **not** by extension: `*.css` / `*.js` also matches `/sw.js` and any unhashed file served from the root, and an `immutable` year on those freezes whichever build first fetched them.
- **Images & fonts** — `Cache-Control: max-age=604800, immutable` (1 week)
- **Source maps** (`.map`) — `Cache-Control: max-age=0, must-revalidate` (never cached)
- **HTML & other routes** — security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`), no explicit cache (browser default)

The `Cache-Control` values here are written over whatever the Worker origin sent. The origin already gets these right — `public/_headers` marks `/sw.js` `no-store` and HTML `no-cache, no-store` — so any rule added to this file has to agree with it, and a rule that does not is silently the one the browser obeys.

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

## Performance tips

- **Enable gzip/brotli on Cloudflare** — since the Worker origin is on Cloudflare, enable "Auto Minify" and Brotli compression in the Cloudflare dashboard (Speed > Optimization > Content Optimization). NGINX Unit itself does not compress proxied responses.
- **Cloudflare Cache Level** — set to "Standard" or "Aggressive" in the dashboard (Caching > Configuration) so Cloudflare caches HTML at the edge too.
- **Unit HTTP/2** — if using Unit 1.31+, enable HTTP/2 on the listener for multiplexed connections:

```json
"listeners": {
  "*:443": {
    "pass": "routes/site",
    "tls": { "certificate": "files.aquamiral.org" },
    "http2": true
  }
}
```

## Important limitation

There is no NGINX Unit control socket on the current development machine, and port `8080` is occupied by Vite development mode. Therefore the configuration cannot be applied automatically from this workspace. Run the command above on the server where Unit is installed, then point DNS for `files.aquamiral.org` to that server.

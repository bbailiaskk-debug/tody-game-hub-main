# Deploy tody-game-hub on a Linux VPS behind NGINX Unit

The project is a TanStack Start / Nitro app. It ships in two flavours:

- **Cloudflare Workers** (`npm run build`, `preset: cloudflare-module`) — the
  production default used by the Lovable pipeline. Online multiplayer
  (chess / tic-tac-toe) relies on Cloudflare **Durable Objects** — this works
  ONLY on the Workers runtime.
- **Node server** (`NITRO_PRESET=node-server npm run build`) — a standard Node
  HTTP server (`.output/server/index.mjs`) for running behind NGINX Unit.

> ⚠️ **Important limitations on Node / NGINX Unit**
> 1. **Online multiplayer (chess, tic-tac-toe) will not work.** Its server
>    functions use Cloudflare Durable Objects (CHESS_GAME_DO, TTT_GAME_DO),
>    which do not exist outside Workers. Single-player/local games, AI chat,
>    music, profiles and SSR all work fine (auth and AI gracefully fall back
>    to in-memory storage — data is NOT persisted across restarts without KV).
> 2. **NGINX Unit is archived** (as of Oct 2025, project is unmaintained).
>    The config below still works on installed packages, but if you are
>    starting fresh you should prefer **plain NGINX** or **Caddy** — the same
>    layout applies (static files + `proxy_pass http://127.0.0.1:3000`).

---

## How it works

- `unit-tody-game-hub.service` (systemd) runs the Node SSR app:
  `node --import ./deploy/register-cloudflare-loader.mjs .output/server/index.mjs`
  listening on `127.0.0.1:3000`.
- The `cloudflare:workers` ESM loader shim maps `env` → `process.env`, so the
  5 server modules that `import { env } from "cloudflare:workers"` load cleanly
  on Node.
- NGINX Unit listens on `:80` / `:443`, serves immutable assets (`/assets/*`,
  images, video, fonts) straight from `.output/public`, and proxies everything
  else to the Node app.

## Prerequisites (on the VPS, Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y nodejs npm rsync curl nginx  # nodejs >= 20 required
```

> Replace `nginx` above with the NGINX **Unit** package if you really want Unit;
> Unit is normally installed via its own repo: https://unit.nginx.org/installation/#ubuntu

```bash
sudo systemctl enable --now unit
```

## Deploy (from the repo root)

```bash
# 1. Build node-server output, rsync to VPS, install systemd unit
bash deploy/unit/deploy.sh deploy 203.0.113.5

# 2. On the VPS: start the app
sudo systemctl daemon-reload
sudo systemctl enable --now unit-tody-game-hub
sudo systemctl status unit-tody-game-hub   # check it's active
curl -s http://127.0.0.1:3000/ -o /dev/null -w "%{http_code}\n"   # expect 3xx/200
```

## Load the Unit listener / routes

```bash
sudo curl -X PUT --data-binary @/srv/tody-game-hub/deploy/unit/unit-config.json \
  --unix-socket /run/control.unit.sock http://localhost/config
```

Verify:

```bash
curl -s http://SERVER_IP/ -o /dev/null -w "%{http_code}\n"     # expect 200
curl -s http://SERVER_IP/assets/...your.json -o /dev/null -w "%{http_code}\n"
```

## TLS

1. Add your certificate bundle to Unit (it must include the key):

```bash
sudo unitc 'certificates/tody-game-hub' <<'JSON'
{"certificate": "PRIVATE_KEY_B64", "private_key": "CERT_B64", "intermediates": []}
JSON
```

2. The shipped `unit-config.json` already has an `*:443` listener with
   `"certificate": "tody-game-hub"`. If you use certbot for certs, run:
   `sudo apt install -y certbot && sudo certbot certonly --standalone -d your.domain`
   then base64-encode the chain+key and `PUT` them as above.

3. Restart Unit: `sudo systemctl restart unit`.

Behind the scenes there are **two** cooperating HTTPS layers:

- **Unit terminates TLS** on `:443` and the shipped `unit-config.json` 301-redirects
  every plain-HTTP (`scheme: http`) request on `:80` to `https://$host$request_uri`
  — so no plain-http traffic ever reaches the app.
- **Unit does NOT inject `x-forwarded-proto` when proxying** (verified against Unit
  source: the proxy path forwards the client's original headers unchanged). The
  systemd unit therefore sets `HTTPS_REDIRECT=off`, which tells `redirectToHttps`
  (src/server.ts) to never redirect on its own — otherwise it would see the internal
  `http://127.0.0.1:3000` URL and loop (301→301→…). On Cloudflare Workers the env
  var is absent, so the app still does its own upgrade-to-https there.

## Troubleshooting

- Node app crashes with `ERR_UNSUPPORTED_ESM_URL_SCHEME`?
  → Make sure the app is started **with** the loader:
  `--import ./deploy/register-cloudflare-loader.mjs`.
- `502` from Unit → the Node app is down:
  `sudo journalctl -u unit-tody-game-hub -e`.
- Static files 404 → check `share` root is
  `/srv/tody-game-hub/.output/public/`.
- Multiplayer buttons do nothing / error → expected on Node (see limitations).
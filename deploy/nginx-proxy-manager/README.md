# Nginx Proxy Manager deployment

This site is deployed as a Cloudflare Worker. Configure Nginx Proxy Manager (NPM) as a reverse **HTTP Proxy** in front of the public Worker URL `https://tody-game-hub.bbailiaskk.workers.dev`.

> The site uses **WebSockets** for the realtime games — online air hockey, chess, and tic-tac-toe connect over `/api/ws/*`. WebSocket upgrade forwarding is required, not optional.

## 1. Proxy Host

Create a new **Proxy Host** with these values:

- **Domain Names:** your public domain, for example `gaming.example.com`
- **Scheme:** `https`
- **Forward Hostname / IP:** `tody-game-hub.bbailiaskk.workers.dev`
- **Forward Port:** `443`
- **Cache Assets:** enabled
- **Block Common Exploits:** enabled
- **Websockets Support:** enabled (REQUIRED — the online games use WebSockets; without it the game screens fail to connect)
- In the **SSL** tab: request a Let's Encrypt certificate for the public domain, and enable **Force SSL** and **HTTP/2 Support** after DNS points to the NPM server. Enable **HSTS** as well.

## 2. Advanced configuration

Paste the contents of [`proxy-host.conf`](./proxy-host.conf) into the Proxy Host **Advanced** field. It:

- Pins TLS/SNI and the `Host` header to the Worker origin
- Forwards `Upgrade`/`Connection` so WebSocket upgrades reach Cloudflare (NPM defines the `$connection_upgrade` map globally — keep those lines; they are only invalid on a raw nginx without that `map`)
- Forwards `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host` — the app reads `x-forwarded-proto` to detect https, so missing it causes an http→https redirect loop
- Sets timeouts tuned for the realtime connection (clients ping every 15 s)
- Adds security headers

Do **not** add custom `location`/cache rules for `/assets/*`: the Cloudflare Worker already serves hashed assets as `Cache-Control: public, max-age=2592000, immutable` (`.output/public/_headers`) and HTML as `no-cache`. Extra NPM-level caching adds no benefit and is a common source of stale/broken pages.

## 3. DNS

Create an `A` or `AAAA` record for the chosen public domain pointing to the server running Nginx Proxy Manager. Ports `80` and `443` must be forwarded to NPM. Do not expose the NPM admin port `81` publicly.

The current origin remains:

`https://tody-game-hub.bbailiaskk.workers.dev`

## Verify it did not break

- Open the main page and one online game (air hockey) through the proxy — the match should connect and run.
- If the game stays on "connecting": enable **Websockets Support** (or confirm the Advanced block's `Upgrade`/`Connection` headers are present) and reload.
- If the page redirects in a loop: confirm `proxy_set_header X-Forwarded-Proto $scheme;` is in the Advanced block.
# Nginx Proxy Manager deployment

This site is deployed as a Cloudflare Worker. Configure Nginx Proxy Manager as a reverse proxy in front of the public Worker URL.

## Proxy Host

Create a new **Proxy Host** with these values:

- **Domain Names:** your public domain, for example `gaming.example.com`
- **Scheme:** `https`
- **Forward Hostname / IP:** `tody-game-hub.bbailiaskk.workers.dev`
- **Forward Port:** `443`
- **Cache Assets:** enabled
- **Block Common Exploits:** enabled
- **Websockets Support:** enabled

Request a Let's Encrypt certificate for the public domain and enable **Force SSL**, **HTTP/2 Support**, and **HSTS** after DNS points to the Nginx Proxy Manager server.

## Advanced configuration

Paste this into the Proxy Host **Advanced** field:

```nginx
proxy_ssl_server_name on;
proxy_ssl_name tody-game-hub.bbailiaskk.workers.dev;
proxy_http_version 1.1;
proxy_set_header Host tody-game-hub.bbailiaskk.workers.dev;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;
proxy_buffering on;
proxy_buffers 16 16k;
proxy_buffer_size 16k;
proxy_connect_timeout 10s;
proxy_send_timeout 60s;
proxy_read_timeout 60s;

location ~* \.(?:css|js|mjs|map|ico|png|jpg|jpeg|webp|avif|svg|woff2?|ttf|otf)$ {
    proxy_pass https://tody-game-hub.bbailiaskk.workers.dev;
    proxy_ssl_server_name on;
    proxy_ssl_name tody-game-hub.bbailiaskk.workers.dev;
    proxy_set_header Host tody-game-hub.bbailiaskk.workers.dev;
    proxy_cache_valid 200 7d;
    add_header Cache-Control "public, max-age=604800, immutable" always;
}
```

If Nginx reports `unknown "connection_upgrade" variable`, remove the `Upgrade` and `Connection` lines. The site does not currently require WebSockets, but those headers keep the proxy compatible with future realtime features.

## DNS

Create an `A` or `AAAA` record for the chosen public domain pointing to the server running Nginx Proxy Manager. Ports `80` and `443` must be forwarded to NPM. Do not expose the NPM admin port `81` publicly.

The current origin remains:

`https://tody-game-hub.bbailiaskk.workers.dev`

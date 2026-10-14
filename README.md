# Todor's Gaming Hub

Направи ми същия сайт като на снимките, които качих – модерен гейминг уебсайт за "Todor Khristov " с тъмен дизайн, зелени акценти, секция за игри и информация за YouTube канала ми.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://tody-game-hub.bbailiaskk.workers.dev

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/59aa9126-2ddc-4a06-9b72-980379a117b0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

The workspace disables Compile Hero's compile-on-save for this Vite-managed
project. Run `npm run typecheck` for a TypeScript check; `npm run build` runs that
check automatically before producing the Cloudflare build.

## Profiling

`npm run profile` drives the built site through a real Chrome, records a V8 sampling profile of each page load, and writes `profiles/<route>.cpuprofile`. Those files are what the [JavaScript Profiler Flame Chart](https://marketplace.visualstudio.com/items?itemName=ms-vscode.vscode-js-profile-flame) extension opens — drag one in and the widest band is the thing that is costing the page its time.

It prints the self-time ranking and the transfer log alongside the files, because a flame chart is a picture and a picture does not say what to change.

The server has to be up first, and it must be the built one: dev mode serves unminified modules and splits nothing, so it answers a different question than the one being asked.

```sh
npm run build
npx wrangler dev --var HTTPS_REDIRECT:off
npm run profile                        # /, /games, /music, /info
npm run profile http://127.0.0.1:8787 /rules /tutorial
```

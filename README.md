# Todor's Gaming Hub

Яки игри и забавление — игри, моменти и енергия от Todor Khristov Gaming.

**Live app (старата, Workers сборка):** https://tody-game-hub.bbailiaskk.workers.dev

> Тази копия е пренесена от **TanStack Start + Vite** на **Next.js 16 (App Router)**.
> Виж [Какво е пренесено](#какво-е-пренесено) по-долу — част от стария бекенд
> няма Next.js еквивалент и не е пренесен.

## Development

Нужни са Node.js и npm.

```bash
npm install
npm run dev        # http://localhost:3000
```

| Команда | Какво прави |
|---|---|
| `npm run dev` | Dev сървър |
| `npm run build` | Production build |
| `npm start` | Сервира build-а |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest |

## Стек

- **Next.js 16** (App Router, Turbopack) · React 19 · TypeScript
- **Tailwind CSS v4** — конфигурацията е CSS-first, в `app/globals.css`
- Radix UI (shadcn/ui), lucide-react
- Vitest

## Структура

```
app/          App Router — по една папка на маршрут
  <route>/page.tsx          server компонент, притежава `metadata`
  <route>/<route>-client.tsx  клиентският компонент, който рендира
  api/[...path]/route.ts    единственият вход за всички server функции
components/   site/ (header, sidebar, theme), ui/ (shadcn), messages/
lib/          business логика, протоколи, multiplayer engines
hooks/        use-mobile
```

Страниците са разделени на server + client, защото Next.js не чете `metadata`
от файл с `"use client"`, а всички тези страници държат state.

## Какво е пренесено

| | |
|---|---|
| **Маршрути** | 27 — пълни, с преведени `metadata` (title, canonical, OG, Twitter) |
| **Игри** | 14 налични (`/chess`, `/tetris`, `/wordle`, …) |
| **Съдържание** | 128 файла byte-identical с предишната версия |
| **Стилове** | Tailwind v4 темата, дизайн токените, всички компоненти |
| **Server функции** | 30 — като Route Handlers през `app/api/[...path]` |
| **Съхранение** | REST KV (Upstash / Vercel KV) или in-memory, през `lib/kv.ts` |

### Какво НЕ е пренесено

**Messages бекендът.** Чат, гласови канали, guild-и и multiplayer-ът за
шах / tic-tac-toe / air hockey вървяха върху **Cloudflare Durable Objects** —
`exports.cloudflare.ts`, 3636 реда, sqlite-backed инстанции с WebSocket
Hibernation API. Това няма Next.js еквивалент и не е пренесено. `/messages`
показва съобщение за грешка вместо да счупи страницата; session handshake-ът
(`GET /api/messages/session`) работи, защото е подписан cookie без DO.

**Desktop и Android.** Electron приложението и TWA билдът не са пренесени.

**Build артефактите от стария pipeline** — lighthouse JSON-и, временни HTML
файлове, запис на екран — са премахнати от кореня.

### Конфигурация

Всичко е незадължително: без нищо конфигурирано `npm run dev` тръгва, а
акаунтите, плановете и чатовете живеят в паметта до рестарт.

| Променлива | За какво е |
|---|---|
| `AUTH_USERS_KV_URL` / `AUTH_USERS_KV_TOKEN` | KV за акаунти, планове, rate limits |
| `GEMINI_CACHE_KV_URL` / `GEMINI_CACHE_KV_TOKEN` | KV кеш за `/ai` |
| `GEMINI_API_KEY` | Google Gemini за TK-Bot |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Плащания |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Вход с Google |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google вход от браузъра |

## Тестове

`npm test` — 632 от 640 минават. Един тест (`lib/image-utils.test.ts`) пада
поради несъвместимост между jsdom и Node версията; кодът под него е
byte-identical с предишната версия.

Тестовете, които покриваха Durable Objects и Workers entry point-а, са
премахнати — тестваха код, който вече не съществува тук.
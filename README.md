# Balderdash Online

A Jackbox-style web version of Balderdash, the word-definition bluffing game. One person hosts
on a laptop or TV, everyone else joins from their phone with a 4-letter code. No accounts.

- **Next.js 15** (App Router, TypeScript strict) on **Vercel**
- **Supabase Postgres** for state (one JSONB row per game) and **Supabase Realtime Broadcast** for updates
- A **pure game engine** (`src/engine`) that owns every rule, tested with Vitest
- **Playwright** e2e that plays a full game with a host and three phone-sized browsers

## Run it locally

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm dev:lan      # same, reachable from phones on your Wi-Fi (next dev -H 0.0.0.0)
```

Without Supabase keys the app runs on an **in-memory store** and the clients poll every 2 seconds.
That is enough to play a full game on one machine and is what the test suite uses. State is lost
when the dev server restarts.

Testing several players on one machine: open each player in a **separate browser profile or an
incognito window**. Session cookies are keyed by game code (`bd_<CODE>`), so two tabs in one
profile share one session.

## Scripts

| Command              | What it does                                              |
| -------------------- | --------------------------------------------------------- |
| `pnpm test`          | Engine, text and API unit tests (Vitest)                  |
| `pnpm test:coverage` | Same with a coverage report; `src/engine` must stay ≥ 95% |
| `pnpm test:e2e`      | Playwright: full game, player refresh, host refresh       |
| `pnpm lint`          | ESLint + Prettier check                                   |
| `pnpm typecheck`     | `tsc --noEmit`                                            |
| `pnpm build`         | Production build                                          |

First time running e2e: `pnpm exec playwright install chromium`.

## Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run `supabase/migrations/0001_init.sql`. It creates the `games` and
   `sessions` tables with row-level security on and **no policies**, so the anon key can't read
   anything. Only the server, using the service-role key, touches the database.
3. In **Project Settings → API** copy three values into `.env.local` (template in `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...        # browser: Realtime subscribe only
SUPABASE_SERVICE_ROLE_KEY=eyJ...            # server only, never ship to the client
CRON_SECRET=some-long-random-string         # protects /api/cron/cleanup
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

4. Restart `pnpm dev`. The connection dot on the host screen now says **Live** instead of
   **Connected**, meaning updates arrive over Realtime Broadcast rather than polling.

Realtime Broadcast doesn't need any table or publication. The server posts each new public
snapshot to `https://<project>.supabase.co/realtime/v1/api/broadcast` on channel `game:<CODE>`;
clients subscribe with the anon key.

## Deploy to Vercel

1. Push this repo to GitHub and import it in Vercel. Framework preset: Next.js. Build command and
   output are the defaults. Install command: `pnpm install`.
2. Add the five environment variables above in **Settings → Environment Variables** (Production and
   Preview). Set `NEXT_PUBLIC_SITE_URL` to your production URL.
3. Deploy. `vercel.json` schedules the cleanup cron daily at 04:00 UTC. Vercel sends
   `Authorization: Bearer $CRON_SECRET` to `/api/cron/cleanup`, which deletes games whose
   `expires_at` has passed. Every successful action extends a game by 24 hours.
4. Play a game from real phones against the production URL. Follow `QA.md`.

Rate limits (`src/server/rateLimit.ts`) are in-memory token buckets, so on Vercel they are
**per lambda instance**: a soft guard against accidents, not a hard wall. They are enforced in
production and whenever `BD_RATE_LIMIT=on`.

## How it works

```
phone / laptop ──POST /api/games/[code]/actions──▶ route handler
                                                   │ 1. resolve cookie → session → actor
                                                   │ 2. load games row
                                                   │ 3. applyAction(state, action, actor)   ← pure engine
                                                   │ 4. UPDATE … WHERE version = old  (retry ×5 on conflict)
                                                   │ 5. broadcast PublicSnapshot on game:<CODE>
                                                   ▼
                                           { snapshot }  ──▶ every subscribed client
```

- The **engine** (`src/engine`) is pure: no I/O, no `Date.now()`, no `Math.random()`. Time and
  randomness are injected, which is what makes the rules testable to the branch.
- **Views** (`src/engine/views.ts`) redact. The public snapshot never contains a definition
  (other than the cards on the table), an author before REVEAL, or a submission before VOTING.
  There are tests asserting this for every phase.
- The **client hook** (`src/hooks/useGame.ts`) applies snapshots only when the version increases,
  refetches private state when the phase changes, heartbeats every 15s while visible, and
  resyncs on reconnect and tab focus.
- **Sessions** are 32 random bytes in an `HttpOnly` cookie; only the SHA-256 is stored.

### Project layout

```
src/
  app/            routes: /, /host/new, /host/[code], /join, /play/[code], /api/**
  engine/         types, actions, engine (applyAction/autoAdvance), scoring, views, normalize
  server/         store (Supabase + memory), sessions, runAction, broadcast, rateLimit, codes
  hooks/          useGame, useHeartbeat, useDraft
  components/     IndexCard, WordHeader, StatusChips, Scoreboard, RevealCards, QrCode, …
  lib/            zod schemas, text hygiene, rng, api client, storage helpers
supabase/migrations/0001_init.sql
e2e/              Playwright
http/game.http    REST-client walkthrough of the API
QA.md             manual test script for laptop + two phones
```

### Decisions worth knowing

Search the code for `DECISION:` comments. The main ones:

- No Supabase env → memory store + polling, so the app and tests run anywhere.
- The `Secure` cookie flag is set only over HTTPS so phones on a plain-http LAN can play.
- Heartbeats that change nothing visible are persisted but not broadcast.
- Leaving a game only forgets the session; players who leave stay on the scoreboard.
- `normalize()` strips every leading article, not just one.

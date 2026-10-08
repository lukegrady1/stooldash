# Balderdash Online — Project Spec

> Handoff document for Claude Code. Build a Jackbox-style web version of the party game Balderdash (word-definition bluffing). Read this whole file before writing code. When something here is ambiguous, prefer the simplest choice that keeps the server authoritative, and leave a `// DECISION:` comment explaining it.

---

## 1. What we're building

A website where one person **hosts** a game and friends **join from their phones** with a 4-letter code.

The host types in a list of obscure words and their real definitions. In each round:

1. Every player sees the word and secretly writes a fake definition that sounds real.
2. Once everyone has submitted, all the fakes plus the real definition are shuffled and shown anonymously.
3. Every player votes for the one they think is real. You can't vote for your own.
4. The real definition is revealed, along with who wrote each fake, who voted for what, and the points each player earned.
5. A scoreboard shows the rankings, then the next word starts.

After the last word, a final results screen shows the winner.

**Why:** YouTubers play this on note cards, and scoring and flow get messy. The app handles collection, anonymity, shuffling, vote counting and scoring automatically.

**Reference prototype:** A working single-file prototype exists as a claude.ai artifact. It has the same flow, rules and visual style (index cards). This spec replaces its peer-to-peer "presence" transport with a real server. Match its UX and visual language. Don't copy its networking.

---

## 2. Goals and non-goals

### Goals (v1)
- Anyone with the link and a code can join. **No accounts and no sign-up for anyone.**
- The server is authoritative. Clients never receive secrets they shouldn't see, such as who wrote which fake before the reveal.
- Works well on phones (players) and on a laptop or TV via screen share (host).
- Survives refreshes and brief disconnects for both host and players. Scores are never lost.
- Real-time updates with no manual refresh.
- Deployable for free or cheaply (Vercel + Supabase free tiers).

### Non-goals (v1)
- User accounts, saved deck libraries in the cloud, public matchmaking.
- The host also playing as a player (the host knows the answers).
- Audio, animation-heavy transitions, chat.
- Moderation or profanity filtering beyond basic length and character limits.

### Stretch (only after v1 is done and tested)
- Optional per-phase timers.
- A separate `/display/[code]` "TV screen" route, so the host can control from a phone while the big screen only shows the game.
- Rotating "reader" mode, where a player is host for a round.
- Saving and loading decks as JSON files. Built-in starter decks.

---

## 3. Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript (strict)** | Owner works in Next.js/TS. |
| Styling | **Tailwind CSS v4** + CSS variables for theme tokens | Tokens in §11. |
| Database | **Supabase Postgres** | One row per game, state as JSONB (see §6). |
| Realtime | **Supabase Realtime Broadcast** | The server broadcasts after every state change. Clients only listen. |
| Validation | **zod** | Every API input. |
| Tests | **Vitest** (engine unit tests), **Playwright** (multi-browser-context e2e) | The engine must reach ~100% branch coverage. |
| Hosting | **Vercel** | Route handlers run as serverless functions. No long-lived sockets are needed on our side. |
| Package manager | pnpm | |

**Why this shape:** Vercel serverless can't hold WebSockets, so we don't try to. Clients POST actions to route handlers. Handlers load the game, run a pure reducer, save with optimistic concurrency, then broadcast the new **public** snapshot over Supabase Realtime. Clients subscribe to the channel to receive updates.

Don't use Supabase Auth, and don't let clients write to Postgres directly. All DB access goes through the server using the service-role key. RLS is enabled with **no** public policies, so the anon key can't read tables.

---

## 4. Glossary

- **Game:** one session, identified by a 4-letter `code`.
- **Host:** the person who created the game. Controls flow and sees secrets. Does not score.
- **Player:** a joined participant with a name and score.
- **Round:** one word. A game has N rounds, where N is the number of words the host entered (1–20, 10 recommended).
- **Option:** one card shown during voting. Either the real definition or a player's fake.
- **Marked player:** a player the host ticked during review because they basically wrote the real definition.

---

## 5. Game rules (source of truth)

### 5.1 Setup
- The host enters 1–20 entries of `{ word, definition }`.
  - `word`: 1–40 characters, trimmed.
  - `definition`: 1–200 characters, trimmed.
- Settings:
  - `correctGuessPoints`: 1, 2 or 3. Default **2**.
  - `maxPlayers`: default 12, hard cap 16.
- Minimum to start: **2 players** (show a hint that 3+ is more fun).

### 5.2 Round flow
1. **WRITING:** All players see the word and its spelling (letters spaced out). Each player submits a definition (1–160 characters, whitespace collapsed). They can edit it until the phase ends. Submission status (✓) is public. Content is not.
2. **REVIEW (host only):** The host sees the real definition and every submission with its author. The host can tick players who essentially wrote the real definition. The server pre-ticks suggestions using normalized matching (§5.5), but the host decides. Players see "Everyone's in. The host is shuffling the cards."
3. **VOTING:** The server builds options from the real definition plus the submissions of unmarked players, shuffled with a crypto RNG, and assigns letters A, B, C… Every voting-eligible player picks one option. They can change their pick until the phase ends.
   - A player **cannot** vote for their own option. This is enforced on the server. The UI also disables their own card.
   - Marked players don't vote. Their screen says they knew it (+3).
   - Players who didn't submit this round can still vote.
4. **REVEAL:** Show the real definition (highlighted), the author of each fake, who picked each option, and the points each player gained this round.
5. **SCOREBOARD:** Rankings with this round's gain. The host clicks Next word, or Final results on the last round.
6. **FINISHED:** Final standings and winner(s). Ties share the win.

### 5.3 Scoring (exact)
For each round:
```
for each (voter, optionId) in votes:
    option = options[optionId]
    if option.source == REAL:
        gained[voter] += settings.correctGuessPoints
    else if option.authorId != voter:          // always true because of validation, but check anyway
        gained[option.authorId] += 1           // 1 point per player fooled
for each playerId in marked:
    gained[playerId] += 3
score[p] += gained[p] for all p
```
- Kicked players keep any points already applied, but are removed from the scoreboard.
- Players who left the game and were never kicked stay on the scoreboard.

### 5.4 Auto-advance
- WRITING → REVIEW when **every active player** has a submission. "Active" is defined in §8.4. There must be at least 1 active player.
- VOTING → REVEAL when **every active, eligible voter** has voted. There must be at least 1 eligible voter.
- The host can always force these: **Stop waiting** (WRITING → REVIEW) and **Reveal now** (VOTING → REVEAL).
- REVIEW → VOTING, REVEAL → SCOREBOARD and SCOREBOARD → next round are **always manual host actions.**

### 5.5 Normalization (for matching and suggestions)
`normalize(s)`: lowercase, strip punctuation, collapse whitespace, trim, remove leading articles ("a", "an", "the", "to").
- At REVIEW, if `normalize(sub) === normalize(realDefinition)`, pre-tick that player as marked. The host can untick.
- If two fakes normalize to the same string, keep both as separate options and show a "duplicate" note to the host in REVIEW.

---

## 6. Data model

Keep it small. All game state lives in one JSONB document per game, so every action is a single atomic read-modify-write.

### 6.1 SQL (Supabase migration `0001_init.sql`)
```sql
create table games (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,              -- 'KQWZ'
  state        jsonb not null,                    -- GameState (see 6.2)
  version      integer not null default 1,        -- optimistic concurrency
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '24 hours'
);
create index games_expires_idx on games (expires_at);

create table sessions (
  token_hash   text primary key,                  -- sha256(token), never store raw token
  game_id      uuid not null references games(id) on delete cascade,
  role         text not null check (role in ('host','player')),
  player_id    text,                              -- null for host
  created_at   timestamptz not null default now()
);
create index sessions_game_idx on sessions (game_id);

alter table games enable row level security;
alter table sessions enable row level security;
-- No policies: only the service role (server) can read/write.
```

### 6.2 TypeScript types (`src/engine/types.ts`)
```ts
export type Phase = 'LOBBY' | 'WRITING' | 'REVIEW' | 'VOTING' | 'REVEAL' | 'SCOREBOARD' | 'FINISHED';

export interface WordEntry { word: string; definition: string }

export interface Player {
  id: string;            // short random id, e.g. 'p_7h2k9x'
  name: string;          // 1–16 chars, unique per game (case-insensitive)
  score: number;
  joinedAt: number;      // epoch ms
  lastSeenAt: number;    // epoch ms, updated by heartbeat
  kicked: boolean;
}

export interface Option {
  id: string;            // random, not guessable ordering, e.g. 'o_x3f'
  text: string;
  source: 'REAL' | 'PLAYER';
  authorId?: string;     // present when source === 'PLAYER'
}

export interface RoundState {
  index: number;                         // 0-based
  submissions: Record<string, string>;   // playerId -> text
  marked: string[];                      // playerIds
  options: Option[];                     // in display order (already shuffled)
  votes: Record<string, string>;         // voterId -> optionId
  gained: Record<string, number>;        // playerId -> points this round
}

export interface Settings { correctGuessPoints: 1 | 2 | 3; maxPlayers: number }

export interface GameState {
  id: string;
  code: string;
  phase: Phase;
  words: WordEntry[];        // SECRET (definitions)
  settings: Settings;
  players: Player[];         // join order
  round: RoundState | null;  // null in LOBBY
  history: Array<Pick<RoundState, 'index' | 'gained'>>; // optional, for stats
  createdAt: number;
  updatedAt: number;
}
```

---

## 7. Game engine (pure, the heart of the project)

Location: `src/engine/`. **No I/O, no Date.now(), no Math.random() inside.** Inject `now` and `rng`.

```ts
// src/engine/actions.ts
export type Actor = { role: 'host' } | { role: 'player'; playerId: string };

export type Action =
  | { type: 'JOIN'; name: string; playerId: string }      // playerId generated by caller
  | { type: 'HEARTBEAT' }
  | { type: 'START' }                                     // host
  | { type: 'SUBMIT'; text: string }                      // player
  | { type: 'STOP_WAITING' }                              // host, WRITING -> REVIEW
  | { type: 'SET_MARKED'; playerIds: string[] }           // host, REVIEW
  | { type: 'OPEN_VOTING' }                               // host, REVIEW -> VOTING
  | { type: 'VOTE'; optionId: string }                    // player
  | { type: 'REVEAL_NOW' }                                // host, VOTING -> REVEAL
  | { type: 'SHOW_SCOREBOARD' }                           // host, REVEAL -> SCOREBOARD
  | { type: 'NEXT_ROUND' }                                // host, SCOREBOARD -> WRITING | FINISHED
  | { type: 'KICK'; playerId: string }                    // host, any phase
  | { type: 'RENAME'; name: string }                      // player, LOBBY only
  | { type: 'END_GAME' };                                 // host -> FINISHED

export interface EngineCtx { now: number; rng: () => number /* [0,1) crypto-backed */ }

export type EngineResult =
  | { ok: true; state: GameState }
  | { ok: false; error: EngineError };

export type EngineError =
  | 'WRONG_PHASE' | 'NOT_HOST' | 'NOT_PLAYER' | 'UNKNOWN_PLAYER' | 'KICKED'
  | 'NAME_TAKEN' | 'NAME_INVALID' | 'GAME_FULL' | 'TEXT_INVALID'
  | 'OWN_OPTION' | 'UNKNOWN_OPTION' | 'NOT_ELIGIBLE' | 'NOT_ENOUGH_PLAYERS';

export function applyAction(s: GameState, a: Action, actor: Actor, ctx: EngineCtx): EngineResult;
```

Rules for `applyAction`:
- Return a **new** object. Never mutate the input (use `structuredClone` at the top).
- After every successful action, run `autoAdvance(state, ctx)` (§5.4).
- Bump `updatedAt = ctx.now`. Any action from a player also updates that player's `lastSeenAt`.
- `JOIN` is allowed in **any** phase except FINISHED. Late joiners start at 0 points and take part from the current phase onward.
- `JOIN` with a name that matches an existing **non-kicked** player is rejected with `NAME_TAKEN`. Rejoining after a refresh uses the session cookie, not JOIN (§9.2).
- `SUBMIT` is only valid in WRITING. Later submissions overwrite earlier ones.
- `VOTE` is only valid in VOTING. The voter must be active, not marked, and not the option's author.
- `KICK` removes the player's submission and vote for the current round. If they had an option in VOTING, remove that option and any votes for it. Those voters can vote again. Then re-run autoAdvance.
- `NEXT_ROUND` on the last round goes to FINISHED.

### 7.1 Views (redaction is critical)
```ts
export function toPublicSnapshot(s: GameState, ctx: { now: number }): PublicSnapshot;
export function toPlayerView(s: GameState, playerId: string): PlayerPrivate;
export function toHostView(s: GameState, ctx: { now: number }): HostView;
```

```ts
export interface PublicSnapshot {
  code: string;
  version: number;                 // filled in by the API layer from games.version
  phase: Phase;
  roundIndex: number | null;
  totalRounds: number;
  word: string | null;             // ONLY the word, never the definition (null in LOBBY/FINISHED)
  settings: Settings;
  players: Array<{
    id: string; name: string; score: number; active: boolean;
    status: 'idle' | 'submitted' | 'voted' | 'knew_it';
  }>;
  options: Array<{ id: string; letter: string; text: string }> | null; // VOTING & REVEAL only, NO author/source
  reveal: null | {                 // REVEAL only
    realOptionId: string;
    authors: Record<string, string>;   // optionId -> playerId (fakes only)
    votes: Record<string, string>;     // voterId -> optionId
    marked: string[];
  };
  gained: Record<string, number> | null; // REVEAL & SCOREBOARD
  markedIds: string[] | null;            // VOTING only (so marked players know to sit out)
}

export interface PlayerPrivate {
  playerId: string;
  name: string;
  mySubmission: string | null;   // current round
  myVote: string | null;
  myOptionId: string | null;     // VOTING only, so the UI can disable own card reliably
}

export interface HostView extends PublicSnapshot {
  words: WordEntry[];
  currentDefinition: string | null;
  submissions: Array<{ playerId: string; text: string; duplicateOf?: string; matchesReal: boolean }>;
}
```

**Redaction tests (must exist):** For every phase, assert that `JSON.stringify(toPublicSnapshot(...))` contains no definition text from `words` other than the shown options, no `authorId` before REVEAL, and no submission text before VOTING.

---

## 8. API (Next.js route handlers)

All under `src/app/api/`. All inputs are validated with zod. All responses are JSON: `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.

### 8.1 Endpoints
| Method & path | Who | Body | Returns |
|---|---|---|---|
| `POST /api/games` | anyone | `{ words: WordEntry[], settings }` | `{ code }` + sets host cookie |
| `GET /api/games/[code]` | anyone with code | — | `PublicSnapshot` |
| `POST /api/games/[code]/join` | anyone | `{ name }` | `{ playerId }` + sets player cookie |
| `POST /api/games/[code]/actions` | host or player (cookie) | `Action` minus JOIN | `{ snapshot: PublicSnapshot }` |
| `GET /api/games/[code]/me` | player (cookie) | — | `PlayerPrivate` |
| `GET /api/games/[code]/host` | host (cookie) | — | `HostView` |

### 8.2 Request lifecycle for every mutation
```
1. Resolve actor from cookie `bd_<code>` -> sha256 -> sessions row (role, player_id). 401 if missing.
2. Load games row by code (404 if missing or expired).
3. result = applyAction(row.state, action, actor, { now: Date.now(), rng: cryptoRng })
4. If !ok -> 409/400 with error code (map EngineError -> HTTP).
5. UPDATE games SET state=$new, version=version+1, updated_at=now()
   WHERE id=$id AND version=$old  RETURNING version
   If 0 rows -> reload and retry from step 3 (max 5 attempts, then 503).
6. Broadcast PublicSnapshot (with new version) on channel `game:<CODE>`, event `snapshot`.
7. Return the snapshot.
```
Put this in `src/server/runAction.ts`, so every route uses the same path.

### 8.3 Sessions and cookies
- Token: 32 random bytes, base64url. Store only `sha256(token)` in `sessions`.
- Cookie name `bd_<CODE>`. Flags: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`.
- One browser can be host of one game and player in another, because cookies are keyed by code.
- Testing multiple players on one machine: use separate browser profiles or incognito windows. Document this in the README.

### 8.4 Presence ("active")
- Clients POST `{ type: 'HEARTBEAT' }` every **15s** while the tab is visible, and immediately on `visibilitychange` to visible.
- A player is **active** if `now - lastSeenAt < 45s` and they aren't kicked.
- Auto-advance only waits on active players. Because state changes only happen on actions, a player going inactive doesn't trigger advance by itself. That's what the host's "Stop waiting" button is for. Also run `autoAdvance` on every HEARTBEAT, since time has moved on.
- Optional: use Supabase Realtime Presence on the client purely for a live "online" dot. The server's notion of active stays heartbeat-based.

### 8.5 Code generation
- 4 letters from `ABCDEFGHJKLMNPQRSTUVWXYZ` (no I or O). Retry on unique-constraint conflict.
- Codes are case-insensitive on input. Store and display them uppercase.

### 8.6 Rate limiting and abuse
- Per IP: `POST /api/games` max 10/hour. `join` max 30/10 min.
- Per session: actions max 10/sec (in-memory token bucket is fine for v1. Document that it's per-instance).
- Strip control and zero-width characters from names and texts. Render all user text as text, never `dangerouslySetInnerHTML`.

### 8.7 Cleanup
- Vercel Cron (daily) hits `POST /api/cron/cleanup` with a `CRON_SECRET` header and deletes `games where expires_at < now()`.
- Extend `expires_at` to `now() + 24h` on every successful action.

---

## 9. Realtime and client sync

### 9.1 Channel
- Channel `game:<CODE>`, Broadcast event `snapshot`, payload `PublicSnapshot`.
- The server sends with the service-role client. Clients subscribe with the **anon** key. Broadcast doesn't touch tables, so RLS still blocks DB reads.

### 9.2 Client state hook (`src/hooks/useGame.ts`)
```
on mount:
  snapshot = GET /api/games/[code]
  if player: me = GET /me (if 401 -> show join form)
  if host:   hostView = GET /host
  subscribe to channel
on broadcast(snapshot):
  if snapshot.version <= current.version: ignore
  set snapshot
  if phase or roundIndex changed: refetch /me (player) or /host (host)
  if host and phase is WRITING or REVIEW: refetch /host on every snapshot (to see new submissions)
on channel reconnect / tab visible:
  refetch GET snapshot (+ /me or /host)
every 15s while visible: HEARTBEAT
```
- After an action POST succeeds, apply the returned snapshot immediately. Don't wait for the broadcast.
- Optimistic UI is OK for SUBMIT and VOTE. Roll back if the action returns an error.
- Keep text drafts in local component state **and** `sessionStorage` (`bd-draft-<code>-<round>`), so a refresh doesn't lose a half-written definition.

---

## 10. Pages and screens

### 10.1 Routes
| Route | Purpose |
|---|---|
| `/` | Home: big wordmark, one-line pitch, **Host a game** / **Join a game**. If a host cookie for an unfinished game exists, show **Resume hosting KQWZ**. |
| `/host/new` | Deck editor (setup). |
| `/host/[code]` | Host control and display screen (all phases). |
| `/join` | Code + name form. Also accepts `/join?code=KQWZ`. |
| `/play/[code]` | Player screen (all phases). Redirects to `/join?code=` when there's no session. |

### 10.2 Deck editor (`/host/new`)
- Rows of `[Word input] [Definition textarea] [×]`. Show **Add word**, **Use 10 sample words**, **Clear all**.
- A collapsible **Paste a list** section. One entry per line. The separator is the first of `=`, `|`, tab, or ` - ` / ` – ` / ` — ` / ` : `.
- Points selector: 1 / 2 / 3 (default 2), with helper text "Fooling someone is always 1 point per vote. Writing the real definition yourself is 3."
- Persist the deck to `localStorage` (`bd-deck`) on every edit.
- **Import/Export JSON** buttons (stretch).
- CTA: "Open lobby with N words" (disabled at 0). Then `POST /api/games` and redirect to `/host/[code]`.
- Sample words (all verified dictionary words):
  - Snollygoster: A shrewd, unprincipled person, especially a politician.
  - Borborygmus: A rumbling or gurgling noise made by gas moving through the intestines.
  - Quockerwodger: A wooden puppet whose limbs jerk when a string is pulled; also a politician controlled by someone else.
  - Gongoozler: A person who enjoys idly watching boats and activity on canals.
  - Bumfuzzle: To confuse or fluster.
  - Widdershins: In a direction contrary to the sun's course; counterclockwise.
  - Absquatulate: To leave abruptly or run away.
  - Kakorrhaphiophobia: An abnormal fear of failure.
  - Ultracrepidarian: A person who gives opinions on matters beyond their knowledge.
  - Sialoquent: Spitting while speaking.

### 10.3 Host screen (`/host/[code]`) by phase
- **LOBBY:** Huge join code, the join URL (`<origin>/join?code=KQWZ`), a QR code of the URL (use the `qrcode` package and render an SVG), and a list of joined players with a kick (×) on each. Start button reads "Start game · N words", or is disabled with "Need at least 2 players".
- **WRITING:** "Word 3 of 10", the huge word, spelled-out letters, "X of Y definitions in", status chips (✓ when submitted, dimmed when inactive). **Stop waiting** button.
- **REVIEW:** The real definition on a highlighted card, labelled "only you see this". A list of submissions with author name and a checkbox "basically nailed it (+3)". Pre-ticked suggestions get a "matches the real one" note. Duplicates are flagged. **Show definitions and start voting** button.
- **VOTING:** The word, all option cards with letters (big and readable for screen share), "X of Y votes in", chips, **Reveal now** button.
- **REVEAL:** "Knew it" line if any players were marked. Each card shows its letter. The real card's text is highlighted, with "Found by …" or "Nobody found it". Fake cards show "Written by NAME", a red "fooled N" pill and "Picked by …". **Show scoreboard** button.
- **SCOREBOARD:** Ranked list with ties sharing a rank, a +gain column and a ★ on the leader. Button reads **Next word**, or **Final results** on the last round.
- **FINISHED:** "NAME wins" (or "A & B win"), final board, **New game** (back to the deck editor with the same deck) and **Done**.
- **End game** (with a confirm) is available in every phase.

### 10.4 Player screen (`/play/[code]`) by phase
- **LOBBY:** "You're in, NAME." "Waiting for the host to start." Chips of everyone. **Leave game**.
- **WRITING:** The word and its spelling. A textarea in the handwriting font (max 160, with a counter) and the placeholder "Make it sound like a dictionary wrote it. If you know the real one, write that." **Submit definition**. After submitting, show their card read-only with an **Edit** button, plus "Waiting on everyone else" and chips.
- **REVIEW:** "Everyone's in. The host is shuffling the cards."
- **VOTING:** "Which one is the real definition?" Tappable full-width cards. Their own card is disabled and labelled "Yours, can't vote for it" (use `myOptionId`). The picked card gets an outline and the label "Your vote". After voting, show "Vote locked in. Tap another card to change it." Marked players instead see "You knew the real definition. That's 3 points."
- **REVEAL:** "+N for you this round" (or "No points this round"), then the same reveal cards as the host.
- **SCOREBOARD / FINISHED:** Same board as the host, with their own row highlighted.
- **Kicked:** "The host removed you from this game." Link home.
- **Host offline:** If no snapshot arrives for 60s and fetches fail, show a soft banner "Can't reach the game. Retrying…".

### 10.5 Shared components (`src/components/`)
`IndexCard`, `WordHeader`, `StatusChips`, `Scoreboard`, `RevealCards`, `JoinCode`, `QrCode`, `Button`, `TextField`, `ConnectionDot`, `ConfirmDialog`.

---

## 11. Visual design (carry over from the prototype)

The memorable element is the **index card**. Every definition, real or fake, is rendered on a lined note card in the **same handwriting font**, so the styling never gives the real one away. Everything else stays quiet.

### 11.1 Tokens
```css
:root {
  --desk:#E6E9F7; --ink:#1B2150; --muted:#565E8E; --panel:#FFFFFF; --line:#CBD0EA;
  --brand:#2F3FB0; --brand-ink:#FFFFFF; --good:#1D7A52; --warn:#B4361F;
  --card:#FFFDF6; --card-ink:#24263A; --rule-red:#E4483B; --rule-blue:#B5CBEB; --hi:#FFE24A;
}
/* dark (prefers-color-scheme + [data-theme="dark"]) */
--desk:#12163A; --ink:#EEF0FF; --muted:#A3A9D8; --panel:#1C2252; --line:#2F3772;
--brand:#8190FF; --brand-ink:#0E1236; --good:#5BD49B; --warn:#FF8A73;
/* cards stay paper-colored in both themes */
```

### 11.2 Type
- UI and headlines: **Bricolage Grotesque** (400/600/800) via `next/font/google`.
- Card text: **Kalam** (400/700).
- The word display is 800 weight, tight tracking (`-0.035em`), `clamp(40px, 10vw, 76px)`.
- The join code is 800 weight, `letter-spacing: .08em`, `clamp(64px, 18vw, 128px)`.

### 11.3 Index card CSS
- Background `--card` with a red rule 2px tall at 22px from the top. Blue lines every 30px from a `repeating-linear-gradient`. Text uses a 30px line-height so it sits on the lines.
- Small letter tag (A, B, C…) in the top margin, in the UI font.
- The real card at reveal gets a highlighter effect: `linear-gradient(transparent 12%, var(--hi) 12% 88%, transparent 88%)` with `box-decoration-break: clone`.
- The "fooled N" pill is `--rule-red` with white text.

### 11.4 Rules
- Mobile-first. The player screen is fully usable at 360px wide with one hand. Tap targets are at least 44px.
- Sentence case everywhere. No all-caps labels.
- Visible focus rings. Respect `prefers-reduced-motion`.
- Motion is limited to a subtle lift on card hover and a single reveal moment, where cards flip to show authors with a ~150ms stagger. The reveal is skipped under reduced motion.
- Respect safe-area insets: `viewport-fit=cover` and `env(safe-area-inset-*)` padding.

---

## 12. Edge cases checklist (each needs handling and, where possible, a test)

- [ ] A player refreshes mid-round. The session cookie restores them, along with their draft and vote.
- [ ] The host refreshes. The host cookie restores full control.
- [ ] A player joins mid-game. They start at 0 and participate from the current phase. A player joining during VOTING can vote.
- [ ] A player goes inactive during WRITING. The host uses Stop waiting. Their missing submission just means no card.
- [ ] Nobody submits. VOTING shows only the real card. Everyone who votes gets points.
- [ ] Everyone is marked. There are no voters, so the host clicks Reveal now.
- [ ] A kick during VOTING removes the kicked player's card and the votes on it. Those voters can vote again.
- [ ] Two players submit identical text. Both cards are shown, and the host sees a duplicate flag.
- [ ] A submission exactly matches the real definition. It's pre-ticked in REVIEW.
- [ ] A player tries to vote for their own option through the API. Rejected with `OWN_OPTION`.
- [ ] A duplicate name, case-insensitive. Rejected with `NAME_TAKEN`. Show "That name's taken in this game."
- [ ] The game is full. Rejected with `GAME_FULL`.
- [ ] Wrong or expired code. "No game with that code. Check with your host."
- [ ] Two host tabs click Next at the same time. Optimistic concurrency means only one applies. The other gets the fresh state and a `WRONG_PHASE` no-op that's swallowed silently.
- [ ] An out-of-order broadcast arrives. It's ignored by version.
- [ ] Very long words or unbroken strings. Use `overflow-wrap: anywhere` on cards and the word header.
- [ ] Emoji in names and definitions are allowed. Control and zero-width characters are stripped.

---

## 13. Project structure

```
balderdash/
├─ src/
│  ├─ app/
│  │  ├─ page.tsx                     # home
│  │  ├─ host/new/page.tsx            # deck editor
│  │  ├─ host/[code]/page.tsx         # host screen
│  │  ├─ join/page.tsx
│  │  ├─ play/[code]/page.tsx
│  │  ├─ api/games/route.ts                     # POST create
│  │  ├─ api/games/[code]/route.ts              # GET snapshot
│  │  ├─ api/games/[code]/join/route.ts
│  │  ├─ api/games/[code]/actions/route.ts
│  │  ├─ api/games/[code]/me/route.ts
│  │  ├─ api/games/[code]/host/route.ts
│  │  └─ api/cron/cleanup/route.ts
│  ├─ engine/                         # PURE: types, applyAction, autoAdvance, scoring, views, normalize
│  │  ├─ types.ts  actions.ts  engine.ts  scoring.ts  views.ts  normalize.ts  sample-deck.ts
│  │  └─ __tests__/
│  ├─ server/                         # db client, runAction, sessions, broadcast, rateLimit, codes
│  ├─ hooks/useGame.ts  useHeartbeat.ts
│  ├─ components/
│  ├─ lib/zod-schemas.ts  rng.ts  text.ts
│  └─ styles/globals.css
├─ supabase/migrations/0001_init.sql
├─ e2e/ (Playwright)
├─ .env.example
└─ README.md
```

### 13.1 Environment variables (`.env.example`)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=      # client: realtime subscribe only
SUPABASE_SERVICE_ROLE_KEY=          # server only, never expose
CRON_SECRET=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

---

## 14. Testing

### 14.1 Engine unit tests (Vitest), required
- Full happy path: 3 players, 2 rounds, scripted RNG. Assert exact scores.
- Scoring matrix: real-guess points of 1, 2 and 3. Multiple voters on one fake. Marked +3. No votes.
- Own-vote rejection. Marked-player vote rejection. Unknown option.
- Auto-advance triggers and non-triggers, including active vs. inactive players by `lastSeenAt`.
- Kick in each phase.
- Late join in each phase.
- Every phase transition guard (`WRONG_PHASE`, `NOT_HOST`).
- Redaction tests (§7.1) for every phase.
- `normalize` cases.
- Immutability: the input state is deep-equal before and after.

### 14.2 E2E (Playwright)
- One host context plus 3 player contexts (separate `browser.newContext()` for separate cookies). Play a full 2-word game through the UI and assert the final scoreboard.
- Refresh a player mid-WRITING. Their draft and submission survive.
- Refresh the host mid-VOTING. Controls still work.
- Mobile viewport (iPhone 13 profile) for players.

### 14.3 Manual QA script
Write `QA.md` with steps to run a game across a laptop (host, screen-shared) and two phones on the local network (`next dev -H 0.0.0.0`).

---

## 15. Milestones (do them in order, with a commit at each)

**M0 — Scaffold.** Next.js + TS strict + Tailwind + ESLint/Prettier + Vitest + Playwright. Fonts and theme tokens. Home page with static content. *Done when* `pnpm dev`, `pnpm test` and `pnpm lint` all pass.

**M1 — Engine.** Types, `applyAction`, scoring, autoAdvance, views, normalize, sample deck, and the full unit test suite in §14.1. *Done when* tests pass with ≥95% branch coverage on `src/engine`.

**M2 — Persistence + API.** Supabase migration, server client, sessions and cookies, `runAction` with optimistic retry, all endpoints, zod schemas, rate limits. *Done when* a scripted Node test (or a REST client file in `/http`) can create a game, join 3 players and play one round via HTTP.

**M3 — Realtime.** Broadcast after every write, the `useGame` hook with version ordering, refetch on reconnect, heartbeat. *Done when* two browsers stay in sync without manual refresh.

**M4 — UI.** All screens in §10 with the design in §11. *Done when* the Playwright full-game test passes.

**M5 — Polish.** QR code, reveal animation, empty and error states, the edge cases in §12, accessibility pass (keyboard-only host flow, screen-reader labels on cards and chips).

**M6 — Deploy.** Vercel project, env vars, Supabase project, cron, a README with setup and deploy steps. *Done when* a game can be played end to end on the production URL from real phones.

---

## 16. Instructions for Claude Code

1. Start with M0 and work strictly milestone by milestone. At the end of each milestone, summarize what was built and what's next, then continue.
2. Write the engine tests **before or alongside** the engine. The engine is the source of truth for rules. UI and API must never re-implement rules.
3. Never send `words[].definition`, `authorId` (pre-reveal), or submissions (pre-voting) to a non-host client. If unsure, add a redaction test.
4. Don't add dependencies beyond those listed (plus `qrcode`, `@supabase/supabase-js`, `zod`, `clsx`) without explaining why in the commit message.
5. Keep components small and typed. No `any`.
6. If a Supabase project isn't configured yet, generate the migration and a README section telling the owner exactly which keys to paste into `.env.local`, then continue with the parts that don't need it (engine, UI against a mocked `useGame`).s
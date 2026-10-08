-- Balderdash: one row per game, state as JSONB. Only the service role touches these tables.

create table games (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,              -- 'KQWZ'
  state        jsonb not null,                    -- GameState (src/engine/types.ts)
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

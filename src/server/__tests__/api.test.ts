/**
 * Drives the real route handlers (no HTTP server) against the in-memory store.
 * This is the M2 "scripted Node test": create a game, join 3 players, play a round.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PublicSnapshot, PlayerPrivate, HostView } from '@/engine/types';
import { resetRateLimits } from '@/server/rateLimit';
import { MemoryStore, setStore } from '@/server/store';
import { POST as createGame } from '@/app/api/games/route';
import { GET as getSnapshot } from '@/app/api/games/[code]/route';
import { POST as join } from '@/app/api/games/[code]/join/route';
import { POST as act } from '@/app/api/games/[code]/actions/route';
import { GET as me } from '@/app/api/games/[code]/me/route';
import { GET as host } from '@/app/api/games/[code]/host/route';
import { POST as leave } from '@/app/api/games/[code]/leave/route';
import { GET as cron } from '@/app/api/cron/cleanup/route';

type Json = { ok: true; data: never } | { ok: false; error: { code: string; message: string } };

/** A tiny cookie jar so each "browser" keeps its own session. */
class Client {
  cookies = new Map<string, string>();

  absorb(res: Response) {
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) {
      const [pair] = c.split(';');
      const [k, v] = (pair ?? '').split('=');
      if (!k) continue;
      if (c.includes('Max-Age=0')) this.cookies.delete(k);
      else this.cookies.set(k, v ?? '');
    }
  }

  req(path: string, init?: { method?: string; body?: unknown; ip?: string }): NextRequest {
    const headers = new Headers();
    if (init?.body !== undefined) headers.set('content-type', 'application/json');
    if (this.cookies.size) {
      headers.set('cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '));
    }
    if (init?.ip) headers.set('x-forwarded-for', init.ip);
    return new NextRequest(`http://localhost:3000${path}`, {
      method: init?.method ?? 'GET',
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  }
}

const params = (code: string) => ({ params: Promise.resolve({ code }) });

async function json<T>(res: Response): Promise<{ status: number; body: Json; data: T }> {
  const body = (await res.json()) as Json;
  return { status: res.status, body, data: (body.ok ? body.data : undefined) as T };
}

const WORDS = [
  { word: 'Snollygoster', definition: 'A shrewd, unprincipled person, especially a politician.' },
  { word: 'Bumfuzzle', definition: 'To confuse or fluster.' },
];

async function setup() {
  const hostC = new Client();
  const res = await createGame(hostC.req('/api/games', { method: 'POST', body: { words: WORDS } }));
  hostC.absorb(res);
  const { data, status } = await json<{ code: string }>(res);
  expect(status).toBe(200);
  const code = data.code;
  expect(code).toMatch(/^[A-HJ-NP-Z]{4}$/);
  const players = await Promise.all(
    ['Ann', 'Bob', 'Cy'].map(async (name, i) => {
      const c = new Client();
      const r = await join(
        c.req(`/api/games/${code}/join`, { method: 'POST', body: { name }, ip: `10.0.0.${i}` }),
        params(code),
      );
      c.absorb(r);
      const j = await json<{ playerId: string }>(r);
      expect(j.status).toBe(201);
      return { c, id: j.data.playerId, name };
    }),
  );
  return { hostC, code, players };
}

async function action(c: Client, code: string, body: unknown) {
  return json<{ snapshot: PublicSnapshot }>(
    await act(c.req(`/api/games/${code}/actions`, { method: 'POST', body }), params(code)),
  );
}

beforeEach(() => {
  setStore(new MemoryStore());
  resetRateLimits();
  process.env.BD_RATE_LIMIT = 'on';
});

describe('API: create / join / snapshot', () => {
  it('rejects bad input and unknown codes', async () => {
    const c = new Client();
    const bad = await json(
      await createGame(c.req('/api/games', { method: 'POST', body: { words: [] } })),
    );
    expect(bad.status).toBe(400);
    const notJson = await json(
      await createGame(
        new NextRequest('http://x/api/games', {
          method: 'POST',
          body: '{',
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    expect(notJson.status).toBe(400);
    const missing = await json(await getSnapshot(c.req('/api/games/ZZZZ'), params('ZZZZ')));
    expect(missing.status).toBe(404);
    const badCode = await json(await getSnapshot(c.req('/api/games/nope!'), params('nope!')));
    expect(badCode.status).toBe(404);
  });

  it('creates, joins, and serves a redacted snapshot; codes are case-insensitive', async () => {
    const { hostC, code, players } = await setup();
    expect(hostC.cookies.has(`bd_${code}`)).toBe(true);
    const snap = await json<PublicSnapshot>(
      await getSnapshot(
        new Client().req(`/api/games/${code.toLowerCase()}`),
        params(code.toLowerCase()),
      ),
    );
    expect(snap.status).toBe(200);
    expect(snap.data.phase).toBe('LOBBY');
    expect(snap.data.players.map((p) => p.name)).toEqual(['Ann', 'Bob', 'Cy']);
    expect(snap.data.version).toBe(4); // create=1, +3 joins
    expect(JSON.stringify(snap.data)).not.toContain('politician');

    // Duplicate name, case-insensitive.
    const dup = await json(
      await join(
        new Client().req(`/api/games/${code}/join`, { method: 'POST', body: { name: 'ANN' } }),
        params(code),
      ),
    );
    expect(dup.status).toBe(409);
    expect(dup.body.ok === false && dup.body.error.code).toBe('NAME_TAKEN');
    // Invalid name
    const inv = await json(
      await join(
        new Client().req(`/api/games/${code}/join`, { method: 'POST', body: { name: ' ' } }),
        params(code),
      ),
    );
    expect(inv.status).toBe(400);

    // Rejoin from the same browser is idempotent.
    const again = await json<{ playerId: string }>(
      await join(
        players[0]!.c.req(`/api/games/${code}/join`, {
          method: 'POST',
          body: { name: 'Whatever' },
        }),
        params(code),
      ),
    );
    expect(again.status).toBe(200);
    expect(again.data.playerId).toBe(players[0]!.id);
  });

  it('fills up at maxPlayers', async () => {
    const hostC = new Client();
    const res = await createGame(
      hostC.req('/api/games', {
        method: 'POST',
        body: { words: WORDS, settings: { maxPlayers: 2 } },
      }),
    );
    const { data } = await json<{ code: string }>(res);
    for (const n of ['A', 'B']) {
      const r = await json(
        await join(
          new Client().req(`/api/games/${data.code}/join`, { method: 'POST', body: { name: n } }),
          params(data.code),
        ),
      );
      expect(r.status).toBe(201);
    }
    const full = await json(
      await join(
        new Client().req(`/api/games/${data.code}/join`, { method: 'POST', body: { name: 'C' } }),
        params(data.code),
      ),
    );
    expect(full.status).toBe(409);
    expect(full.body.ok === false && full.body.error.code).toBe('GAME_FULL');
  });
});

describe('API: sessions and auth', () => {
  it('/me and /host require the right cookie', async () => {
    const { hostC, code, players } = await setup();
    const anon = new Client();
    expect((await json(await me(anon.req(`/api/games/${code}/me`), params(code)))).status).toBe(
      401,
    );
    expect((await json(await host(anon.req(`/api/games/${code}/host`), params(code)))).status).toBe(
      401,
    );
    expect(
      (await json(await host(players[0]!.c.req(`/api/games/${code}/host`), params(code)))).status,
    ).toBe(403);
    expect((await json(await me(hostC.req(`/api/games/${code}/me`), params(code)))).status).toBe(
      401,
    );
    const noSession = await action(anon, code, { type: 'HEARTBEAT' });
    expect(noSession.status).toBe(401);

    const mine = await json<PlayerPrivate>(
      await me(players[1]!.c.req(`/api/games/${code}/me`), params(code)),
    );
    expect(mine.data).toMatchObject({ playerId: players[1]!.id, name: 'Bob', kicked: false });
    const hv = await json<HostView>(await host(hostC.req(`/api/games/${code}/host`), params(code)));
    expect(hv.data.words).toEqual(WORDS);
    expect(hv.data.version).toBe(4);
  });

  it('a cookie from one game does not work on another', async () => {
    const a = await setup();
    const b = await setup();
    const cross = new Client();
    cross.cookies.set(`bd_${b.code}`, a.hostC.cookies.get(`bd_${a.code}`)!);
    expect(
      (await json(await host(cross.req(`/api/games/${b.code}/host`), params(b.code)))).status,
    ).toBe(401);
  });

  it('leave clears the session', async () => {
    const { code, players } = await setup();
    const p = players[2]!;
    const r = await leave(p.c.req(`/api/games/${code}/leave`, { method: 'POST' }), params(code));
    p.c.absorb(r);
    expect(r.status).toBe(200);
    expect(p.c.cookies.has(`bd_${code}`)).toBe(false);
    // Even if the old token is replayed, the session row is gone.
    const stale = new Client();
    expect((await json(await me(stale.req(`/api/games/${code}/me`), params(code)))).status).toBe(
      401,
    );
  });
});

describe('API: play one round over HTTP', () => {
  it('runs WRITING -> REVIEW -> VOTING -> REVEAL -> SCOREBOARD with correct scores', async () => {
    const { hostC, code, players } = await setup();
    const [ann, bob, cy] = players as [
      (typeof players)[0],
      (typeof players)[0],
      (typeof players)[0],
    ];

    // Player can't start; host can.
    expect((await action(ann.c, code, { type: 'START' })).status).toBe(403);
    const started = await action(hostC, code, { type: 'START' });
    expect(started.status).toBe(200);
    expect(started.data.snapshot.phase).toBe('WRITING');
    expect(started.data.snapshot.word).toBe('Snollygoster');

    // Bad action body
    expect((await action(ann.c, code, { type: 'NOPE' })).status).toBe(400);
    // JOIN is not accepted on /actions
    expect((await action(ann.c, code, { type: 'JOIN', name: 'x', playerId: 'y' })).status).toBe(
      400,
    );

    // Submissions
    expect(
      (await action(ann.c, code, { type: 'SUBMIT', text: 'A tall hat.' })).data.snapshot.players[0]
        ?.status,
    ).toBe('submitted');
    await action(bob.c, code, { type: 'SUBMIT', text: 'A canal boat.' });
    const mid = await json<PublicSnapshot>(
      await getSnapshot(new Client().req(`/api/games/${code}`), params(code)),
    );
    expect(JSON.stringify(mid.data)).not.toContain('A tall hat.');
    const last = await action(cy.c, code, {
      type: 'SUBMIT',
      text: 'a shrewd unprincipled person especially a politician',
    });
    expect(last.data.snapshot.phase).toBe('REVIEW');

    // Host sees submissions with the pre-tick; players see nothing.
    const hv = await json<HostView>(await host(hostC.req(`/api/games/${code}/host`), params(code)));
    expect(hv.data.submissions.find((s) => s.playerId === cy.id)?.matchesReal).toBe(true);
    expect(hv.data.currentDefinition).toBe(WORDS[0]!.definition);

    const voting = await action(hostC, code, { type: 'OPEN_VOTING' });
    expect(voting.data.snapshot.phase).toBe('VOTING');
    const options = voting.data.snapshot.options!;
    expect(options).toHaveLength(3); // real + Ann + Bob (Cy marked)
    expect(voting.data.snapshot.markedIds).toEqual([cy.id]);
    expect(JSON.stringify(voting.data.snapshot)).not.toContain('authorId');

    // Ann's own option is reported privately so the UI can disable it.
    const annMe = await json<PlayerPrivate>(
      await me(ann.c.req(`/api/games/${code}/me`), params(code)),
    );
    const annOption = annMe.data.myOptionId!;
    expect(options.some((o) => o.id === annOption)).toBe(true);
    const own = await action(ann.c, code, { type: 'VOTE', optionId: annOption });
    expect(own.status).toBe(403);
    expect(own.body.ok === false && own.body.error.code).toBe('OWN_OPTION');
    expect((await action(cy.c, code, { type: 'VOTE', optionId: annOption })).status).toBe(403); // marked
    expect((await action(ann.c, code, { type: 'VOTE', optionId: 'o_nope' })).status).toBe(404);

    const realId = options.find((o) => o.text === WORDS[0]!.definition)!.id;
    const bobOption = options.find((o) => o.id !== realId && o.id !== annOption)!.id;
    await action(ann.c, code, { type: 'VOTE', optionId: bobOption }); // Bob +1
    const revealed = await action(bob.c, code, { type: 'VOTE', optionId: realId }); // Bob +2
    expect(revealed.data.snapshot.phase).toBe('REVEAL');
    expect(revealed.data.snapshot.reveal?.realOptionId).toBe(realId);
    expect(revealed.data.snapshot.reveal?.authors[annOption]).toBe(ann.id);
    expect(revealed.data.snapshot.gained).toEqual({ [bob.id]: 3, [cy.id]: 3 });

    const sb = await action(hostC, code, { type: 'SHOW_SCOREBOARD' });
    expect(sb.data.snapshot.phase).toBe('SCOREBOARD');
    expect(sb.data.snapshot.players.map((p) => p.score)).toEqual([0, 3, 3]);

    // Stale host tab repeating the click gets a swallowable 409.
    const dupe = await action(hostC, code, { type: 'SHOW_SCOREBOARD' });
    expect(dupe.status).toBe(409);
    expect(dupe.body.ok === false && dupe.body.error.code).toBe('WRONG_PHASE');

    const next = await action(hostC, code, { type: 'NEXT_ROUND' });
    expect(next.data.snapshot.phase).toBe('WRITING');
    expect(next.data.snapshot.roundIndex).toBe(1);
  });

  it('kick removes the player and their session stops working', async () => {
    const { hostC, code, players } = await setup();
    const kicked = await action(hostC, code, { type: 'KICK', playerId: players[1]!.id });
    expect(kicked.data.snapshot.players.map((p) => p.name)).toEqual(['Ann', 'Cy']);
    const r = await action(players[1]!.c, code, { type: 'HEARTBEAT' });
    expect(r.status).toBe(403);
    expect(r.body.ok === false && r.body.error.code).toBe('KICKED');
    const view = await json<PlayerPrivate>(
      await me(players[1]!.c.req(`/api/games/${code}/me`), params(code)),
    );
    expect(view.data.kicked).toBe(true);
  });
});

describe('API: rate limits and cron', () => {
  it('limits game creation per IP', async () => {
    const c = new Client();
    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (
        await createGame(
          c.req('/api/games', { method: 'POST', body: { words: WORDS }, ip: '1.2.3.4' }),
        )
      ).status;
    }
    expect(last).toBe(429);
    const other = await createGame(
      c.req('/api/games', { method: 'POST', body: { words: WORDS }, ip: '5.6.7.8' }),
    );
    expect(other.status).toBe(200);
  });

  it('limits actions per session', async () => {
    const { hostC, code } = await setup();
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await action(hostC, code, { type: 'HEARTBEAT' })).status;
    expect(last).toBe(429);
  });

  it('cron cleanup needs the secret and deletes expired games', async () => {
    process.env.CRON_SECRET = 'shh';
    const { code } = await setup();
    const unauth = await cron(new NextRequest('http://x/api/cron/cleanup'));
    expect(unauth.status).toBe(401);
    const ok1 = await json<{ deleted: number }>(
      await cron(
        new NextRequest('http://x/api/cron/cleanup', { headers: { authorization: 'Bearer shh' } }),
      ),
    );
    expect(ok1.data.deleted).toBe(0);
    // Age the game past its TTL by poking the store directly.
    const store = new MemoryStore();
    setStore(store);
    await store.createGame(
      {
        ...(await (
          await import('@/engine/engine')
        ).createGame({ id: 'x', code: 'AAAA', words: WORDS }, { now: 0 })),
      },
      0,
    );
    const ok2 = await json<{ deleted: number }>(
      await cron(
        new NextRequest('http://x/api/cron/cleanup', { headers: { 'x-cron-secret': 'shh' } }),
      ),
    );
    expect(ok2.data.deleted).toBe(1);
    expect(
      (await json(await getSnapshot(new Client().req(`/api/games/AAAA`), params('AAAA')))).status,
    ).toBe(404);
    void code;
    delete process.env.CRON_SECRET;
  });
});

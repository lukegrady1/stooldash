import type { NextRequest } from 'next/server';
import { toPlayerView } from '@/engine/views';
import { randomString } from '@/lib/rng';
import { codeSchema, joinSchema } from '@/lib/zod-schemas';
import { ApiError, handle, ok, readJson } from '@/server/http';
import { RULES, allow, clientIp } from '@/server/rateLimit';
import { loadGame, runAction } from '@/server/runAction';
import { createSession, resolveSession, setSessionCookie } from '@/server/sessions';

export const runtime = 'nodejs';

type Params = { params: Promise<{ code: string }> };

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** POST /api/games/[code]/join — join as a player, get a session cookie. */
export async function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    const code = codeSchema.safeParse((await params).code);
    if (!code.success)
      throw new ApiError(404, 'NOT_FOUND', 'No game with that code. Check with your host.');
    if (!allow(RULES.join, `join:${clientIp(req)}`)) {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many join attempts. Slow down.');
    }
    const parsed = joinSchema.safeParse(await readJson(req));
    if (!parsed.success)
      throw new ApiError(400, 'NAME_INVALID', 'Pick a name between 1 and 16 characters.');

    const row = await loadGame(code.data);

    // DECISION: a browser that already holds a live player session for this code is
    // simply reconnected (idempotent join). Rejoining after a refresh never creates
    // a second player. A kicked session falls through and joins fresh.
    const existing = await resolveSession(req, code.data, row.id);
    if (existing?.actor.role === 'player') {
      const view = toPlayerView(row.state, existing.actor.playerId);
      if (view && !view.kicked) return ok({ playerId: view.playerId, name: view.name });
    }

    const playerId = `p_${randomString(ID_ALPHABET, 6)}`;
    // JOIN is the one action with no pre-existing actor; the engine ignores the actor
    // for it, so the server submits it in its own (host-role) capacity.
    const result = await runAction(
      code.data,
      { type: 'JOIN', name: parsed.data.name, playerId },
      { role: 'host' },
      row,
    );
    const token = await createSession(row.id, 'player', playerId);
    const res = ok({ playerId, name: parsed.data.name, snapshot: result.snapshot }, 201);
    setSessionCookie(res, req, code.data, token);
    return res;
  });
}

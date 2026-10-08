import type { NextRequest } from 'next/server';
import { createGame } from '@/engine/engine';
import { createGameSchema } from '@/lib/zod-schemas';
import { generateCode } from '@/server/codes';
import { ApiError, handle, ok, readJson } from '@/server/http';
import { RULES, allow, clientIp } from '@/server/rateLimit';
import { createSession, setSessionCookie } from '@/server/sessions';
import { CodeConflictError, getStore } from '@/server/store';

export const runtime = 'nodejs';

/** POST /api/games — create a game, become its host. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!allow(RULES.createGame, `create:${clientIp(req)}`)) {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many games created. Try again later.');
    }
    const parsed = createGameSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid input.');
    }
    const store = getStore();
    const now = Date.now();

    let created = null;
    for (let i = 0; i < 8 && !created; i++) {
      const state = createGame(
        {
          id: crypto.randomUUID(),
          code: generateCode(),
          words: parsed.data.words,
          settings: parsed.data.settings,
        },
        { now },
      );
      try {
        created = await store.createGame(state, now);
      } catch (e) {
        if (!(e instanceof CodeConflictError)) throw e;
      }
    }
    if (!created) throw new ApiError(503, 'CONFLICT', 'Could not allocate a game code.');

    const token = await createSession(created.id, 'host', null);
    const res = ok({ code: created.code });
    setSessionCookie(res, req, created.code, token);
    return res;
  });
}

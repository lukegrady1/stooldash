import type { NextRequest } from 'next/server';
import { codeSchema } from '@/lib/zod-schemas';
import { ApiError, handle, ok } from '@/server/http';
import { loadGame } from '@/server/runAction';
import { clearSessionCookie, resolveSession } from '@/server/sessions';
import { getStore } from '@/server/store';

export const runtime = 'nodejs';

type Params = { params: Promise<{ code: string }> };

/**
 * POST /api/games/[code]/leave — forget this browser's session for the game.
 * DECISION: there is no LEAVE engine action (players who leave stay on the scoreboard,
 * spec §5.3), so leaving only deletes the session and clears the cookie.
 */
export async function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    const code = codeSchema.safeParse((await params).code);
    if (!code.success)
      throw new ApiError(404, 'NOT_FOUND', 'No game with that code. Check with your host.');
    const row = await loadGame(code.data);
    const session = await resolveSession(req, code.data, row.id);
    if (session) await getStore().deleteSession(session.tokenHash);
    const res = ok({ left: true });
    clearSessionCookie(res, code.data);
    return res;
  });
}

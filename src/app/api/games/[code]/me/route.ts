import type { NextRequest } from 'next/server';
import { toPlayerView } from '@/engine/views';
import { codeSchema } from '@/lib/zod-schemas';
import { ApiError, handle, ok } from '@/server/http';
import { loadGame } from '@/server/runAction';
import { resolveSession } from '@/server/sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ code: string }> };

/** GET /api/games/[code]/me — the calling player's private view. */
export async function GET(req: NextRequest, { params }: Params) {
  return handle(async () => {
    const code = codeSchema.safeParse((await params).code);
    if (!code.success)
      throw new ApiError(404, 'NOT_FOUND', 'No game with that code. Check with your host.');
    const row = await loadGame(code.data);
    const session = await resolveSession(req, code.data, row.id);
    if (!session || session.actor.role !== 'player') {
      throw new ApiError(401, 'UNAUTHORIZED', 'No player session for this game.');
    }
    const view = toPlayerView(row.state, session.actor.playerId);
    if (!view) throw new ApiError(404, 'UNKNOWN_PLAYER', "That player isn't in this game.");
    return ok(view);
  });
}

import type { NextRequest } from 'next/server';
import { toHostView } from '@/engine/views';
import { codeSchema } from '@/lib/zod-schemas';
import { ApiError, handle, ok } from '@/server/http';
import { loadGame } from '@/server/runAction';
import { resolveSession } from '@/server/sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ code: string }> };

/** GET /api/games/[code]/host — the full host view, including secrets. */
export async function GET(req: NextRequest, { params }: Params) {
  return handle(async () => {
    const code = codeSchema.safeParse((await params).code);
    if (!code.success)
      throw new ApiError(404, 'NOT_FOUND', 'No game with that code. Check with your host.');
    const row = await loadGame(code.data);
    const session = await resolveSession(req, code.data, row.id);
    if (!session) throw new ApiError(401, 'UNAUTHORIZED', 'No session for this game.');
    if (session.actor.role !== 'host')
      throw new ApiError(403, 'NOT_HOST', 'Only the host can see this.');
    return ok({ ...toHostView(row.state, { now: Date.now() }), version: row.version });
  });
}

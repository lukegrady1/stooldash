import type { NextRequest } from 'next/server';
import { actionSchema, codeSchema } from '@/lib/zod-schemas';
import { ApiError, handle, ok, readJson } from '@/server/http';
import { RULES, allow } from '@/server/rateLimit';
import { loadGame, runAction } from '@/server/runAction';
import { resolveSession } from '@/server/sessions';

export const runtime = 'nodejs';

type Params = { params: Promise<{ code: string }> };

/** POST /api/games/[code]/actions — any engine action except JOIN. Needs a session cookie. */
export async function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    const code = codeSchema.safeParse((await params).code);
    if (!code.success)
      throw new ApiError(404, 'NOT_FOUND', 'No game with that code. Check with your host.');
    const parsed = actionSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ApiError(400, 'VALIDATION', 'Invalid action.');

    const row = await loadGame(code.data);
    const session = await resolveSession(req, code.data, row.id);
    if (!session) throw new ApiError(401, 'UNAUTHORIZED', 'No session for this game.');
    if (!allow(RULES.action, `act:${session.tokenHash}`)) {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many actions. Slow down.');
    }

    const result = await runAction(code.data, parsed.data, session.actor, row);
    return ok({ snapshot: result.snapshot });
  });
}

import type { NextRequest } from 'next/server';
import { codeSchema } from '@/lib/zod-schemas';
import { ApiError, handle, ok } from '@/server/http';
import { loadGame, snapshotOf } from '@/server/runAction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ code: string }> };

/** GET /api/games/[code] — public snapshot. */
export async function GET(_req: NextRequest, { params }: Params) {
  return handle(async () => {
    const code = codeSchema.safeParse((await params).code);
    if (!code.success)
      throw new ApiError(404, 'NOT_FOUND', 'No game with that code. Check with your host.');
    const row = await loadGame(code.data);
    return ok(snapshotOf(row.state, row.version));
  });
}

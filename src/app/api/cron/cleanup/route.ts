import type { NextRequest } from 'next/server';
import { ApiError, handle, ok } from '@/server/http';
import { getStore } from '@/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = req.headers.get('authorization');
  return bearer === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret;
}

async function cleanup(req: NextRequest) {
  return handle(async () => {
    if (!authorized(req)) throw new ApiError(401, 'UNAUTHORIZED', 'Bad cron secret.');
    const deleted = await getStore().deleteExpiredGames(Date.now());
    return ok({ deleted });
  });
}

/** Vercel Cron sends GET; the spec says POST. Accept both. */
export const GET = cleanup;
export const POST = cleanup;

import { NextResponse } from 'next/server';
import type { EngineError } from '@/engine/actions';

export type ApiErrorCode =
  | EngineError
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'CONFLICT'
  | 'INTERNAL';

export type ApiResponse<T> =
  { ok: true; data: T } | { ok: false; error: { code: ApiErrorCode; message: string } };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const ENGINE_STATUS: Record<EngineError, number> = {
  WRONG_PHASE: 409,
  NOT_HOST: 403,
  NOT_PLAYER: 403,
  UNKNOWN_PLAYER: 404,
  KICKED: 403,
  NAME_TAKEN: 409,
  NAME_INVALID: 400,
  GAME_FULL: 409,
  TEXT_INVALID: 400,
  OWN_OPTION: 403,
  UNKNOWN_OPTION: 404,
  NOT_ELIGIBLE: 403,
  NOT_ENOUGH_PLAYERS: 409,
};

export const ENGINE_MESSAGES: Record<EngineError, string> = {
  WRONG_PHASE: "That can't happen right now.",
  NOT_HOST: 'Only the host can do that.',
  NOT_PLAYER: 'Only a player can do that.',
  UNKNOWN_PLAYER: "That player isn't in this game.",
  KICKED: 'The host removed you from this game.',
  NAME_TAKEN: "That name's taken in this game.",
  NAME_INVALID: 'Pick a name between 1 and 16 characters.',
  GAME_FULL: 'This game is full.',
  TEXT_INVALID: 'Definitions must be 1 to 160 characters.',
  OWN_OPTION: "You can't vote for your own definition.",
  UNKNOWN_OPTION: "That card isn't in play.",
  NOT_ELIGIBLE: "You're sitting this vote out.",
  NOT_ENOUGH_PLAYERS: 'Need at least 2 players.',
};

export function engineError(code: EngineError): ApiError {
  return new ApiError(ENGINE_STATUS[code], code, ENGINE_MESSAGES[code]);
}

export function ok<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(err: ApiError): NextResponse<ApiResponse<never>> {
  return NextResponse.json(
    { ok: false, error: { code: err.code, message: err.message } },
    { status: err.status },
  );
}

/** Wrap a handler so thrown ApiErrors become JSON and anything else a 500. */
export async function handle<T>(
  fn: () => Promise<NextResponse<ApiResponse<T>>>,
): Promise<NextResponse<ApiResponse<T>>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) return fail(e);
    console.error(e);
    return fail(new ApiError(500, 'INTERNAL', 'Something went wrong.'));
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, 'VALIDATION', 'Body must be JSON.');
  }
}

import { createHash, randomBytes } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import type { Actor } from '@/engine/actions';
import { getStore, type SessionRole } from './store';
import { isProduction } from './env';

export const SESSION_MAX_AGE_S = 86_400;

export function cookieName(code: string): string {
  return `bd_${code.toUpperCase()}`;
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Create a session row and return the raw token (to be set as a cookie). */
export async function createSession(
  gameId: string,
  role: SessionRole,
  playerId: string | null,
): Promise<string> {
  const token = newToken();
  await getStore().createSession({ tokenHash: hashToken(token), gameId, role, playerId });
  return token;
}

export interface ResolvedSession {
  actor: Actor;
  tokenHash: string;
}

/** Resolve the cookie for this game into an actor, or null. */
export async function resolveSession(
  req: NextRequest,
  code: string,
  gameId: string,
): Promise<ResolvedSession | null> {
  const raw = req.cookies.get(cookieName(code))?.value;
  if (!raw) return null;
  const tokenHash = hashToken(raw);
  const s = await getStore().getSession(tokenHash);
  if (!s || s.gameId !== gameId) return null;
  if (s.role === 'host') return { actor: { role: 'host' }, tokenHash };
  if (!s.playerId) return null;
  return { actor: { role: 'player', playerId: s.playerId }, tokenHash };
}

/**
 * DECISION: `Secure` is only set when the request is HTTPS. The spec asks for Secure,
 * but the QA script plays from phones over plain-http LAN (`next dev -H 0.0.0.0`),
 * where browsers drop Secure cookies. Production (Vercel) is always HTTPS.
 */
export function setSessionCookie(res: NextResponse, req: NextRequest, code: string, token: string) {
  const https =
    req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
  res.cookies.set({
    name: cookieName(code),
    value: token,
    httpOnly: true,
    secure: https || isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_S,
  });
}

export function clearSessionCookie(res: NextResponse, code: string) {
  res.cookies.set({ name: cookieName(code), value: '', path: '/', maxAge: 0 });
}

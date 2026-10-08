import { randomString } from '@/lib/rng';

/** 4 letters, no I or O (spec §8.5). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateCode(): string {
  return randomString(CODE_ALPHABET, 4);
}

export function normalizeCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{4}$/.test(code) ? code : null;
}

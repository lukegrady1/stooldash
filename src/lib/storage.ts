'use client';
/** Guarded access to web storage (private mode, SSR and blocked storage all throw). */

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export const local = {
  get<T>(key: string, fallback: T): T {
    return safe(() => {
      const raw = window.localStorage.getItem(key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    }, fallback);
  },
  set(key: string, value: unknown): void {
    safe(() => window.localStorage.setItem(key, JSON.stringify(value)), undefined);
  },
  remove(key: string): void {
    safe(() => window.localStorage.removeItem(key), undefined);
  },
};

export const session = {
  get(key: string): string | null {
    return safe(() => window.sessionStorage.getItem(key), null);
  },
  set(key: string, value: string): void {
    safe(() => window.sessionStorage.setItem(key, value), undefined);
  },
  remove(key: string): void {
    safe(() => window.sessionStorage.removeItem(key), undefined);
  },
};

/** Remembered host games so the home page can offer "Resume hosting". */
export interface HostedGame {
  code: string;
  createdAt: number;
}

const HOSTED_KEY = 'bd-hosted';

export function rememberHosted(code: string): void {
  const list = local.get<HostedGame[]>(HOSTED_KEY, []).filter((g) => g.code !== code);
  list.unshift({ code, createdAt: Date.now() });
  local.set(HOSTED_KEY, list.slice(0, 5));
}

export function forgetHosted(code: string): void {
  local.set(
    HOSTED_KEY,
    local.get<HostedGame[]>(HOSTED_KEY, []).filter((g) => g.code !== code),
  );
}

export function recentHosted(): HostedGame[] {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return local.get<HostedGame[]>(HOSTED_KEY, []).filter((g) => g.createdAt > dayAgo);
}

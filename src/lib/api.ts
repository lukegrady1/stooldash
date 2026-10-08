/** Thin typed client for our JSON API. Every response is `{ ok, data } | { ok: false, error }`. */
import type { ApiErrorCode, ApiResponse } from '@/server/http';

export type ApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: { code: ApiErrorCode | 'NETWORK'; message: string }; status: number };

async function call<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      credentials: 'same-origin',
    });
    let json: ApiResponse<T> | null = null;
    try {
      json = (await res.json()) as ApiResponse<T>;
    } catch {
      json = null;
    }
    if (!json) {
      return {
        ok: false,
        status: res.status,
        error: { code: 'INTERNAL', message: `Unexpected response (${res.status}).` },
      };
    }
    if (json.ok) return { ok: true, data: json.data, status: res.status };
    return { ok: false, error: json.error, status: res.status };
  } catch {
    return {
      ok: false,
      status: 0,
      error: { code: 'NETWORK', message: "Can't reach the game. Retrying…" },
    };
  }
}

export const api = {
  get: <T>(path: string) => call<T>('GET', path),
  post: <T>(path: string, body?: unknown) => call<T>('POST', path, body ?? {}),
};

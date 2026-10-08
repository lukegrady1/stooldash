/**
 * Push the public snapshot to everyone on channel `game:<CODE>` (event `snapshot`)
 * via Supabase Realtime's HTTP broadcast endpoint. Without Supabase this is a no-op and
 * clients fall back to polling (see src/hooks/useGame.ts).
 */
import type { PublicSnapshot } from '@/engine/types';
import { supabaseEnv } from './env';

export function channelName(code: string): string {
  return `game:${code.toUpperCase()}`;
}

export async function broadcastSnapshot(snapshot: PublicSnapshot): Promise<void> {
  const env = supabaseEnv();
  if (!env) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${env.url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: env.serviceKey,
        authorization: `Bearer ${env.serviceKey}`,
      },
      body: JSON.stringify({
        messages: [{ topic: channelName(snapshot.code), event: 'snapshot', payload: snapshot }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`broadcast failed: ${res.status} ${await res.text().catch(() => '')}`);
    }
  } catch (e) {
    console.error('broadcast error', e);
  } finally {
    clearTimeout(timer);
  }
}

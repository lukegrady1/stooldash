'use client';
/**
 * Client state for one game (spec §9.2).
 *
 *   mount:   GET snapshot, then GET /me (player) or /host (host); subscribe
 *   update:  broadcast snapshots are applied only when version increases
 *   private: refetched when phase/round changes; host also on every WRITING/REVIEW snapshot
 *   resync:  on channel reconnect and when the tab becomes visible
 *   beat:    HEARTBEAT every 15s while visible (the response is a snapshot too)
 *
 * DECISION: when Supabase env is missing (local dev, CI) the hook polls the snapshot
 * every 2s instead of subscribing. With Supabase it still polls slowly (20s) as a safety
 * net against a dropped broadcast.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HostView, PlayerPrivate, PublicSnapshot } from '@/engine/types';
import { api, type ApiResult } from '@/lib/api';
import { getSupabaseBrowser } from '@/lib/supabase-client';
import type { ClientAction } from '@/lib/zod-schemas';
import { useHeartbeat } from './useHeartbeat';

export type Role = 'host' | 'player';

export type GameStatus =
  | 'loading'
  | 'ready'
  | 'no-session' // player without a cookie, or host cookie missing
  | 'not-found'
  | 'kicked';

export type Connection = 'connecting' | 'live' | 'polling' | 'offline';

export interface ActResult {
  ok: boolean;
  code?: string;
  message?: string;
}

export interface UseGame {
  code: string;
  role: Role;
  status: GameStatus;
  connection: Connection;
  snapshot: PublicSnapshot | null;
  me: PlayerPrivate | null;
  hostView: HostView | null;
  /** Last action error, cleared on the next successful action. */
  error: string | null;
  act: (action: ClientAction) => Promise<ActResult>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

const FAST_POLL_MS = 2000;
const SAFETY_POLL_MS = 20_000;

export function useGame(code: string, role: Role): UseGame {
  const [status, setStatus] = useState<GameStatus>('loading');
  const [connection, setConnection] = useState<Connection>('connecting');
  const [snapshot, setSnapshot] = useState<PublicSnapshot | null>(null);
  const [me, setMe] = useState<PlayerPrivate | null>(null);
  const [hostView, setHostView] = useState<HostView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const snapRef = useRef<PublicSnapshot | null>(null);
  const statusRef = useRef<GameStatus>('loading');
  statusRef.current = status;
  // fetchPrivate and applySnapshot call each other; a ref breaks the cycle.
  const applyRef = useRef<(s: PublicSnapshot) => boolean>(() => false);

  const base = `/api/games/${encodeURIComponent(code)}`;

  const fetchPrivate = useCallback(async () => {
    if (role === 'player') {
      const r = await api.get<PlayerPrivate>(`${base}/me`);
      if (r.ok) {
        setMe(r.data);
        if (r.data.kicked) setStatus('kicked');
      } else if (r.status === 401 || r.status === 404) {
        setStatus('no-session');
      }
      return r;
    }
    const r = await api.get<HostView>(`${base}/host`);
    if (r.ok) {
      setHostView(r.data);
      applyRef.current(r.data);
    } else if (r.status === 401 || r.status === 403) {
      setStatus('no-session');
    }
    return r;
  }, [base, role]);

  /** Apply a snapshot if newer; decide whether private state must be refetched. */
  const applySnapshot = useCallback(
    (next: PublicSnapshot) => {
      const prev = snapRef.current;
      if (prev && next.version <= prev.version) return false;
      snapRef.current = next;
      setSnapshot(next);
      const phaseChanged =
        !prev || prev.phase !== next.phase || prev.roundIndex !== next.roundIndex;
      const hostWatching = role === 'host' && (next.phase === 'WRITING' || next.phase === 'REVIEW');
      if (phaseChanged || hostWatching) void fetchPrivate();
      return true;
    },
    [role, fetchPrivate],
  );
  applyRef.current = applySnapshot;

  const refresh = useCallback(async () => {
    const r = await api.get<PublicSnapshot>(base);
    if (r.ok) {
      setConnection((c) => (c === 'offline' ? 'polling' : c));
      applySnapshot(r.data);
      if (statusRef.current === 'loading' || statusRef.current === 'no-session') {
        const p = await fetchPrivate();
        if (p.ok) setStatus((s) => (s === 'kicked' ? s : 'ready'));
      }
    } else if (r.status === 404) {
      setStatus('not-found');
    } else if (r.status === 0) {
      setConnection('offline');
    }
  }, [base, applySnapshot, fetchPrivate]);

  // Initial load.
  useEffect(() => {
    snapRef.current = null;
    setStatus('loading');
    void refresh();
  }, [refresh]);

  // Realtime subscription or polling.
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let poll: ReturnType<typeof setInterval> | null = null;
    const startPoll = (ms: number) => {
      if (poll) clearInterval(poll);
      poll = setInterval(() => {
        if (document.visibilityState === 'visible') void refresh();
      }, ms);
    };

    if (!supabase) {
      setConnection('polling');
      startPoll(FAST_POLL_MS);
      return () => {
        if (poll) clearInterval(poll);
      };
    }

    const channel = supabase
      .channel(`game:${code.toUpperCase()}`, { config: { broadcast: { self: true } } })
      .on('broadcast', { event: 'snapshot' }, (msg) => {
        const payload = msg.payload as PublicSnapshot | undefined;
        if (payload && typeof payload.version === 'number') applySnapshot(payload);
      })
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') {
          setConnection('live');
          void refresh(); // anything missed while connecting
        } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
          setConnection((c) => (c === 'offline' ? c : 'polling'));
        }
      });
    startPoll(SAFETY_POLL_MS);

    return () => {
      if (poll) clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [code, applySnapshot, refresh]);

  // Resync whenever the tab comes back.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const act = useCallback(
    async (action: ClientAction): Promise<ActResult> => {
      // Optimistic private state for SUBMIT and VOTE; rolled back on error.
      let rollback: (() => void) | null = null;
      if (role === 'player' && action.type === 'SUBMIT') {
        const before = me;
        setMe((m) => (m ? { ...m, mySubmission: action.text.trim() } : m));
        rollback = () => setMe(before);
      } else if (role === 'player' && action.type === 'VOTE') {
        const before = me;
        setMe((m) => (m ? { ...m, myVote: action.optionId } : m));
        rollback = () => setMe(before);
      }

      const r: ApiResult<{ snapshot: PublicSnapshot }> = await api.post(`${base}/actions`, action);
      if (r.ok) {
        setConnection((c) => (c === 'offline' ? 'polling' : c));
        applySnapshot(r.data.snapshot);
        if (action.type !== 'HEARTBEAT') setError(null);
        // SUBMIT/VOTE: confirm private state from the server (cheap, and exact).
        if (role === 'player' && (action.type === 'SUBMIT' || action.type === 'VOTE'))
          void fetchPrivate();
        return { ok: true };
      }
      rollback?.();
      if (r.error.code === 'KICKED') setStatus('kicked');
      else if (r.status === 401) setStatus('no-session');
      else if (r.status === 404 && r.error.code === 'NOT_FOUND') setStatus('not-found');
      else if (r.status === 0) setConnection('offline');
      // A stale tab's WRONG_PHASE is expected noise (spec §12): refresh and stay quiet.
      if (r.error.code === 'WRONG_PHASE') void refresh();
      else if (action.type !== 'HEARTBEAT') setError(r.error.message);
      return { ok: false, code: r.error.code, message: r.error.message };
    },
    [base, role, me, applySnapshot, fetchPrivate, refresh],
  );

  const beat = useMemo(
    () => (status === 'ready' ? () => void act({ type: 'HEARTBEAT' }) : null),
    [status, act],
  );
  useHeartbeat(beat);

  const clearError = useCallback(() => setError(null), []);

  return {
    code,
    role,
    status,
    connection,
    snapshot,
    me,
    hostView,
    error,
    act,
    refresh,
    clearError,
  };
}

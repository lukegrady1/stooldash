'use client';
import { useCallback, useEffect, useState } from 'react';
import { session } from '@/lib/storage';

/** A text draft mirrored to sessionStorage (`bd-draft-<code>-<round>`), so a refresh keeps it. */
export function useDraft(code: string, roundIndex: number | null, initial = '') {
  const key = roundIndex === null ? null : `bd-draft-${code}-${roundIndex}`;
  const [draft, setDraftState] = useState<string>(initial);

  useEffect(() => {
    if (!key) return;
    const stored = session.get(key);
    setDraftState(stored ?? initial);
    // Reset when the round changes; `initial` is the server-side submission if any.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setDraft = useCallback(
    (value: string) => {
      setDraftState(value);
      if (key) session.set(key, value);
    },
    [key],
  );

  const clearDraft = useCallback(() => {
    if (key) session.remove(key);
  }, [key]);

  return { draft, setDraft, clearDraft };
}

'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PublicSnapshot } from '@/engine/types';
import { api } from '@/lib/api';
import { forgetHosted, recentHosted } from '@/lib/storage';

/** "Resume hosting KQWZ" when this browser recently hosted a game that isn't finished. */
export function ResumeHosting() {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const g of recentHosted()) {
        const r = await api.get<PublicSnapshot>(`/api/games/${g.code}`);
        if (cancelled) return;
        if (r.ok && r.data.phase !== 'FINISHED') {
          setCode(g.code);
          return;
        }
        forgetHosted(g.code);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  if (!code) return null;
  return (
    <Link
      href={`/host/${code}`}
      className="rounded-xl border-2 border-brand/40 bg-brand/10 px-4 py-3 font-semibold text-brand"
    >
      Resume hosting {code}
    </Link>
  );
}

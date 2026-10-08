'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SAMPLE_DECK } from '@/engine/sample-deck';
import type { CorrectGuessPoints, WordEntry } from '@/engine/types';
import { LIMITS } from '@/engine/types';
import { api } from '@/lib/api';
import { newRowId, parsePastedList, rowError, validEntries, type DeckRow } from '@/lib/deck';
import { local, rememberHosted } from '@/lib/storage';
import clsx from 'clsx';

const DECK_KEY = 'bd-deck';

interface StoredDeck {
  rows: DeckRow[];
  points: CorrectGuessPoints;
}

const emptyRow = (): DeckRow => ({ id: newRowId(), word: '', definition: '' });

function rowsFrom(entries: readonly WordEntry[]): DeckRow[] {
  return entries.map((e) => ({ id: newRowId(), ...e }));
}

export function DeckEditor() {
  const router = useRouter();
  const [rows, setRows] = useState<DeckRow[]>([emptyRow()]);
  const [points, setPoints] = useState<CorrectGuessPoints>(2);
  const [loaded, setLoaded] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load from localStorage once, then persist on every edit.
  useEffect(() => {
    const stored = local.get<StoredDeck | null>(DECK_KEY, null);
    if (stored && Array.isArray(stored.rows) && stored.rows.length > 0) {
      setRows(
        stored.rows.map((r) => ({
          id: r.id || newRowId(),
          word: r.word ?? '',
          definition: r.definition ?? '',
        })),
      );
      if (stored.points === 1 || stored.points === 2 || stored.points === 3)
        setPoints(stored.points);
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) local.set(DECK_KEY, { rows, points } satisfies StoredDeck);
  }, [rows, points, loaded]);

  const entries = useMemo(() => validEntries(rows), [rows]);
  const tooMany = entries.length > LIMITS.words.max;

  const update = (id: string, patch: Partial<DeckRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) =>
    setRows((rs) => (rs.length === 1 ? [emptyRow()] : rs.filter((r) => r.id !== id)));
  const addRow = () => setRows((rs) => [...rs, emptyRow()]);
  const useSample = () => setRows(rowsFrom(SAMPLE_DECK));
  const clearAll = () => {
    setRows([emptyRow()]);
    setConfirmClear(false);
  };

  const appendEntries = (list: WordEntry[]) =>
    setRows((rs) => [...rs.filter((r) => r.word.trim() || r.definition.trim()), ...rowsFrom(list)]);

  const importPaste = () => {
    const parsed = parsePastedList(pasteText);
    if (parsed.length === 0) {
      setError('No entries found. Use one line per word, like "Snollygoster = A shrewd person".');
      return;
    }
    appendEntries(parsed);
    setPasteText('');
    setPasteOpen(false);
    setError(null);
  };

  const exportJson = () => {
    const blob = new Blob(
      [JSON.stringify({ words: entries, settings: { correctGuessPoints: points } }, null, 2)],
      {
        type: 'application/json',
      },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'balderdash-deck.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const list = Array.isArray(parsed) ? parsed : (parsed as { words?: unknown }).words;
      if (!Array.isArray(list)) throw new Error('bad');
      const words: WordEntry[] = list
        .filter(
          (x): x is WordEntry =>
            typeof x === 'object' &&
            x !== null &&
            typeof (x as WordEntry).word === 'string' &&
            typeof (x as WordEntry).definition === 'string',
        )
        .map((x) => ({ word: x.word, definition: x.definition }));
      if (words.length === 0) throw new Error('bad');
      appendEntries(words);
      setError(null);
    } catch {
      setError(
        'That file isn’t a deck. Expected JSON like { "words": [{ "word", "definition" }] }.',
      );
    }
  };

  const openLobby = async () => {
    setBusy(true);
    setError(null);
    const r = await api.post<{ code: string }>('/api/games', {
      words: entries.slice(0, LIMITS.words.max),
      settings: { correctGuessPoints: points, maxPlayers: LIMITS.maxPlayersDefault },
    });
    if (!r.ok) {
      setBusy(false);
      setError(r.error.message);
      return;
    }
    rememberHosted(r.data.code);
    router.push(`/host/${r.data.code}`);
  };

  return (
    <div className="mt-6 flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Build your deck</h1>
        <p className="mt-1 text-muted">
          Obscure words and their real definitions. Players never see the definitions until the
          vote. Up to {LIMITS.words.max} words, 10 is a good game.
        </p>
      </header>

      {error ? (
        <Banner tone="warn" onDismiss={() => setError(null)}>
          {error}
        </Banner>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={addRow}>
          Add word
        </Button>
        <Button variant="secondary" onClick={useSample}>
          Use 10 sample words
        </Button>
        <Button variant="ghost" onClick={() => setConfirmClear(true)}>
          Clear all
        </Button>
      </div>

      <ol className="flex flex-col gap-3" aria-label="Words">
        {rows.map((row, i) => {
          const err = rowError(row);
          return (
            <li key={row.id} className="rounded-2xl border-2 border-line bg-panel p-3">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,11rem)_1fr_auto]">
                <label className="sr-only" htmlFor={`${row.id}-w`}>
                  Word {i + 1}
                </label>
                <input
                  id={`${row.id}-w`}
                  value={row.word}
                  onChange={(e) => update(row.id, { word: e.target.value })}
                  placeholder="Word"
                  maxLength={LIMITS.word.max}
                  autoComplete="off"
                  className="min-h-11 rounded-xl border-2 border-line bg-desk/50 px-3 font-semibold focus:border-brand focus-visible:outline-none"
                />
                <label className="sr-only" htmlFor={`${row.id}-d`}>
                  Definition {i + 1}
                </label>
                <textarea
                  id={`${row.id}-d`}
                  value={row.definition}
                  onChange={(e) => update(row.id, { definition: e.target.value })}
                  placeholder="Real definition"
                  maxLength={LIMITS.definition.max}
                  rows={2}
                  className="min-h-11 resize-y rounded-xl border-2 border-line bg-desk/50 px-3 py-2 focus:border-brand focus-visible:outline-none"
                />
                <button
                  type="button"
                  onClick={() => remove(row.id)}
                  aria-label={`Remove word ${i + 1}`}
                  className="grid min-h-11 min-w-11 place-items-center self-start rounded-xl text-xl text-muted hover:bg-warn/10 hover:text-warn"
                >
                  ×
                </button>
              </div>
              {err ? (
                <p className="mt-2 text-sm font-semibold text-warn" role="alert">
                  {err}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>

      <section className="rounded-2xl border-2 border-line bg-panel">
        <button
          type="button"
          onClick={() => setPasteOpen((o) => !o)}
          aria-expanded={pasteOpen}
          className="flex min-h-12 w-full items-center justify-between px-4 text-left font-semibold"
        >
          Paste a list
          <span aria-hidden className={clsx('transition-transform', pasteOpen && 'rotate-180')}>
            ▾
          </span>
        </button>
        {pasteOpen ? (
          <div className="flex flex-col gap-3 border-t-2 border-line p-4">
            <p className="text-sm text-muted">
              One entry per line. Separate the word and definition with <code>=</code>,{' '}
              <code>|</code>, a tab, <code> - </code> or <code> : </code>.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={6}
              aria-label="Pasted list"
              placeholder={
                'Snollygoster = A shrewd, unprincipled person\nBumfuzzle | To confuse or fluster'
              }
              className="rounded-xl border-2 border-line bg-desk/50 px-3 py-2 font-mono text-sm focus:border-brand focus-visible:outline-none"
            />
            <div>
              <Button variant="secondary" onClick={importPaste}>
                Add these words
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border-2 border-line bg-panel p-4">
        <h2 className="font-semibold">Points for guessing the real definition</h2>
        <div role="radiogroup" aria-label="Points for a correct guess" className="mt-3 flex gap-2">
          {([1, 2, 3] as const).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={points === n}
              onClick={() => setPoints(n)}
              className={clsx(
                'min-h-11 min-w-14 rounded-xl border-2 text-lg font-extrabold transition-colors',
                points === n
                  ? 'border-brand bg-brand text-brand-ink'
                  : 'border-line bg-desk/50 hover:border-brand/60',
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">
          Fooling someone is always 1 point per vote. Writing the real definition yourself is 3.
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => fileRef.current?.click()}>
          Import JSON
        </Button>
        <Button variant="ghost" onClick={exportJson} disabled={entries.length === 0}>
          Export JSON
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importJson(f);
            e.target.value = '';
          }}
        />
      </div>

      <div className="sticky bottom-0 -mx-4 border-t-2 border-line bg-desk/90 px-4 py-3 backdrop-blur">
        <Button
          size="lg"
          full
          busy={busy}
          disabled={entries.length === 0 || tooMany}
          onClick={openLobby}
        >
          {tooMany
            ? `Too many words (max ${LIMITS.words.max})`
            : `Open lobby with ${entries.length} ${entries.length === 1 ? 'word' : 'words'}`}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear all words?"
        body="This empties the deck on this browser."
        confirmLabel="Clear all"
        danger
        onConfirm={clearAll}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}

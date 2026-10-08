'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ConnectionDot } from '@/components/ConnectionDot';
import { IndexCard } from '@/components/IndexCard';
import { JoinCode } from '@/components/JoinCode';
import { QrCode } from '@/components/QrCode';
import { RevealCards } from '@/components/RevealCards';
import { Scoreboard } from '@/components/Scoreboard';
import { Shell } from '@/components/Shell';
import { StatusChips } from '@/components/StatusChips';
import { WordHeader } from '@/components/WordHeader';
import { winners } from '@/engine/scoring';
import type { HostView, PublicSnapshot } from '@/engine/types';
import { LIMITS } from '@/engine/types';
import { useGame, type UseGame } from '@/hooks/useGame';
import { forgetHosted } from '@/lib/storage';
import type { ClientAction } from '@/lib/zod-schemas';

export function HostScreen({ code }: { code: string }) {
  const game = useGame(code, 'host');
  const { status, snapshot, hostView, connection, error, clearError, act } = game;
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [kickId, setKickId] = useState<string | null>(null);
  const router = useRouter();

  const view: HostView | null = hostView && snapshot ? { ...hostView, ...snapshot } : hostView;

  if (status === 'not-found') {
    return (
      <Shell width="sm">
        <Empty title="No game with that code" body="It may have expired. Games last 24 hours.">
          <Link href="/host/new" className="font-semibold text-brand underline">
            Start a new game
          </Link>
        </Empty>
      </Shell>
    );
  }
  if (status === 'no-session') {
    return (
      <Shell width="sm">
        <Empty
          title="You're not hosting this game on this browser"
          body="Open the game from the browser that created it, or start a new one."
        >
          <Link href="/host/new" className="font-semibold text-brand underline">
            Start a new game
          </Link>
        </Empty>
      </Shell>
    );
  }
  if (!view || !snapshot) {
    return (
      <Shell width="sm">
        <p className="mt-12 text-center text-muted" aria-live="polite">
          Loading your game…
        </p>
      </Shell>
    );
  }

  const kickTarget = kickId ? snapshot.players.find((p) => p.id === kickId) : null;
  const run = (a: ClientAction) => void act(a);

  return (
    <Shell
      width="lg"
      right={
        <>
          <ConnectionDot connection={connection} />
          {snapshot.phase !== 'LOBBY' ? (
            <span className="rounded-full border-2 border-line bg-panel px-3 py-1 text-sm font-extrabold tracking-[0.15em]">
              {code}
            </span>
          ) : null}
          {snapshot.phase !== 'FINISHED' ? (
            <Button variant="ghost" onClick={() => setConfirmEnd(true)}>
              End game
            </Button>
          ) : null}
        </>
      }
    >
      {connection === 'offline' ? (
        <Banner tone="warn" className="mt-2">
          Can&rsquo;t reach the game. Retrying…
        </Banner>
      ) : null}
      {error ? (
        <Banner tone="warn" className="mt-2" onDismiss={clearError}>
          {error}
        </Banner>
      ) : null}

      <div className="mt-4">
        {snapshot.phase === 'LOBBY' && <Lobby game={game} snapshot={snapshot} onKick={setKickId} />}
        {snapshot.phase === 'WRITING' && (
          <Writing snapshot={snapshot} run={run} onKick={setKickId} />
        )}
        {snapshot.phase === 'REVIEW' && <Review view={view} run={run} />}
        {snapshot.phase === 'VOTING' && <Voting snapshot={snapshot} run={run} onKick={setKickId} />}
        {snapshot.phase === 'REVEAL' && <Reveal snapshot={snapshot} run={run} />}
        {snapshot.phase === 'SCOREBOARD' && <Board snapshot={snapshot} run={run} />}
        {snapshot.phase === 'FINISHED' && (
          <Finished
            snapshot={snapshot}
            onNewGame={() => {
              forgetHosted(code);
              router.push('/host/new');
            }}
            onDone={() => {
              forgetHosted(code);
              router.push('/');
            }}
          />
        )}
      </div>

      <ConfirmDialog
        open={confirmEnd}
        title="End the game now?"
        body="Everyone goes straight to the final results with the scores as they stand."
        confirmLabel="End game"
        danger
        onConfirm={() => {
          setConfirmEnd(false);
          run({ type: 'END_GAME' });
        }}
        onCancel={() => setConfirmEnd(false)}
      />
      <ConfirmDialog
        open={kickTarget !== null && kickTarget !== undefined}
        title={`Remove ${kickTarget?.name ?? 'this player'}?`}
        body="They keep the points they already have but leave the scoreboard and can't rejoin with the same session."
        confirmLabel="Remove"
        danger
        onConfirm={() => {
          if (kickId) run({ type: 'KICK', playerId: kickId });
          setKickId(null);
        }}
        onCancel={() => setKickId(null)}
      />
    </Shell>
  );
}

function Empty({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-12 flex flex-col items-center gap-3 text-center">
      <h1 className="text-2xl font-extrabold">{title}</h1>
      <p className="text-muted">{body}</p>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Lobby({
  game,
  snapshot,
  onKick,
}: {
  game: UseGame;
  snapshot: PublicSnapshot;
  onKick: (id: string) => void;
}) {
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const joinUrl = `${origin || ''}/join?code=${snapshot.code}`;
  const enough = snapshot.players.length >= LIMITS.minPlayersToStart;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,22rem)]">
      <section className="flex flex-col items-center gap-4 rounded-3xl border-2 border-line bg-panel px-4 py-8 text-center">
        <p className="text-sm font-semibold text-muted">Join at</p>
        <p className="text-xl font-bold break-all sm:text-2xl">
          {origin ? joinUrl.replace(/^https?:\/\//, '') : '…'}
        </p>
        <p className="mt-2 text-sm font-semibold text-muted">with the code</p>
        <JoinCode code={snapshot.code} />
        {origin ? <QrCode value={joinUrl} size={168} className="mt-2 rounded-xl" /> : null}
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-extrabold">
            Players <span className="text-muted">· {snapshot.players.length}</span>
          </h2>
          <StatusChips players={snapshot.players} onKick={onKick} className="mt-2" />
        </div>
        <Button size="lg" full disabled={!enough} onClick={() => void game.act({ type: 'START' })}>
          {enough
            ? `Start game · ${snapshot.totalRounds} ${snapshot.totalRounds === 1 ? 'word' : 'words'}`
            : 'Need at least 2 players'}
        </Button>
        {enough && snapshot.players.length < 3 ? (
          <p className="text-center text-sm text-muted">
            Two works. Three or more is a lot more fun.
          </p>
        ) : null}
        <p className="text-sm text-muted">
          Players refresh freely. If someone loses their place, they can join again with the same
          name from the same phone.
        </p>
      </section>
    </div>
  );
}

function Writing({
  snapshot,
  run,
  onKick,
}: {
  snapshot: PublicSnapshot;
  run: (a: ClientAction) => void;
  onKick: (id: string) => void;
}) {
  const done = snapshot.players.filter((p) => p.status === 'submitted').length;
  return (
    <div className="flex flex-col items-center gap-8">
      <WordHeader
        word={snapshot.word ?? ''}
        roundIndex={snapshot.roundIndex ?? 0}
        totalRounds={snapshot.totalRounds}
      />
      <p className="text-lg font-semibold" aria-live="polite">
        {done} of {snapshot.players.length} definitions in
      </p>
      <StatusChips
        players={snapshot.players}
        done="submitted"
        onKick={onKick}
        className="justify-center"
      />
      <Button variant="secondary" size="lg" onClick={() => run({ type: 'STOP_WAITING' })}>
        Stop waiting
      </Button>
    </div>
  );
}

function Review({ view, run }: { view: HostView; run: (a: ClientAction) => void }) {
  const markedKey = view.marked.join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const marked = useMemo(() => new Set(view.marked), [markedKey]);
  const [local, setLocal] = useState<Set<string>>(marked);
  // Keep in sync when the server's marked list changes (e.g. after a kick).
  useEffect(() => setLocal(marked), [marked]);

  const toggle = (id: string) => {
    const next = new Set(local);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setLocal(next);
    run({ type: 'SET_MARKED', playerIds: [...next] });
  };
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? 'Someone';

  return (
    <div className="flex flex-col gap-6">
      <WordHeader
        word={view.word ?? ''}
        roundIndex={view.roundIndex ?? 0}
        totalRounds={view.totalRounds}
        size="sm"
      />
      <div className="mx-auto w-full max-w-2xl">
        <IndexCard
          text={view.currentDefinition ?? ''}
          corner={<span className="font-bold text-card-warn">Only you see this</span>}
          ariaLabel="The real definition, visible only to the host"
        />
      </div>

      <section className="mx-auto w-full max-w-2xl">
        <h2 className="text-lg font-extrabold">
          Submissions <span className="text-muted">· {view.submissions.length}</span>
        </h2>
        <p className="text-sm text-muted">
          Tick anyone who basically wrote the real definition. They score 3 and sit out the vote.
        </p>
        {view.submissions.length === 0 ? (
          <p className="mt-4 rounded-xl border-2 border-dashed border-line p-4 text-center text-muted">
            Nobody submitted. Voting will show only the real card.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {view.submissions.map((s) => (
              <li key={s.playerId} className="rounded-2xl border-2 border-line bg-panel p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-extrabold">{nameOf(s.playerId)}</p>
                  <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                    {s.matchesReal ? (
                      <span className="rounded-full bg-good/15 px-2 py-0.5 text-good">
                        matches the real one
                      </span>
                    ) : null}
                    {s.duplicateOf ? (
                      <span className="rounded-full bg-warn/15 px-2 py-0.5 text-warn">
                        duplicate of {nameOf(s.duplicateOf)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="handwriting mt-1 text-lg leading-7 break-words">{s.text}</p>
                <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={local.has(s.playerId)}
                    onChange={() => toggle(s.playerId)}
                    className="size-5 accent-[var(--brand)]"
                  />
                  basically nailed it (+3)
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mx-auto w-full max-w-2xl">
        <Button size="lg" full onClick={() => run({ type: 'OPEN_VOTING' })}>
          Show definitions and start voting
        </Button>
      </div>
    </div>
  );
}

function Voting({
  snapshot,
  run,
  onKick,
}: {
  snapshot: PublicSnapshot;
  run: (a: ClientAction) => void;
  onKick: (id: string) => void;
}) {
  const marked = new Set(snapshot.markedIds ?? []);
  const voters = snapshot.players.filter((p) => !marked.has(p.id));
  const done = voters.filter((p) => p.status === 'voted').length;
  return (
    <div className="flex flex-col gap-6">
      <WordHeader
        word={snapshot.word ?? ''}
        roundIndex={snapshot.roundIndex ?? 0}
        totalRounds={snapshot.totalRounds}
        size="sm"
      />
      <ul className="grid gap-4 md:grid-cols-2" aria-label="Definitions">
        {(snapshot.options ?? []).map((o) => (
          <li key={o.id}>
            <IndexCard
              text={o.text}
              letter={o.letter}
              ariaLabel={`Card ${o.letter}: ${o.text}`}
              className="[&_.index-card__text]:text-[22px]"
            />
          </li>
        ))}
      </ul>
      <p className="text-center text-lg font-semibold" aria-live="polite">
        {voters.length === 0
          ? 'Nobody to vote. Reveal when ready.'
          : `${done} of ${voters.length} votes in`}
      </p>
      <StatusChips
        players={snapshot.players}
        done="voted"
        onKick={onKick}
        className="justify-center"
      />
      <div className="mx-auto w-full max-w-md">
        <Button
          size="lg"
          full
          variant={done === voters.length ? 'primary' : 'secondary'}
          onClick={() => run({ type: 'REVEAL_NOW' })}
        >
          Reveal now
        </Button>
      </div>
    </div>
  );
}

function Reveal({ snapshot, run }: { snapshot: PublicSnapshot; run: (a: ClientAction) => void }) {
  const reveal = snapshot.reveal;
  if (!reveal) return null;
  const knew = reveal.marked.map(
    (id) => snapshot.players.find((p) => p.id === id)?.name ?? 'Someone',
  );
  return (
    <div className="flex flex-col gap-6">
      <WordHeader
        word={snapshot.word ?? ''}
        roundIndex={snapshot.roundIndex ?? 0}
        totalRounds={snapshot.totalRounds}
        size="sm"
      />
      {knew.length > 0 ? (
        <p className="text-center text-lg font-semibold text-good">
          {'★\uFE0E'} {knew.join(', ')} knew it. +3 {knew.length === 1 ? '' : 'each'}
        </p>
      ) : null}
      <div className="mx-auto w-full max-w-2xl">
        <RevealCards options={snapshot.options ?? []} reveal={reveal} players={snapshot.players} />
      </div>
      <div className="mx-auto w-full max-w-md">
        <Button size="lg" full onClick={() => run({ type: 'SHOW_SCOREBOARD' })}>
          Show scoreboard
        </Button>
      </div>
    </div>
  );
}

function Board({ snapshot, run }: { snapshot: PublicSnapshot; run: (a: ClientAction) => void }) {
  const last = (snapshot.roundIndex ?? 0) + 1 >= snapshot.totalRounds;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <header className="text-center">
        <p className="text-sm font-semibold text-muted">
          After word {(snapshot.roundIndex ?? 0) + 1} of {snapshot.totalRounds}
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight">Scoreboard</h1>
      </header>
      <Scoreboard players={snapshot.players} gained={snapshot.gained} />
      <Button size="lg" full onClick={() => run({ type: 'NEXT_ROUND' })}>
        {last ? 'Final results' : 'Next word'}
      </Button>
    </div>
  );
}

export function WinnerLine({ snapshot }: { snapshot: PublicSnapshot }) {
  const top = winners(snapshot.players);
  if (top.length === 0) return <h1 className="text-3xl font-extrabold">Game over</h1>;
  const names = top.map((p) => p.name);
  const text =
    names.length === 1
      ? `${names[0]} wins`
      : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]} win`;
  return <h1 className="word-display text-[clamp(32px,8vw,64px)]">{text}</h1>;
}

function Finished({
  snapshot,
  onNewGame,
  onDone,
}: {
  snapshot: PublicSnapshot;
  onNewGame: () => void;
  onDone: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <header className="text-center">
        <p className="text-sm font-semibold text-muted">Final results</p>
        <WinnerLine snapshot={snapshot} />
      </header>
      <Scoreboard players={snapshot.players} gained={null} showGain={false} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" full onClick={onNewGame}>
          New game
        </Button>
        <Button size="lg" full variant="secondary" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

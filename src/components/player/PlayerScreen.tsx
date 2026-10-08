'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { ConnectionDot } from '@/components/ConnectionDot';
import { IndexCard } from '@/components/IndexCard';
import { RevealCards } from '@/components/RevealCards';
import { Scoreboard } from '@/components/Scoreboard';
import { Shell } from '@/components/Shell';
import { StatusChips } from '@/components/StatusChips';
import { TextArea } from '@/components/TextField';
import { WordHeader } from '@/components/WordHeader';
import { WinnerLine } from '@/components/host/HostScreen';
import type { PlayerPrivate, PublicSnapshot } from '@/engine/types';
import { LIMITS } from '@/engine/types';
import { useDraft } from '@/hooks/useDraft';
import { useGame, type UseGame } from '@/hooks/useGame';
import { api } from '@/lib/api';
import { charLength } from '@/lib/text';

export function PlayerScreen({ code }: { code: string }) {
  const game = useGame(code, 'player');
  const { status, snapshot, me, connection, error, clearError } = game;
  const router = useRouter();

  useEffect(() => {
    if (status === 'no-session') router.replace(`/join?code=${encodeURIComponent(code)}`);
  }, [status, code, router]);

  if (status === 'not-found') {
    return (
      <Shell width="sm">
        <Center title="No game with that code" body="Check with your host. Games last 24 hours.">
          <Link href="/join" className="font-semibold text-brand underline">
            Try another code
          </Link>
        </Center>
      </Shell>
    );
  }
  if (status === 'kicked') {
    return (
      <Shell width="sm">
        <Center title="The host removed you from this game" body="Thanks for playing.">
          <Link href="/" className="font-semibold text-brand underline">
            Home
          </Link>
        </Center>
      </Shell>
    );
  }
  if (!snapshot || !me || status !== 'ready') {
    return (
      <Shell width="sm">
        <p className="mt-12 text-center text-muted" aria-live="polite">
          {status === 'no-session' ? 'Taking you to the join screen…' : 'Loading…'}
        </p>
      </Shell>
    );
  }

  return (
    <Shell
      width="sm"
      right={
        <>
          <ConnectionDot connection={connection} />
          <span className="text-sm font-semibold text-muted">{me.name}</span>
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
        {snapshot.phase === 'LOBBY' && <Lobby game={game} snapshot={snapshot} me={me} />}
        {snapshot.phase === 'WRITING' && <Writing game={game} snapshot={snapshot} me={me} />}
        {snapshot.phase === 'REVIEW' && (
          <div className="flex flex-col items-center gap-6 text-center">
            <WordHeader
              word={snapshot.word ?? ''}
              roundIndex={snapshot.roundIndex ?? 0}
              totalRounds={snapshot.totalRounds}
              size="sm"
            />
            <p className="text-lg font-semibold" aria-live="polite">
              Everyone&rsquo;s in. The host is shuffling the cards.
            </p>
            <Shuffle />
          </div>
        )}
        {snapshot.phase === 'VOTING' && <Voting game={game} snapshot={snapshot} me={me} />}
        {snapshot.phase === 'REVEAL' && <Reveal snapshot={snapshot} me={me} />}
        {snapshot.phase === 'SCOREBOARD' && (
          <div className="flex flex-col gap-4">
            <header className="text-center">
              <p className="text-sm font-semibold text-muted">
                After word {(snapshot.roundIndex ?? 0) + 1} of {snapshot.totalRounds}
              </p>
              <h1 className="text-3xl font-extrabold tracking-tight">Scoreboard</h1>
            </header>
            <Scoreboard
              players={snapshot.players}
              gained={snapshot.gained}
              highlightId={me.playerId}
            />
            <p className="text-center text-sm text-muted">Waiting for the host.</p>
          </div>
        )}
        {snapshot.phase === 'FINISHED' && (
          <div className="flex flex-col gap-4">
            <header className="text-center">
              <p className="text-sm font-semibold text-muted">Final results</p>
              <WinnerLine snapshot={snapshot} />
            </header>
            <Scoreboard
              players={snapshot.players}
              gained={null}
              showGain={false}
              highlightId={me.playerId}
            />
            <Link href="/" className="mt-2 text-center font-semibold text-brand underline">
              Home
            </Link>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Center({
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

function Shuffle() {
  return (
    <div className="relative h-24 w-40" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="index-card absolute inset-x-0 top-0 h-20 !p-0"
          style={{
            transform: `rotate(${(i - 1) * 6}deg) translateY(${i * 3}px)`,
            opacity: 1 - i * 0.2,
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Lobby({
  game,
  snapshot,
  me,
}: {
  game: UseGame;
  snapshot: PublicSnapshot;
  me: PlayerPrivate;
}) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const leave = async () => {
    setLeaving(true);
    await api.post(`/api/games/${game.code}/leave`);
    router.push('/');
  };
  return (
    <div className="flex flex-col gap-6 text-center">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">You&rsquo;re in, {me.name}.</h1>
        <p className="mt-1 text-muted" aria-live="polite">
          Waiting for the host to start.
        </p>
      </div>
      <div className="rounded-2xl border-2 border-line bg-panel p-4 text-left">
        <p className="text-sm font-semibold text-muted">In the room · {snapshot.players.length}</p>
        <StatusChips players={snapshot.players} highlightId={me.playerId} className="mt-2" />
      </div>
      <p className="text-sm text-muted">
        Keep this tab open. You&rsquo;ll get {snapshot.totalRounds}{' '}
        {snapshot.totalRounds === 1 ? 'word' : 'words'} to bluff on.
      </p>
      <Button variant="ghost" onClick={leave} busy={leaving}>
        Leave game
      </Button>
    </div>
  );
}

function Writing({
  game,
  snapshot,
  me,
}: {
  game: UseGame;
  snapshot: PublicSnapshot;
  me: PlayerPrivate;
}) {
  const { draft, setDraft, clearDraft } = useDraft(
    game.code,
    snapshot.roundIndex,
    me.mySubmission ?? '',
  );
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const len = charLength(draft.trim());
  const valid = len >= LIMITS.submission.min && len <= LIMITS.submission.max;
  const submitted = me.mySubmission !== null && !editing;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    const r = await game.act({ type: 'SUBMIT', text: draft });
    setBusy(false);
    if (r.ok) {
      setEditing(false);
      clearDraft();
    }
  };

  const done = snapshot.players.filter((p) => p.status === 'submitted').length;

  return (
    <div className="flex flex-col gap-6">
      <WordHeader
        word={snapshot.word ?? ''}
        roundIndex={snapshot.roundIndex ?? 0}
        totalRounds={snapshot.totalRounds}
        size="sm"
      />
      {submitted ? (
        <>
          <IndexCard
            text={me.mySubmission ?? ''}
            corner={<span className="font-bold text-good">✓ Submitted</span>}
            ariaLabel="Your submitted definition"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-muted" aria-live="polite">
              Waiting on everyone else · {done} of {snapshot.players.length} in
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                setDraft(me.mySubmission ?? '');
                setEditing(true);
              }}
            >
              Edit
            </Button>
          </div>
          <StatusChips players={snapshot.players} done="submitted" highlightId={me.playerId} />
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="flex flex-col gap-4"
        >
          <TextArea
            label="Your definition"
            handwriting
            counter={LIMITS.submission.max}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Make it sound like a dictionary wrote it. If you know the real one, write that."
            maxLength={LIMITS.submission.max * 2}
            autoFocus
            rows={4}
            error={
              len > LIMITS.submission.max
                ? `Keep it under ${LIMITS.submission.max} characters.`
                : null
            }
          />
          <Button type="submit" size="lg" full disabled={!valid} busy={busy}>
            {me.mySubmission !== null ? 'Save changes' : 'Submit definition'}
          </Button>
          {me.mySubmission !== null ? (
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          ) : null}
        </form>
      )}
    </div>
  );
}

function Voting({
  game,
  snapshot,
  me,
}: {
  game: UseGame;
  snapshot: PublicSnapshot;
  me: PlayerPrivate;
}) {
  const marked = (snapshot.markedIds ?? []).includes(me.playerId);
  const options = snapshot.options ?? [];
  const [pending, setPending] = useState<string | null>(null);

  const vote = async (optionId: string) => {
    if (optionId === me.myOptionId || pending) return;
    setPending(optionId);
    await game.act({ type: 'VOTE', optionId });
    setPending(null);
  };

  if (marked) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <WordHeader
          word={snapshot.word ?? ''}
          roundIndex={snapshot.roundIndex ?? 0}
          totalRounds={snapshot.totalRounds}
          size="sm"
        />
        <p className="text-2xl font-extrabold text-good">★ You knew the real definition.</p>
        <p className="text-muted">That&rsquo;s 3 points. Sit back while the others guess.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <WordHeader
        word={snapshot.word ?? ''}
        roundIndex={snapshot.roundIndex ?? 0}
        totalRounds={snapshot.totalRounds}
        size="sm"
      />
      <h2 className="text-center text-lg font-extrabold">Which one is the real definition?</h2>
      <ul className="flex flex-col gap-4" aria-label="Definitions">
        {options.map((o) => {
          const mine = o.id === me.myOptionId;
          const picked = o.id === me.myVote;
          return (
            <li key={o.id}>
              <IndexCard
                as="button"
                text={o.text}
                letter={o.letter}
                hover
                picked={picked}
                disabled={mine}
                onClick={() => void vote(o.id)}
                ariaLabel={`Card ${o.letter}: ${o.text}${mine ? '. Yours, can’t vote for it' : picked ? '. Your vote' : ''}`}
                ariaPressed={picked}
                corner={
                  mine ? (
                    <span>Yours, can&rsquo;t vote for it</span>
                  ) : picked ? (
                    <span className="font-bold text-brand">Your vote</span>
                  ) : null
                }
              />
            </li>
          );
        })}
      </ul>
      <p className="text-center text-sm font-semibold text-muted" aria-live="polite">
        {me.myVote ? 'Vote locked in. Tap another card to change it.' : 'Tap a card to vote.'}
      </p>
    </div>
  );
}

function Reveal({ snapshot, me }: { snapshot: PublicSnapshot; me: PlayerPrivate }) {
  const reveal = snapshot.reveal;
  if (!reveal) return null;
  const mine = snapshot.gained?.[me.playerId] ?? 0;
  return (
    <div className="flex flex-col gap-5">
      <WordHeader
        word={snapshot.word ?? ''}
        roundIndex={snapshot.roundIndex ?? 0}
        totalRounds={snapshot.totalRounds}
        size="sm"
      />
      <p
        className={`text-center text-2xl font-extrabold ${mine > 0 ? 'text-good' : 'text-muted'}`}
        aria-live="polite"
      >
        {mine > 0 ? `+${mine} for you this round` : 'No points this round'}
      </p>
      <RevealCards
        options={snapshot.options ?? []}
        reveal={reveal}
        players={snapshot.players}
        meId={me.playerId}
      />
    </div>
  );
}

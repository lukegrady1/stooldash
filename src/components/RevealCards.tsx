'use client';
import { useEffect, useState } from 'react';
import type { PublicOption, PublicPlayer, RevealInfo } from '@/engine/types';
import { IndexCard } from './IndexCard';

export interface RevealCardsProps {
  options: PublicOption[];
  reveal: RevealInfo;
  players: PublicPlayer[];
  /** The viewing player's id (for "you" labelling), or null for the host. */
  meId?: string | null;
  /** Skip the flip animation (also skipped automatically under reduced motion). */
  animate?: boolean;
}

function nameList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0] as string;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The reveal: real card highlighted, fakes labelled with author, voters and a "fooled N" pill. */
export function RevealCards({
  options,
  reveal,
  players,
  meId = null,
  animate = true,
}: RevealCardsProps) {
  const [motion, setMotion] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setMotion(animate && !reduced);
  }, [animate]);

  const nameOf = (id: string) => {
    const p = players.find((x) => x.id === id);
    if (!p) return 'Someone';
    return id === meId ? 'you' : p.name;
  };
  const votersFor = (optionId: string) =>
    Object.entries(reveal.votes)
      .filter(([, o]) => o === optionId)
      .map(([voter]) => nameOf(voter));

  return (
    <ul className="flex flex-col gap-4" aria-label="Revealed definitions">
      {options.map((o, i) => {
        const isReal = o.id === reveal.realOptionId;
        const authorId = reveal.authors[o.id];
        const voters = votersFor(o.id);
        const fooled = voters.length;
        const label = isReal
          ? `Card ${o.letter}, the real definition. ${voters.length ? `Found by ${nameList(voters)}.` : 'Nobody found it.'}`
          : `Card ${o.letter}, written by ${authorId ? nameOf(authorId) : 'unknown'}. ${fooled ? `Fooled ${fooled}: ${nameList(voters)}.` : 'Fooled nobody.'}`;
        return (
          <li
            key={o.id}
            className={motion ? 'reveal-flip' : undefined}
            style={motion ? { animationDelay: `${i * 150}ms` } : undefined}
          >
            <IndexCard
              text={o.text}
              letter={o.letter}
              highlight={isReal}
              ariaLabel={label}
              corner={isReal ? <span className="font-bold text-good">Real definition</span> : null}
              footer={
                isReal ? (
                  <p className="text-muted">
                    {voters.length ? (
                      <>
                        Found by <span className="font-semibold text-good">{nameList(voters)}</span>
                      </>
                    ) : (
                      'Nobody found it'
                    )}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
                    <span>
                      Written by{' '}
                      <span className="font-semibold text-card-ink">
                        {authorId ? nameOf(authorId) : 'unknown'}
                      </span>
                    </span>
                    {fooled > 0 ? (
                      <>
                        <span className="fooled-pill">fooled {fooled}</span>
                        <span>Picked by {nameList(voters)}</span>
                      </>
                    ) : (
                      <span>Fooled nobody</span>
                    )}
                  </div>
                )
              }
            />
          </li>
        );
      })}
    </ul>
  );
}

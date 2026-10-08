import Link from 'next/link';
import { ResumeHosting } from '@/components/ResumeHosting';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-10 px-4 py-12 text-center">
      <div>
        <p className="mb-3 text-sm font-semibold text-muted">A party game for 2 to 16 phones</p>
        <h1 className="word-display">Balderdash</h1>
        <p className="mt-4 text-lg text-muted">
          Make up a definition. Fool your friends. Spot the real one.
        </p>
      </div>
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Link
          href="/host/new"
          className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-brand px-6 text-lg font-semibold text-brand-ink shadow-[0_2px_0_rgb(0_0_0/0.12)]"
        >
          Host a game
        </Link>
        <Link
          href="/join"
          className="inline-flex min-h-14 items-center justify-center rounded-2xl border-2 border-line bg-panel px-6 text-lg font-semibold"
        >
          Join a game
        </Link>
      </div>
      <ResumeHosting />
      <ol className="mt-4 grid w-full gap-3 text-left text-sm text-muted sm:grid-cols-3">
        <li className="rounded-xl border-2 border-line bg-panel p-3">
          <span className="font-extrabold text-ink">1.</span> The host types in obscure words.
        </li>
        <li className="rounded-xl border-2 border-line bg-panel p-3">
          <span className="font-extrabold text-ink">2.</span> Everyone writes a fake definition.
        </li>
        <li className="rounded-xl border-2 border-line bg-panel p-3">
          <span className="font-extrabold text-ink">3.</span> Vote for the real one. Fool people for
          points.
        </li>
      </ol>
    </main>
  );
}

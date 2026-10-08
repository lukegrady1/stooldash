import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-10 px-4 py-12 text-center">
      <div>
        <h1 className="word-display">Balderdash</h1>
        <p className="mt-4 text-lg text-muted">
          Make up a definition. Fool your friends. Spot the real one.
        </p>
      </div>
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Link
          href="/host/new"
          className="inline-flex min-h-14 items-center justify-center rounded-xl bg-brand px-6 text-lg font-semibold text-brand-ink"
        >
          Host a game
        </Link>
        <Link
          href="/join"
          className="inline-flex min-h-14 items-center justify-center rounded-xl border-2 border-line bg-panel px-6 text-lg font-semibold"
        >
          Join a game
        </Link>
      </div>
    </main>
  );
}

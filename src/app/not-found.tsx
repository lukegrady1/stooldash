import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-3xl font-extrabold">Nothing here</h1>
      <p className="text-muted">That page doesn&rsquo;t exist.</p>
      <Link href="/" className="font-semibold text-brand underline">
        Home
      </Link>
    </main>
  );
}

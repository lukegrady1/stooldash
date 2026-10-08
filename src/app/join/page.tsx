import { Suspense } from 'react';
import { JoinForm } from '@/components/player/JoinForm';
import { Shell } from '@/components/Shell';

export const metadata = { title: 'Join a game · Balderdash' };

export default function JoinPage() {
  return (
    <Shell width="sm">
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Join a game</h1>
      <p className="mt-1 text-muted">Ask your host for the 4-letter code.</p>
      <Suspense>
        <JoinForm />
      </Suspense>
    </Shell>
  );
}

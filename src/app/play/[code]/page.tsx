import { notFound } from 'next/navigation';
import { PlayerScreen } from '@/components/player/PlayerScreen';

export const metadata = { title: 'Play · Balderdash' };

export default async function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) notFound();
  return <PlayerScreen code={code} />;
}

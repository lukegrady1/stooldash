import { notFound } from 'next/navigation';
import { HostScreen } from '@/components/host/HostScreen';

export const metadata = { title: 'Host · Balderdash' };

export default async function HostGamePage({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) notFound();
  return <HostScreen code={code} />;
}

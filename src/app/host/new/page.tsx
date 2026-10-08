import { DeckEditor } from '@/components/host/DeckEditor';
import { Shell } from '@/components/Shell';

export const metadata = { title: 'Host a game · Balderdash' };

export default function NewGamePage() {
  return (
    <Shell width="md">
      <DeckEditor />
    </Shell>
  );
}

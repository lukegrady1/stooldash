'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { LIMITS } from '@/engine/types';
import { api } from '@/lib/api';
import { local } from '@/lib/storage';

const NAME_KEY = 'bd-name';

export function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = params.get('code');
    if (fromUrl) setCode(fromUrl.toUpperCase().slice(0, 4));
    setName(local.get<string>(NAME_KEY, ''));
  }, [params]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setCodeError(null);
    setNameError(null);
    const c = code.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(c)) {
      setCodeError('Codes are 4 letters.');
      return;
    }
    if (!name.trim()) {
      setNameError('Pick a name.');
      return;
    }
    setBusy(true);
    const r = await api.post<{ playerId: string }>(`/api/games/${c}/join`, { name });
    setBusy(false);
    if (r.ok) {
      local.set(NAME_KEY, name.trim());
      router.push(`/play/${c}`);
      return;
    }
    switch (r.error.code) {
      case 'NOT_FOUND':
        setCodeError('No game with that code. Check with your host.');
        break;
      case 'NAME_TAKEN':
        setNameError("That name's taken in this game.");
        break;
      case 'NAME_INVALID':
        setNameError('Names are 1 to 16 characters.');
        break;
      case 'GAME_FULL':
        setCodeError('This game is full.');
        break;
      case 'WRONG_PHASE':
        setCodeError('That game has already finished.');
        break;
      default:
        setCodeError(r.error.message);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 flex flex-col gap-5" noValidate>
      <TextField
        label="Game code"
        value={code}
        onChange={(e) =>
          setCode(
            e.target.value
              .toUpperCase()
              .replace(/[^A-Z]/g, '')
              .slice(0, 4),
          )
        }
        placeholder="KQWZ"
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        inputMode="text"
        maxLength={4}
        error={codeError}
        className="[&_input]:text-center [&_input]:text-3xl [&_input]:font-extrabold [&_input]:tracking-[0.3em] [&_input]:uppercase"
      />
      <TextField
        label="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="What should we call you?"
        maxLength={LIMITS.name.max}
        autoComplete="nickname"
        error={nameError}
      />
      <Button type="submit" size="lg" busy={busy} full>
        Join
      </Button>
    </form>
  );
}

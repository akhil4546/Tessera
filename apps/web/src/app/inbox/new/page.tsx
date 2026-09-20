'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { TesseraApiError } from '@tessera/api-client';
import { Button, TextField, Tile } from '@tessera/ui';
import { api } from '../../../lib/api';

export default function NewThreadPage() {
  const t = useTranslations();
  const router = useRouter();
  const [handles, setHandles] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const parts = handles
        .split(/[,\s]+/)
        .map((part) => part.replace(/^@/, '').trim())
        .filter(Boolean);
      if (parts.length === 0) throw new Error(t('inbox.toHint'));
      if (parts.length === 1) return api.createConversation({ handle: parts[0] });
      return api.createConversation({ handles: parts, title: title || undefined });
    },
    onSuccess: (conversation) => router.push(`/inbox/${conversation.id}`),
    onError: (err) => {
      setError(err instanceof TesseraApiError ? err.message : t('error.body'));
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    create.mutate();
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">{t('inbox.newThread')}</p>
      <Tile>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <TextField
            name="to"
            label={t('inbox.to')}
            hint={t('inbox.toHint')}
            value={handles}
            onChange={(e) => setHandles(e.target.value)}
            autoComplete="off"
          />
          <TextField
            name="title"
            label={t('inbox.groupName')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit" disabled={create.isPending}>
            {t('inbox.start')}
          </Button>
        </form>
      </Tile>
    </div>
  );
}

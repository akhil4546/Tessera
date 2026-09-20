'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { TesseraApiError } from '@tessera/api-client';
import type { PostVisibility } from '@tessera/types';
import { Button, TextField, Tile } from '@tessera/ui';
import { api } from '../lib/api';
import { AudienceFields } from './audience-fields';

type Draft = {
  file: File;
  preview: string;
  altText: string;
  durationMs: number;
  text: string;
  hashtag: string;
  location: string;
  pollPrompt: string;
  pollA: string;
  pollB: string;
  question: string;
};

export function CreateMoment({ onCancel }: { onCancel: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const [items, setItems] = useState<Draft[]>([]);
  const [active, setActive] = useState(0);
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [circleIds, setCircleIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const current = items[active];

  function onFiles(list: FileList | null) {
    if (!list) return;
    const next: Draft[] = Array.from(list).slice(0, 20).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      altText: '',
      durationMs: 5000,
      text: '',
      hashtag: '',
      location: '',
      pollPrompt: '',
      pollA: '',
      pollB: '',
      question: '',
    }));
    setItems(next);
    setActive(0);
  }

  function patch(partial: Partial<Draft>) {
    setItems((rows) => rows.map((row, i) => (i === active ? { ...row, ...partial } : row)));
  }

  async function publish() {
    setError(null);
    setPending(true);
    try {
      const segments = [];
      for (const item of items) {
        const kind = item.file.type.startsWith('video/') ? 'video' : 'image';
        const intent = await api.createMediaIntent({
          kind,
          mimeType: item.file.type || 'image/jpeg',
          byteSize: item.file.size,
          purpose: 'moment',
        });
        if (intent.driver === 'fs' || intent.localUploadPath) {
          await api.uploadMediaBytes(intent.id, await item.file.arrayBuffer(), item.file.type || 'image/jpeg');
        } else {
          await fetch(intent.uploadUrl, { method: 'PUT', headers: intent.headers, body: item.file });
        }
        let mediaRow = await api.completeMedia(intent.id);
        for (let i = 0; i < 20 && mediaRow.status === 'processing'; i += 1) {
          await new Promise((r) => setTimeout(r, 500));
          mediaRow = await api.getMedia(intent.id);
        }
        if (mediaRow.status === 'failed') throw new Error(mediaRow.processingError ?? 'Processing failed');
        const stickers = [];
        if (item.text.trim()) {
          stickers.push({
            kind: 'text',
            x: 0.5,
            y: 0.82,
            payload: { text: item.text.trim(), color: '#F4EDE3', align: 'center' },
          });
        }
        if (item.hashtag.trim()) {
          stickers.push({
            kind: 'hashtag',
            x: 0.22,
            y: 0.14,
            payload: { tag: item.hashtag.replace(/^#/, '') },
          });
        }
        if (item.location.trim()) {
          stickers.push({
            kind: 'location',
            x: 0.5,
            y: 0.12,
            payload: { name: item.location.trim() },
          });
        }
        if (item.pollPrompt.trim() && item.pollA.trim() && item.pollB.trim()) {
          stickers.push({
            kind: 'poll',
            x: 0.5,
            y: 0.62,
            payload: { prompt: item.pollPrompt.trim(), options: [item.pollA.trim(), item.pollB.trim()] },
          });
        }
        if (item.question.trim()) {
          stickers.push({
            kind: 'question',
            x: 0.5,
            y: 0.5,
            payload: { prompt: item.question.trim() },
          });
        }
        segments.push({
          mediaId: intent.id,
          durationMs: item.durationMs,
          altText: item.altText,
          stickers,
        });
      }
      await api.createMoment({
        segments,
        visibility,
        circleIds: visibility === 'circles' ? circleIds : undefined,
      });
      router.push('/');
    } catch (err) {
      setError(err instanceof TesseraApiError ? err.message : err instanceof Error ? err.message : 'Could not publish.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">{t('create.moment')}</h1>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
      {items.length === 0 ? (
        <Tile>
          <p className="text-sm text-text-secondary">{t('create.momentPick')}</p>
          <label className="mt-4 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-tile bg-accent px-4 text-sm font-medium text-text-inverse">
            {t('create.pick')}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
              multiple
              className="sr-only"
              onChange={(e) => onFiles(e.target.files)}
            />
          </label>
        </Tile>
      ) : (
        <>
          {current ? (
            <div className="overflow-hidden rounded-tile-lg bg-surface-muted">
              <img src={current.preview} alt="" className="mx-auto max-h-[420px] w-full object-contain" />
            </div>
          ) : null}
          <div className="flex gap-2 overflow-x-auto">
            {items.map((item, index) => (
              <button
                key={item.preview}
                type="button"
                className={`h-16 w-16 overflow-hidden rounded-tile border ${index === active ? 'border-accent' : 'border-border'}`}
                onClick={() => setActive(index)}
              >
                <img src={item.preview} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
          {current ? (
            <div className="grid gap-3">
              <label className="text-sm">
                {t('create.duration')}
                <input
                  type="range"
                  min={1000}
                  max={15000}
                  step={500}
                  value={current.durationMs}
                  className="w-full accent-[var(--tessera-accent)]"
                  onChange={(e) => patch({ durationMs: Number(e.target.value) })}
                />
                <span className="text-text-secondary">{current.durationMs / 1000}s</span>
              </label>
              <TextField
                name="alt"
                label={t('create.alt')}
                value={current.altText}
                onChange={(e) => patch({ altText: e.target.value })}
              />
              <TextField
                name="text"
                label={t('create.stickerText')}
                value={current.text}
                onChange={(e) => patch({ text: e.target.value })}
              />
              <TextField
                name="hashtag"
                label={t('create.stickerHashtag')}
                value={current.hashtag}
                onChange={(e) => patch({ hashtag: e.target.value })}
              />
              <TextField
                name="location"
                label={t('create.stickerLocation')}
                value={current.location}
                onChange={(e) => patch({ location: e.target.value })}
              />
              <TextField
                name="poll"
                label={t('create.pollPrompt')}
                value={current.pollPrompt}
                onChange={(e) => patch({ pollPrompt: e.target.value })}
              />
              {current.pollPrompt ? (
                <>
                  <TextField name="pollA" label={`${t('create.pollOption')} 1`} value={current.pollA} onChange={(e) => patch({ pollA: e.target.value })} />
                  <TextField name="pollB" label={`${t('create.pollOption')} 2`} value={current.pollB} onChange={(e) => patch({ pollB: e.target.value })} />
                </>
              ) : null}
              <TextField
                name="question"
                label={t('create.questionPrompt')}
                value={current.question}
                onChange={(e) => patch({ question: e.target.value })}
              />
            </div>
          ) : null}
          <fieldset className="flex gap-3">
            <AudienceFields
              visibility={visibility}
              onVisibility={setVisibility}
              circleIds={circleIds}
              onCircleIds={setCircleIds}
            />
          </fieldset>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="button" onClick={() => void publish()} disabled={pending}>
            {pending ? t('create.processing') : t('common.publish')}
          </Button>
        </>
      )}
    </div>
  );
}

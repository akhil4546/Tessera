'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FILTER_LIST } from '@tessera/media/filters';
import { ZERO_ADJUSTMENTS, adjustmentsToCss, type MediaAdjustments } from '@tessera/media/adjustments';
import type { AuthenticityKind, CropAspect, PostVisibility } from '@tessera/types';
import { Button, TextArea, TextField, Tile } from '@tessera/ui';
import { TesseraApiError } from '@tessera/api-client';
import { api } from '../lib/api';
import { AudienceFields, toScheduledIso } from './audience-fields';
import { CreateLoop } from './create-loop';
import { CreateMoment } from './create-moment';

type DraftItem = {
  file: File;
  preview: string;
  altText: string;
  crop: CropAspect;
  filterId: string;
  adjustments: MediaAdjustments;
};

const CROPS: CropAspect[] = ['original', 'square', 'portrait', 'landscape'];

export function CreatePost() {
  const t = useTranslations();
  const router = useRouter();
  const [kind, setKind] = useState<'post' | 'moment' | 'loop' | null>(null);
  const [step, setStep] = useState<'choose' | 'edit' | 'details'>('choose');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [active, setActive] = useState(0);
  const [caption, setCaption] = useState('');
  const [locationName, setLocationName] = useState('');
  const [authenticity, setAuthenticity] = useState<AuthenticityKind>('edited');
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [circleIds, setCircleIds] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [publicCounts, setPublicCounts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const current = items[active];
  const previewFilter = useMemo(() => {
    if (!current) return 'none';
    const named = FILTER_LIST.find((f) => f.id === current.filterId)?.css ?? '';
    return [named, adjustmentsToCss(current.adjustments)].filter(Boolean).join(' ');
  }, [current]);

  function onFiles(list: FileList | null) {
    if (!list) return;
    const next: DraftItem[] = [];
    for (const file of Array.from(list).slice(0, 10)) {
      next.push({
        file,
        preview: URL.createObjectURL(file),
        altText: '',
        crop: 'original',
        filterId: 'none',
        adjustments: { ...ZERO_ADJUSTMENTS },
      });
    }
    setItems(next);
    setActive(0);
    setStep('edit');
  }

  function patchActive(partial: Partial<DraftItem>) {
    setItems((rows) => rows.map((row, i) => (i === active ? { ...row, ...partial } : row)));
  }

  async function publish() {
    setError(null);
    setPending(true);
    try {
      const media = [];
      for (const item of items) {
        const kind = item.file.type.startsWith('video/') ? 'video' : 'image';
        const intent = await api.createMediaIntent({
          kind,
          mimeType: item.file.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
          byteSize: item.file.size,
          purpose: 'post',
        });
        if (intent.driver === 'fs' || intent.localUploadPath) {
          await api.uploadMediaBytes(intent.id, await item.file.arrayBuffer(), item.file.type || 'image/jpeg');
        } else {
          await fetch(intent.uploadUrl, {
            method: 'PUT',
            headers: intent.headers,
            body: item.file,
          });
        }
        let mediaRow = await api.completeMedia(intent.id);
        for (let i = 0; i < 20 && mediaRow.status === 'processing'; i += 1) {
          await new Promise((r) => setTimeout(r, 500));
          mediaRow = await api.getMedia(intent.id);
        }
        if (mediaRow.status === 'failed') {
          throw new Error(mediaRow.processingError ?? 'Processing failed');
        }
        media.push({
          id: intent.id,
          altText: item.altText,
          crop: item.crop,
          filterId: item.filterId,
          adjustments: item.adjustments,
        });
      }
      const edited = items.some(
        (item) => item.filterId !== 'none' || Object.values(item.adjustments).some((n) => n !== 0),
      );
      const declared = authenticity === 'unfiltered' && edited ? 'edited' : authenticity;
      const scheduled = toScheduledIso(scheduledAt);
      const post = await api.createPost({
        media,
        caption,
        locationName: locationName || null,
        authenticity: declared,
        visibility,
        circleIds: visibility === 'circles' ? circleIds : undefined,
        commentsEnabled,
        publicAppreciationCounts: publicCounts,
        scheduledAt: scheduled,
      });
      router.push(post.publishedAt ? `/p/${post.id}` : '/settings');
    } catch (err) {
      setError(err instanceof TesseraApiError ? err.message : err instanceof Error ? err.message : 'Could not publish.');
    } finally {
      setPending(false);
    }
  }

  if (kind === 'moment') {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">
          {t('common.phase')} · {t('nav.create')}
        </p>
        <CreateMoment onCancel={() => setKind(null)} />
      </div>
    );
  }

  if (kind === 'loop') {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">
          {t('common.phase')} · {t('nav.create')}
        </p>
        <CreateLoop onCancel={() => setKind(null)} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">
        {t('common.phase')} · {t('nav.create')}
      </p>
      {step === 'choose' ? (
        <>
          <h1 className="font-display text-2xl font-semibold text-text-primary">{t('create.choose')}</h1>
          <ul className="grid gap-3 sm:grid-cols-3">
            <li>
              <Tile>
                <p className="font-medium">{t('create.post')}</p>
                <p className="mt-1 text-sm text-text-secondary">{t('create.pick')}</p>
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
            </li>
            <li>
              <Tile>
                <p className="font-medium">{t('create.moment')}</p>
                <p className="mt-1 text-sm text-text-secondary">{t('create.momentHint')}</p>
                <Button type="button" className="mt-4" onClick={() => setKind('moment')}>
                  {t('create.momentPick')}
                </Button>
              </Tile>
            </li>
            <li>
              <Tile>
                <p className="font-medium">{t('create.loop')}</p>
                <p className="mt-1 text-sm text-text-secondary">{t('create.loopHint')}</p>
                <Button type="button" className="mt-4" onClick={() => setKind('loop')}>
                  {t('create.record')}
                </Button>
              </Tile>
            </li>
          </ul>
        </>
      ) : null}

      {step === 'edit' && current ? (
        <>
          <div className="overflow-hidden rounded-tile-lg bg-surface-muted">
            <img
              src={current.preview}
              alt=""
              className="mx-auto max-h-[480px] w-full object-contain"
              style={{ filter: previewFilter }}
            />
          </div>
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
          <div>
            <p className="mb-2 text-sm font-medium">{t('create.crop')}</p>
            <div className="flex flex-wrap gap-2">
              {CROPS.map((crop) => (
                <Button key={crop} type="button" variant={current.crop === crop ? 'primary' : 'secondary'} onClick={() => patchActive({ crop })}>
                  {crop === 'original'
                    ? t('create.cropOriginal')
                    : crop === 'square'
                      ? t('create.cropSquare')
                      : crop === 'portrait'
                        ? t('create.cropPortrait')
                        : t('create.cropLandscape')}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">{t('create.filters')}</p>
            <div className="flex gap-2 overflow-x-auto pb-2">
              <button
                type="button"
                className={`min-h-11 rounded-tile px-3 text-sm ${current.filterId === 'none' ? 'bg-accent text-text-inverse' : 'bg-surface-muted'}`}
                onClick={() => patchActive({ filterId: 'none' })}
              >
                {t('create.none')}
              </button>
              {FILTER_LIST.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={`min-h-11 rounded-tile px-3 text-sm ${current.filterId === filter.id ? 'bg-accent text-text-inverse' : 'bg-surface-muted'}`}
                  onClick={() => patchActive({ filterId: filter.id })}
                >
                  {filter.name}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ['brightness', t('create.brightness')],
                ['contrast', t('create.contrast')],
                ['warmth', t('create.warmth')],
                ['saturation', t('create.saturation')],
                ['fade', t('create.fade')],
                ['vignette', t('create.vignette')],
                ['sharpen', t('create.sharpen')],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-sm">
                {label}
                <input
                  type="range"
                  min={key === 'fade' || key === 'vignette' || key === 'sharpen' ? 0 : -100}
                  max={100}
                  value={current.adjustments[key]}
                  className="w-full accent-[var(--tessera-accent)]"
                  onChange={(e) =>
                    patchActive({ adjustments: { ...current.adjustments, [key]: Number(e.target.value) } })
                  }
                />
              </label>
            ))}
          </div>
          <TextArea
            name="alt"
            label={t('create.alt')}
            hint={t('create.altHint')}
            value={current.altText}
            onChange={(e) => patchActive({ altText: e.target.value })}
          />
          <Button type="button" onClick={() => setStep('details')}>
            {t('create.next')}
          </Button>
        </>
      ) : null}

      {step === 'details' ? (
        <div className="flex flex-col gap-4">
          <TextArea name="caption" label={t('create.caption')} hint={t('create.captionHint')} value={caption} onChange={(e) => setCaption(e.target.value)} />
          <TextField name="location" label={t('create.location')} value={locationName} onChange={(e) => setLocationName(e.target.value)} />
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{t('create.authenticity')}</legend>
            {(
              [
                ['unfiltered', t('create.unfiltered')],
                ['edited', t('create.edited')],
                ['ai_generated', t('create.ai')],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="authenticity"
                  checked={authenticity === value}
                  onChange={() => setAuthenticity(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <AudienceFields
            visibility={visibility}
            onVisibility={setVisibility}
            circleIds={circleIds}
            onCircleIds={setCircleIds}
            scheduledAt={scheduledAt}
            onScheduledAt={setScheduledAt}
          />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={commentsEnabled} onChange={(e) => setCommentsEnabled(e.target.checked)} />
            {t('create.commentsOn')}
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={publicCounts} onChange={(e) => setPublicCounts(e.target.checked)} />
            <span>
              {t('create.publicCounts')}
              <span className="block text-text-secondary">{t('create.publicCountsHint')}</span>
            </span>
          </label>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => void publish()} disabled={pending}>
              {pending ? t('create.processing') : t('common.publish')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                void api
                  .createDraft({
                    kind: 'post',
                    payload: { caption, locationName, authenticity, visibility, circleIds, scheduledAt },
                  })
                  .then(() => setError(t('create.draftSaved')))
                  .catch((err) => setError(err instanceof TesseraApiError ? err.message : t('error.body')));
              }}
            >
              {t('create.saveDraft')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

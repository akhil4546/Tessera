'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QUICK_EMOJIS, type MomentAuthorReel, type MomentCard, type ReelShelfDetail } from '@tessera/types';
import { TesseraApiError } from '@tessera/api-client';
import { Button } from '@tessera/ui';
import { api } from '../lib/api';
import { mediaSrc } from '../lib/media';

export function MomentViewer({
  handle,
  neighbours,
  onClose,
  onSwitch,
  shelfId,
}: {
  handle: string;
  neighbours?: string[];
  onClose: () => void;
  onSwitch?: (handle: string) => void;
  shelfId?: string;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const reel = useQuery({
    queryKey: shelfId ? ['shelf', handle, shelfId] : ['moments', 'author', handle],
    queryFn: async (): Promise<MomentAuthorReel | ReelShelfDetail> =>
      shelfId ? api.getReelShelf(handle, shelfId) : api.momentAuthorReel(handle),
  });
  const moments: MomentCard[] = useMemo(() => {
    if (!reel.data) return [];
    if ('moments' in reel.data) return reel.data.moments;
    return reel.data.items.map((item) => item.moment);
  }, [reel.data]);

  const [index, setIndex] = useState(0);
  const [seg, setSeg] = useState(0);
  const [paused, setPaused] = useState(false);
  const [keepTitle, setKeepTitle] = useState('Kept light');
  const [keepOpen, setKeepOpen] = useState(false);
  const [replyHint, setReplyHint] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const moment = moments[index];
  const segment = moment?.segments[seg];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['moments'] });
    void queryClient.invalidateQueries({ queryKey: ['shelf'] });
  };

  const view = useMutation({
    mutationFn: () => api.viewMomentSegment(moment!.id, segment!.id),
    onSuccess: invalidate,
  });
  const react = useMutation({
    mutationFn: (emoji: string) => api.reactToMoment(moment!.id, segment!.id, emoji),
    onSuccess: invalidate,
  });
  const keep = useMutation({
    mutationFn: () => api.keepMoment(moment!.id, { title: keepTitle }),
    onSuccess: () => {
      setKeepOpen(false);
      invalidate();
    },
  });

  const goNext = useCallback(() => {
    if (!moment) return;
    if (seg + 1 < moment.segments.length) {
      setSeg(seg + 1);
      return;
    }
    if (index + 1 < moments.length) {
      setIndex(index + 1);
      setSeg(0);
      return;
    }
    const nextHandle = neighbours ? neighbours[neighbours.indexOf(handle) + 1] : undefined;
    if (nextHandle && onSwitch) {
      onSwitch(nextHandle);
      return;
    }
    onClose();
  }, [handle, index, moment, moments.length, neighbours, onClose, onSwitch, seg]);

  const goPrev = useCallback(() => {
    if (seg > 0) {
      setSeg(seg - 1);
      return;
    }
    if (index > 0) {
      const prev = moments[index - 1];
      setIndex(index - 1);
      setSeg(Math.max(0, (prev?.segments.length ?? 1) - 1));
      return;
    }
    const prevHandle = neighbours ? neighbours[neighbours.indexOf(handle) - 1] : undefined;
    if (prevHandle && onSwitch) onSwitch(prevHandle);
  }, [handle, index, moments, neighbours, onSwitch, seg]);

  useEffect(() => {
    setIndex(0);
    setSeg(0);
  }, [handle, shelfId]);

  useEffect(() => {
    if (moment && segment && !segment.viewedByMe) {
      view.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment?.id, segment?.id]);

  useEffect(() => {
    if (!segment || paused) return;
    timer.current = setTimeout(goNext, segment.durationMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [goNext, paused, segment]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') goNext();
      if (event.key === 'ArrowLeft') goPrev();
      if (event.key === ' ') {
        event.preventDefault();
        setPaused((value) => !value);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, onClose]);

  if (reel.isLoading) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-text-primary/80 text-surface">
        {t('common.loading')}
      </div>
    );
  }
  if (!moment || !segment) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-text-primary/80">
        <Button type="button" onClick={onClose}>
          {t('moment.close')}
        </Button>
      </div>
    );
  }

  const src = mediaSrc(segment.media.srcset.at(-1)?.webp);
  const bars = moment.segments.map((item, i) => (
    <span
      key={item.id}
      className={`h-1 flex-1 rounded-full ${i < seg ? 'bg-surface' : i === seg ? 'bg-accent' : 'bg-surface/30'}`}
    />
  ));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/85 p-4">
      <div className="relative flex h-[min(90vh,720px)] w-full max-w-md flex-col overflow-hidden rounded-tile-lg bg-text-primary text-surface">
        <div className="flex gap-1 p-3">{bars}</div>
        <div
          className="relative min-h-0 flex-1"
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerLeave={() => setPaused(false)}
        >
          {src ? <img src={src} alt={segment.media.altText} className="h-full w-full object-contain" /> : null}
          <button type="button" aria-label={t('moment.previous')} className="absolute inset-y-0 left-0 w-1/3" onClick={goPrev} />
          <button type="button" aria-label={t('moment.next')} className="absolute inset-y-0 right-0 w-1/3" onClick={goNext} />
          {segment.stickers.map((sticker) => (
            <div
              key={sticker.id}
              className="pointer-events-auto absolute max-w-[70%] rounded-tile bg-text-primary/70 px-2 py-1 text-sm"
              style={{
                left: `${sticker.x * 100}%`,
                top: `${sticker.y * 100}%`,
                transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg) scale(${sticker.scale})`,
              }}
            >
              {sticker.kind === 'text' ? String(sticker.payload.text ?? '') : null}
              {sticker.kind === 'hashtag' ? `#${String(sticker.payload.tag ?? '')}` : null}
              {sticker.kind === 'mention' ? `@${String(sticker.payload.handle ?? '')}` : null}
              {sticker.kind === 'location' ? String(sticker.payload.name ?? '') : null}
              {sticker.kind === 'link' ? String(sticker.payload.label ?? sticker.payload.url ?? '') : null}
              {sticker.kind === 'countdown' ? String(sticker.payload.endsAt ?? '') : null}
              {sticker.kind === 'poll' ? (
                <div className="flex flex-col gap-1">
                  <p>{String(sticker.payload.prompt ?? '')}</p>
                  {Array.isArray(sticker.payload.options)
                    ? sticker.payload.options.map((option, optionIndex) => (
                        <button
                          key={String(option)}
                          type="button"
                          className="rounded-tile bg-surface/20 px-2 py-1 text-left"
                          onClick={() =>
                            void api.respondToSticker(moment.id, sticker.id, { optionIndex }).then(invalidate)
                          }
                        >
                          {String(option)}
                          {sticker.summary && Array.isArray((sticker.summary as { options?: { votes: number }[] }).options)
                            ? ` · ${(sticker.summary as { options: { votes: number }[] }).options[optionIndex]?.votes ?? 0}`
                            : ''}
                        </button>
                      ))
                    : null}
                </div>
              ) : null}
              {sticker.kind === 'question' ? (
                <form
                  className="flex flex-col gap-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void api.respondToSticker(moment.id, sticker.id, { text: answer }).then(() => {
                      setAnswer('');
                      invalidate();
                    });
                  }}
                >
                  <p>{String(sticker.payload.prompt ?? '')}</p>
                  <input
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    className="rounded-tile bg-surface/20 px-2 py-1 text-surface"
                    placeholder={t('moment.answerHint')}
                  />
                  <button type="submit">{t('moment.answer')}</button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 p-3">
          <p className="text-sm font-medium">@{moment.author.handle}</p>
          <button type="button" className="min-h-11 px-2" onClick={onClose}>
            {t('moment.close')}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 px-3 pb-3">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={`min-h-11 rounded-tile px-3 ${segment.reaction.mine === emoji ? 'bg-accent' : 'bg-surface/15'}`}
              onClick={() => react.mutate(emoji)}
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            className="min-h-11 rounded-tile bg-surface/15 px-3"
            onClick={async () => {
              try {
                const conversation = await api.replyToMoment(moment.id);
                window.location.href = `/inbox/${conversation.id}`;
              } catch (err) {
                setReplyHint(err instanceof TesseraApiError ? err.message : t('moment.replySoon'));
              }
            }}
          >
            {t('moment.reply')}
          </button>
          {moment.viewer.canKeep ? (
            <button type="button" className="min-h-11 rounded-tile bg-moss px-3" onClick={() => setKeepOpen(true)}>
              {t('moment.keep')}
            </button>
          ) : null}
        </div>
        {replyHint ? <p className="px-3 pb-3 text-sm text-surface/80">{replyHint}</p> : null}
        {keepOpen ? (
          <div className="flex gap-2 px-3 pb-4">
            <input
              value={keepTitle}
              onChange={(e) => setKeepTitle(e.target.value)}
              className="min-h-11 flex-1 rounded-tile bg-surface/15 px-3 text-surface"
              aria-label={t('create.shelfTitle')}
            />
            <Button type="button" onClick={() => keep.mutate()} disabled={keep.isPending}>
              {t('create.keep')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

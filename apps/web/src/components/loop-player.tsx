'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  APPRECIATION_TYPES,
  appreciationMeta,
  type AppreciationType,
  type PostCard,
  type WellbeingView,
} from '@tessera/types';
import { Button, EmptyState, TextField } from '@tessera/ui';
import { TesseraApiError } from '@tessera/api-client';
import { api } from '../lib/api';
import { attachHls } from '../lib/hls';
import { mediaSrc } from '../lib/media';

function LoopSlide({
  post,
  active,
  warm,
  muted,
  captionsOn,
  onEnded,
}: {
  post: PostCard;
  active: boolean;
  warm: boolean;
  muted: boolean;
  captionsOn: boolean;
  onEnded: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const media = post.media[0];
  const overlays = post.loop?.overlays ?? [];

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !warm) return;
    let stop: () => void = () => undefined;
    void attachHls(el, media?.hlsUrl).then((dispose) => {
      stop = dispose;
      if (active) void el.play().catch(() => undefined);
    });
    return () => stop();
  }, [media?.hlsUrl, active, warm]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = muted;
    const captionTrack = el.textTracks[0];
    if (captionTrack) {
      captionTrack.mode = captionsOn && post.loop?.captionsUrl ? 'showing' : 'disabled';
    }
    if (active) void el.play().catch(() => undefined);
    else el.pause();
  }, [active, captionsOn, muted, post.loop?.captionsUrl]);

  return (
    <div className="relative flex h-[min(92vh,820px)] w-full max-w-[420px] snap-start items-center justify-center overflow-hidden rounded-tile-lg bg-ink">
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        playsInline
        loop
        muted={muted}
        poster={mediaSrc(media?.posterUrl)}
        onEnded={onEnded}
        aria-label={media?.altText || post.caption || 'Loop'}
      >
        <track
          kind="captions"
          src={post.loop?.captionsUrl ? mediaSrc(post.loop.captionsUrl) : undefined}
          srcLang="en"
          label="Captions"
        />
      </video>
      {overlays.map((overlay) => {
        const show = true;
        if (!show) return null;
        return (
          <p
            key={`${overlay.text}-${overlay.x}-${overlay.y}`}
            className="pointer-events-none absolute max-w-[80%] text-center font-display text-2xl text-sand drop-shadow"
            style={{
              left: `${overlay.x * 100}%`,
              top: `${overlay.y * 100}%`,
              transform: `translate(-50%, -50%) rotate(${overlay.rotation}deg) scale(${overlay.scale})`,
              color: overlay.color,
            }}
          >
            {overlay.text}
          </p>
        );
      })}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-sand">
        <Link href={`/u/${post.author.handle}`} className="font-medium">
          @{post.author.handle}
        </Link>
        {post.caption ? <p className="mt-1 text-sm">{post.caption}</p> : null}
        {post.loop?.audio ? (
          <p className="mt-2 text-xs uppercase tracking-[0.14em] text-sand/80">
            Original audio · {post.loop.audio.title} · @{post.loop.audio.author.handle}
          </p>
        ) : (
          <p className="mt-2 text-xs uppercase tracking-[0.14em] text-sand/80">Original audio</p>
        )}
      </div>
    </div>
  );
}

export function LoopPlayer({ startId }: { startId?: string }) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const watchTick = useRef<ReturnType<typeof setInterval> | null>(null);

  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.getMe();
      } catch (err) {
        if (err instanceof TesseraApiError && err.status === 401) return null;
        throw err;
      }
    },
  });

  const feed = useQuery({
    queryKey: ['loops', 'feed'],
    queryFn: () => api.loopsFeed({ limit: 8 }),
    enabled: Boolean(me.data),
  });

  const [wellbeing, setWellbeing] = useState<WellbeingView | null>(null);
  const wellbeingSource = feed.data?.wellbeing;
  const [seenWellbeing, setSeenWellbeing] = useState(wellbeingSource);
  if (wellbeingSource && wellbeingSource !== seenWellbeing) {
    setSeenWellbeing(wellbeingSource);
    setWellbeing(wellbeingSource);
  }

  const items = useMemo(() => feed.data?.items ?? [], [feed.data?.items]);
  const startKey =
    startId && items.length > 0 ? `${startId}:${items.map((item) => item.id).join(',')}` : null;
  const [appliedStart, setAppliedStart] = useState<string | null>(null);
  if (startKey && appliedStart !== startKey) {
    setAppliedStart(startKey);
    const at = items.findIndex((item) => item.id === startId);
    if (at >= 0) setIndex(at);
  }

  const current = items[index];
  const reduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const appreciate = useMutation({
    mutationFn: (input: { id: string; type: AppreciationType }) => {
      const post = items.find((row) => row.id === input.id);
      return post?.appreciation.mine === input.type
        ? api.unappreciate(input.id)
        : api.appreciate(input.id, input.type);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['loops'] }),
  });

  const comments = useQuery({
    queryKey: ['comments', commentsFor],
    queryFn: () => api.listComments(commentsFor!),
    enabled: Boolean(commentsFor),
  });

  const sendComment = useMutation({
    mutationFn: () => api.createComment(commentsFor!, draft),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: ['comments', commentsFor] });
    },
  });

  useEffect(() => {
    if (!current || wellbeing?.paused) return;
    watchTick.current = setInterval(() => {
      void api
        .watchLoop(current.id, 5)
        .then(setWellbeing)
        .catch(() => undefined);
    }, 5000);
    return () => {
      if (watchTick.current) clearInterval(watchTick.current);
    };
  }, [current, wellbeing?.paused]);

  const go = useCallback(
    (next: number) => {
      if (next < 0 || next >= items.length) return;
      setIndex(next);
      const node = scroller.current?.children[next] as HTMLElement | undefined;
      node?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
    },
    [items.length, reduced],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowDown' || event.key === 'j') go(index + 1);
      if (event.key === 'ArrowUp' || event.key === 'k') go(index - 1);
      if (event.key === 'm') setMuted((v) => !v);
      if (event.key === 'c') setCaptionsOn((v) => !v);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index]);

  if (me.isLoading || feed.isLoading) {
    return <p className="text-text-secondary">{t('common.loading')}</p>;
  }
  if (!me.data) {
    return (
      <p className="text-text-secondary">
        <Link className="underline" href="/login">
          {t('nav.signIn')}
        </Link>
      </p>
    );
  }
  if (items.length === 0) {
    return <EmptyState title={t('empty.loops.title')} body={t('empty.loops.body')} />;
  }

  return (
    <div className="relative mx-auto flex max-w-5xl gap-6">
      <div
        ref={scroller}
        className="flex h-[min(92vh,820px)] snap-y snap-mandatory flex-col overflow-y-auto"
        onScroll={(event) => {
          const node = event.currentTarget;
          const i = Math.round(node.scrollTop / Math.max(node.clientHeight, 1));
          if (i !== index && i >= 0 && i < items.length) setIndex(i);
        }}
      >
        {items.map((post, i) => (
          <LoopSlide
            key={post.id}
            post={post}
            active={i === index && !wellbeing?.paused && !reduced}
            warm={Math.abs(i - index) <= 2}
            muted={muted}
            captionsOn={captionsOn}
            onEnded={() => go(i + 1)}
          />
        ))}
      </div>
      {current ? (
        <aside className="hidden w-56 shrink-0 flex-col gap-3 py-4 md:flex">
          <Button type="button" variant="secondary" onClick={() => setMuted((v) => !v)}>
            {muted ? t('loop.unmute') : t('loop.mute')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setCaptionsOn((v) => !v)}>
            {captionsOn ? t('loop.captions') : t('loop.captionsOff')}
          </Button>
          {current.loop?.captionStatus === 'skipped' ? (
            <p className="text-xs text-text-secondary">{t('loop.captionsSkipped')}</p>
          ) : null}
          {APPRECIATION_TYPES.map((type) => {
            const meta = appreciationMeta[type];
            const active = current.appreciation.mine === type;
            return (
              <button
                key={type}
                type="button"
                className={`inline-flex min-h-11 items-center gap-2 rounded-tile px-3 text-sm ${
                  active ? 'bg-accent-muted' : 'bg-surface-muted'
                }`}
                onClick={() => appreciate.mutate({ id: current.id, type })}
              >
                <span aria-hidden>{meta.emoji}</span>
                {t(meta.labelKey)}
              </button>
            );
          })}
          <Button type="button" variant="ghost" onClick={() => setCommentsFor(current.id)}>
            {t('feed.comments')}
            {current.commentCount ? ` · ${current.commentCount}` : ''}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={async () => {
              await navigator.clipboard.writeText(`${window.location.origin}/loops/${current.id}`);
              setShareMsg(t('loop.shared'));
            }}
          >
            {t('loop.share')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={async () => {
              try {
                const result = await api.saveLoop(current.id);
                setSaveMsg(`${t('loop.saved')} · ${result.board.title}`);
              } catch (err) {
                setSaveMsg(err instanceof TesseraApiError ? err.message : t('error.body'));
              }
            }}
          >
            {t('loop.save')}
          </Button>
          {shareMsg ? <p className="text-xs text-moss">{shareMsg}</p> : null}
          {saveMsg ? <p className="text-xs text-text-secondary">{saveMsg}</p> : null}
        </aside>
      ) : null}

      {commentsFor ? (
        <div className="absolute inset-y-0 right-0 w-full max-w-sm overflow-y-auto rounded-tile bg-surface-elevated p-4 shadow-tile">
          <Button type="button" variant="ghost" onClick={() => setCommentsFor(null)}>
            {t('moment.close')}
          </Button>
          {comments.data?.items.map((comment) => (
            <p key={comment.id} className="mt-3 text-sm">
              <span className="font-medium">@{comment.author.handle}</span> {comment.body}
            </p>
          ))}
          <form
            className="mt-4 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (draft.trim()) sendComment.mutate();
            }}
          >
            <TextField
              name="comment"
              label={t('feed.writeComment')}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button type="submit">{t('feed.reply')}</Button>
          </form>
        </div>
      ) : null}

      {wellbeing?.paused ? (
        <div className="absolute inset-0 flex items-center justify-center bg-ink/70 p-6">
          <div className="max-w-md rounded-tile-lg bg-surface p-6">
            <h2 className="font-display text-2xl text-text-primary">{t('loop.pauseTitle')}</h2>
            <p className="mt-2 text-text-secondary">{t('loop.pauseBody')}</p>
            <div className="mt-4 flex flex-col gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => (window.location.href = '/')}
              >
                {t('loop.stop')}
              </Button>
              <Button
                type="button"
                onClick={async () => {
                  setWellbeing(await api.extendLoopsBudget());
                }}
              >
                {t('loop.extend')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={async () => {
                  setWellbeing(await api.dismissLoopsBudget());
                }}
              >
                {t('loop.dismiss')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

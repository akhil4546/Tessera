'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { AudioTrackView, AuthenticityKind, LoopSpeed, PostVisibility } from '@tessera/types';
import { Button, TextArea, TextField } from '@tessera/ui';
import { TesseraApiError } from '@tessera/api-client';
import { api } from '../lib/api';
import { AudienceFields, toScheduledIso } from './audience-fields';

type DraftClip = {
  file: File;
  url: string;
  durationMs: number;
  trimStartMs: number;
  trimEndMs: number;
  speed: LoopSpeed;
};

const SPEEDS: LoopSpeed[] = [0.5, 1, 1.5, 2, 3];

function pickRecorderMime(): string {
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  for (const type of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
  }
  return 'video/webm';
}

async function probeDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Could not read that clip.'));
    });
    return Math.max(200, Math.round((video.duration || 1) * 1000));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function CreateLoop({ onCancel }: { onCancel: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [clips, setClips] = useState<DraftClip[]>([]);
  const [active, setActive] = useState(0);
  const [timer, setTimer] = useState<0 | 3 | 10>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [overlayText, setOverlayText] = useState('');
  const [overlays, setOverlays] = useState<{ text: string; x: number; y: number }[]>([]);
  const [coverFrameMs, setCoverFrameMs] = useState(0);
  const [allowReuse, setAllowReuse] = useState(true);
  const [audioTrackId, setAudioTrackId] = useState<string | undefined>();
  const [audioLibrary, setAudioLibrary] = useState<AudioTrackView[]>([]);
  const [caption, setCaption] = useState('');
  const [authenticity, setAuthenticity] = useState<AuthenticityKind>('unfiltered');
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [circleIds, setCircleIds] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState<'clips' | 'details'>('clips');

  useEffect(() => {
    void api.listAudio().then((page) => setAudioLibrary(page.items)).catch(() => setAudioLibrary([]));
  }, []);

  useEffect(() => {
    return () => {
      for (const clip of clips) URL.revokeObjectURL(clip.url);
    };
  }, [clips]);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const next: DraftClip[] = [];
    for (const file of Array.from(list).slice(0, 10 - clips.length)) {
      const durationMs = await probeDuration(file);
      next.push({
        file,
        url: URL.createObjectURL(file),
        durationMs,
        trimStartMs: 0,
        trimEndMs: durationMs,
        speed: 1,
      });
    }
    setClips((rows) => [...rows, ...next]);
  }

  async function startCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 }, aspectRatio: 9 / 16 },
        audio: true,
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setCameraError(t('create.cameraMissing'));
    }
  }

  function beginRecord() {
    const stream = videoRef.current?.srcObject;
    if (!(stream instanceof MediaStream)) {
      void startCamera().then(() => {
        window.setTimeout(() => beginRecord(), 300);
      });
      return;
    }
    const mime = pickRecorderMime();
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      const file = new File([blob], `loop-${Date.now()}.webm`, { type: mime });
      void probeDuration(file).then((durationMs) => {
        setClips((rows) => [
          ...rows,
          {
            file,
            url: URL.createObjectURL(file),
            durationMs,
            trimStartMs: 0,
            trimEndMs: durationMs,
            speed: 1,
          },
        ]);
      });
      setRecording(false);
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  }

  function onRecordClick() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (timer === 0) {
      beginRecord();
      return;
    }
    setCountdown(timer);
    const started = Date.now();
    const tick = window.setInterval(() => {
      const left = timer - Math.floor((Date.now() - started) / 1000);
      if (left <= 0) {
        window.clearInterval(tick);
        setCountdown(null);
        beginRecord();
        return;
      }
      setCountdown(left);
    }, 200);
  }

  function patchClip(index: number, partial: Partial<DraftClip>) {
    setClips((rows) => rows.map((row, i) => (i === index ? { ...row, ...partial } : row)));
  }

  function moveClip(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= clips.length) return;
    setClips((rows) => {
      const copy = [...rows];
      const [item] = copy.splice(index, 1);
      if (!item) return rows;
      copy.splice(next, 0, item);
      return copy;
    });
    setActive((current) => (current === index ? next : current));
  }

  async function publish() {
    setError(null);
    setPending(true);
    try {
      const uploaded = [];
      for (const clip of clips) {
        const intent = await api.createMediaIntent({
          kind: 'video',
          mimeType: clip.file.type || 'video/webm',
          byteSize: clip.file.size,
          purpose: 'loop',
        });
        if (intent.driver === 'fs' || intent.localUploadPath) {
          await api.uploadMediaBytes(intent.id, await clip.file.arrayBuffer(), clip.file.type || 'video/webm');
        } else {
          await fetch(intent.uploadUrl, {
            method: 'PUT',
            headers: intent.headers,
            body: clip.file,
          });
        }
        let mediaRow = await api.completeMedia(intent.id);
        for (let i = 0; i < 30 && mediaRow.status === 'processing'; i += 1) {
          await new Promise((r) => setTimeout(r, 500));
          mediaRow = await api.getMedia(intent.id);
        }
        if (mediaRow.status === 'failed') {
          throw new Error(mediaRow.processingError ?? 'Processing failed');
        }
        uploaded.push({
          mediaId: intent.id,
          trimStartMs: clip.trimStartMs,
          trimEndMs: clip.trimEndMs,
          speed: clip.speed,
        });
      }
      const loop = await api.createLoop({
        clips: uploaded,
        coverFrameMs,
        overlays: overlays.map((row) => ({ ...row, color: '#F4EDE3' })),
        audioTrackId,
        allowAudioReuse: allowReuse,
        caption,
        authenticity,
        visibility,
        circleIds: visibility === 'circles' ? circleIds : undefined,
        scheduledAt: toScheduledIso(scheduledAt),
        altText: caption || 'Loop',
      });
      router.push(loop.publishedAt ? `/loops/${loop.id}` : '/settings');
    } catch (err) {
      setError(err instanceof TesseraApiError ? err.message : err instanceof Error ? err.message : 'Could not publish.');
    } finally {
      setPending(false);
    }
  }

  const current = clips[active];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-text-primary">{t('create.loop')}</h1>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
      <p className="text-sm text-text-secondary">{t('create.loopHint')}</p>
      <p className="text-sm text-text-secondary">{t('create.allowReuseHint')}</p>

      {step === 'clips' ? (
        <>
          <div className="overflow-hidden rounded-tile-lg bg-ink">
            <video
              ref={videoRef}
              className="mx-auto aspect-[9/16] max-h-[70vh] w-full max-w-sm object-cover"
              autoPlay
              muted
              playsInline
              src={current && !recording ? current.url : undefined}
            />
            {countdown != null ? (
              <p className="absolute inset-0 flex items-center justify-center font-display text-6xl text-sand">{countdown}</p>
            ) : null}
          </div>
          {cameraError ? <p className="text-sm text-danger">{cameraError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => void startCamera()}>
              {t('create.record')}
            </Button>
            <Button type="button" onClick={onRecordClick}>
              {recording ? t('create.stopRecord') : t('create.record')}
            </Button>
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-tile bg-surface-muted px-4 text-sm">
              {t('create.uploadLoop')}
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                multiple
                className="sr-only"
                onChange={(e) => void addFiles(e.target.files)}
              />
            </label>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">{t('create.timer')}</p>
            <div className="flex gap-2">
              {([0, 3, 10] as const).map((value) => (
                <Button key={value} type="button" variant={timer === value ? 'primary' : 'secondary'} onClick={() => setTimer(value)}>
                  {value === 0 ? t('create.timerOff') : `${value}s`}
                </Button>
              ))}
            </div>
          </div>
          {clips.length ? (
            <div>
              <p className="mb-2 text-sm font-medium">{t('create.clips')}</p>
              <div className="flex gap-2 overflow-x-auto">
                {clips.map((clip, index) => (
                  <button
                    key={clip.url}
                    type="button"
                    className={`h-20 w-14 overflow-hidden rounded-tile border ${index === active ? 'border-accent' : 'border-border'}`}
                    onClick={() => setActive(index)}
                  >
                    <video src={clip.url} className="h-full w-full object-cover" muted />
                  </button>
                ))}
              </div>
              {current ? (
                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={() => moveClip(active, -1)}>
                      ↑
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => moveClip(active, 1)}>
                      ↓
                    </Button>
                  </div>
                  <p className="text-sm font-medium">{t('create.speed')}</p>
                  <div className="flex flex-wrap gap-2">
                    {SPEEDS.map((speed) => (
                      <Button
                        key={speed}
                        type="button"
                        variant={current.speed === speed ? 'primary' : 'secondary'}
                        onClick={() => patchClip(active, { speed })}
                      >
                        {speed}×
                      </Button>
                    ))}
                  </div>
                  <label className="text-sm">
                    {t('create.trim')} start
                    <input
                      type="range"
                      min={0}
                      max={current.trimEndMs - 100}
                      value={current.trimStartMs}
                      className="w-full accent-[var(--tessera-accent)]"
                      onChange={(e) => patchClip(active, { trimStartMs: Number(e.target.value) })}
                    />
                  </label>
                  <label className="text-sm">
                    {t('create.trim')} end
                    <input
                      type="range"
                      min={current.trimStartMs + 100}
                      max={current.durationMs}
                      value={current.trimEndMs}
                      className="w-full accent-[var(--tessera-accent)]"
                      onChange={(e) => patchClip(active, { trimEndMs: Number(e.target.value) })}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}
          <div>
            <p className="mb-2 text-sm font-medium">{t('create.overlays')}</p>
            <div className="flex gap-2">
              <TextField name="overlay" label={t('create.overlayText')} value={overlayText} onChange={(e) => setOverlayText(e.target.value)} />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (!overlayText.trim()) return;
                  setOverlays((rows) => [...rows, { text: overlayText.trim(), x: 0.5, y: 0.8 }]);
                  setOverlayText('');
                }}
              >
                {t('create.addOverlay')}
              </Button>
            </div>
            {overlays.map((row) => (
              <p key={row.text} className="text-sm text-text-secondary">
                {row.text}
              </p>
            ))}
          </div>
          <label className="text-sm">
            {t('create.cover')}
            <input
              type="range"
              min={0}
              max={Math.max(0, (current?.durationMs ?? 1000) - 50)}
              value={coverFrameMs}
              className="w-full accent-[var(--tessera-accent)]"
              onChange={(e) => setCoverFrameMs(Number(e.target.value))}
            />
          </label>
          <Button type="button" onClick={() => setStep('details')} disabled={clips.length === 0}>
            {t('create.next')}
          </Button>
        </>
      ) : (
        <div className="flex flex-col gap-4">
          <TextArea name="caption" label={t('create.caption')} value={caption} onChange={(e) => setCaption(e.target.value)} />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={allowReuse} onChange={(e) => setAllowReuse(e.target.checked)} />
            {t('create.allowReuse')}
          </label>
          <div>
            <p className="mb-2 text-sm font-medium">{t('create.reuseAudio')}</p>
            <select
              className="min-h-11 w-full rounded-tile border border-border bg-surface-elevated px-3"
              value={audioTrackId ?? ''}
              onChange={(e) => setAudioTrackId(e.target.value || undefined)}
            >
              <option value="">{t('create.originalAudio')}</option>
              {audioLibrary.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.title} · @{track.author.handle}
                </option>
              ))}
            </select>
          </div>
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
                <input type="radio" name="authenticity" checked={authenticity === value} onChange={() => setAuthenticity(value)} />
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
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="button" onClick={() => void publish()} disabled={pending}>
            {pending ? t('create.processing') : t('common.publish')}
          </Button>
        </div>
      )}
    </div>
  );
}

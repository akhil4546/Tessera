'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QUICK_EMOJIS, type MessageView } from '@tessera/types';
import { TesseraApiError } from '@tessera/api-client';
import { Button, TextArea, Tile } from '@tessera/ui';
import { api } from '../../../lib/api';
import { ReportDialog } from '../../../components/report-dialog';
import { connectInboxSocket, emitTyping, joinThread, leaveThread } from '../../../lib/inbox-socket';

export default function ThreadPage() {
  const params = useParams<{ id: string }>();
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [typingHandle, setTypingHandle] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const conversation = useQuery({
    queryKey: ['conversation', params.id],
    queryFn: () => api.getConversation(params.id),
  });
  const messages = useQuery({
    queryKey: ['messages', params.id],
    queryFn: () => api.listMessages(params.id, { limit: 50 }),
  });
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });

  const chronological = useMemo(
    () => [...(messages.data?.items ?? [])].reverse(),
    [messages.data?.items],
  );

  useEffect(() => {
    joinThread(params.id);
    const stop = connectInboxSocket((event) => {
      if (event.type === 'typing') {
        if (event.conversationId !== params.id) return;
        setTypingHandle(event.handle);
        window.setTimeout(() => setTypingHandle((current) => (current === event.handle ? null : current)), 3000);
        return;
      }
      if ('conversationId' in event && event.conversationId !== params.id) return;
      void queryClient.invalidateQueries({ queryKey: ['messages', params.id] });
      void queryClient.invalidateQueries({ queryKey: ['conversation', params.id] });
      void queryClient.invalidateQueries({ queryKey: ['inbox'] });
    });
    return () => {
      leaveThread(params.id);
      stop();
    };
  }, [params.id, queryClient]);

  useEffect(() => {
    const last = chronological[chronological.length - 1];
    if (last) {
      void api.markConversationRead(params.id, last.id);
      bottom.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chronological, params.id]);

  const send = useMutation({
    mutationFn: async (body: Record<string, unknown>) => api.sendMessage(params.id, body),
    onSuccess: () => {
      setDraft('');
      setEditingId(null);
      void queryClient.invalidateQueries({ queryKey: ['messages', params.id] });
      void queryClient.invalidateQueries({ queryKey: ['conversation', params.id] });
    },
  });
  const edit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => api.editMessage(id, body),
    onSuccess: () => {
      setEditingId(null);
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: ['messages', params.id] });
    },
  });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    if (editingId) {
      edit.mutate({ id: editingId, body: draft });
      return;
    }
    send.mutate({ kind: 'text', body: draft, clientId: crypto.randomUUID() });
  }

  async function onAttach(file: File) {
    const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'image';
    const intent = await api.createMediaIntent({
      purpose: 'message',
      kind: kind === 'audio' ? 'audio' : kind,
      mimeType: file.type,
      byteSize: file.size,
    });
    await api.uploadMediaBytes(intent.id, file, file.type);
    await api.completeMedia(intent.id);
    send.mutate({
      kind: kind === 'audio' ? 'voice' : kind,
      mediaId: intent.id,
      body: '',
      clientId: crypto.randomUUID(),
    });
  }

  if (conversation.error instanceof TesseraApiError && conversation.error.status === 401) {
    router.push('/login');
  }
  if (conversation.isLoading || !conversation.data) {
    return <p className="text-text-secondary">{t('common.loading')}</p>;
  }

  const incoming = conversation.data.request?.status === 'pending' && conversation.data.request.incoming;
  const waiting = conversation.data.request?.status === 'pending' && !conversation.data.request.incoming;
  const heading =
    conversation.data.kind === 'group'
      ? conversation.data.title ?? t('inbox.members')
      : conversation.data.members.find((row) => row.user.id !== me.data?.id)?.user.displayName ??
        conversation.data.title;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">
            <Link href="/inbox">{t('inbox.title')}</Link>
          </p>
          <h1 className="font-display text-2xl font-semibold">{heading}</h1>
          <p className="text-sm text-text-secondary">
            {conversation.data.members
              .map((row) => `@${row.user.handle}${row.online ? ' · ' + t('inbox.online') : ''}`)
              .join(', ')}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            variant="ghost"
            onClick={() =>
              api.updateConversation(params.id, { muted: !conversation.data.muted }).then(() =>
                queryClient.invalidateQueries({ queryKey: ['conversation', params.id] }),
              )
            }
          >
            {conversation.data.muted ? t('inbox.unmute') : t('inbox.mute')}
          </Button>
          {conversation.data.kind === 'group' ? (
            <Button variant="ghost" onClick={() => api.leaveConversation(params.id).then(() => router.push('/inbox'))}>
              {t('inbox.leave')}
            </Button>
          ) : null}
          <ReportDialog kind="conversation" id={params.id} />
        </div>
      </div>

      {incoming && conversation.data.request ? (
        <Tile className="flex flex-wrap gap-2">
          <p className="w-full text-sm">{t('inbox.incoming')}</p>
          <Button onClick={() => api.acceptMessageRequest(conversation.data.request!.id).then(() => conversation.refetch())}>
            {t('inbox.accept')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => api.declineMessageRequest(conversation.data.request!.id).then(() => router.push('/inbox'))}
          >
            {t('inbox.decline')}
          </Button>
        </Tile>
      ) : null}
      {waiting ? <p className="text-sm text-slate">{t('inbox.waiting')}</p> : null}

      <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
        {chronological.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            mine={message.sender.id === me.data?.id}
            onEdit={() => {
              setEditingId(message.id);
              setDraft(message.body);
            }}
            onUnsend={() => api.unsendMessage(message.id).then(() => messages.refetch())}
            onReact={(emoji) =>
              (message.reactions.some((row) => row.mine && row.emoji === emoji)
                ? api.unreactToMessage(message.id)
                : api.reactToMessage(message.id, emoji)
              ).then(() => messages.refetch())
            }
          />
        ))}
        <div ref={bottom} />
      </div>
      {typingHandle ? (
        <p className="text-sm text-text-secondary">
          @{typingHandle} {t('inbox.typing')}
        </p>
      ) : null}

      <form className="flex flex-col gap-2" onSubmit={onSubmit}>
        <TextArea
          name="message"
          label={t('inbox.write')}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            emitTyping(params.id);
          }}
          rows={3}
          disabled={Boolean(incoming)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={send.isPending || Boolean(incoming)}>
            {editingId ? t('inbox.edit') : t('inbox.send')}
          </Button>
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-tile bg-surface-muted px-4 text-sm">
            {t('inbox.attach')}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,audio/webm,audio/mp4,audio/mpeg"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onAttach(file);
                event.target.value = '';
              }}
            />
          </label>
        </div>
        <p className="text-xs text-text-secondary">{t('inbox.plaintextNote')}</p>
      </form>
    </div>
  );
}

function MessageBubble({
  message,
  mine,
  onEdit,
  onUnsend,
  onReact,
}: {
  message: MessageView;
  mine: boolean;
  onEdit: () => void;
  onUnsend: () => void;
  onReact: (emoji: string) => void;
}) {
  const t = useTranslations();
  return (
    <Tile className={`max-w-[90%] p-3 ${mine ? 'ml-auto bg-accent-muted' : ''}`}>
      <p className="text-xs text-text-secondary">@{message.sender.handle}</p>
      {message.deletedAt ? (
        <p className="italic text-text-secondary">{t('inbox.unsent')}</p>
      ) : (
        <>
          {message.replyTo ? (
            <p className="mb-1 text-xs text-slate">
              → @{message.replyTo.senderHandle}: {message.replyTo.deleted ? t('inbox.unsent') : message.replyTo.body}
            </p>
          ) : null}
          {message.body ? <p className="whitespace-pre-wrap">{message.body}</p> : null}
          {message.media?.kind === 'image' && message.media.srcset[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={message.media.srcset[0].webp} alt={message.media.altText || ''} className="mt-2 max-h-64 rounded-tile" />
          ) : null}
          {message.media?.audioUrl ? (
            <audio className="mt-2 w-full" controls src={message.media.audioUrl} />
          ) : null}
          {message.media?.hlsUrl ? (
            <p className="mt-2 text-sm">
              <a className="underline" href={message.media.hlsUrl}>
                Video
              </a>
            </p>
          ) : null}
          {message.share ? (
            message.share.available && message.share.href ? (
              <Link className="mt-2 block text-sm underline" href={message.share.href}>
                {message.share.title} @{message.share.authorHandle}
              </Link>
            ) : (
              <p className="mt-2 text-sm text-text-secondary">This tile isn’t available.</p>
            )
          ) : null}
          {message.editedAt ? <p className="text-xs text-slate">{t('common.edited')}</p> : null}
        </>
      )}
      {message.reactions.length ? (
        <p className="mt-1 text-sm">
          {message.reactions.map((row) => (
            <span key={row.emoji} className="mr-2">
              {row.emoji} {row.count}
            </span>
          ))}
        </p>
      ) : null}
      {mine && message.receipt ? (
        <p className="mt-1 text-xs text-slate">{message.receipt.read ? t('inbox.seen') : message.receipt.delivered ? t('inbox.delivered') : ''}</p>
      ) : null}
      {!message.deletedAt ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {QUICK_EMOJIS.map((emoji) => (
            <button key={emoji} type="button" className="min-h-11 min-w-11 rounded-tile px-2" onClick={() => onReact(emoji)}>
              {emoji}
            </button>
          ))}
          {mine && message.kind === 'text' ? (
            <button type="button" className="min-h-11 px-2 text-sm underline" onClick={onEdit}>
              {t('inbox.edit')}
            </button>
          ) : null}
          {mine ? (
            <button type="button" className="min-h-11 px-2 text-sm underline" onClick={onUnsend}>
              {t('inbox.unsend')}
            </button>
          ) : null}
        </div>
      ) : null}
    </Tile>
  );
}

'use client';

import { io, type Socket } from 'socket.io-client';
import type { InboxSocketEvent } from '@tessera/types';
import { API_BASE } from './api';

let socket: Socket | null = null;

export function getInboxSocket(): Socket {
  if (!socket) {
    socket = io(`${API_BASE}/v1/inbox`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      autoConnect: false,
    });
  }
  return socket;
}

export function connectInboxSocket(onEvent: (event: InboxSocketEvent) => void): () => void {
  const client = getInboxSocket();
  const handler = (event: InboxSocketEvent) => onEvent(event);
  client.on('inbox', handler);
  if (!client.connected) client.connect();
  const ping = setInterval(() => {
    if (client.connected) client.emit('presence.ping');
  }, 20_000);
  return () => {
    clearInterval(ping);
    client.off('inbox', handler);
  };
}

export function joinThread(conversationId: string): void {
  getInboxSocket().emit('join', { conversationId });
}

export function leaveThread(conversationId: string): void {
  getInboxSocket().emit('leave', { conversationId });
}

export function emitTyping(conversationId: string): void {
  getInboxSocket().emit('typing', { conversationId });
}

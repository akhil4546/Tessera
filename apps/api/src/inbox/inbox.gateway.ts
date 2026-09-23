import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { ACCESS_COOKIE } from '../common/cookies.js';
import { allowedOrigins } from '../common/origins.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TokenService } from '../auth/tokens.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { InboxRealtime } from './inbox.realtime.js';
import { InboxService } from './inbox.service.js';

type SocketUser = { id: string; handle: string };

@WebSocketGateway({
  namespace: '/v1/inbox',
  cors: { origin: allowedOrigins(), credentials: true },
})
export class InboxGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger(InboxGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    private readonly realtime: InboxRealtime,
    private readonly inbox: InboxService,
    private readonly notifications: NotificationsService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.attach(server);
    this.notifications.attachRealtime(this.realtime);
  }

  async handleConnection(client: Socket): Promise<void> {
    const user = await this.authenticate(client);
    if (!user) {
      client.disconnect(true);
      return;
    }
    rememberSocketUser(client, user);
    await client.join(`user:${user.id}`);
    await this.inbox.heartbeat(user.id);
  }

  handleDisconnect(_client: Socket): void {}

  @SubscribeMessage('join')
  async join(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId?: string }) {
    const user = socketUser(client);
    if (!user || !body?.conversationId) return { ok: false };
    try {
      await this.inbox.get(user.id, body.conversationId);
      await client.join(`conversation:${body.conversationId}`);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  @SubscribeMessage('leave')
  async leave(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId?: string }) {
    if (body?.conversationId) await client.leave(`conversation:${body.conversationId}`);
    return { ok: true };
  }

  @SubscribeMessage('typing')
  async typing(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const user = socketUser(client);
    if (!user || !body?.conversationId) return { ok: false };
    try {
      const conversation = await this.inbox.get(user.id, body.conversationId);
      this.inbox.typing(
        user.id,
        user.handle,
        body.conversationId,
        conversation.members.map((row) => row.user.id),
      );
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  @SubscribeMessage('presence.ping')
  async ping(@ConnectedSocket() client: Socket) {
    const user = socketUser(client);
    if (!user) return { ok: false };
    await this.inbox.heartbeat(user.id);
    return { ok: true };
  }

  private async authenticate(client: Socket): Promise<{ id: string; handle: string } | null> {
    const token = readSocketToken(client);
    if (!token) return null;
    try {
      const payload = await this.tokens.verifyAccess(token);
      const session = await this.prisma.session.findFirst({
        where: {
          id: payload.sid,
          userId: payload.sub,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!session) return null;
      return { id: payload.sub, handle: payload.hdl };
    } catch (err) {
      this.log.debug(`socket auth failed: ${err instanceof Error ? err.message : 'unknown'}`);
      return null;
    }
  }
}

function socketUser(client: Socket): SocketUser | undefined {
  const data = client.data as { user?: unknown };
  const user = data.user;
  if (!user || typeof user !== 'object') return undefined;
  const record = user as { id?: unknown; handle?: unknown };
  if (typeof record.id !== 'string' || typeof record.handle !== 'string') return undefined;
  return { id: record.id, handle: record.handle };
}

function rememberSocketUser(client: Socket, user: SocketUser): void {
  (client.data as { user?: SocketUser }).user = user;
}

function readSocketToken(client: Socket): string | undefined {
  const auth = client.handshake.auth as { token?: unknown };
  if (typeof auth?.token === 'string' && auth.token.length > 0) return auth.token;
  const header = client.handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer '))
    return header.slice('Bearer '.length).trim();
  const cookie = client.handshake.headers.cookie;
  if (!cookie) return undefined;
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === ACCESS_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  addMembersSchema,
  createConversationSchema,
  createMessageSchema,
  editMessageSchema,
  inboxListQuerySchema,
  inboxMessagesQuerySchema,
  messageReactionSchema,
  presenceQuerySchema,
  readCursorSchema,
  updateConversationSchema,
  reportBodySchema,
  updateMessagingSchema,
} from '@tessera/validation';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, type RequestUser } from '../auth/current-user.js';
import { ZodPipe } from '../common/zod-pipe.js';
import { SafetyService } from '../safety/safety.service.js';
import { InboxService } from './inbox.service.js';

@ApiTags('inbox')
@Controller('v1')
@UseGuards(AuthGuard)
@ApiCookieAuth()
export class InboxController {
  constructor(
    private readonly inbox: InboxService,
    private readonly safety: SafetyService,
  ) {}

  @Get('inbox')
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodPipe(inboxListQuerySchema)) query: ReturnType<typeof inboxListQuerySchema.parse>,
  ) {
    return this.inbox.list(user.id, query.filter, query.cursor, query.limit);
  }

  @Get('inbox/badge')
  badge(@CurrentUser() user: RequestUser) {
    return this.inbox.badge(user.id);
  }

  @Post('inbox/conversations')
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(createConversationSchema)) body: ReturnType<typeof createConversationSchema.parse>,
  ) {
    return this.inbox.create(user.id, body);
  }

  @Get('inbox/conversations/:id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.inbox.get(user.id, id);
  }

  @Patch('inbox/conversations/:id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateConversationSchema)) body: ReturnType<typeof updateConversationSchema.parse>,
  ) {
    return this.inbox.update(user.id, id, body);
  }

  @Post('inbox/conversations/:id/members')
  addMembers(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(addMembersSchema)) body: ReturnType<typeof addMembersSchema.parse>,
  ) {
    return this.inbox.addMembers(user.id, id, body.handles);
  }

  @Delete('inbox/conversations/:id/members/:handle')
  removeMember(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('handle') handle: string,
  ) {
    return this.inbox.removeMember(user.id, id, handle);
  }

  @Post('inbox/conversations/:id/leave')
  leave(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.inbox.leave(user.id, id);
  }

  @Get('inbox/conversations/:id/messages')
  messages(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Query(new ZodPipe(inboxMessagesQuerySchema)) query: ReturnType<typeof inboxMessagesQuerySchema.parse>,
  ) {
    return this.inbox.listMessages(user.id, id, query.cursor, query.limit);
  }

  @Post('inbox/conversations/:id/messages')
  send(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(createMessageSchema)) body: ReturnType<typeof createMessageSchema.parse>,
  ) {
    return this.inbox.send(user.id, id, body);
  }

  @Patch('inbox/messages/:id')
  edit(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(editMessageSchema)) body: ReturnType<typeof editMessageSchema.parse>,
  ) {
    return this.inbox.edit(user.id, id, body.body);
  }

  @Delete('inbox/messages/:id')
  unsend(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.inbox.unsend(user.id, id);
  }

  @Post('inbox/messages/:id/reactions')
  react(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(messageReactionSchema)) body: ReturnType<typeof messageReactionSchema.parse>,
  ) {
    return this.inbox.react(user.id, id, body.emoji);
  }

  @Delete('inbox/messages/:id/reactions')
  unreact(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.inbox.unreact(user.id, id);
  }

  @Post('inbox/conversations/:id/read')
  read(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(readCursorSchema)) body: ReturnType<typeof readCursorSchema.parse>,
  ) {
    return this.inbox.markRead(user.id, id, body.messageId);
  }

  @Post('inbox/conversations/:id/delivered')
  delivered(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(readCursorSchema)) body: ReturnType<typeof readCursorSchema.parse>,
  ) {
    return this.inbox.markDelivered(user.id, id, body.messageId);
  }

  @Post('inbox/requests/:id/accept')
  accept(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.inbox.acceptRequest(user.id, id);
  }

  @Post('inbox/requests/:id/decline')
  decline(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.inbox.declineRequest(user.id, id);
  }

  @Post('inbox/conversations/:id/report')
  reportConversation(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(reportBodySchema)) body: ReturnType<typeof reportBodySchema.parse>,
  ) {
    return this.safety.report(user.id, { ...body, targetKind: 'conversation', targetId: id });
  }

  @Post('inbox/messages/:id/report')
  reportMessage(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(reportBodySchema)) body: ReturnType<typeof reportBodySchema.parse>,
  ) {
    return this.safety.report(user.id, { ...body, targetKind: 'message', targetId: id });
  }

  @Get('me/messaging')
  prefs(@CurrentUser() user: RequestUser) {
    return this.inbox.getPrefs(user.id);
  }

  @Put('me/messaging')
  setPrefs(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(updateMessagingSchema)) body: ReturnType<typeof updateMessagingSchema.parse>,
  ) {
    return this.inbox.setPrefs(user.id, body);
  }

  @Get('inbox/presence')
  presence(
    @CurrentUser() user: RequestUser,
    @Query(new ZodPipe(presenceQuerySchema)) query: ReturnType<typeof presenceQuerySchema.parse>,
  ) {
    return this.inbox.presence(user.id, query.handles);
  }
}

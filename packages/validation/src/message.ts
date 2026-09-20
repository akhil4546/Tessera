import { z } from 'zod';
import {
  INBOX_FILTERS,
  MAX_GROUP_MEMBERS,
  MAX_GROUP_TITLE,
  MAX_MESSAGE_BODY,
  MAX_VOICE_DURATION_MS,
  MESSAGE_KINDS,
  WHO_CAN_MESSAGE,
} from '@tessera/types';

export const inboxFilterSchema = z.enum(INBOX_FILTERS);
export const whoCanMessageSchema = z.enum(WHO_CAN_MESSAGE);
export const messageKindSchema = z.enum(MESSAGE_KINDS);

export const inboxListQuerySchema = z.object({
  filter: inboxFilterSchema.default('all'),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const createConversationSchema = z
  .object({
    handle: z.string().trim().min(2).max(30).optional(),
    handles: z.array(z.string().trim().min(2).max(30)).min(1).max(MAX_GROUP_MEMBERS - 1).optional(),
    title: z.string().trim().min(1).max(MAX_GROUP_TITLE).optional(),
  })
  .refine((value) => Boolean(value.handle || (value.handles && value.handles.length > 0)), {
    message: 'Choose someone to write to.',
  });

export const updateConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_GROUP_TITLE).optional(),
    muted: z.boolean().optional(),
    hidden: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No changes' });

export const addMembersSchema = z.object({
  handles: z.array(z.string().trim().min(2).max(30)).min(1).max(MAX_GROUP_MEMBERS - 1),
});

export const createMessageSchema = z
  .object({
    kind: messageKindSchema.default('text'),
    body: z.string().max(MAX_MESSAGE_BODY).default(''),
    mediaId: z.string().min(1).optional(),
    postId: z.string().min(1).optional(),
    loopId: z.string().min(1).optional(),
    momentId: z.string().min(1).optional(),
    replyToId: z.string().min(1).optional(),
    clientId: z.string().trim().min(1).max(80).optional(),
    durationMs: z.number().int().positive().max(MAX_VOICE_DURATION_MS).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'text' && !value.body.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Write a message.' });
    }
    if ((value.kind === 'image' || value.kind === 'video' || value.kind === 'voice') && !value.mediaId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Attach media for this message.' });
    }
    if (value.kind === 'post' && !value.postId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose a post to send.' });
    }
    if (value.kind === 'loop' && !value.loopId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose a Loop to send.' });
    }
    if (value.kind === 'moment' && !value.momentId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose a Moment to send.' });
    }
    if (value.kind === 'system') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'System messages are created by Tessera.' });
    }
  });

export const editMessageSchema = z.object({
  body: z.string().trim().min(1).max(MAX_MESSAGE_BODY),
});

export const messageReactionSchema = z.object({
  emoji: z.string().trim().min(1).max(16),
});

export const readCursorSchema = z.object({
  messageId: z.string().min(1),
});

export const presenceQuerySchema = z.object({
  handles: z.string().min(1).max(800),
});

export const updateMessagingSchema = z
  .object({
    activityStatusEnabled: z.boolean().optional(),
    readReceiptsEnabled: z.boolean().optional(),
    whoCanMessage: whoCanMessageSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No changes' });

export const inboxMessagesQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export type CreateConversationInput = z.output<typeof createConversationSchema>;
export type CreateMessageInput = z.output<typeof createMessageSchema>;
export type UpdateMessagingInput = z.output<typeof updateMessagingSchema>;
export type UpdateConversationInput = z.output<typeof updateConversationSchema>;

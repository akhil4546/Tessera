import { describe, expect, it } from 'vitest';
import { createConversationSchema, createMessageSchema, inboxListQuerySchema, updateMessagingSchema } from './message';

describe('createConversationSchema', () => {
  it('needs a handle or a list of handles', () => {
    expect(createConversationSchema.safeParse({}).success).toBe(false);
    expect(createConversationSchema.safeParse({ handle: 'asha_climbs' }).success).toBe(true);
    expect(createConversationSchema.safeParse({ handles: ['nia_notes', 'mara_tiles'], title: 'Clay crew' }).success).toBe(
      true,
    );
  });
});

describe('createMessageSchema', () => {
  it('requires a body for text and media for attachments', () => {
    expect(createMessageSchema.safeParse({ kind: 'text', body: '' }).success).toBe(false);
    expect(createMessageSchema.safeParse({ kind: 'text', body: 'hello' }).success).toBe(true);
    expect(createMessageSchema.safeParse({ kind: 'image' }).success).toBe(false);
    expect(createMessageSchema.safeParse({ kind: 'image', mediaId: 'm1' }).success).toBe(true);
    expect(createMessageSchema.safeParse({ kind: 'system', body: 'joined' }).success).toBe(false);
  });
});

describe('updateMessagingSchema', () => {
  it('requires at least one preference', () => {
    expect(updateMessagingSchema.safeParse({}).success).toBe(false);
    expect(updateMessagingSchema.safeParse({ readReceiptsEnabled: false }).success).toBe(true);
  });
});

describe('inboxListQuerySchema', () => {
  it('accepts unified Inbox filters', () => {
    expect(inboxListQuerySchema.parse({ filter: 'mentions' }).filter).toBe('mentions');
    expect(inboxListQuerySchema.parse({ filter: 'appreciations' }).filter).toBe('appreciations');
    expect(inboxListQuerySchema.parse({ filter: 'follows' }).filter).toBe('follows');
    expect(inboxListQuerySchema.parse({}).filter).toBe('all');
  });
});

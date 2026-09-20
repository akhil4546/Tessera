import {
  MAX_GROUP_MEMBERS,
  MESSAGE_EDIT_WINDOW_MS,
  type WhoCanMessage,
} from '@tessera/types';

export { MAX_GROUP_MEMBERS, MESSAGE_EDIT_WINDOW_MS };

export function pairKey(a: string, b: string): { userLowId: string; userHighId: string } {
  return a < b ? { userLowId: a, userHighId: b } : { userLowId: b, userHighId: a };
}

export function effectiveWhoCanMessage(input: {
  whoCanMessage: WhoCanMessage;
  isMinor: boolean;
}): WhoCanMessage {
  if (input.isMinor && input.whoCanMessage === 'everyone') return 'followers';
  return input.whoCanMessage;
}

export type StartDirectDecision =
  | { type: 'error'; code: 'SELF' | 'BLOCKED' | 'NOT_ALLOWED' }
  | { type: 'ok'; request: boolean };

/**
 * 1:1 start rules.
 * Minors (and whoCanMessage=followers) only accept accepted followers.
 * Non-followers of the recipient land in Requests when whoCanMessage=everyone.
 */
export function decideStartDirect(input: {
  actorId: string;
  targetId: string;
  blockedEitherWay: boolean;
  actorIsFollowerOfTarget: boolean;
  targetWhoCanMessage: WhoCanMessage;
  targetIsMinor: boolean;
}): StartDirectDecision {
  if (input.actorId === input.targetId) return { type: 'error', code: 'SELF' };
  if (input.blockedEitherWay) return { type: 'error', code: 'BLOCKED' };
  const policy = effectiveWhoCanMessage({
    whoCanMessage: input.targetWhoCanMessage,
    isMinor: input.targetIsMinor,
  });
  if (policy === 'nobody') return { type: 'error', code: 'NOT_ALLOWED' };
  if (policy === 'followers' && !input.actorIsFollowerOfTarget) {
    return { type: 'error', code: 'NOT_ALLOWED' };
  }
  return { type: 'ok', request: !input.actorIsFollowerOfTarget };
}

export function canEditMessage(input: { senderId: string; actorId: string; kind: string; createdAt: Date; deletedAt: Date | null; now?: Date }): boolean {
  if (input.senderId !== input.actorId) return false;
  if (input.kind !== 'text') return false;
  if (input.deletedAt) return false;
  const now = input.now ?? new Date();
  return now.getTime() - input.createdAt.getTime() <= MESSAGE_EDIT_WINDOW_MS;
}

export function canUnsend(input: { senderId: string; actorId: string }): boolean {
  return input.senderId === input.actorId;
}

export function groupOverCapacity(currentMembers: number, adding: number): boolean {
  return currentMembers + adding > MAX_GROUP_MEMBERS;
}

export function readReceiptVisible(input: {
  readerId: string;
  senderId: string;
  readerReceiptsEnabled: boolean;
}): boolean {
  if (input.readerId === input.senderId) return false;
  return input.readerReceiptsEnabled;
}

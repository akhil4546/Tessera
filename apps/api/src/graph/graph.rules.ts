export type FollowDecision =
  | { type: 'error'; code: 'SELF' | 'BLOCKED' | 'ALREADY' }
  | { type: 'create'; status: 'pending' | 'accepted' };

export function decideFollow(input: {
  actorId: string;
  targetId: string;
  blockedEitherWay: boolean;
  targetPrivate: boolean;
  existingStatus: 'pending' | 'accepted' | null;
}): FollowDecision {
  if (input.actorId === input.targetId) return { type: 'error', code: 'SELF' };
  if (input.blockedEitherWay) return { type: 'error', code: 'BLOCKED' };
  if (input.existingStatus) return { type: 'error', code: 'ALREADY' };
  return { type: 'create', status: input.targetPrivate ? 'pending' : 'accepted' };
}

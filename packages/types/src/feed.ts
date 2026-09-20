/**
 * Hybrid fan-out: authors below this follower count are fanned out on write.
 * High-follower accounts are merged at read time. Used from Phase 2.
 */
export const FEED_FANOUT_FOLLOWER_THRESHOLD = 10_000;

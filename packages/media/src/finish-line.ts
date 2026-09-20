export type FinishLine = {
  reached: boolean;
  seenSinceLastVisit: number;
  olderAvailable: boolean;
};

export type FeedSlice<T extends { publishedAt: Date | string }> = {
  items: T[];
  finishLine: FinishLine | null;
  nextCursor: string | null;
};

/**
 * Following feed is reverse-chronological. Posts newer than `caughtUpAt` are
 * the "since last visit" set. The finish line sits after those. Older posts
 * are only returned when `keepGoing` is true.
 */
export function sliceFollowingFeed<T extends { publishedAt: Date | string; id: string }>(input: {
  posts: T[];
  caughtUpAt: Date | null;
  keepGoing: boolean;
  limit: number;
  cursor?: { publishedAt: Date; id: string };
}): { visible: T[]; finishLine: FinishLine | null; hasMore: boolean } {
  const caught = input.caughtUpAt?.getTime() ?? 0;
  const isNew = (post: T) => new Date(post.publishedAt).getTime() > caught;
  const newer = input.posts.filter(isNew);
  const older = input.posts.filter((post) => !isNew(post));

  if (!input.keepGoing) {
    const page = newer.slice(0, input.limit);
    const hasMoreNew = newer.length > input.limit;
    const reached = !hasMoreNew;
    return {
      visible: page,
      finishLine: {
        reached,
        seenSinceLastVisit: newer.length,
        olderAvailable: older.length > 0,
      },
      hasMore: hasMoreNew,
    };
  }

  const page = older.slice(0, input.limit);
  return {
    visible: page,
    finishLine: null,
    hasMore: older.length > input.limit,
  };
}

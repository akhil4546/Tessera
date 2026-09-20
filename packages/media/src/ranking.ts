/**
 * Tessera Discover ranking — rules-based, documented, slider-driven.
 * v1 is not an ML model. The interface is scoreCandidate() so a model can replace it later.
 *
 * Score =
 *   topicMatch
 * + 1.2 * peopleIInteractWith * interact
 * + 1.0 * newCreators * newCreator
 * + 1.0 * nearby * nearby
 * + 0.4 * popularity
 * + 0.3 * recency
 * − 1.5 * lessVideo * isVideo
 *
 * Each returned signal is one term that actually entered the sum. “Why am I seeing this?”
 * reads those stored signals — never a generic explanation.
 */
export const NEW_CREATOR_FOLLOWER_MAX = 50;

export type RankingWeights = {
  peopleIInteractWith: number;
  newCreators: number;
  nearby: number;
  lessVideo: number;
};

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  peopleIInteractWith: 0.5,
  newCreators: 0.5,
  nearby: 0.5,
  lessVideo: 0,
};

export const RANKING_BASE = {
  interact: 1.2,
  newCreator: 1.0,
  nearby: 1.0,
  topic: 1.0,
  popularity: 0.4,
  recency: 0.3,
  videoPenalty: 1.5,
} as const;

export type RankingSignalKey =
  | 'topic'
  | 'interact'
  | 'new_creator'
  | 'nearby'
  | 'popularity'
  | 'recency'
  | 'video';

export type RankingSignal = {
  key: RankingSignalKey;
  label: string;
  weight: number;
  value: number;
  contribution: number;
};

export function clampWeight(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function normalizeWeights(input: Partial<RankingWeights> | null | undefined): RankingWeights {
  return {
    peopleIInteractWith: clampWeight(input?.peopleIInteractWith ?? DEFAULT_RANKING_WEIGHTS.peopleIInteractWith),
    newCreators: clampWeight(input?.newCreators ?? DEFAULT_RANKING_WEIGHTS.newCreators),
    nearby: clampWeight(input?.nearby ?? DEFAULT_RANKING_WEIGHTS.nearby),
    lessVideo: clampWeight(input?.lessVideo ?? DEFAULT_RANKING_WEIGHTS.lessVideo),
  };
}

export type ScoreCandidateInput = {
  topicMatch: number;
  topicLabel?: string;
  interact: number;
  interactLabel?: string;
  newCreator: number;
  newCreatorLabel?: string;
  nearby: number;
  nearbyLabel?: string;
  popularity: number;
  recency: number;
  isVideo: boolean;
  weights: RankingWeights;
};

function pushSignal(
  signals: RankingSignal[],
  key: RankingSignalKey,
  label: string,
  weight: number,
  value: number,
): void {
  const v = clampWeight(value);
  const contribution = Number((weight * v).toFixed(6));
  if (v <= 0 || contribution === 0) return;
  signals.push({ key, label, weight, value: v, contribution });
}

export function scoreCandidate(input: ScoreCandidateInput): { score: number; signals: RankingSignal[] } {
  const w = normalizeWeights(input.weights);
  const signals: RankingSignal[] = [];

  pushSignal(
    signals,
    'topic',
    input.topicLabel ?? 'Matches topics you follow or use',
    RANKING_BASE.topic,
    input.topicMatch,
  );
  pushSignal(
    signals,
    'interact',
    input.interactLabel ?? 'From people you interact with',
    RANKING_BASE.interact * w.peopleIInteractWith,
    input.interact,
  );
  pushSignal(
    signals,
    'new_creator',
    input.newCreatorLabel ?? 'New creator',
    RANKING_BASE.newCreator * w.newCreators,
    input.newCreator,
  );
  pushSignal(
    signals,
    'nearby',
    input.nearbyLabel ?? 'Near places you have posted',
    RANKING_BASE.nearby * w.nearby,
    input.nearby,
  );
  pushSignal(signals, 'popularity', 'Recent activity on this post', RANKING_BASE.popularity, input.popularity);
  pushSignal(signals, 'recency', 'Published recently', RANKING_BASE.recency, input.recency);

  if (input.isVideo && w.lessVideo > 0) {
    const weight = Number((-RANKING_BASE.videoPenalty * w.lessVideo).toFixed(6));
    signals.push({
      key: 'video',
      label: 'Loop — your Discover is tuned for fewer videos',
      weight,
      value: 1,
      contribution: weight,
    });
  }

  const score = Number(signals.reduce((sum, row) => sum + row.contribution, 0).toFixed(6));
  return { score, signals };
}

export function newCreatorSignal(followerCount: number): number {
  if (followerCount <= NEW_CREATOR_FOLLOWER_MAX) return 1;
  return clampWeight(1 - (followerCount - NEW_CREATOR_FOLLOWER_MAX) / 450);
}

export function topicMatchSignal(
  postTags: string[],
  userTopics: string[],
): { value: number; matched: string[] } {
  const set = new Set(userTopics.map((tag) => tag.toLowerCase()));
  const matched = postTags.filter((tag) => set.has(tag.toLowerCase()));
  if (matched.length === 0) return { value: 0, matched: [] };
  return { value: clampWeight(matched.length / Math.max(postTags.length, 1)), matched };
}

export function recencySignal(publishedAt: Date, now = new Date()): number {
  const hours = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60);
  if (hours <= 24) return 1;
  if (hours <= 72) return 0.7;
  if (hours <= 168) return 0.4;
  if (hours <= 336) return 0.2;
  return 0.05;
}

export function popularitySignal(appreciations: number, comments: number): number {
  const raw = Math.max(0, appreciations) + 2 * Math.max(0, comments);
  return clampWeight(Math.log1p(raw) / Math.log1p(50));
}

export function rankByScore<T extends { id: string; score: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id.localeCompare(b.id);
  });
}

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RANKING_WEIGHTS,
  newCreatorSignal,
  popularitySignal,
  rankByScore,
  scoreCandidate,
  type RankingWeights,
} from './ranking.ts';

const photo: Omit<Parameters<typeof scoreCandidate>[0], 'weights'> = {
  topicMatch: 0,
  interact: 1,
  newCreator: 0,
  nearby: 0,
  popularity: 0.2,
  recency: 0.7,
  isVideo: false,
};

const newCreator: Omit<Parameters<typeof scoreCandidate>[0], 'weights'> = {
  topicMatch: 0,
  interact: 0,
  newCreator: 1,
  nearby: 0,
  popularity: 0.1,
  recency: 1,
  isVideo: false,
};

const nearbyLoop: Omit<Parameters<typeof scoreCandidate>[0], 'weights'> = {
  topicMatch: 0,
  interact: 0,
  newCreator: 0.2,
  nearby: 1,
  popularity: 0.3,
  recency: 1,
  isVideo: true,
};

function weights(partial: Partial<RankingWeights>): RankingWeights {
  return { ...DEFAULT_RANKING_WEIGHTS, ...partial };
}

describe('scoreCandidate', () => {
  it('sums only the signals that actually contributed', () => {
    const ranked = scoreCandidate({ ...photo, weights: DEFAULT_RANKING_WEIGHTS });
    const fromSignals = ranked.signals.reduce((sum, row) => sum + row.contribution, 0);
    expect(ranked.score).toBeCloseTo(fromSignals, 5);
    expect(ranked.signals.some((row) => row.key === 'interact')).toBe(true);
    expect(ranked.signals.some((row) => row.key === 'nearby')).toBe(false);
    expect(ranked.signals.some((row) => row.key === 'video')).toBe(false);
  });

  it('Tune my Discover sliders change ranking order', () => {
    const interactHeavy = weights({ peopleIInteractWith: 1, newCreators: 0, nearby: 0, lessVideo: 0 });
    const newHeavy = weights({ peopleIInteractWith: 0, newCreators: 1, nearby: 0, lessVideo: 0 });

    const interactOrder = rankByScore([
      { id: 'photo', ...scoreCandidate({ ...photo, weights: interactHeavy }) },
      { id: 'new', ...scoreCandidate({ ...newCreator, weights: interactHeavy }) },
    ]);
    expect(interactOrder[0]?.id).toBe('photo');

    const newOrder = rankByScore([
      { id: 'photo', ...scoreCandidate({ ...photo, weights: newHeavy }) },
      { id: 'new', ...scoreCandidate({ ...newCreator, weights: newHeavy }) },
    ]);
    expect(newOrder[0]?.id).toBe('new');
  });

  it('less-video slider applies a real penalty stored on the impression', () => {
    const equal = weights({ peopleIInteractWith: 0, newCreators: 0.2, nearby: 1, lessVideo: 0 });
    const lessVideo = weights({ peopleIInteractWith: 0, newCreators: 0.2, nearby: 1, lessVideo: 1 });

    const loopOff = scoreCandidate({ ...nearbyLoop, weights: equal });
    const loopOn = scoreCandidate({ ...nearbyLoop, weights: lessVideo });
    expect(loopOn.score).toBeLessThan(loopOff.score);

    const videoSignal = loopOn.signals.find((row) => row.key === 'video');
    expect(videoSignal).toBeDefined();
    expect(videoSignal?.contribution).toBeLessThan(0);
    expect(loopOff.signals.some((row) => row.key === 'video')).toBe(false);
  });

  it('zeroing a slider removes that signal from Why am I seeing this', () => {
    const off = scoreCandidate({
      ...nearbyLoop,
      weights: weights({ nearby: 0, lessVideo: 0 }),
    });
    expect(off.signals.some((row) => row.key === 'nearby')).toBe(false);
  });
});

describe('newCreatorSignal / popularitySignal', () => {
  it('treats small graphs as new and saturates popularity', () => {
    expect(newCreatorSignal(3)).toBe(1);
    expect(newCreatorSignal(50)).toBe(1);
    expect(newCreatorSignal(500)).toBe(0);
    expect(popularitySignal(0, 0)).toBe(0);
    expect(popularitySignal(50, 0)).toBeGreaterThan(0.9);
  });
});

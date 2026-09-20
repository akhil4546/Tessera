import { describe, expect, it } from 'vitest';
import { hashtagParamSchema, rankingWeightsSchema, searchQuerySchema, updateRankingSchema } from './discover';

describe('rankingWeightsSchema', () => {
  it('accepts 0–1 sliders and rejects out of range', () => {
    expect(
      rankingWeightsSchema.safeParse({
        peopleIInteractWith: 0.5,
        newCreators: 1,
        nearby: 0,
        lessVideo: 0.25,
      }).success,
    ).toBe(true);
    expect(
      rankingWeightsSchema.safeParse({
        peopleIInteractWith: 1.2,
        newCreators: 0,
        nearby: 0,
        lessVideo: 0,
      }).success,
    ).toBe(false);
  });
});

describe('updateRankingSchema', () => {
  it('requires at least one slider', () => {
    expect(updateRankingSchema.safeParse({}).success).toBe(false);
    expect(updateRankingSchema.safeParse({ lessVideo: 1 }).success).toBe(true);
  });
});

describe('searchQuerySchema / hashtagParamSchema', () => {
  it('parses query tabs and normalises tags', () => {
    expect(searchQuerySchema.parse({ q: 'clay', tab: 'hashtags' }).tab).toBe('hashtags');
    expect(hashtagParamSchema.parse('#Clay')).toBe('clay');
    expect(hashtagParamSchema.safeParse('!!').success).toBe(false);
  });
});

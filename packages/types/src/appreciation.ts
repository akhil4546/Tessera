/**
 * Four appreciation types (not a single like). Reserved in Phase 0 so later
 * phases do not invent competing enums in web/mobile/api.
 */
export const APPRECIATION_TYPES = ['inspiring', 'funny', 'love', 'useful'] as const;

export type AppreciationType = (typeof APPRECIATION_TYPES)[number];

export const appreciationMeta: Record<
  AppreciationType,
  { emoji: string; labelKey: `appreciation.${AppreciationType}` }
> = {
  inspiring: { emoji: '✨', labelKey: 'appreciation.inspiring' },
  funny: { emoji: '😂', labelKey: 'appreciation.funny' },
  love: { emoji: '💛', labelKey: 'appreciation.love' },
  useful: { emoji: '🎯', labelKey: 'appreciation.useful' },
};

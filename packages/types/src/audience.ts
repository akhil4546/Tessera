export const AUDIENCE_VALUES = ['public', 'followers', 'circles'] as const;

export type AudienceValue = (typeof AUDIENCE_VALUES)[number];

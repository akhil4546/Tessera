export const ACCOUNT_TYPES = ['personal', 'creator', 'business'] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

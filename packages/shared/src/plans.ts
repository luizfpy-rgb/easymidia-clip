export const PLANS = {
  trial: { priceBRL: 0, shortsPerMonth: 5 },
  starter: { priceBRL: 47, shortsPerMonth: 30 },
  pro: { priceBRL: 97, shortsPerMonth: 100 },
  agency: { priceBRL: 297, shortsPerMonth: 500 },
} as const;
export type PlanId = keyof typeof PLANS;

export const PLATFORMS = [
  'youtube',
  'instagram',
  'tiktok',
  'facebook',
  'linkedin',
  'twitter',
  'threads',
  'pinterest',
  'bluesky',
] as const;
export type Platform = (typeof PLATFORMS)[number];

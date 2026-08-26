import type { Platform } from './plans.js';

export const BLOTATO_BASE_URL = 'https://backend.blotato.com/v2';

// content.platform e target.targetType usam o mesmo valor (docs Blotato)
export const BLOTATO_PLATFORM: Record<Platform, string> = {
  youtube: 'youtube',
  instagram: 'instagram',
  tiktok: 'tiktok',
  facebook: 'facebook',
  linkedin: 'linkedin',
  twitter: 'twitter',
  threads: 'threads',
  pinterest: 'pinterest',
  bluesky: 'bluesky',
};

export type BlotatoPostStatus = 'in-progress' | 'scheduled' | 'published' | 'failed';

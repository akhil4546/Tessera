const HASHTAG = /#([a-zA-Z][a-zA-Z0-9_]{0,49})/g;
const MENTION = /@([a-z0-9_]{2,30})/g;

export type CaptionEntities = {
  hashtags: string[];
  mentions: string[];
};

export function parseCaption(caption: string): CaptionEntities {
  const hashtags: string[] = [];
  const mentions: string[] = [];
  for (const match of caption.matchAll(HASHTAG)) {
    const tag = match[1]?.toLowerCase();
    if (tag && !hashtags.includes(tag)) hashtags.push(tag);
  }
  for (const match of caption.matchAll(MENTION)) {
    const handle = match[1]?.toLowerCase();
    if (handle && !mentions.includes(handle)) mentions.push(handle);
  }
  return { hashtags, mentions };
}

export function normalizeHashtag(raw: string): string {
  return raw.replace(/^#/, '').toLowerCase();
}

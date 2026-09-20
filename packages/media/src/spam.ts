const URL_RE = /https?:\/\/[^\s<]+/gi;

export function countUrls(text: string): number {
  return text.match(URL_RE)?.length ?? 0;
}

export function isDuplicateBody(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase() && a.trim().length > 0;
}

/**
 * New accounts dumping several links in a comment or message.
 * Does not fake a bot score — this is a documented heuristic.
 */
export function urlHeavyNewAccount(input: {
  accountAgeMs: number;
  body: string;
  newAccountMs?: number;
  minUrls?: number;
}): boolean {
  const windowMs = input.newAccountMs ?? 24 * 60 * 60 * 1000;
  const minUrls = input.minUrls ?? 3;
  if (input.accountAgeMs > windowMs) return false;
  return countUrls(input.body) >= minUrls;
}

export function duplicateBurst(input: {
  recentBodies: string[];
  body: string;
  minRepeats?: number;
}): boolean {
  const minRepeats = input.minRepeats ?? 3;
  const needle = input.body.trim().toLowerCase();
  if (needle.length < 4) return false;
  const matches = input.recentBodies.filter((row) => row.trim().toLowerCase() === needle).length;
  return matches >= minRepeats;
}

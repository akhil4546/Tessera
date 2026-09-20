/**
 * Remaining minor product rules (age gate + private default + follower DMs already exist).
 * Restricted discoverability: minors stay out of Discover ranking, people suggestions,
 * and public people search unless the viewer already follows them.
 */
export function minorDiscoverableTo(input: {
  isMinor: boolean;
  viewerId?: string | null;
  viewerFollows: boolean;
  isSelf: boolean;
}): boolean {
  if (!input.isMinor) return true;
  if (input.isSelf) return true;
  if (input.viewerFollows) return true;
  return false;
}

export function excludeMinorFromDiscover(isMinor: boolean): boolean {
  return isMinor;
}

export function excludeMinorFromSuggestions(isMinor: boolean): boolean {
  return isMinor;
}

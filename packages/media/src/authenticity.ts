import { adjustmentsAreIdentity, type MediaAdjustments } from './adjustments.ts';

export type AuthenticityKind = 'unfiltered' | 'edited' | 'ai_generated';

export type MediaEditState = {
  filterId: string;
  adjustments: MediaAdjustments;
};

export function mediaWasEdited(items: MediaEditState[]): boolean {
  return items.some((item) => item.filterId !== 'none' || !adjustmentsAreIdentity(item.adjustments));
}

export function assertAuthenticity(
  declared: AuthenticityKind,
  items: MediaEditState[],
): { ok: true } | { ok: false; code: 'AUTHENTICITY_MISMATCH'; message: string } {
  const edited = mediaWasEdited(items);
  if (declared === 'unfiltered' && edited) {
    return {
      ok: false,
      code: 'AUTHENTICITY_MISMATCH',
      message: 'Unfiltered is only for posts with no filters or adjustments.',
    };
  }
  return { ok: true };
}

export function unfilteredBadge(declared: AuthenticityKind, items: MediaEditState[]): boolean {
  return declared === 'unfiltered' && !mediaWasEdited(items);
}

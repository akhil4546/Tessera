export function slugifyPlace(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'place';
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const earthKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const NEARBY_KM_FULL = 25;
export const NEARBY_KM_HALF = 100;
export const NEARBY_KM_QUARTER = 500;

export function nearbySignalFromKm(km: number | null | undefined): number {
  if (km == null || !Number.isFinite(km)) return 0;
  if (km <= NEARBY_KM_FULL) return 1;
  if (km <= NEARBY_KM_HALF) return 0.5;
  if (km <= NEARBY_KM_QUARTER) return 0.25;
  return 0;
}

export function shortestDistanceKm(
  origin: { lat: number; lng: number } | null | undefined,
  targets: Array<{ lat: number; lng: number }>,
): number | null {
  if (!origin || targets.length === 0) return null;
  let best: number | null = null;
  for (const target of targets) {
    const km = haversineKm(origin, target);
    if (best == null || km < best) best = km;
  }
  return best;
}

import { slugifyPlace } from '@tessera/media';
import type { PrismaService } from '../prisma/prisma.service.js';

export type PlaceRow = {
  id: string;
  name: string;
  slug: string;
  lat: number | null;
  lng: number | null;
};

type PlaceClient = {
  place: {
    findUnique: PrismaService['place']['findUnique'];
    create: PrismaService['place']['create'];
    update: PrismaService['place']['update'];
  };
};

export async function upsertPlaceByName(
  db: PlaceClient,
  name: string | null | undefined,
  coords?: { lat: number; lng: number } | null,
): Promise<PlaceRow | null> {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  const slug = slugifyPlace(trimmed);
  const existing = await db.place.findUnique({ where: { slug } });
  if (existing) {
    if (existing.lat == null && existing.lng == null && coords) {
      return db.place.update({
        where: { id: existing.id },
        data: { lat: coords.lat, lng: coords.lng, name: trimmed },
      });
    }
    return existing;
  }
  return db.place.create({
    data: {
      name: trimmed,
      slug,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    },
  });
}

export function toPlacePreview(place: PlaceRow | null | undefined) {
  if (!place) return null;
  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
  };
}

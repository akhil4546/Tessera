/**
 * Phase 9 seed: identity through organisation, plus safety (reports, restrict, admin).
 * Password for every seeded account: Seedpass1!
 * Admin: admin@tessera.test / Adminpass1!
 */
import path from 'node:path';
import argon2 from 'argon2';
import { config as loadEnv } from 'dotenv';
import sharp from 'sharp';
import { createPrismaClient } from '@tessera/db';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  createObjectStorage,
  fanoutPost,
  ffmpegAvailable,
  indexPublishedPost,
  indexUserProfile,
  processImage,
  processLoop,
  resolveStorageConfig,
  slugifyPlace,
  synthesizeTestVideo,
} from '@tessera/media';

loadEnv({ path: path.resolve(process.cwd(), '.env') });
loadEnv({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const PASSWORD = 'Seedpass1!';

type SeedUser = {
  email: string;
  handle: string;
  displayName: string;
  bio: string;
  dateOfBirth: string;
  isPrivate?: boolean;
  isMinor?: boolean;
  pronouns?: string;
  links?: { title: string; url: string }[];
};

const USERS: SeedUser[] = [
  {
    email: 'asha@tessera.test',
    handle: 'asha_climbs',
    displayName: 'Asha',
    bio: 'Granite, chalk, and slow mornings. https://asha.example',
    dateOfBirth: '1994-03-12',
    pronouns: 'she/her',
    links: [{ title: 'Notes', url: 'https://asha.example' }],
  },
  {
    email: 'ravi@tessera.test',
    handle: 'ravi_makes',
    displayName: 'Ravi',
    bio: 'Wood, tea, and badly tuned radios.',
    dateOfBirth: '1991-11-02',
  },
  {
    email: 'june@tessera.test',
    handle: 'june_private',
    displayName: 'June',
    bio: 'Private on purpose.',
    dateOfBirth: '1996-07-22',
    isPrivate: true,
  },
  {
    email: 'leo@tessera.test',
    handle: 'leo_blocks',
    displayName: 'Leo',
    bio: 'Keeps a short list.',
    dateOfBirth: '1988-01-30',
  },
  {
    email: 'nia@tessera.test',
    handle: 'nia_notes',
    displayName: 'Nia',
    bio: 'Field notes, not captions.',
    dateOfBirth: '1998-05-09',
  },
  {
    email: 'kenji@tessera.test',
    handle: 'kenji_loop',
    displayName: 'Kenji',
    bio: 'Original audio only.',
    dateOfBirth: '1995-09-18',
  },
  {
    email: 'mara@tessera.test',
    handle: 'mara_tiles',
    displayName: 'Mara',
    bio: 'Mosaic, not grid.',
    dateOfBirth: '1993-02-14',
  },
  {
    email: 'omar@tessera.test',
    handle: 'omar_maps',
    displayName: 'Omar',
    bio: 'Places I actually stood.',
    dateOfBirth: '1990-12-01',
  },
  {
    email: 'piotr@tessera.test',
    handle: 'piotr_lab',
    displayName: 'Piotr',
    bio: 'Experiments that did not explode.',
    dateOfBirth: '1987-08-21',
  },
  {
    email: 'yara@tessera.test',
    handle: 'yara_film',
    displayName: 'Yara',
    bio: 'Unfiltered when it counts.',
    dateOfBirth: '1999-04-04',
  },
  {
    email: 'bea@tessera.test',
    handle: 'bea_garden',
    displayName: 'Bea',
    bio: 'Soil under the nails.',
    dateOfBirth: '1992-06-16',
  },
  {
    email: 'tess@tessera.test',
    handle: 'tess_well',
    displayName: 'Tess',
    bio: 'Not the product. Just a person.',
    dateOfBirth: '1997-10-11',
  },
  {
    email: 'iris@tessera.test',
    handle: 'iris_minor',
    displayName: 'Iris',
    bio: 'Sixteen. Private by default. Not in Discover.',
    dateOfBirth: '2010-04-12',
    isMinor: true,
    isPrivate: true,
  },
];

async function tile(color: string, label: string, width: number, height: number): Promise<Buffer> {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="${color}"/>
    <text x="50%" y="50%" fill="#F4EDE3" font-size="48" font-family="Georgia, serif" text-anchor="middle" dominant-baseline="middle">${label}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

async function main() {
  const prisma = createPrismaClient();
  const storage = createObjectStorage(resolveStorageConfig());
  await storage.ensureReady();
  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 4096, timeCost: 1 });

  console.log('Tessera seed: identity graph + posts + Moments + Loops + Discovery + Inbox + notifications + Circles + Boards…');
  await prisma.draft.deleteMany({
    where: { user: { email: { endsWith: '@tessera.test' } } },
  });
  await prisma.board.deleteMany({
    where: { owner: { email: { endsWith: '@tessera.test' } } },
  });
  await prisma.circle.deleteMany({
    where: { owner: { email: { endsWith: '@tessera.test' } } },
  });
  await prisma.notification.deleteMany({
    where: { recipient: { email: { endsWith: '@tessera.test' } } },
  });
  await prisma.conversation.deleteMany({
    where: { createdBy: { email: { endsWith: '@tessera.test' } } },
  });
  await prisma.moment.deleteMany({
    where: { author: { email: { endsWith: '@tessera.test' } } },
  });
  await prisma.reelShelf.deleteMany({
    where: { user: { email: { endsWith: '@tessera.test' } } },
  });
  await prisma.post.deleteMany({
    where: { author: { email: { endsWith: '@tessera.test' } } },
  });

  const ids = new Map<string, string>();

  for (const person of USERS) {
    const user = await prisma.user.upsert({
      where: { email: person.email },
      create: {
        email: person.email,
        passwordHash,
        handle: person.handle,
        dateOfBirth: new Date(person.dateOfBirth),
        isMinor: person.isMinor ?? false,
        emailVerifiedAt: new Date(),
        profile: {
          create: {
            displayName: person.displayName,
            bio: person.bio,
            pronouns: person.pronouns ?? null,
            isPrivate: person.isPrivate ?? false,
            whoCanMessage: person.isMinor ? 'followers' : 'everyone',
            links: person.links ?? [],
          },
        },
      },
      update: {
        passwordHash,
        handle: person.handle,
        emailVerifiedAt: new Date(),
        isMinor: person.isMinor ?? false,
        profile: {
          update: {
            displayName: person.displayName,
            bio: person.bio,
            pronouns: person.pronouns ?? null,
            isPrivate: person.isPrivate ?? false,
            whoCanMessage: person.isMinor ? 'followers' : undefined,
            links: person.links ?? [],
          },
        },
      },
    });
    ids.set(person.handle, user.id);
  }

  async function follow(follower: string, followee: string, status: 'accepted' | 'pending' = 'accepted') {
    const followerId = ids.get(follower);
    const followeeId = ids.get(followee);
    if (!followerId || !followeeId) throw new Error('missing seed id');
    await prisma.follow.upsert({
      where: { followerId_followeeId: { followerId, followeeId } },
      create: {
        followerId,
        followeeId,
        status,
        acceptedAt: status === 'accepted' ? new Date() : null,
      },
      update: { status, acceptedAt: status === 'accepted' ? new Date() : null },
    });
  }

  await follow('asha_climbs', 'ravi_makes');
  await follow('asha_climbs', 'nia_notes');
  await follow('asha_climbs', 'mara_tiles');
  await follow('asha_climbs', 'kenji_loop');
  await follow('ravi_makes', 'asha_climbs');
  await follow('nia_notes', 'asha_climbs');
  await follow('mara_tiles', 'kenji_loop');
  await follow('kenji_loop', 'yara_film');
  await follow('yara_film', 'bea_garden');
  await follow('bea_garden', 'tess_well');
  await follow('tess_well', 'asha_climbs');
  await follow('piotr_lab', 'omar_maps');
  await follow('omar_maps', 'piotr_lab');
  await follow('asha_climbs', 'june_private', 'pending');
  await follow('piotr_lab', 'asha_climbs', 'pending');

  const leo = ids.get('leo_blocks');
  const omar = ids.get('omar_maps');
  if (leo && omar) {
    await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: leo, blockedId: omar } },
      create: { blockerId: leo, blockedId: omar },
      update: {},
    });
    await prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: leo, followeeId: omar },
          { followerId: omar, followeeId: leo },
        ],
      },
    });
  }

  const asha = ids.get('asha_climbs');
  const kenji = ids.get('kenji_loop');
  if (asha && kenji) {
    await prisma.mute.upsert({
      where: { muterId_mutedId: { muterId: asha, mutedId: kenji } },
      create: { muterId: asha, mutedId: kenji, scope: 'moments' },
      update: { scope: 'moments' },
    });
  }

  const palettes: [string, string, number, number][] = [
    ['#C8553D', 'Clay ridge', 1200, 1500],
    ['#5B7553', 'Moss wall', 1600, 1000],
    ['#1F1B16', 'Ink hour', 1000, 1000],
    ['#4A5A6A', 'Slate bowl', 1200, 1600],
    ['#B04732', 'Hearth', 1400, 1050],
  ];

  async function upsertPlace(name: string, coords?: { lat: number; lng: number }) {
    const slug = slugifyPlace(name);
    return prisma.place.upsert({
      where: { slug },
      create: { name, slug, lat: coords?.lat ?? null, lng: coords?.lng ?? null },
      update: {
        name,
        lat: coords?.lat ?? undefined,
        lng: coords?.lng ?? undefined,
      },
    });
  }

  async function makePost(opts: {
    handle: string;
    caption: string;
    authenticity: 'unfiltered' | 'edited' | 'ai_generated';
    publishedAt: Date;
    palette: number;
    filterId?: string;
    locationName?: string;
    coords?: { lat: number; lng: number };
  }) {
    const authorId = ids.get(opts.handle);
    if (!authorId) throw new Error(opts.handle);
    const [color, label, w, h] = palettes[opts.palette % palettes.length]!;
    const jpeg = await tile(color, label, w, h);
    const processed = await processImage(jpeg, { filterId: opts.filterId ?? 'none' });
    const place = opts.locationName ? await upsertPlace(opts.locationName, opts.coords) : null;
    const post = await prisma.post.create({
      data: {
        authorId,
        caption: opts.caption,
        authenticity: opts.authenticity,
        visibility: 'public',
        locationName: opts.locationName ?? null,
        placeId: place?.id ?? null,
        publishedAt: opts.publishedAt,
      },
    });
    const originalKey = `post/${authorId}/${post.id}/original.jpg`;
    await storage.put(originalKey, jpeg, 'image/jpeg');
    const widths: Record<string, { webp: string; avif: string }> = {};
    for (const variant of processed.variants) {
      const webpKey = `${originalKey}.w${variant.width}.webp`;
      const avifKey = `${originalKey}.w${variant.width}.avif`;
      await storage.put(webpKey, variant.webp, 'image/webp');
      await storage.put(avifKey, variant.avif, 'image/avif');
      widths[String(variant.width)] = { webp: webpKey, avif: avifKey };
    }
    await prisma.mediaItem.create({
      data: {
        ownerId: authorId,
        postId: post.id,
        purpose: 'post',
        kind: 'image',
        mimeType: 'image/jpeg',
        byteSize: jpeg.length,
        originalKey,
        variants: { widths },
        width: processed.width,
        height: processed.height,
        aspect: processed.aspect,
        blurhash: processed.blurhash,
        altText: `${label} — placeholder seed tile`,
        filterId: opts.filterId ?? 'none',
        status: 'ready',
        sortOrder: 0,
      },
    });
    const tags = [...opts.caption.matchAll(/#([a-zA-Z][a-zA-Z0-9_]{0,49})/g)].map((m) => m[1]!.toLowerCase());
    for (const tag of tags) {
      const hashtag = await prisma.hashtag.upsert({ where: { tag }, create: { tag }, update: {} });
      await prisma.postHashtag.create({ data: { postId: post.id, hashtagId: hashtag.id } });
    }
    await fanoutPost(prisma, post.id);
    return post;
  }

  const now = Date.now();
  const raviNew = await makePost({
    handle: 'ravi_makes',
    caption: 'The chair finally sits right. #wood #hearth',
    authenticity: 'edited',
    publishedAt: new Date(now - 2 * 60 * 60 * 1000),
    palette: 4,
    filterId: 'hearth',
  });
  const niaNew = await makePost({
    handle: 'nia_notes',
    caption: 'Field note: wind from the west. #chalk',
    authenticity: 'unfiltered',
    publishedAt: new Date(now - 5 * 60 * 60 * 1000),
    palette: 2,
  });
  const maraHero = await makePost({
    handle: 'mara_tiles',
    caption: 'Not a grid. A mosaic. #clay',
    authenticity: 'edited',
    publishedAt: new Date(now - 8 * 60 * 60 * 1000),
    palette: 0,
    filterId: 'clay',
    locationName: 'Studio floor',
    coords: { lat: 52.3676, lng: 4.9041 },
  });
  const maraOld = await makePost({
    handle: 'mara_tiles',
    caption: 'Wide cloth, slow dye.',
    authenticity: 'edited',
    publishedAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
    palette: 1,
    filterId: 'moss',
  });
  const ashaOwn = await makePost({
    handle: 'asha_climbs',
    caption: 'Granite that still has morning on it. #climb',
    authenticity: 'unfiltered',
    publishedAt: new Date(now - 30 * 60 * 60 * 1000),
    palette: 3,
    locationName: 'Hampi boulders',
    coords: { lat: 15.335, lng: 76.46 },
  });
  const raviOld = await makePost({
    handle: 'ravi_makes',
    caption: 'Tea before the glue sets.',
    authenticity: 'unfiltered',
    publishedAt: new Date(now - 6 * 24 * 60 * 60 * 1000),
    palette: 2,
  });

  await makePost({
    handle: 'omar_maps',
    caption: 'Stood here, not a pin from a camera. #climb',
    authenticity: 'unfiltered',
    publishedAt: new Date(now - 4 * 60 * 60 * 1000),
    palette: 3,
    locationName: 'Hampi boulders',
    coords: { lat: 15.335, lng: 76.46 },
  });
  await makePost({
    handle: 'omar_maps',
    caption: 'Courtyard shade, Jaipur. #clay',
    authenticity: 'edited',
    publishedAt: new Date(now - 26 * 60 * 60 * 1000),
    palette: 0,
    filterId: 'hearth',
    locationName: 'Jaipur courtyard',
    coords: { lat: 26.9124, lng: 75.7873 },
  });
  await makePost({
    handle: 'omar_maps',
    caption: 'Tiles that outlast the story. #clay',
    authenticity: 'unfiltered',
    publishedAt: new Date(now - 9 * 24 * 60 * 60 * 1000),
    palette: 4,
    locationName: 'Lisbon tiles',
    coords: { lat: 38.7223, lng: -9.1393 },
  });
  await makePost({
    handle: 'piotr_lab',
    caption: 'The kiln did not explode. #clay',
    authenticity: 'edited',
    publishedAt: new Date(now - 3 * 60 * 60 * 1000),
    palette: 0,
    filterId: 'clay',
  });
  await makePost({
    handle: 'bea_garden',
    caption: 'Soil under the nails. #garden',
    authenticity: 'unfiltered',
    publishedAt: new Date(now - 7 * 60 * 60 * 1000),
    palette: 1,
    locationName: "Bea's allotment",
    coords: { lat: 51.4545, lng: -2.5879 },
  });
  await makePost({
    handle: 'tess_well',
    caption: 'A pause, not a streak. #garden',
    authenticity: 'unfiltered',
    publishedAt: new Date(now - 90 * 60 * 1000),
    palette: 2,
  });
  await makePost({
    handle: 'yara_film',
    caption: 'Unfiltered window. #light',
    authenticity: 'unfiltered',
    publishedAt: new Date(now - 6 * 60 * 60 * 1000),
    palette: 2,
  });

  if (asha) {
    for (const tag of ['clay', 'climb']) {
      const hashtag = await prisma.hashtag.upsert({ where: { tag }, create: { tag }, update: {} });
      await prisma.hashtagFollow.upsert({
        where: { userId_hashtagId: { userId: asha, hashtagId: hashtag.id } },
        create: { userId: asha, hashtagId: hashtag.id },
        update: {},
      });
    }
  }

  if (asha) {
    await prisma.appreciation.upsert({
      where: { userId_postId: { userId: asha, postId: raviNew.id } },
      create: { userId: asha, postId: raviNew.id, kind: 'useful' },
      update: { kind: 'useful' },
    });
    await prisma.comment.create({
      data: { postId: raviNew.id, authorId: asha, body: 'The grain is doing the talking.' },
    });
    await prisma.feedState.upsert({
      where: { userId: asha },
      create: {
        userId: asha,
        followingCaughtUpAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
      },
      update: { followingCaughtUpAt: new Date(now - 2 * 24 * 60 * 60 * 1000) },
    });
    await prisma.heroTile.deleteMany({ where: { userId: asha } });
    await prisma.heroTile.create({ data: { userId: asha, postId: ashaOwn.id, position: 0 } });
  }

  const maraId = ids.get('mara_tiles');
  if (maraId) {
    await prisma.heroTile.deleteMany({ where: { userId: maraId } });
    await prisma.heroTile.create({ data: { userId: maraId, postId: maraHero.id, position: 0 } });
    await prisma.heroTile.create({ data: { userId: maraId, postId: maraOld.id, position: 1 } });
  }

  void niaNew;
  void raviOld;

  async function makeMoment(opts: {
    handle: string;
    palette: number;
    publishedAt: Date;
    stickers?: Array<{
      kind: 'text' | 'hashtag' | 'poll' | 'location';
      x: number;
      y: number;
      payload: Record<string, unknown>;
    }>;
  }) {
    const authorId = ids.get(opts.handle);
    if (!authorId) throw new Error(opts.handle);
    const [color, label, w, h] = palettes[opts.palette % palettes.length]!;
    const jpeg = await tile(color, label, w, h);
    const processed = await processImage(jpeg);
    const originalKey = `moment/${authorId}/${crypto.randomUUID()}/original.jpg`;
    await storage.put(originalKey, jpeg, 'image/jpeg');
    const widths: Record<string, { webp: string; avif: string }> = {};
    for (const variant of processed.variants) {
      const webpKey = `${originalKey}.w${variant.width}.webp`;
      const avifKey = `${originalKey}.w${variant.width}.avif`;
      await storage.put(webpKey, variant.webp, 'image/webp');
      await storage.put(avifKey, variant.avif, 'image/avif');
      widths[String(variant.width)] = { webp: webpKey, avif: avifKey };
    }
    const media = await prisma.mediaItem.create({
      data: {
        ownerId: authorId,
        purpose: 'moment',
        kind: 'image',
        mimeType: 'image/jpeg',
        byteSize: jpeg.length,
        originalKey,
        variants: { widths },
        width: processed.width,
        height: processed.height,
        aspect: processed.aspect,
        blurhash: processed.blurhash,
        altText: `${label} — Moment seed tile`,
        status: 'ready',
      },
    });
    const expiresAt = new Date(opts.publishedAt.getTime() + 24 * 60 * 60 * 1000);
    const moment = await prisma.moment.create({
      data: {
        authorId,
        visibility: 'public',
        publishedAt: opts.publishedAt,
        expiresAt,
        segments: {
          create: {
            mediaId: media.id,
            sortOrder: 0,
            durationMs: 5000,
            stickers: {
              create: (opts.stickers ?? []).map((sticker) => ({
                kind: sticker.kind,
                x: sticker.x,
                y: sticker.y,
                payload: sticker.payload,
              })),
            },
          },
        },
      },
    });
    return { moment, media };
  }

  const ashaMoment = await makeMoment({
    handle: 'asha_climbs',
    palette: 3,
    publishedAt: new Date(now - 40 * 60 * 1000),
    stickers: [{ kind: 'text', x: 0.5, y: 0.82, payload: { text: 'Chalk still on the holds', color: '#F4EDE3', align: 'center' } }],
  });
  await makeMoment({
    handle: 'ravi_makes',
    palette: 4,
    publishedAt: new Date(now - 90 * 60 * 1000),
    stickers: [
      {
        kind: 'poll',
        x: 0.5,
        y: 0.7,
        payload: { prompt: 'Glue or dowel?', options: ['Glue', 'Dowel'] },
      },
    ],
  });
  await makeMoment({
    handle: 'nia_notes',
    palette: 2,
    publishedAt: new Date(now - 3 * 60 * 60 * 1000),
    stickers: [{ kind: 'hashtag', x: 0.28, y: 0.18, payload: { tag: 'wind' } }],
  });
  const maraLive = await makeMoment({
    handle: 'mara_tiles',
    palette: 0,
    publishedAt: new Date(now - 20 * 60 * 1000),
    stickers: [{ kind: 'location', x: 0.5, y: 0.12, payload: { name: 'Studio floor' } }],
  });
  await makeMoment({
    handle: 'kenji_loop',
    palette: 1,
    publishedAt: new Date(now - 15 * 60 * 1000),
    stickers: [{ kind: 'text', x: 0.5, y: 0.8, payload: { text: 'Original audio only', color: '#F4EDE3', align: 'center' } }],
  });

  if (maraId) {
    const shelf = await prisma.reelShelf.create({
      data: {
        userId: maraId,
        title: 'Studio light',
        coverMediaId: maraLive.media.id,
        sortOrder: 0,
      },
    });
    await prisma.reelShelfItem.create({
      data: { shelfId: shelf.id, momentId: maraLive.moment.id, sortOrder: 0 },
    });
  }

  void ashaMoment;

  const tessId = ids.get('tess_well');
  if (tessId) {
    await prisma.wellbeingSetting.upsert({
      where: { userId: tessId },
      create: { userId: tessId, loopsBudgetMinutes: 15 },
      update: { loopsBudgetMinutes: 15 },
    });
  }

  if (await ffmpegAvailable()) {
    const dir = await mkdtemp(path.join(tmpdir(), 'tessera-seed-loop-'));
    try {
      async function makeLoop(opts: {
        handle: string;
        caption: string;
        color: string;
        publishedAt: Date;
        allowAudioReuse?: boolean;
        audioTrackId?: string;
      }) {
        const authorId = ids.get(opts.handle);
        if (!authorId) throw new Error(opts.handle);
        const dest = path.join(dir, `${opts.handle}.mp4`);
        await synthesizeTestVideo({ dest, durationSec: 2, color: opts.color, withTone: true });
        const video = await readFile(dest);
        const originalKey = `loop/${authorId}/${crypto.randomUUID()}/original.mp4`;
        await storage.put(originalKey, video, 'video/mp4');
        const media = await prisma.mediaItem.create({
          data: {
            ownerId: authorId,
            purpose: 'loop',
            kind: 'video',
            mimeType: 'video/mp4',
            byteSize: video.length,
            originalKey,
            status: 'uploaded',
            altText: opts.caption || 'Seed Loop',
          },
        });
        const post = await prisma.post.create({
          data: {
            authorId,
            kind: 'loop',
            caption: opts.caption,
            authenticity: 'unfiltered',
            visibility: 'public',
            publishedAt: opts.publishedAt,
          },
        });
        await prisma.mediaItem.update({ where: { id: media.id }, data: { postId: post.id } });
        await prisma.loop.create({
          data: {
            postId: post.id,
            allowAudioReuse: opts.allowAudioReuse ?? true,
            audioTrackId: opts.audioTrackId ?? null,
            captionStatus: 'pending',
            overlays: [{ text: 'original audio', x: 0.5, y: 0.82, rotation: 0, scale: 1, startMs: 0, endMs: null, color: '#F4EDE3' }],
            clips: [{ mediaId: media.id, trimStartMs: 0, trimEndMs: 2000, speed: 1 }],
          },
        });
        const tags = [...opts.caption.matchAll(/#([a-zA-Z][a-zA-Z0-9_]{0,49})/g)].map((m) => m[1]!.toLowerCase());
        for (const tag of tags) {
          const hashtag = await prisma.hashtag.upsert({ where: { tag }, create: { tag }, update: {} });
          await prisma.postHashtag.upsert({
            where: { postId_hashtagId: { postId: post.id, hashtagId: hashtag.id } },
            create: { postId: post.id, hashtagId: hashtag.id },
            update: {},
          });
        }
        await processLoop(prisma, storage, post.id, {
          info: (obj, msg) => console.log(msg, obj),
          warn: (obj, msg) => console.warn(msg, obj),
          error: (obj, msg) => console.error(msg, obj),
        });
        return prisma.post.findUniqueOrThrow({ where: { id: post.id }, include: { loop: true } });
      }

      const kenjiLoop = await makeLoop({
        handle: 'kenji_loop',
        caption: 'Yard dust. Original audio. #clay',
        color: '0x5B7553',
        publishedAt: new Date(now - 50 * 60 * 1000),
      });
      const yaraLoop = await makeLoop({
        handle: 'yara_film',
        caption: 'Unfiltered light, borrowed sound.',
        color: '0xC8553D',
        publishedAt: new Date(now - 25 * 60 * 1000),
        audioTrackId: kenjiLoop.loop?.audioTrackId ?? undefined,
      });
      void yaraLoop;
      if (asha) {
        await prisma.feedState.upsert({
          where: { userId: asha },
          create: {
            userId: asha,
            followingCaughtUpAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
          },
          update: {},
        });
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  } else {
    console.warn('FFMPEG_MISSING: seed skipped Loops. Install FFmpeg to generate placeholder vertical video.');
  }

  const allUsers = await prisma.user.findMany({
    where: { email: { endsWith: '@tessera.test' } },
    select: { id: true },
  });
  for (const user of allUsers) await indexUserProfile(prisma, user.id);
  const allPosts = await prisma.post.findMany({
    where: { author: { email: { endsWith: '@tessera.test' } }, publishedAt: { not: null } },
    select: { id: true },
  });
  for (const post of allPosts) await indexPublishedPost(prisma, post.id);

  const ashaId = ids.get('asha_climbs');
  const raviId = ids.get('ravi_makes');
  const niaId = ids.get('nia_notes');
  const maraId = ids.get('mara_tiles');
  const omarId = ids.get('omar_maps');
  if (ashaId && raviId && niaId && maraId && omarId) {
    const pair = ashaId < raviId ? { userLowId: ashaId, userHighId: raviId } : { userLowId: raviId, userHighId: ashaId };
    const direct = await prisma.conversation.create({
      data: {
        kind: 'direct',
        createdById: ashaId,
        members: { create: [{ userId: ashaId, role: 'owner' }, { userId: raviId, role: 'member' }] },
        pair: { create: pair },
      },
    });
    const first = await prisma.message.create({
      data: {
        conversationId: direct.id,
        senderId: raviId,
        kind: 'text',
        body: 'The chair grain caught the afternoon. Did you see it?',
        bodyEncoding: 'plaintext',
      },
    });
    const second = await prisma.message.create({
      data: {
        conversationId: direct.id,
        senderId: ashaId,
        kind: 'text',
        body: 'I did. Slow light on oak is my favourite kind of tile.',
        bodyEncoding: 'plaintext',
      },
    });
    await prisma.conversation.update({
      where: { id: direct.id },
      data: { lastMessageAt: second.createdAt, lastMessageId: second.id },
    });
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: direct.id, userId: ashaId } },
      data: { lastReadMessageId: second.id, lastDeliveredMessageId: second.id },
    });
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: direct.id, userId: raviId } },
      data: { lastReadMessageId: first.id, lastDeliveredMessageId: second.id },
    });

    const group = await prisma.conversation.create({
      data: {
        kind: 'group',
        title: 'Clay crew',
        createdById: ashaId,
        members: {
          create: [
            { userId: ashaId, role: 'owner' },
            { userId: niaId, role: 'member' },
            { userId: maraId, role: 'member' },
          ],
        },
      },
    });
    const groupMsg = await prisma.message.create({
      data: {
        conversationId: group.id,
        senderId: niaId,
        kind: 'text',
        body: 'Field notes from the ridge. Meet after the heat drops?',
        bodyEncoding: 'plaintext',
      },
    });
    await prisma.conversation.update({
      where: { id: group.id },
      data: { lastMessageAt: groupMsg.createdAt, lastMessageId: groupMsg.id },
    });

    const requestPair =
      omarId < ashaId ? { userLowId: omarId, userHighId: ashaId } : { userLowId: ashaId, userHighId: omarId };
    const requestThread = await prisma.conversation.create({
      data: {
        kind: 'direct',
        createdById: omarId,
        members: { create: [{ userId: omarId, role: 'owner' }, { userId: ashaId, role: 'member' }] },
        pair: { create: requestPair },
        request: { create: { fromUserId: omarId, toUserId: ashaId, status: 'pending' } },
      },
    });
    const requestMsg = await prisma.message.create({
      data: {
        conversationId: requestThread.id,
        senderId: omarId,
        kind: 'text',
        body: 'That courtyard in Jaipur — was the dust as red as it looks?',
        bodyEncoding: 'plaintext',
      },
    });
    await prisma.conversation.update({
      where: { id: requestThread.id },
      data: { lastMessageAt: requestMsg.createdAt, lastMessageId: requestMsg.id },
    });
  }

  const tessId = ids.get('tess_well');
  const piotrId = ids.get('piotr_lab');
  if (ashaId && raviId && niaId && tessId && piotrId) {
    await prisma.notification.create({
      data: {
        recipientId: ashaId,
        kind: 'appreciation',
        aggregateKey: `appreciation:${ashaOwn.id}`,
        actorIds: [raviId, niaId],
        actorCount: 2,
        targetType: 'post',
        targetId: ashaOwn.id,
        href: `/p/${ashaOwn.id}`,
        payload: { postId: ashaOwn.id },
      },
    });
    await prisma.notification.create({
      data: {
        recipientId: ashaId,
        kind: 'comment',
        aggregateKey: `comment:${ashaOwn.id}`,
        actorIds: [niaId],
        actorCount: 1,
        targetType: 'post',
        targetId: ashaOwn.id,
        preview: 'The granite looks slower in this light.',
        href: `/p/${ashaOwn.id}`,
        payload: { postId: ashaOwn.id },
      },
    });
    await prisma.notification.create({
      data: {
        recipientId: ashaId,
        kind: 'new_follower',
        aggregateKey: 'new_follower',
        actorIds: [tessId],
        actorCount: 1,
        targetType: 'user',
        targetId: tessId,
        href: '/u/tess_well',
      },
    });
    await prisma.notification.create({
      data: {
        recipientId: ashaId,
        kind: 'follow_request',
        aggregateKey: `follow_request:${piotrId}`,
        actorIds: [piotrId],
        actorCount: 1,
        targetType: 'user',
        targetId: piotrId,
        href: '/settings/requests',
      },
    });
    await prisma.notificationPreference.upsert({
      where: { userId: ashaId },
      create: { userId: ashaId, timezone: 'UTC' },
      update: {},
    });
  }

  const juneId = ids.get('june_private');
  if (ashaId && raviId && niaId && juneId) {
    const family = await prisma.circle.create({
      data: { ownerId: ashaId, name: 'Family', members: { create: [{ userId: juneId }] } },
    });
    const crew = await prisma.circle.create({
      data: {
        ownerId: ashaId,
        name: 'Climbing crew',
        members: { create: [{ userId: raviId }, { userId: niaId }] },
      },
    });
    void family;
    void crew;

    const saved = await prisma.board.create({
      data: { ownerId: ashaId, title: 'Saved', isDefault: true, visibility: 'private' },
    });
    const granite = await prisma.board.create({
      data: {
        ownerId: ashaId,
        title: 'Granite',
        description: 'Holds we actually used.',
        visibility: 'public',
      },
    });
    if (ashaOwn) {
      await prisma.boardItem.create({
        data: { boardId: saved.id, postId: ashaOwn.id, addedById: ashaId },
      });
      await prisma.boardItem.create({
        data: { boardId: granite.id, postId: ashaOwn.id, addedById: ashaId },
      });
    }
    await prisma.boardCollaborator.create({
      data: { boardId: granite.id, userId: raviId, acceptedAt: new Date() },
    });
    await prisma.notification.create({
      data: {
        recipientId: raviId,
        kind: 'board_invite',
        aggregateKey: `board_invite:${granite.id}`,
        actorIds: [ashaId],
        actorCount: 1,
        targetType: 'board',
        targetId: granite.id,
        href: `/boards/${granite.id}`,
        payload: { boardId: granite.id, title: granite.title },
      },
    });
    await prisma.draft.create({
      data: {
        userId: ashaId,
        kind: 'post',
        payload: { caption: 'A draft from the ridge. Syncs to mobile.' },
      },
    });
    const due = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const scheduled = await prisma.post.create({
      data: {
        authorId: ashaId,
        kind: 'post',
        visibility: 'public',
        caption: 'Scheduled: morning light, not yet.',
        authenticity: 'edited',
        scheduledAt: due,
      },
    });
    void scheduled;

    await prisma.restrict.upsert({
      where: { restrictorId_restrictedId: { restrictorId: ashaId, restrictedId: piotrId } },
      create: { restrictorId: ashaId, restrictedId: piotrId },
      update: {},
    });
    if (ashaOwn) {
      await prisma.post.update({ where: { id: ashaOwn.id }, data: { sensitive: true } });
      const existingCase = await prisma.moderationCase.findFirst({
        where: { targetKind: 'post', targetId: ashaOwn.id },
      });
      const moderationCase =
        existingCase ??
        (await prisma.moderationCase.create({
          data: {
            source: 'report',
            targetKind: 'post',
            targetId: ashaOwn.id,
            subjectUserId: ashaId,
            summary: 'Seed report: Omar flagged Asha’s public tile.',
          },
        }));
      await prisma.report.deleteMany({ where: { reporterId: omarId, targetId: ashaOwn.id } });
      await prisma.report.create({
        data: {
          reporterId: omarId,
          targetKind: 'post',
          targetId: ashaOwn.id,
          reportedUserId: ashaId,
          reason: 'spam',
          details: 'Seeded report so the admin queue is not empty.',
          status: 'linked',
          caseId: moderationCase.id,
        },
      });
    }
  }

  await prisma.keywordFilter.upsert({
    where: { keyword: 'scam' },
    create: { keyword: 'scam', action: 'queue' },
    update: { action: 'queue' },
  });

  const adminHash = await argon2.hash('Adminpass1!', { type: argon2.argon2id, memoryCost: 4096, timeCost: 1 });
  await prisma.adminUser.upsert({
    where: { email: 'admin@tessera.test' },
    create: {
      email: 'admin@tessera.test',
      passwordHash: adminHash,
      displayName: 'Seed Admin',
      role: 'superadmin',
    },
    update: { passwordHash: adminHash, role: 'superadmin', disabledAt: null },
  });

  await prisma.$disconnect();
  console.log(
    `Seeded ${USERS.length} users plus safety. Sign in as asha@tessera.test / ${PASSWORD}. Admin: admin@tessera.test / Adminpass1!`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

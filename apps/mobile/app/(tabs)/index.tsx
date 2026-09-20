import { useCallback, useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View, useColorScheme } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { TesseraApiError } from '@tessera/api-client';
import type { FollowingFeed, MomentCard, MomentTray, PostCard } from '@tessera/types';
import { appreciationMeta, QUICK_EMOJIS } from '@tessera/types';
import { api } from '../../src/api';
import { colors, layout } from '../../src/theme';
import { t } from '../../src/t';
import { EmptyScreen } from '../../src/empty-screen';
import { mediaSrc } from '../../src/media';

export default function HomeScreen() {
  const router = useRouter();
  const c = colors(useColorScheme());
  const [feed, setFeed] = useState<FollowingFeed | null | undefined>(undefined);
  const [tray, setTray] = useState<MomentTray | null>(null);
  const [openHandle, setOpenHandle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let active = true;
    api
      .followingFeed()
      .then((data) => {
        if (active) setFeed(data);
      })
      .catch((err) => {
        if (err instanceof TesseraApiError && err.status === 401) setFeed(null);
        else setError(err instanceof Error ? err.message : 'error');
      });
    api
      .momentTray()
      .then((data) => {
        if (active) setTray(data);
      })
      .catch(() => {
        if (active) setTray(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(load);

  if (feed === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: c.surface, padding: 24 }}>
        <Text style={{ color: c.textSecondary }}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (!feed) {
    return <EmptyScreen kicker={t('nav.home')} titleKey="empty.home.title" bodyKey="empty.home.body" />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Text style={{ color: c.slate, fontSize: 11, fontWeight: '600', letterSpacing: 1.4, textTransform: 'uppercase' }}>
        {t('common.phase')} · {t('nav.home')}
      </Text>
      <Pressable
        onPress={() => router.push('/loops')}
        style={{ minHeight: layout.touch, justifyContent: 'center' }}
      >
        <Text style={{ color: c.accent }}>{t('feed.loops')}</Text>
      </Pressable>
      {tray?.rings.length ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {tray.rings.map((ring) => {
            const uri = mediaSrc(ring.preview?.srcset.at(-1)?.webp ?? ring.author.avatarUrl);
            return (
              <Pressable key={ring.author.id} onPress={() => setOpenHandle(ring.author.handle)} style={{ width: 72, alignItems: 'center' }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 12,
                    overflow: 'hidden',
                    borderWidth: 2,
                    borderColor: ring.unseenCount > 0 && !ring.isSelf ? c.accent : c.border,
                  }}
                >
                  {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} /> : null}
                </View>
                <Text numberOfLines={1} style={{ color: c.textPrimary, fontSize: 11, marginTop: 4 }}>
                  {ring.isSelf ? t('feed.yourMoment') : ring.author.handle}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {feed.items.length === 0 ? (
        <Text style={{ color: c.textSecondary }}>{t('empty.feed.body')}</Text>
      ) : null}
      {feed.items.map((post) => (
        <PostTile key={post.id} post={post} onChange={load} />
      ))}
      {feed.finishLine?.reached ? (
        <View
          style={{
            borderRadius: layout.radius,
            borderWidth: 1,
            borderColor: c.border,
            padding: 20,
            backgroundColor: c.surfaceElevated,
          }}
        >
          <Text style={{ color: c.textPrimary, fontSize: 20, fontWeight: '600' }}>{t('empty.caughtUp.title')}</Text>
          <Text style={{ color: c.textSecondary, marginTop: 8 }}>
            {feed.finishLine.seenSinceLastVisit} {t('feed.seen')}
          </Text>
          {feed.finishLine.olderAvailable ? (
            <Pressable
              onPress={() => {
                void api.markCaughtUp().then(() => api.followingFeed({ keepGoing: true }).then(setFeed));
              }}
              style={{ marginTop: 16, minHeight: layout.touch, justifyContent: 'center' }}
            >
              <Text style={{ color: c.accent }}>{t('feed.keepGoing')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {error ? <Text style={{ color: c.danger }}>{error}</Text> : null}
    </ScrollView>
    <Modal visible={Boolean(openHandle)} animationType="fade" onRequestClose={() => setOpenHandle(null)}>
      {openHandle ? (
        <MobileMomentViewer
          handle={openHandle}
          onClose={() => {
            setOpenHandle(null);
            load();
          }}
        />
      ) : null}
    </Modal>
    </View>
  );
}

function MobileMomentViewer({ handle, onClose }: { handle: string; onClose: () => void }) {
  const c = colors(useColorScheme());
  const [moments, setMoments] = useState<MomentCard[]>([]);
  const [index, setIndex] = useState(0);
  const [seg, setSeg] = useState(0);

  useEffect(() => {
    void api.momentAuthorReel(handle).then((reel) => {
      setMoments(reel.moments);
      setIndex(0);
      setSeg(0);
    });
  }, [handle]);

  const moment = moments[index];
  const segment = moment?.segments[seg];
  const uri = mediaSrc(segment?.media.srcset.at(-1)?.webp);

  useEffect(() => {
    if (moment && segment && !segment.viewedByMe) {
      void api.viewMomentSegment(moment.id, segment.id);
    }
  }, [moment, segment]);

  function advance() {
    if (!moment) return;
    if (seg + 1 < moment.segments.length) {
      setSeg(seg + 1);
      return;
    }
    if (index + 1 < moments.length) {
      setIndex(index + 1);
      setSeg(0);
      return;
    }
    onClose();
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.textPrimary, padding: 16, justifyContent: 'center' }}>
      <Text style={{ color: c.surface, marginBottom: 8 }}>@{handle}</Text>
      {uri ? <Image source={{ uri }} style={{ width: '100%', aspectRatio: segment?.media.aspect ?? 0.8, borderRadius: 16 }} /> : null}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        {QUICK_EMOJIS.map((emoji) => (
          <Pressable
            key={emoji}
            onPress={() => {
              if (moment && segment) void api.reactToMoment(moment.id, segment.id, emoji);
            }}
            style={{ minHeight: layout.touch, minWidth: layout.touch, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 22 }}>{emoji}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={advance} style={{ minHeight: layout.touch, marginTop: 12, justifyContent: 'center' }}>
        <Text style={{ color: c.accent }}>{t('moment.next')}</Text>
      </Pressable>
      <Pressable onPress={onClose} style={{ minHeight: layout.touch, justifyContent: 'center' }}>
        <Text style={{ color: c.surface }}>{t('moment.close')}</Text>
      </Pressable>
    </View>
  );
}

function PostTile({ post, onChange }: { post: PostCard; onChange: () => void }) {
  const c = colors(useColorScheme());
  const hero = post.media[0];
  const uri = mediaSrc(hero?.srcset[hero.srcset.length - 1]?.webp);
  return (
    <View style={{ borderRadius: layout.radius, overflow: 'hidden', borderWidth: 1, borderColor: c.border }}>
      <Text style={{ color: c.textPrimary, padding: 12, fontWeight: '600' }}>@{post.author.handle}</Text>
      {uri ? <Image source={{ uri }} style={{ width: '100%', aspectRatio: hero?.aspect ?? 1 }} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 }}>
        {(['inspiring', 'funny', 'love', 'useful'] as const).map((type) => (
          <Pressable
            key={type}
            onPress={() => {
              void (post.appreciation.mine === type ? api.unappreciate(post.id) : api.appreciate(post.id, type)).then(
                onChange,
              );
            }}
            style={{
              minHeight: layout.touch,
              paddingHorizontal: 12,
              justifyContent: 'center',
              borderRadius: 12,
              backgroundColor: post.appreciation.mine === type ? c.accentMuted : c.surfaceMuted,
            }}
          >
            <Text style={{ color: c.textPrimary }}>
              {appreciationMeta[type].emoji} {t(appreciationMeta[type].labelKey)}
            </Text>
          </Pressable>
        ))}
      </View>
      {post.caption ? (
        <Text style={{ color: c.textPrimary, paddingHorizontal: 12, paddingBottom: 12 }}>{post.caption}</Text>
      ) : null}
    </View>
  );
}

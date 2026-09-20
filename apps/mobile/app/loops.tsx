import { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View, useColorScheme, ScrollView } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { PostCard, WellbeingView } from '@tessera/types';
import { TesseraApiError } from '@tessera/api-client';
import { api } from '../src/api';
import { colors, layout } from '../src/theme';
import { t } from '../src/t';
import { mediaSrc } from '../src/media';

function LoopVideo({ uri, playing }: { uri: string; playing: boolean }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = true;
  });
  if (playing) {
    player.play();
  } else {
    player.pause();
  }
  return <VideoView player={player} style={{ width: '100%', aspectRatio: 9 / 16 }} contentFit="cover" nativeControls={false} />;
}

export default function LoopsScreen() {
  const c = colors(useColorScheme());
  const router = useRouter();
  const [items, setItems] = useState<PostCard[]>([]);
  const [index, setIndex] = useState(0);
  const [wellbeing, setWellbeing] = useState<WellbeingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => {
    let active = true;
    api
      .loopsFeed({ limit: 8 })
      .then((feed) => {
        if (!active) return;
        setItems(feed.items);
        setWellbeing(feed.wellbeing);
      })
      .catch((err) => {
        if (err instanceof TesseraApiError && err.status === 401) router.replace('/login');
        else setError(err instanceof Error ? err.message : 'error');
      });
    return () => {
      active = false;
    };
  }, [router]);

  useFocusEffect(load);

  const current = items[index];
  const uri = mediaSrc(current?.media[0]?.hlsUrl ?? current?.media[0]?.posterUrl);

  useFocusEffect(
    useCallback(() => {
      if (!current || wellbeing?.paused) return;
      watchRef.current = setInterval(() => {
        void api.watchLoop(current.id, 5).then(setWellbeing).catch(() => undefined);
      }, 5000);
      return () => {
        if (watchRef.current) clearInterval(watchRef.current);
      };
    }, [current, wellbeing?.paused]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, padding: 16, gap: 12 }}>
      <Pressable onPress={() => router.back()} style={{ minHeight: layout.touch, justifyContent: 'center' }}>
        <Text style={{ color: c.accent }}>{t('moment.close')}</Text>
      </Pressable>
      <Text style={{ color: c.slate, fontSize: 11, fontWeight: '600', letterSpacing: 1.4, textTransform: 'uppercase' }}>
        {t('common.phase')} · {t('feed.loops')}
      </Text>
      {wellbeing?.paused ? (
        <View style={{ padding: 20, borderRadius: layout.radius, backgroundColor: c.surfaceElevated, gap: 12 }}>
          <Text style={{ color: c.textPrimary, fontSize: 22, fontWeight: '600' }}>{t('loop.pauseTitle')}</Text>
          <Text style={{ color: c.textSecondary }}>{t('loop.pauseBody')}</Text>
          <Pressable onPress={() => router.back()} style={{ minHeight: layout.touch, justifyContent: 'center' }}>
            <Text style={{ color: c.accent }}>{t('loop.stop')}</Text>
          </Pressable>
          <Pressable
            onPress={() => void api.extendLoopsBudget().then(setWellbeing)}
            style={{ minHeight: layout.touch, justifyContent: 'center' }}
          >
            <Text style={{ color: c.accent }}>{t('loop.extend')}</Text>
          </Pressable>
          <Pressable
            onPress={() => void api.dismissLoopsBudget().then(setWellbeing)}
            style={{ minHeight: layout.touch, justifyContent: 'center' }}
          >
            <Text style={{ color: c.accent }}>{t('loop.dismiss')}</Text>
          </Pressable>
        </View>
      ) : current && uri ? (
        <LoopVideo uri={uri} playing={!wellbeing?.paused} />
      ) : (
        <Text style={{ color: c.textSecondary }}>{t('empty.loops.body')}</Text>
      )}
      {current ? (
        <Text style={{ color: c.textPrimary }}>
          @{current.author.handle}
          {current.caption ? ` · ${current.caption}` : ''}
        </Text>
      ) : null}
      <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
        {items.map((item, i) => (
          <Pressable
            key={item.id}
            onPress={() => setIndex(i)}
            style={{
              minHeight: layout.touch,
              paddingHorizontal: 12,
              borderRadius: 12,
              justifyContent: 'center',
              backgroundColor: i === index ? c.accent : c.surfaceMuted,
            }}
          >
            <Text style={{ color: i === index ? c.textInverse : c.textPrimary }}>@{item.author.handle}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {error ? <Text style={{ color: c.danger }}>{error}</Text> : null}
    </View>
  );
}

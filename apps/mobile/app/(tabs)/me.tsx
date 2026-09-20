import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { TesseraApiError } from '@tessera/api-client';
import type { MeProfile, MemoryMapView, MosaicView, ReelShelfCard } from '@tessera/types';
import { api } from '../../src/api';
import { clearTokens } from '../../src/session';
import { colors, layout } from '../../src/theme';
import { t } from '../../src/t';
import { EmptyScreen } from '../../src/empty-screen';
import { mediaSrc } from '../../src/media';

export default function MeScreen() {
  const c = colors(useColorScheme());
  const [me, setMe] = useState<MeProfile | null | undefined>(undefined);
  const [mosaic, setMosaic] = useState<MosaicView | null>(null);
  const [shelves, setShelves] = useState<ReelShelfCard[]>([]);
  const [map, setMap] = useState<MemoryMapView | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      api
        .getMe()
        .then(async (user) => {
          if (!active) return;
          setMe(user);
          const tiles = await api.mosaic(user.handle);
          const shelfList = await api.listReelShelves(user.handle);
          const memory = await api.memoryMap(user.handle);
          if (active) {
            setMosaic(tiles);
            setShelves(shelfList.items);
            setMap(memory);
          }
        })
        .catch((err) => {
          if (err instanceof TesseraApiError && err.status === 401) setMe(null);
        });
      return () => {
        active = false;
      };
    }, []),
  );

  if (me === undefined) {
    return (
      <View style={[styles.root, { backgroundColor: c.surface }]}>
        <Text style={{ color: c.textSecondary }}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (!me) {
    return (
      <View style={{ flex: 1 }}>
        <EmptyScreen kicker={t('nav.me')} titleKey="empty.me.title" bodyKey="empty.me.body" />
        <Link href="/login" style={{ textAlign: 'center', color: c.accent, marginBottom: 32 }}>
          {t('nav.signIn')}
        </Link>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.root, { backgroundColor: c.surface }]} contentContainerStyle={{ paddingBottom: 32 }}>
      <Text style={[styles.name, { color: c.textPrimary }]}>{me.displayName}</Text>
      <Text style={{ color: c.textSecondary }}>@{me.handle}</Text>
      {me.bio ? <Text style={[styles.bio, { color: c.textPrimary }]}>{me.bio}</Text> : null}
      <Text style={{ color: c.textSecondary, marginTop: 12 }}>
        {me.counts.followers} {t('profile.followers')} · {me.counts.following} {t('profile.follows')}
      </Text>
      <Link href="/circles" style={{ color: c.accent, marginTop: 12 }}>
        {t('settings.circles')}
      </Link>
      <Link href="/boards" style={{ color: c.accent, marginTop: 8 }}>
        {t('settings.boards')}
      </Link>
      {map?.visible && map.pins.length ? (
        <View style={{ marginTop: 16, gap: 8 }}>
          <Text style={{ color: c.textPrimary, fontWeight: '600' }}>{t('discover.map')}</Text>
          {map.pins.map((pin) => (
            <Text key={pin.postId} style={{ color: c.textSecondary }}>
              {pin.place.name}
              {pin.place.lat != null && pin.place.lng != null
                ? ` · ${pin.place.lat.toFixed(1)}, ${pin.place.lng.toFixed(1)}`
                : ''}
            </Text>
          ))}
        </View>
      ) : null}
      {shelves.length ? (
        <View style={{ marginTop: 16, gap: 8 }}>
          <Text style={{ color: c.textPrimary, fontWeight: '600' }}>{t('shelf.title')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {shelves.map((shelf) => {
              const uri = mediaSrc(shelf.cover?.srcset.at(-1)?.webp);
              return (
                <View key={shelf.id} style={{ width: 88 }}>
                  {uri ? (
                    <Image source={{ uri }} style={{ width: 88, height: 110, borderRadius: 12 }} />
                  ) : (
                    <View style={{ width: 88, height: 110, borderRadius: 12, backgroundColor: c.surfaceMuted }} />
                  )}
                  <Text numberOfLines={1} style={{ color: c.textPrimary, marginTop: 4, fontSize: 12 }}>
                    {shelf.title}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
      {mosaic?.tiles.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          {mosaic.tiles.map((tile) => {
            const uri = mediaSrc(tile.post.media[0]?.srcset.at(-1)?.webp);
            return uri ? (
              <Image
                key={tile.post.id}
                source={{ uri }}
                style={{
                  width: tile.span.cols === 2 ? '100%' : '48%',
                  aspectRatio: tile.span.rows === 2 ? 0.8 : 1.2,
                  borderRadius: 12,
                }}
              />
            ) : null;
          })}
        </View>
      ) : null}
      <Pressable
        onPress={async () => {
          await api.logout().catch(() => undefined);
          await clearTokens();
          setMe(null);
        }}
        style={[styles.button, { borderColor: c.border, minHeight: layout.touch }]}
      >
        <Text style={{ color: c.textPrimary }}>{t('nav.signOut')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, gap: 8 },
  name: { fontSize: 28, fontWeight: '600' },
  bio: { marginTop: 12, fontSize: 16, lineHeight: 24 },
  button: { marginTop: 24, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});

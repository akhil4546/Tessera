import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import type { PlacePage } from '@tessera/types';
import { api } from '../../src/api';
import { colors } from '../../src/theme';
import { t } from '../../src/t';

export default function PlaceScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const c = colors(useColorScheme());
  const [page, setPage] = useState<PlacePage | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!slug) return;
      void api.placePage(slug).then(setPage).catch(() => setPage(null));
    }, [slug]),
  );

  if (!page) {
    return (
      <View style={[styles.root, { backgroundColor: c.surface }]}>
        <Text style={{ color: c.textSecondary }}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.root, { backgroundColor: c.surface }]}>
      <Text style={[styles.title, { color: c.textPrimary }]}>{page.name}</Text>
      {page.lat != null && page.lng != null ? (
        <Text style={{ color: c.textSecondary, marginTop: 8 }}>
          {page.lat.toFixed(2)}, {page.lng.toFixed(2)}
        </Text>
      ) : null}
      {page.items.map((post) => (
        <View key={post.id} style={{ marginTop: 16 }}>
          <Text style={{ color: c.textPrimary, fontWeight: '600' }}>@{post.author.handle}</Text>
          <Text style={{ color: c.textSecondary, marginTop: 4 }}>{post.caption}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24 },
  title: { fontSize: 28, fontWeight: '600' },
});

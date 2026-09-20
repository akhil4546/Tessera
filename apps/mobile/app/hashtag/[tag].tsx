import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import type { HashtagPage } from '@tessera/types';
import { api } from '../../src/api';
import { colors, layout } from '../../src/theme';
import { t } from '../../src/t';

export default function HashtagScreen() {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const c = colors(useColorScheme());
  const [page, setPage] = useState<HashtagPage | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!tag) return;
      void api.hashtagPage(tag).then(setPage).catch(() => setPage(null));
    }, [tag]),
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
      <Text style={[styles.title, { color: c.textPrimary }]}>#{page.tag}</Text>
      <Pressable
        onPress={async () => {
          const next = page.followed ? await api.unfollowHashtag(page.tag) : await api.followHashtag(page.tag);
          setPage(next);
        }}
        style={[styles.button, { borderColor: c.border, minHeight: layout.touch }]}
      >
        <Text style={{ color: c.textPrimary }}>
          {page.followed ? t('discover.unfollowTag') : t('discover.followTag')}
        </Text>
      </Pressable>
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
  button: { marginTop: 16, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});

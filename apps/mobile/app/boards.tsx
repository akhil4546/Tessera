import { useCallback, useState } from 'react';
import { ScrollView, Text, View, useColorScheme } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { BoardCard } from '@tessera/types';
import { api } from '../src/api';
import { colors } from '../src/theme';
import { t } from '../src/t';

export default function BoardsScreen() {
  const c = colors(useColorScheme());
  const [items, setItems] = useState<BoardCard[]>([]);

  useFocusEffect(
    useCallback(() => {
      void api.listBoards().then((page) => setItems(page.items));
    }, []),
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface, padding: 16 }}>
      <Text style={{ color: c.textPrimary, fontSize: 24, fontWeight: '600' }}>{t('boards.title')}</Text>
      <Text style={{ color: c.textSecondary, marginTop: 8 }}>{t('boards.hint')}</Text>
      {items.map((board) => (
        <View key={board.id} style={{ marginTop: 16 }}>
          <Text style={{ color: c.textPrimary, fontWeight: '600' }}>{board.title}</Text>
          <Text style={{ color: c.textSecondary }}>
            {board.itemCount} · {board.visibility}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, useColorScheme } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { CircleSummary } from '@tessera/types';
import { api } from '../src/api';
import { colors } from '../src/theme';
import { t } from '../src/t';

export default function CirclesScreen() {
  const c = colors(useColorScheme());
  const [items, setItems] = useState<CircleSummary[]>([]);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(() => {
    void api
      .listCircles()
      .then((page) => setItems(page.items))
      .catch((err) => setStatus(String(err)));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface, padding: 16 }}>
      <Text style={{ color: c.textPrimary, fontSize: 24, fontWeight: '600' }}>{t('circles.title')}</Text>
      <Text style={{ color: c.textSecondary, marginTop: 8 }}>{t('circles.hint')}</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t('circles.name')}
        placeholderTextColor={c.textSecondary}
        style={{ marginTop: 16, minHeight: 44, borderRadius: 12, paddingHorizontal: 12, color: c.textPrimary, backgroundColor: c.surfaceMuted }}
      />
      <Pressable
        onPress={() => {
          void api.createCircle(name).then(() => {
            setName('');
            load();
          });
        }}
        style={{ marginTop: 12, minHeight: 44, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: '#F4EDE3', fontWeight: '600' }}>{t('circles.create')}</Text>
      </Pressable>
      {status ? <Text style={{ color: c.textSecondary, marginTop: 8 }}>{status}</Text> : null}
      {items.map((circle) => (
        <View key={circle.id} style={{ marginTop: 12 }}>
          <Text style={{ color: c.textPrimary, fontWeight: '600' }}>{circle.name}</Text>
          <Text style={{ color: c.textSecondary }}>{circle.memberCount}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

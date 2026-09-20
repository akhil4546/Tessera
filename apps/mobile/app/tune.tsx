import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import type { RankingWeights } from '@tessera/types';
import { api } from '../src/api';
import { colors, layout } from '../src/theme';
import { t } from '../src/t';

const SLIDERS: Array<{ key: keyof RankingWeights; labelKey: string }> = [
  { key: 'peopleIInteractWith', labelKey: 'discover.interact' },
  { key: 'newCreators', labelKey: 'discover.newCreators' },
  { key: 'nearby', labelKey: 'discover.nearby' },
  { key: 'lessVideo', labelKey: 'discover.lessVideo' },
];

export default function TuneScreen() {
  const c = colors(useColorScheme());
  const router = useRouter();
  const [draft, setDraft] = useState<RankingWeights>({
    peopleIInteractWith: 0.5,
    newCreators: 0.5,
    nearby: 0.5,
    lessVideo: 0,
  });

  useEffect(() => {
    void api.getDiscoverTuning().then(setDraft).catch(() => undefined);
  }, []);

  return (
    <ScrollView style={[styles.root, { backgroundColor: c.surface }]}>
      <Text style={[styles.title, { color: c.textPrimary }]}>{t('discover.tuneTitle')}</Text>
      <Text style={{ color: c.textSecondary, marginTop: 8 }}>{t('discover.tuneBody')}</Text>
      {SLIDERS.map((slider) => (
        <View key={slider.key} style={{ marginTop: 20 }}>
          <Text style={{ color: c.textPrimary, fontWeight: '600' }}>
            {t(slider.labelKey)} · {draft[slider.key].toFixed(2)}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {[0, 0.25, 0.5, 0.75, 1].map((value) => (
              <Pressable
                key={value}
                onPress={() => setDraft((current) => ({ ...current, [slider.key]: value }))}
                style={[
                  styles.chip,
                  {
                    minHeight: layout.touch,
                    backgroundColor: draft[slider.key] === value ? c.textPrimary : c.surfaceMuted,
                  },
                ]}
              >
                <Text style={{ color: draft[slider.key] === value ? c.textInverse : c.textPrimary }}>{value}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      <Pressable
        onPress={async () => {
          await api.setDiscoverTuning(draft);
          router.back();
        }}
        style={[styles.save, { borderColor: c.border, minHeight: layout.touch }]}
      >
        <Text style={{ color: c.textPrimary }}>{t('common.save')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24 },
  title: { fontSize: 28, fontWeight: '600' },
  chip: { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  save: { marginTop: 24, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});

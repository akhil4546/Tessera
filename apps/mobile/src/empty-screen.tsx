import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { colors, layout } from './theme';
import { t } from './t';

export function EmptyScreen({
  kicker,
  titleKey,
  bodyKey,
}: {
  kicker: string;
  titleKey: string;
  bodyKey: string;
}) {
  const c = colors(useColorScheme());
  return (
    <View style={[styles.root, { backgroundColor: c.surface }]}>
      <Text style={[styles.kicker, { color: c.slate }]}>
        {t('common.phase')} · {kicker}
      </Text>
      <View
        style={[
          styles.card,
          {
            backgroundColor: c.surfaceElevated,
            borderColor: c.border,
            shadowColor: c.textPrimary,
          },
        ]}
      >
        <Text style={[styles.title, { color: c.textPrimary }]}>{t(titleKey)}</Text>
        <Text style={[styles.body, { color: c.textSecondary }]}>{t(bodyKey)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, gap: 16 },
  kicker: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  card: {
    borderRadius: layout.radius,
    borderWidth: 1,
    padding: 24,
  },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 12 },
  body: { fontSize: 16, lineHeight: 24 },
});

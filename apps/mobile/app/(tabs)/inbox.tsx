import { useCallback, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import type { InboxEntry, InboxFilter } from '@tessera/types';
import { INBOX_FILTERS } from '@tessera/types';
import { api } from '../../src/api';
import { flush } from '../../src/outbox';
import { t } from '../../src/t';
import { colors, layout } from '../../src/theme';

const FILTER_LABEL: Record<InboxFilter, string> = {
  all: 'inbox.all',
  messages: 'inbox.messages',
  mentions: 'inbox.mentions',
  appreciations: 'inbox.appreciations',
  follows: 'inbox.follows',
  requests: 'inbox.requests',
};

export default function InboxScreen() {
  const scheme = useColorScheme();
  const c = colors(scheme);
  const router = useRouter();
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [items, setItems] = useState<InboxEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      await flush();
      const list = await api.inbox({ filter });
      setItems(list.items);
      setError(null);
    } catch {
      setError(t('error.body'));
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const emptyTitle =
    filter === 'requests'
      ? t('empty.requests.title')
      : filter === 'messages'
        ? t('empty.inbox.title')
        : t('empty.activity.title');
  const emptyBody =
    filter === 'requests'
      ? t('empty.requests.body')
      : filter === 'messages'
        ? t('empty.inbox.body')
        : t('empty.activity.body');

  return (
    <ScrollView
      style={{ backgroundColor: c.surface }}
      contentContainerStyle={styles.root}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <Text style={[styles.kicker, { color: c.slate }]}>
        {t('common.phase')} · {t('nav.inbox')}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {INBOX_FILTERS.map((value) => (
          <Pressable
            key={value}
            onPress={() => setFilter(value)}
            style={[
              styles.chip,
              {
                backgroundColor: filter === value ? c.accent : c.surfaceMuted,
                minHeight: layout.touch,
              },
            ]}
          >
            <Text style={{ color: filter === value ? c.textInverse : c.textSecondary, fontWeight: '600' }}>
              {t(FILTER_LABEL[value])}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {error ? <Text style={{ color: c.danger }}>{error}</Text> : null}
      {items.length === 0 ? (
        <View style={[styles.card, { backgroundColor: c.surfaceElevated, borderColor: c.border }]}>
          <Text style={[styles.title, { color: c.textPrimary }]}>{emptyTitle}</Text>
          <Text style={{ color: c.textSecondary, lineHeight: 22 }}>{emptyBody}</Text>
        </View>
      ) : (
        items.map((entry) =>
          entry.type === 'thread' ? (
            <Pressable
              key={`t-${entry.conversation.id}`}
              onPress={() => router.push(`/inbox/${entry.conversation.id}`)}
              style={[styles.card, { backgroundColor: c.surfaceElevated, borderColor: c.border, minHeight: layout.touch }]}
            >
              <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 16 }}>
                {entry.conversation.title ??
                  entry.conversation.members.map((row) => row.user.displayName).join(', ')}
                {entry.conversation.unreadCount ? ` · ${entry.conversation.unreadCount}` : ''}
              </Text>
              <Text style={{ color: c.textSecondary, marginTop: 6 }} numberOfLines={2}>
                {entry.conversation.lastMessage?.deletedAt
                  ? t('inbox.unsent')
                  : entry.conversation.lastMessage?.body || entry.conversation.lastMessage?.kind || ''}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              key={`a-${entry.notification.id}`}
              onPress={() => {
                void api.markNotificationsRead({ ids: [entry.notification.id] });
                if (entry.notification.href?.startsWith('/u/')) {
                  router.push(`/tune`);
                }
              }}
              style={[styles.card, { backgroundColor: c.surfaceElevated, borderColor: c.border, minHeight: layout.touch }]}
            >
              <Text style={{ color: c.textPrimary, fontWeight: entry.notification.readAt ? '400' : '600', fontSize: 16 }}>
                {entry.notification.body}
              </Text>
              {entry.notification.preview ? (
                <Text style={{ color: c.textSecondary, marginTop: 6 }} numberOfLines={2}>
                  {entry.notification.preview}
                </Text>
              ) : null}
            </Pressable>
          ),
        )
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: 20, gap: 12 },
  kicker: { fontSize: 11, fontWeight: '600', letterSpacing: 1.4, textTransform: 'uppercase' },
  filters: { flexDirection: 'row', gap: 8, paddingRight: 12 },
  chip: { borderRadius: layout.radius, paddingHorizontal: 16, justifyContent: 'center' },
  card: { borderRadius: layout.radius, borderWidth: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 8 },
});

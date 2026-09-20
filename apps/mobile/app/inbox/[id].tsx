import { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import type { MessageView } from '@tessera/types';
import { api } from '../../src/api';
import { enqueue, flush } from '../../src/outbox';
import { t } from '../../src/t';
import { colors, layout } from '../../src/theme';

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useColorScheme();
  const c = colors(scheme);
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [items, setItems] = useState<MessageView[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      await flush();
      const [conversation, page] = await Promise.all([api.getConversation(id), api.listMessages(id, { limit: 50 })]);
      setTitle(conversation.title ?? conversation.members.map((row) => row.user.displayName).join(', '));
      const chronological = [...page.items].reverse();
      setItems(chronological);
      const last = chronological[chronological.length - 1];
      if (last) await api.markConversationRead(id, last.id);
      setError(null);
    } catch {
      setError(t('error.body'));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function send() {
    if (!id || !draft.trim()) return;
    const body = draft.trim();
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setDraft('');
    try {
      await api.sendMessage(id, { kind: 'text', body, clientId });
      await load();
    } catch {
      await enqueue({ conversationId: id, clientId, kind: 'text', body, createdAt: new Date().toISOString() });
      setError('Queued until you are back online.');
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: c.surface }]}>
      <Pressable onPress={() => router.back()} style={{ minHeight: layout.touch, justifyContent: 'center' }}>
        <Text style={{ color: c.accent }}>{t('inbox.title')}</Text>
      </Pressable>
      <Text style={[styles.title, { color: c.textPrimary }]}>{title}</Text>
      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 16 }}>
        {items.map((message) => (
          <View
            key={message.id}
            style={[styles.bubble, { backgroundColor: c.surfaceElevated, borderColor: c.border }]}
          >
            <Text style={{ color: c.slate, fontSize: 12 }}>@{message.sender.handle}</Text>
            <Text style={{ color: c.textPrimary, marginTop: 4 }}>
              {message.deletedAt ? t('inbox.unsent') : message.body || message.kind}
            </Text>
            {message.receipt?.read ? (
              <Text style={{ color: c.slate, fontSize: 11, marginTop: 4 }}>{t('inbox.seen')}</Text>
            ) : message.receipt?.delivered ? (
              <Text style={{ color: c.slate, fontSize: 11, marginTop: 4 }}>{t('inbox.delivered')}</Text>
            ) : null}
          </View>
        ))}
      </ScrollView>
      {error ? <Text style={{ color: c.danger }}>{error}</Text> : null}
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={t('inbox.write')}
          placeholderTextColor={c.textSecondary}
          style={[
            styles.input,
            { color: c.textPrimary, borderColor: c.border, backgroundColor: c.surfaceElevated, minHeight: layout.touch },
          ]}
        />
        <Pressable
          onPress={() => void send()}
          style={[styles.send, { backgroundColor: c.accent, minHeight: layout.touch }]}
        >
          <Text style={{ color: c.textInverse, fontWeight: '600' }}>{t('inbox.send')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 20, gap: 10 },
  title: { fontSize: 22, fontWeight: '600' },
  bubble: { borderRadius: layout.radius, borderWidth: 1, padding: 12 },
  composer: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  input: { flex: 1, borderWidth: 1, borderRadius: layout.radius, paddingHorizontal: 12, paddingVertical: 10 },
  send: { borderRadius: layout.radius, paddingHorizontal: 16, justifyContent: 'center' },
});

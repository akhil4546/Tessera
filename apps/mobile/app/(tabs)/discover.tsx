import { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { TesseraApiError } from '@tessera/api-client';
import type { DiscoverFeed, SearchResults, SuggestedPerson } from '@tessera/types';
import { api } from '../../src/api';
import { EmptyScreen } from '../../src/empty-screen';
import { colors, layout } from '../../src/theme';
import { t } from '../../src/t';

export default function DiscoverScreen() {
  const c = colors(useColorScheme());
  const router = useRouter();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [feed, setFeed] = useState<DiscoverFeed | null>(null);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchResults | null>(null);
  const [people, setPeople] = useState<SuggestedPerson[]>([]);

  const load = useCallback(() => {
    let active = true;
    api
      .getMe()
      .then(async () => {
        if (!active) return;
        setSignedIn(true);
        const [ranked, suggested] = await Promise.all([api.discoverFeed(), api.suggestedPeople()]);
        if (active) {
          setFeed(ranked);
          setPeople(suggested.items);
        }
      })
      .catch((err) => {
        if (err instanceof TesseraApiError && err.status === 401) setSignedIn(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(load);

  if (signedIn === false) {
    return <EmptyScreen kicker={t('nav.discover')} titleKey="empty.discover.title" bodyKey="empty.discover.body" />;
  }

  return (
    <ScrollView style={[styles.root, { backgroundColor: c.surface }]} contentContainerStyle={{ paddingBottom: 32 }}>
      <Text style={[styles.kicker, { color: c.slate }]}>
        {t('common.phase')} · {t('nav.discover')}
      </Text>
      <TextInput
        value={query}
        onChangeText={async (value) => {
          setQuery(value);
          if (value.trim().length < 2) {
            setSearch(null);
            return;
          }
          try {
            setSearch(await api.search(value));
          } catch {
            setSearch(null);
          }
        }}
        placeholder={t('discover.search')}
        placeholderTextColor={c.textSecondary}
        style={[styles.input, { borderColor: c.border, color: c.textPrimary, backgroundColor: c.surfaceElevated }]}
      />
      <Pressable onPress={() => router.push('/tune')} style={{ minHeight: layout.touch, justifyContent: 'center' }}>
        <Text style={{ color: c.accent }}>{t('discover.tune')}</Text>
      </Pressable>

      {search ? (
        <View style={{ gap: 8 }}>
          {search.hashtags.map((row) => (
            <Link key={row.tag} href={`/hashtag/${row.tag}`} style={{ color: c.accent }}>
              #{row.tag}
            </Link>
          ))}
          {search.places.map((place) => (
            <Link key={place.id} href={`/place/${place.slug}`} style={{ color: c.accent }}>
              {place.name}
            </Link>
          ))}
          {search.people.map((person) => (
            <Text key={person.id} style={{ color: c.textPrimary }}>
              @{person.handle}
            </Text>
          ))}
          <Text style={{ color: c.textSecondary }}>{t('discover.boardsSoon')}</Text>
        </View>
      ) : null}

      {people.length ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: c.textPrimary, fontWeight: '600' }}>{t('discover.suggested')}</Text>
          {people.map((row) => (
            <View key={row.profile.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: c.textPrimary }}>
                @{row.profile.handle}
                {'\n'}
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>{row.reason}</Text>
              </Text>
              <Pressable
                onPress={async () => {
                  await api.dismissSuggestedPerson(row.profile.handle);
                  setPeople((current) => current.filter((item) => item.profile.id !== row.profile.id));
                }}
              >
                <Text style={{ color: c.accent }}>{t('discover.dismiss')}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {feed?.items.map((item) => (
        <View key={item.impressionId} style={[styles.card, { borderColor: c.border, backgroundColor: c.surfaceElevated }]}>
          <Text style={{ color: c.textPrimary, fontWeight: '600' }}>@{item.post.author.handle}</Text>
          <Text style={{ color: c.textSecondary, marginTop: 6 }}>{item.post.caption}</Text>
          <Text style={{ color: c.accent, marginTop: 8 }}>{t('discover.why')}</Text>
          {item.signals.map((signal) => (
            <Text key={`${signal.key}-${signal.label}`} style={{ color: c.textSecondary, fontSize: 12, marginTop: 4 }}>
              {signal.label} ({signal.contribution.toFixed(2)})
            </Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, gap: 16 },
  kicker: { fontSize: 11, fontWeight: '600', letterSpacing: 1.4, textTransform: 'uppercase' },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, marginVertical: 12 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 12 },
});

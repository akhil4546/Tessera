import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { TesseraApiError } from '@tessera/api-client';
import { api } from '../src/api';
import { saveTokens } from '../src/session';
import { colors, layout } from '../src/theme';
import { t } from '../src/t';

export default function SignupScreen() {
  const c = colors(useColorScheme());
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('1994-01-01');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      const result = await api.register({
        email,
        password,
        handle,
        displayName,
        dateOfBirth,
        client: 'mobile',
      });
      if (result.accessToken && result.refreshToken) {
        await saveTokens(result.accessToken, result.refreshToken);
      }
      router.replace('/(tabs)/me');
    } catch (err) {
      setError(err instanceof TesseraApiError ? err.message : t('error.body'));
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: c.surface }]}>
      <Text style={[styles.title, { color: c.textPrimary }]}>{t('auth.signupTitle')}</Text>
      <TextInput placeholder={t('auth.email')} autoCapitalize="none" value={email} onChangeText={setEmail} placeholderTextColor={c.textSecondary} style={[styles.input, { color: c.textPrimary, borderColor: c.border, backgroundColor: c.surfaceElevated }]} />
      <TextInput placeholder={t('auth.password')} secureTextEntry value={password} onChangeText={setPassword} placeholderTextColor={c.textSecondary} style={[styles.input, { color: c.textPrimary, borderColor: c.border, backgroundColor: c.surfaceElevated }]} />
      <TextInput placeholder={t('auth.handle')} autoCapitalize="none" value={handle} onChangeText={setHandle} placeholderTextColor={c.textSecondary} style={[styles.input, { color: c.textPrimary, borderColor: c.border, backgroundColor: c.surfaceElevated }]} />
      <TextInput placeholder={t('auth.displayName')} value={displayName} onChangeText={setDisplayName} placeholderTextColor={c.textSecondary} style={[styles.input, { color: c.textPrimary, borderColor: c.border, backgroundColor: c.surfaceElevated }]} />
      <TextInput placeholder="YYYY-MM-DD" value={dateOfBirth} onChangeText={setDateOfBirth} placeholderTextColor={c.textSecondary} style={[styles.input, { color: c.textPrimary, borderColor: c.border, backgroundColor: c.surfaceElevated }]} />
      {error ? <Text style={{ color: c.danger }}>{error}</Text> : null}
      <Pressable onPress={submit} style={[styles.button, { backgroundColor: c.accent, minHeight: layout.touch }]}>
        <Text style={{ color: c.textInverse, fontWeight: '600' }}>{t('auth.submitSignup')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, gap: 12, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '600', marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 44 },
  button: { borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});

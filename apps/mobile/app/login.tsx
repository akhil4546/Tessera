import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { TesseraApiError } from '@tessera/api-client';
import { api } from '../src/api';
import { saveTokens } from '../src/session';
import { colors, layout } from '../src/theme';
import { t } from '../src/t';

export default function LoginScreen() {
  const c = colors(useColorScheme());
  const router = useRouter();
  const [email, setEmail] = useState('asha@tessera.test');
  const [password, setPassword] = useState('Seedpass1!');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      const result = await api.login({ email, password, client: 'mobile' });
      if ('requiresTwoFactor' in result && result.requiresTwoFactor) {
        setError(t('auth.twoFactorTitle'));
        return;
      }
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
      <Text style={[styles.title, { color: c.textPrimary }]}>{t('auth.loginTitle')}</Text>
      <TextInput
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder={t('auth.email')}
        placeholderTextColor={c.textSecondary}
        value={email}
        onChangeText={setEmail}
        style={[styles.input, { color: c.textPrimary, borderColor: c.border, backgroundColor: c.surfaceElevated }]}
      />
      <TextInput
        secureTextEntry
        placeholder={t('auth.password')}
        placeholderTextColor={c.textSecondary}
        value={password}
        onChangeText={setPassword}
        style={[styles.input, { color: c.textPrimary, borderColor: c.border, backgroundColor: c.surfaceElevated }]}
      />
      {error ? <Text style={{ color: c.danger }}>{error}</Text> : null}
      <Pressable onPress={submit} style={[styles.button, { backgroundColor: c.accent, minHeight: layout.touch }]}>
        <Text style={{ color: c.textInverse, fontWeight: '600' }}>{t('auth.submitLogin')}</Text>
      </Pressable>
      <Link href="/signup" style={{ color: c.accent, marginTop: 16 }}>
        {t('auth.submitSignup')}
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, gap: 12, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '600', marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 44 },
  button: { borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});

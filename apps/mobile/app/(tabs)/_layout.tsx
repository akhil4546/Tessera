import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { colors } from '../../src/theme';
import { t } from '../../src/t';

export default function TabLayout() {
  const scheme = useColorScheme();
  const c = colors(scheme);

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.surfaceElevated },
        headerTintColor: c.textPrimary,
        headerTitleStyle: { fontWeight: '600' },
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textSecondary,
        tabBarStyle: {
          backgroundColor: c.surfaceElevated,
          borderTopColor: c.border,
          minHeight: 56,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('nav.home') }} />
      <Tabs.Screen name="discover" options={{ title: t('nav.discover') }} />
      <Tabs.Screen
        name="create"
        options={{
          title: t('nav.create'),
          tabBarActiveTintColor: c.textInverse,
          tabBarIconStyle: { marginTop: 4 },
        }}
      />
      <Tabs.Screen name="inbox" options={{ title: t('nav.inbox') }} />
      <Tabs.Screen name="me" options={{ title: t('nav.me') }} />
    </Tabs>
  );
}

import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { t } from '@/shared/i18n/strings';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="files"
        options={{
          title: t('files'),
          tabBarIcon: ({ color }) => <SymbolView name="folder.fill" size={23} tintColor={color} />,
        }}
      />
      <Tabs.Screen
        name="transfers"
        options={{
          title: t('transfers'),
          tabBarIcon: ({ color }) => <SymbolView name="arrow.up.arrow.down" size={23} tintColor={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('settings'),
          tabBarIcon: ({ color }) => <SymbolView name="gearshape.fill" size={23} tintColor={color} />,
        }}
      />
    </Tabs>
  );
}

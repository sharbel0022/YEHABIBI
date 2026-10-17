import { Image, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CateringProvider } from '../lib/store';
import { colors } from '../lib/ui';

function Brand() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <Image source={require('../assets/icon.png')} style={{ width: 32, height: 32 }} />
      <Text style={{ color: colors.green, letterSpacing: 2, fontWeight: '700', fontSize: 15 }}>
        CEDAR MEZZE
      </Text>
    </View>
  );
}

export default function Layout() {
  return (
    <SafeAreaProvider>
      <CateringProvider>
        <StatusBar style="dark" />
        <Tabs
          screenOptions={{
            headerTitle: () => <Brand />,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: '#FFFFFF' },
            tabBarActiveTintColor: colors.green,
            tabBarInactiveTintColor: colors.muted,
            tabBarStyle: { borderTopColor: colors.line },
            tabBarLabelStyle: { fontSize: 10 },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'Hem',
              tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 22 }}>⌂</Text>,
            }}
          />
          <Tabs.Screen
            name="menyer"
            options={{
              title: 'Menyer',
              tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 22 }}>≡</Text>,
            }}
          />
          <Tabs.Screen
            name="bygg"
            options={{
              title: 'Bygg',
              tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 22 }}>+</Text>,
            }}
          />
          <Tabs.Screen
            name="bestall"
            options={{
              title: 'Beställ',
              tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>▤</Text>,
            }}
          />
          <Tabs.Screen
            name="ordrar"
            options={{
              title: 'Mina ordrar',
              tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>◷</Text>,
            }}
          />
          <Tabs.Screen
            name="kontakt"
            options={{
              title: 'Kontakt',
              tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>✦</Text>,
            }}
          />
        </Tabs>
      </CateringProvider>
    </SafeAreaProvider>
  );
}

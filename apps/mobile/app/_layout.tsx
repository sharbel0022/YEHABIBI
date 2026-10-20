import { Image, Platform, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CateringProvider } from '../lib/store';
import { colors } from '../lib/ui';
import { RemoteTestBoundary } from '../lib/remote-test-boundary';

function Brand() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <Image source={require('../assets/icon.png')} style={{ width: 46, height: 46 }} accessibilityLabel="Cederträd" />
      <View>
        <Text style={{ color: colors.green, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontWeight: '700', fontSize: 25 }}>Yehabibi</Text>
        <Text style={{ color: colors.green, letterSpacing: 2.4, fontSize: 9 }}>CEDAR MEZZE</Text>
      </View>
    </View>
  );
}

export default function Layout() {
  return (
    <SafeAreaProvider>
      <RemoteTestBoundary>
      <CateringProvider>
        <StatusBar style="dark" />
        <Tabs
          screenOptions={{
            headerTitle: () => <Brand />,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: '#FFFFFF' },
            tabBarActiveTintColor: colors.green,
            tabBarInactiveTintColor: colors.muted,
            tabBarStyle: { borderTopColor: colors.line, paddingTop: 7, backgroundColor: '#FFFFFF' },
            tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
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
              title: 'Din meny', href: null,
            }}
          />
          <Tabs.Screen
            name="direkt"
            options={{ title: 'Beställ nu', href: null }}
          />
          <Tabs.Screen
            name="bestall"
            options={{
              title: 'Förfrågan', href: null,
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
      </RemoteTestBoundary>
    </SafeAreaProvider>
  );
}

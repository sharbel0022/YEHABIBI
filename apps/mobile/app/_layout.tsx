import { useRef, useState } from 'react';
import { AccessibilityInfo, Alert, findNodeHandle, Image, Linking, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router, Tabs, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CateringProvider, useCatering } from '../lib/store';
import { HospitalityProvider, useHospitality } from '../lib/hospitality';
import { ContactActions } from '../lib/hospitality-ui';
import { colors, s } from '../lib/ui';
import { RemoteTestBoundary } from '../lib/remote-test-boundary';
import { phoneHref } from '@yehabibi/shared';

function Brand() {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    <Image source={require('../assets/icon.png')} style={{ width: 40, height: 40 }} accessibilityLabel="Cederträd" />
    <View>
      <Text style={{ color: colors.green, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontWeight: '600', fontSize: 23 }}>Yei Habibi</Text>
      <Text style={{ color: colors.green, letterSpacing: 1.7, fontSize: 8 }}>CATERING & FEST</Text>
    </View>
  </View>;
}

function MenuControl() {
  const { catalog } = useHospitality();
  const [open, setOpen] = useState(false);
  const trigger = useRef<View>(null);
  const closeButton = useRef<View>(null);
  const pathname = usePathname();
  function focus(node: View | null) {
    if (Platform.OS === 'web') (node as unknown as { focus?: () => void })?.focus?.();
    else {
      const handle = findNodeHandle(node);
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }
  function close() { setOpen(false); }
  const links = [ ['/', 'Hem'], ['/menyer', 'Catering'], ['/festlokaler', 'Festlokaler'], ['/om-oss', 'Om oss'], ['/kontakt', 'Kontakt'] ] as const;
  return <>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Ring oss ${catalog.contact.phone}`} disabled={!phoneHref(catalog.contact.phone)}
      onPress={() => { void Linking.openURL(phoneHref(catalog.contact.phone)).catch(() => Alert.alert('Ring oss', catalog.contact.phone)); }}
      style={{ minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.green, fontSize: 23 }}>☎</Text>
    </Pressable>
    <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel="Öppna meny" accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
      <Text style={{ color: colors.green, fontSize: 25 }}>☰</Text>
    </Pressable>
    </View>
    <Modal visible={open} onRequestClose={close} onShow={() => focus(closeButton.current)} onDismiss={() => focus(trigger.current)} animationType="fade" presentationStyle="fullScreen">
      <SafeAreaView style={s.screen} accessibilityViewIsModal>
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.row}><Brand /><Pressable ref={closeButton} accessibilityRole="button" accessibilityLabel="Stäng meny" onPress={close} style={[s.button, s.secondary]}><Text style={[s.buttonText, { color: colors.green }]}>Stäng ×</Text></Pressable></View>
          {links.map(([href, label]) => <Pressable key={href} accessibilityRole="link" accessibilityState={{ selected: pathname === href }}
            onPress={() => { close(); router.push(href); }} style={{ paddingVertical: 18, borderBottomColor: colors.line, borderBottomWidth: 1 }}>
            <Text style={[s.heading, pathname === href && { textDecorationLine: 'underline' }]}>{label}</Text>
          </Pressable>)}
          <ContactActions onlyPhone />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </>;
}

function Navigation() {
  const { catalog } = useCatering();
  const testing = catalog.test_mode === true;
  return <Tabs screenOptions={{
    headerTitle: () => <Brand />, headerRight: () => <MenuControl />, headerShadowVisible: false,
    headerStyle: { backgroundColor: '#FFFFFF' }, tabBarActiveTintColor: colors.green, tabBarInactiveTintColor: colors.muted,
    tabBarStyle: { borderTopColor: colors.line, paddingTop: 7, backgroundColor: '#FFFFFF' },
    tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
  }}>
    <Tabs.Screen name="index" options={{ title: 'Hem', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 23 }}>⌂</Text> }} />
    <Tabs.Screen name="menyer" options={{ title: 'Catering', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 23 }}>≡</Text> }} />
    <Tabs.Screen name="festlokaler" options={{ title: 'Festlokaler', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 21 }}>♧</Text> }} />
    <Tabs.Screen name="om-oss" options={{ title: 'Om oss', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 21 }}>ⓘ</Text> }} />
    <Tabs.Screen name="kontakt" options={{ title: 'Kontakt', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 21 }}>☎</Text> }} />
    <Tabs.Screen name="plockmeny" options={{ title: 'Plockmeny', href: null }} />
    <Tabs.Screen name="forfragan" options={{ title: 'Cateringförfrågan', href: null }} />
    <Tabs.Screen name="bygg" options={{ title: 'Din meny', href: null }} />
    <Tabs.Screen name="direkt" options={{ title: 'Testbeställning', href: null }} />
    <Tabs.Screen name="bestall" options={{ title: 'Testförfrågan', href: null }} />
    <Tabs.Screen name="ordrar" options={{ title: 'Testhistorik', href: testing ? '/ordrar' : null }} />
  </Tabs>;
}

export default function Layout() {
  return <SafeAreaProvider><RemoteTestBoundary><CateringProvider><HospitalityProvider>
    <StatusBar style="dark" /><Navigation />
  </HospitalityProvider></CateringProvider></RemoteTestBoundary></SafeAreaProvider>;
}

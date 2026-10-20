import { useEffect, useRef, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, remoteDeviceAuth, remoteTest } from './api';

/** Tailscale authenticates the owner's phone. No pairing or approval UI. */
export function RemoteTestBoundary({ children }: PropsWithChildren) {
  const device = useSyncExternalStore(remoteDeviceAuth.subscribe, remoteDeviceAuth.getState, remoteDeviceAuth.getState);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const active = useRef(false), inFlight = useRef(false), readyRef = useRef(false);
  readyRef.current = ready;
  const supported = remoteTest.enabled && Platform.OS !== 'web';
  const blocked = device.status === 'revoked' || device.status === 'invalid';
  const retry = useRef<() => Promise<void>>(async () => {});
  retry.current = async () => {
    if (!supported || inFlight.current || ['revoked', 'invalid'].includes(remoteDeviceAuth.getState().status)) return;
    inFlight.current = true;
    if (active.current) setBusy(true);
    const generation = remoteDeviceAuth.generation();
    try {
      await api.getCatalog();
      if (active.current && generation === remoteDeviceAuth.generation()) { setReady(true); setError(''); }
    } catch (reason) {
      if (active.current) { setReady(false); setError(reason instanceof Error ? reason.message : 'Datorn kunde inte nås. Ansluter igen automatiskt.'); }
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  };
  useEffect(() => {
    active.current = true;
    if (!supported) return () => { active.current = false; };
    const unsubscribe = remoteDeviceAuth.subscribe(() => {
      if (active.current && remoteDeviceAuth.getState().status !== 'approved') setReady(false);
    });
    void retry.current();
    const appState = AppState.addEventListener('change', next => { if (next === 'active') void retry.current(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active' && !readyRef.current) void retry.current(); }, 5000);
    return () => { active.current = false; unsubscribe(); appState.remove(); clearInterval(timer); };
  }, [supported]);

  if (!remoteTest.requested) return children;
  if (ready) return <View style={styles.fill}>
    <SafeAreaView edges={['top']} style={styles.banner}>
      <Text style={styles.title}>TESTLÄGE – INGA RIKTIGA PENGAR</Text>
      <Text style={styles.hint}>Ansluten till din dator via Tailscale. Använd endast syntetiska testuppgifter.</Text>
      <Pressable accessibilityRole="button" onPress={() => { void Linking.openURL(remoteTest.origin + '/__test/login').catch(() => setError('Webbläsaren kunde inte öppnas.')); }}>
        <Text style={styles.link}>Testadmin · separat inloggning</Text>
      </Pressable>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </SafeAreaView>
    {children}
  </View>;
  return <SafeAreaView style={styles.page}>
    <Text accessibilityRole="header" style={styles.heading}>{blocked ? 'Åtkomst till datorn saknas' : 'Ansluter till din dator…'}</Text>
    <Text style={styles.title}>TESTLÄGE – INGA RIKTIGA PENGAR</Text>
    <Text style={styles.body}>{blocked ? 'Telefonens åtkomst har återkallats eller kunde inte verifieras. Åtkomsten behöver återställas på datorn.' : 'Appen ansluter automatiskt. Datorn behöver vara på och Tailscale anslutet på båda enheterna, även när du använder 4G eller 5G.'}</Text>
    {busy && <ActivityIndicator accessibilityLabel="Ansluter till datorn" color="#155A43" />}
    {!!remoteTest.error && <Text accessibilityRole="alert" style={styles.error}>{remoteTest.error}</Text>}
    {remoteTest.enabled && Platform.OS === 'web' && <Text style={styles.error}>Öppna appen i Expo Go på telefonen.</Text>}
    {!!error && !blocked && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!blocked && supported && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void retry.current()}><Text style={styles.link}>Försök igen nu</Text></Pressable>}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 }, page: { flex: 1, justifyContent: 'center', padding: 24, gap: 18, backgroundColor: '#fff' },
  heading: { fontSize: 27, fontWeight: '700', color: '#155A43' }, title: { fontWeight: '700', color: '#533c0a' },
  body: { fontSize: 16, lineHeight: 25, color: '#242424' }, hint: { fontSize: 12, lineHeight: 18, color: '#533c0a' },
  banner: { backgroundColor: '#fff4d6', paddingHorizontal: 14, paddingBottom: 8, gap: 5, borderBottomWidth: 1, borderBottomColor: '#d29922' },
  link: { color: '#155A43', textDecorationLine: 'underline', paddingVertical: 8 }, error: { color: '#9b2c2c', lineHeight: 21 },
});

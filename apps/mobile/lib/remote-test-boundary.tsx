import { useEffect, useRef, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, remoteDeviceAuth, remoteTest } from './api';

/** Monterar inga beställningsskärmar innan en autentiserad testkatalog verifierats. */
export function RemoteTestBoundary({ children }: PropsWithChildren) {
  const device = useSyncExternalStore(remoteDeviceAuth.subscribe, remoteDeviceAuth.getState, remoteDeviceAuth.getState);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(remoteTest.enabled && Platform.OS !== 'web');
  const [error, setError] = useState('');
  const active = useRef(true);
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const inFlight = useRef(false);
  const retry = useRef<() => Promise<void>>(async () => {});
  const supported = remoteTest.enabled && Platform.OS !== 'web';
  const blocked = device.status === 'revoked' || device.status === 'invalid' || device.status === 'locked';

  async function connect(register = false) {
    if (!supported || inFlight.current) return;
    const attempt = remoteDeviceAuth.generation();
    inFlight.current = true;
    setBusy(true); setError('');
    const current = () => active.current && attempt === remoteDeviceAuth.generation();
    try {
      if (register || remoteDeviceAuth.getState().status === 'pending') {
        const enrollment = await remoteDeviceAuth.enroll();
        if (!current() || enrollment.status === 'pending') return;
      } else if (!await remoteDeviceAuth.load()) return;
      if (!current()) return;
      try {
        await api.getCatalog();
      } catch (reason) {
        // En tidigare pending-registrering överlever även Expo/telefon-omstart.
        if (current() && remoteDeviceAuth.getState().status === 'pending') {
          await remoteDeviceAuth.enroll();
          return;
        }
        throw reason;
      }
      if (current() && remoteDeviceAuth.getState().status === 'approved') setReady(true);
    } catch (reason) {
      if (current()) { setReady(false); setError(reason instanceof Error ? reason.message : 'Testservern kunde inte verifieras.'); }
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }
  retry.current = async () => {
    const status = remoteDeviceAuth.getState().status;
    if (!['unregistered', 'revoked', 'invalid', 'locked'].includes(status)) await connect();
  };

  useEffect(() => {
    active.current = true;
    if (!supported) return;
    const unsubscribe = remoteDeviceAuth.subscribe(() => {
      if (active.current && remoteDeviceAuth.getState().status !== 'approved') setReady(false);
    });
    void connect();
    const appState = AppState.addEventListener('change', next => { if (next === 'active') void retry.current(); });
    const interval = setInterval(() => {
      if (AppState.currentState === 'active' && !readyRef.current) void retry.current();
    }, 5000);
    return () => { active.current = false; unsubscribe(); appState.remove(); clearInterval(interval); };
  }, [supported]);

  function lock() {
    remoteDeviceAuth.lock();
    setReady(false); setError('');
  }
  async function forget() {
    setReady(false); setError('');
    try { await remoteDeviceAuth.forget(); }
    catch { setError('Appen är låst. Registreringen kunde inte tas bort ur SecureStore; försök glömma telefonen igen.'); }
  }
  async function openAdmin() {
    try { await Linking.openURL(`${remoteTest.origin}/__test/login`); }
    catch { setError('Webbläsaren kunde inte öppnas. Öppna den privata webbadressen från PowerShell.'); }
  }

  if (!remoteTest.requested) return children;
  if (ready) return <View style={{ flex: 1 }}>
    <SafeAreaView edges={['top']} style={styles.banner}>
      <Text accessibilityRole="alert" style={styles.bannerTitle}>TESTLÄGE – INGA RIKTIGA PENGAR</Text>
      <Text style={styles.hint}>Privat test via Tailscale. Använd endast syntetiska uppgifter. Telefonens registrering ger kundåtkomst. Testadmin och betalningssimulator kräver separat förhöjd behörighet från datorn.</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={() => void openAdmin()}><Text style={styles.link}>Öppna privat testadmin</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={lock}><Text style={styles.link}>Lås testappen</Text></Pressable>
      </View>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </SafeAreaView>
    {children}
  </View>;
  return <SafeAreaView style={styles.page}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>Anslut privat testapp</Text>
      <Text style={styles.bannerTitle}>TESTLÄGE – INGA RIKTIGA PENGAR</Text>
      <Text style={styles.body}>Anslut Tailscale på telefonen och datorn. Första gången registrerar du telefonen här och godkänner den på datorn. Därefter ansluter appen automatiskt, även efter omstart.</Text>
      <Text style={styles.hint}>Telefonens hemliga enhetsnyckel sparas i SecureStore. Inga sessionsnycklar behöver kopieras. Använd aldrig riktigt kundnamn, e-postadress eller telefonnummer i testbeställningar.</Text>
      {!!remoteTest.error && <Text accessibilityRole="alert" style={styles.error}>{remoteTest.error}</Text>}
      {remoteTest.enabled && Platform.OS === 'web' && <Text accessibilityRole="alert" style={styles.error}>Registrering kräver Expo Go på iPhone eller Android och telefonens SecureStore. Öppna appen i Expo Go på telefonen.</Text>}
      {supported && <>
        {device.status === 'pending' && device.enrollment?.status === 'pending' && <View style={styles.registration}>
          <Text accessibilityRole="header" style={styles.label}>Godkänn på datorn</Text>
          <Text selectable style={styles.body}>Enhet: {device.enrollment.id}</Text>
          <Text selectable style={styles.code}>{device.enrollment.comparison_code}</Text>
          <Text style={styles.body}>Jämför denna kod med datorns enhetslista. Godkänn sedan i PowerShell:</Text>
          <Text selectable style={styles.command}>npm run dev:remote:devices -- approve {device.enrollment.id} {device.enrollment.comparison_code}</Text>
          <Text style={styles.hint}>Koden är en jämförelsekod, ingen inloggningsnyckel. Appen väntar och ansluter när datorn har godkänt telefonen.</Text>
        </View>}
        {!device.saved && !blocked && <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy}
          onPress={() => void connect(true)} style={[styles.button, busy && styles.disabled]}>
          <Text style={styles.buttonText}>Registrera denna telefon</Text>
        </Pressable>}
        {device.saved && !['revoked', 'invalid'].includes(device.status) && <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || device.forgetting }} disabled={busy || device.forgetting}
          onPress={() => { remoteDeviceAuth.unlock(); void connect(); }} style={[styles.button, (busy || device.forgetting) && styles.disabled]}>
          <Text style={styles.buttonText}>{busy ? 'Ansluter…' : device.status === 'pending' ? 'Kontrollera godkännandet' : 'Anslut igen'}</Text>
        </Pressable>}
        {busy && <ActivityIndicator accessibilityLabel="Verifierar testservern" color="#155A43" />}
        {(device.saved || blocked) && <Pressable accessibilityRole="button" disabled={device.forgetting} accessibilityState={{ disabled: device.forgetting }} onPress={() => void forget()}><Text style={styles.link}>{device.forgetting ? 'Glömmer registreringen…' : 'Glöm telefonens registrering'}</Text></Pressable>}
        {!!device.message && <Text accessibilityRole="alert" style={blocked ? styles.error : styles.body}>{device.message}</Text>}
        {device.saved && !blocked && device.status !== 'pending' && <Text style={styles.hint}>Registreringen finns kvar. Appen försöker ansluta igen automatiskt när datorn och Tailscale är tillgängliga.</Text>}
      </>}
      {!!error && error !== device.message && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' }, content: { padding: 24, gap: 18, maxWidth: 640, width: '100%', alignSelf: 'center' },
  title: { fontSize: 28, color: '#155A43', fontWeight: '700' }, body: { fontSize: 16, lineHeight: 25, color: '#242424' },
  hint: { fontSize: 12, lineHeight: 18, color: '#533c0a' }, label: { fontSize: 16, fontWeight: '600', color: '#155A43' },
  registration: { padding: 16, gap: 12, borderColor: '#155A43', borderWidth: 1, borderRadius: 10 },
  code: { fontSize: 26, fontWeight: '700', letterSpacing: 2, color: '#155A43' },
  command: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, color: '#242424' },
  button: { backgroundColor: '#155A43', borderRadius: 10, padding: 16 }, disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', textAlign: 'center', fontWeight: '700' },
  banner: { backgroundColor: '#fff4d6', paddingHorizontal: 14, paddingBottom: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: '#d29922' },
  bannerTitle: { color: '#533c0a', fontWeight: '700' }, actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 14 },
  link: { color: '#155A43', textDecorationLine: 'underline', paddingVertical: 8 }, error: { color: '#9b2c2c', fontSize: 14, lineHeight: 21 },
});

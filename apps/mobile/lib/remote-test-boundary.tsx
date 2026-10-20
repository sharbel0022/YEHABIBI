import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  api, clearRemoteTestCredential, onRemoteTestLock, readRemoteTestCredential, remoteTest, saveRemoteTestCredential,
} from './api';

/** Monterar inga beställningsskärmar innan en autentiserad testkatalog verifierats. */
export function RemoteTestBoundary({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(remoteTest.enabled);
  const [saved, setSaved] = useState(false);
  const [credential, setCredential] = useState('');
  const [error, setError] = useState('');
  const revision = useRef(0);
  useEffect(() => {
    if (!remoteTest.enabled) return;
    let active = true;
    const unsubscribe = onRemoteTestLock(() => {
      revision.current++;
      if (active) { setReady(false); setSaved(false); setCredential(''); }
    });
    void (async () => {
      const attempt = revision.current;
      try {
        const exists = await readRemoteTestCredential();
        if (!active || attempt !== revision.current) return;
        setSaved(exists);
        if (exists) {
          await api.getCatalog();
          if (active && attempt === revision.current) setReady(true);
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Testservern kunde inte verifieras.');
      } finally { if (active) setBusy(false); }
    })();
    return () => { active = false; unsubscribe(); };
  }, []);

  async function connect() {
    if (busy) return;
    const attempt = revision.current;
    setBusy(true); setError('');
    try {
      if (credential.trim()) { await saveRemoteTestCredential(credential.trim()); setSaved(true); }
      await api.getCatalog();
      if (attempt === revision.current) { setCredential(''); setReady(true); }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Testservern kunde inte verifieras.');
    } finally { setBusy(false); }
  }

  async function lock() {
    try { await clearRemoteTestCredential(); }
    catch { setError('Appen är låst. Det sparade testminnet kunde inte rensas; försök låsa igen.'); }
  }

  async function openAdmin() {
    try { await Linking.openURL(`${remoteTest.origin}/__test/login`); }
    catch { setError('Webbläsaren kunde inte öppnas. Öppna den privata webbadressen från PowerShell.'); }
  }

  if (!remoteTest.requested) return children;
  if (ready) return <View style={{ flex: 1 }}>
    <SafeAreaView edges={['top']} style={styles.banner}>
      <Text accessibilityRole="alert" style={styles.bannerTitle}>TESTLÄGE – INGA RIKTIGA PENGAR</Text>
      <Text style={styles.hint}>Privat test via Tailscale. Endast syntetiska uppgifter. Testadmin och betalningssimulator kräver den separata åtgärdsnyckeln i webbläsaren.</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={() => void openAdmin()}><Text style={styles.link}>Öppna privat testadmin</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => void lock()}><Text style={styles.link}>Lås testappen</Text></Pressable>
      </View>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </SafeAreaView>
    {children}
  </View>;
  return <SafeAreaView style={styles.page}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>Anslut privat testapp</Text>
      <Text style={styles.bannerTitle}>TESTLÄGE – INGA RIKTIGA PENGAR</Text>
      <Text style={styles.body}>Datorn och Tailscale på telefonen måste vara anslutna. Använd kundappens sessionsnyckel som visas av npm run dev:remote i PowerShell.</Text>
      <Text style={styles.hint}>Nyckeln sparas i enhetens säkra lagring, eller tillfälligt i webbläsarens session. Använd aldrig ett riktigt kundnamn, en e-postadress eller ett telefonnummer i testbeställningar.</Text>
      {!!remoteTest.error && <Text accessibilityRole="alert" style={styles.error}>{remoteTest.error}</Text>}
      {remoteTest.enabled && <>
        <Text style={styles.label}>Kundappens sessionsnyckel</Text>
        <TextInput accessibilityLabel="Kundappens sessionsnyckel" value={credential} onChangeText={setCredential}
          secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="none" autoComplete="off"
          maxLength={80} style={styles.input} editable={!busy} onSubmitEditing={() => void connect()} />
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !saved && !credential.trim() }}
          disabled={busy || !saved && !credential.trim()} onPress={() => void connect()}
          style={[styles.button, (busy || !saved && !credential.trim()) && { opacity: 0.5 }]}>
          <Text style={styles.buttonText}>{busy ? 'Verifierar testservern…' : saved && !credential.trim() ? 'Försök ansluta igen' : 'Anslut testappen'}</Text>
        </Pressable>
        {busy && <ActivityIndicator accessibilityLabel="Verifierar testservern" color="#155A43" />}
        {saved && <Pressable accessibilityRole="button" onPress={() => void lock()}><Text style={styles.link}>Glöm sparad sessionsnyckel</Text></Pressable>}
      </>}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' }, content: { padding: 24, gap: 18, maxWidth: 640, width: '100%', alignSelf: 'center' },
  title: { fontSize: 28, color: '#155A43', fontWeight: '700' }, body: { fontSize: 16, lineHeight: 25, color: '#242424' },
  hint: { fontSize: 12, lineHeight: 18, color: '#533c0a' }, label: { fontSize: 14, fontWeight: '600', color: '#155A43' },
  input: { borderColor: '#155A43', borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 16, color: '#242424' },
  button: { backgroundColor: '#155A43', borderRadius: 10, padding: 16 }, buttonText: { color: '#fff', textAlign: 'center', fontWeight: '700' },
  banner: { backgroundColor: '#fff4d6', paddingHorizontal: 14, paddingBottom: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: '#d29922' },
  bannerTitle: { color: '#533c0a', fontWeight: '700' }, actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 14 },
  link: { color: '#155A43', textDecorationLine: 'underline', paddingVertical: 8 }, error: { color: '#9b2c2c', fontSize: 14, lineHeight: 21 },
});

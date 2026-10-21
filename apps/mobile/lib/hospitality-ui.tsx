import { useState, type PropsWithChildren, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cateringMailto, phoneHref } from '@yehabibi/shared';
import { useHospitality } from './hospitality';
import { Button, colors, Notice, s } from './ui';
import { apiUrl, openPolicy } from './api';

export function HospitalityScreen({ title, intro, children, footer }: PropsWithChildren<{ title: string; intro?: string; footer?: ReactNode }>) {
  const { catalog, loading, error, refresh } = useHospitality();
  const [policyError, setPolicyError] = useState('');
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={s.screen}>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[s.content, { gap: 28 }]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.green} />}>
      <View style={s.section}>
        <Text style={[s.eyebrow, { color: colors.red }]}>LIBANESISKA SMAKER · FESTER ATT MINNAS</Text>
        <Text accessibilityRole="header" style={s.title}>{title}</Text>
        {!!intro && <Text style={s.body}>{intro}</Text>}
      </View>
      {loading && <ActivityIndicator accessibilityLabel="Hämtar aktuellt innehåll" color={colors.green} />}
      {catalog.preview && <Text style={s.detail}>Innehållsutkast. Bilder, priser och uppgifter inväntar företagets godkännande före publicering.</Text>}
      {!!error && <View style={s.section}><Notice text={error} /><Button secondary title="Hämta aktuellt innehåll igen" disabled={loading} onPress={() => void refresh()} /></View>}
      {children}
      <View style={[s.section, { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 24 }]}>
        <Text style={s.heading}>Yei Habibi</Text><Text style={s.eyebrow}>CATERING & FEST</Text>
        <Text style={s.detail}>Catering: mejl eller telefon. Fest: endast telefon.</Text>
        {!!apiUrl && <Button secondary title="Integritet" onPress={() => { void openPolicy('/integritet').catch(() => setPolicyError('Integritetssidan kunde inte öppnas.')); }} />}
        {!!policyError && <Notice text={policyError} />}
      </View>
    </ScrollView>
    {!!footer && <View style={[s.fixed, { paddingBottom: 12 }]}>{footer}</View>}
  </SafeAreaView>;
}

export function ContactActions({ onlyPhone = false, menu = 'Catering', body, phone }: { onlyPhone?: boolean; menu?: string; body?: string; phone?: string }) {
  const { catalog } = useHospitality();
  const { contact } = catalog;
  const [error, setError] = useState('');
  const telephone = phone || contact.phone;
  const tel = phoneHref(telephone);
  const mailto = contact.emailVerified ? cateringMailto(contact.email, menu, body) : null;
  async function open(url: string) {
    try { setError(''); await Linking.openURL(url); }
    catch { setError('Länken kunde inte öppnas. Använd kontaktuppgifterna nedan.'); }
  }
  return <View style={s.section}>
    {!onlyPhone && <>
      <Button title="Mejla oss" disabled={!mailto} onPress={() => { if (mailto) void open(mailto); }} />
      {mailto ? <>
        <Text selectable style={s.body}>{contact.email}</Text>
        <Text style={s.detail}>Tryck länge på adressen för att markera och kopiera den.</Text>
        <Text style={s.detail}>Öppnar ett mejlutkast i din e-postapp. Du behöver själv skicka mejlet. Företaget bekräftar sedan din förfrågan personligen.</Text>
      </> : <Text style={s.detail}>Cateringens e-postadress inväntar bekräftelse. Ring oss för din förfrågan.</Text>}
    </>}
    <Button secondary={!onlyPhone} title={`Ring ${telephone}`} disabled={!tel} onPress={() => { if (tel) void open(tel); }} />
    {onlyPhone && <Text style={s.detail}>Ring oss för bokning. Datum och upplägg kommer ni överens om i samtalet.</Text>}
    {!!error && <Notice text={error} />}
  </View>;
}

export function Expandable({ title, children, initiallyExpanded = false }: PropsWithChildren<{ title: string; initiallyExpanded?: boolean }>) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  return <View style={s.section}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={[s.button, s.secondary]}>
      <Text style={[s.buttonText, { color: colors.green }]}>{expanded ? 'Dölj innehåll' : title} {expanded ? '−' : '+'}</Text>
    </Pressable>
    {expanded && children}
  </View>;
}

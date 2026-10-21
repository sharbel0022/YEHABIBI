import { useState } from 'react';
import { Text, View } from 'react-native';
import { safeExternalUrl } from '@yehabibi/shared';
import { openWebsite } from '../lib/api';
import { useHospitality } from '../lib/hospitality';
import { ContactActions, HospitalityScreen } from '../lib/hospitality-ui';
import { Button, Notice, s } from '../lib/ui';

export default function Contact() {
  const { catalog } = useHospitality();
  const { contact } = catalog;
  const [error, setError] = useState('');
  return <HospitalityScreen title="Vi hjälper dig att planera." intro="Välj rätt kontaktväg för det du behöver.">
    <View style={s.card}><View style={s.cardBody}>
      <Text accessibilityRole="header" style={s.heading}>Catering</Text>
      <Text style={s.body}>Tre menyer eller en egen plockmeny. Hör av dig via mejl eller telefon.</Text>
      <ContactActions />
    </View></View>
    <View style={s.card}><View style={s.cardBody}>
      <Text accessibilityRole="header" style={s.heading}>Fest</Text>
      <Text style={s.body}>Frågor och bokning av våra lokaler sker endast via telefon.</Text>
      <ContactActions onlyPhone />
    </View></View>
    <View style={s.section}>
      <Text accessibilityRole="header" style={s.heading}>Yei Habibi · Catering & Fest</Text>
      <Text style={s.label}>Kontaktadress</Text>
      <Text selectable style={s.body}>{contact.address}</Text>
      <Text style={s.detail}>Kontaktadressen gäller inte automatiskt varje festlokal.</Text>
      {!!safeExternalUrl(contact.mapsUrl) && <Button secondary title="Öppna Google Maps" onPress={() => { void openWebsite(contact.mapsUrl).catch(() => setError('Kartlänken kunde inte öppnas.')); }} />}
      {contact.socialLinks.filter(link => safeExternalUrl(link.url)).map(link => <Button secondary key={link.url} title={link.label} onPress={() => { void openWebsite(link.url).catch(() => setError('Länken kunde inte öppnas.')); }} />)}
      {!!error && <Notice text={error} />}
    </View>
  </HospitalityScreen>;
}

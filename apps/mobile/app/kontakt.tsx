import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { safeExternalUrl } from '@yehabibi/shared';
import { openWebsite } from '../lib/api';
import { useCatering } from '../lib/store';
import { Button, Notice, Photo, Screen, s } from '../lib/ui';

export default function Contact() {
  const { catalog } = useCatering();
  const settings = catalog.settings;
  const [error, setError] = useState('');
  async function open(url: string | null | undefined) {
    try {
      setError('');
      await openWebsite(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Länken kunde inte öppnas.');
    }
  }
  async function contact(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      setError('Det finns ingen app som kan öppna länken på den här enheten.');
    }
  }
  return (
    <Screen
      title="Vi hjälper dig att samla alla"
      intro="Har du frågor om en meny, ett firande eller allergier? Hör av dig så planerar vi tillsammans."
    >
      <Photo url="/images/mezze.webp" />
      <View style={s.section}>
        <Text style={s.heading}>Cedar Mezze</Text>
        <Text style={s.body}>{settings.description}</Text>
        <Text style={s.detail}>{settings.service_area}</Text>
        {!!settings.pickup_address && <Text style={s.body}>{settings.pickup_address}</Text>}
        {!!settings.contact_phone && (
          <Button
            secondary
            title={`Ring ${settings.contact_phone}`}
            onPress={() => void contact(`tel:${settings.contact_phone.replace(/[^+\d]/g, '')}`)}
          />
        )}
        {!!settings.contact_email && (
          <Button
            secondary
            title={settings.contact_email}
            onPress={() => void contact(`mailto:${encodeURIComponent(settings.contact_email)}`)}
          />
        )}
        {!settings.contact_email && !settings.contact_phone && (
          <Notice text="Ägaren publicerar kontaktuppgifter före lansering." />
        )}
      </View>
      <View style={s.section}>
        <Text style={s.heading}>Hitta oss</Text>
        <Button
          secondary
          title="Öppna Google Maps"
          disabled={!safeExternalUrl(settings.google_maps_url)}
          onPress={() => void open(settings.google_maps_url)}
        />
        {!safeExternalUrl(settings.google_maps_url) && (
          <Text style={s.detail}>Företagets officiella kartlänk är ännu inte tillagd.</Text>
        )}
      </View>
      <View style={s.section}>
        <Text style={s.heading}>Har vi lagat mat till dig?</Text>
        <Text style={s.body}>Berätta gärna om din upplevelse på Google.</Text>
        <Button
          title="Skriv en Google-recension"
          disabled={!safeExternalUrl(settings.google_review_url)}
          onPress={() => void open(settings.google_review_url)}
        />
        {!safeExternalUrl(settings.google_review_url) && (
          <Text style={s.detail}>
            Recensionsknappen öppnar när företagets riktiga recensionslänk är konfigurerad.
          </Text>
        )}
      </View>
      {[
        { title: 'Instagram', url: settings.instagram_url },
        { title: 'Facebook', url: settings.facebook_url },
        { title: 'TikTok', url: settings.tiktok_url },
      ]
        .filter((item) => safeExternalUrl(item.url))
        .map((item) => (
          <Button key={item.title} secondary title={item.title} onPress={() => void open(item.url)} />
        ))}
      {!!error && <Notice text={error} />}
    </Screen>
  );
}

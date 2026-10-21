import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Venue } from '@yehabibi/shared';
import { useHospitality } from '../lib/hospitality';
import { ContactActions, HospitalityScreen } from '../lib/hospitality-ui';
import { Button, Photo, s } from '../lib/ui';

function VenueDetails({ venue, onClose }: { venue: Venue; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [large, setLarge] = useState(false);
  const touchStart = useRef(0);
  const swiped = useRef(false);
  const image = venue.images[index];
  function move(direction: number) { setIndex(current => (current + direction + venue.images.length) % venue.images.length); }
  useEffect(() => { setIndex(current => Math.min(current, Math.max(0, venue.images.length - 1))); }, [venue.images.length]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    function keyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') { if (large) setLarge(false); else onClose(); }
      if (venue.images.length > 1 && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        setIndex(current => (current + (event.key === 'ArrowLeft' ? -1 : 1) + venue.images.length) % venue.images.length);
      }
    }
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  }, [large, onClose, venue.images.length]);
  return <SafeAreaView style={s.screen} accessibilityViewIsModal>
    <ScrollView contentContainerStyle={s.content}>
      <Button secondary title="Stäng lokalvisning" onPress={onClose} />
      <Text accessibilityRole="header" style={s.title}>{venue.name}</Text>
      {!!image && <Pressable accessibilityRole="button" accessibilityLabel={`Förstora bild ${index + 1} av ${venue.images.length}: ${image.alt}`} onPress={() => { if (!swiped.current) setLarge(true); }}
        onTouchStart={event => { touchStart.current = event.nativeEvent.pageX; swiped.current = false; }} onTouchEnd={event => { const distance = event.nativeEvent.pageX - touchStart.current; if (venue.images.length > 1 && Math.abs(distance) > 70) { swiped.current = true; move(distance > 0 ? -1 : 1); } }}>
        <Photo url={image.src} hero label={image.alt} strict />
      </Pressable>}
      {venue.images.length > 1 && <View style={s.section}>
        <Text style={s.detail} accessibilityLiveRegion="polite">Bild {index + 1} av {venue.images.length}</Text>
        <Button secondary title="Föregående bild" onPress={() => move(-1)} />
        <Button secondary title="Nästa bild" onPress={() => move(1)} />
      </View>}
      <Text style={s.body}>{venue.description}</Text>
      {!!venue.capacity && <Text style={s.label}>Upp till {venue.capacity} personer</Text>}
      {!!venue.address && <Text selectable style={s.body}>{venue.address}</Text>}
      {venue.facilities.map(facility => <Text key={facility} style={s.body}>• {facility}</Text>)}
      <ContactActions onlyPhone phone={venue.phone} />
    </ScrollView>
    <Modal visible={large} onRequestClose={() => setLarge(false)} animationType="fade" presentationStyle="fullScreen">
      <SafeAreaView style={[s.screen, { padding: 18, gap: 20 }]} accessibilityViewIsModal>
        <Button secondary title="Stäng stor bild" onPress={() => setLarge(false)} />
        {!!image && <Photo url={image.src} label={image.alt} contain strict />}
        <Text style={s.detail}>Bild {index + 1} av {venue.images.length}</Text>
        {venue.images.length > 1 && <><Button secondary title="Föregående bild" onPress={() => move(-1)} /><Button title="Nästa bild" onPress={() => move(1)} /></>}
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

export default function Venues() {
  const { catalog } = useHospitality();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const venues = catalog.venues.filter(venue => venue.approved && venue.published);
  const selected = venues.find(venue => venue.id === selectedId);
  useEffect(() => { if (selectedId && !selected) setSelectedId(null); }, [selectedId, selected]);
  return <HospitalityScreen title="Hitta platsen för din fest." intro="Ring oss för information och bokning av festlokal.">
    {!venues.length && <View style={s.section}>
      <Text style={s.heading}>Vi presenterar lokalerna här när uppgifterna är klara.</Text>
      <Text style={s.body}>Godkända namn, bilder och lokalfakta inväntas. Ring oss så berättar vi om möjligheterna för din fest.</Text>
    </View>}
    {venues.map(venue => <View style={s.card} key={venue.id}>
      {!!venue.images[0] && <Photo url={venue.images[0].src} label={venue.images[0].alt} strict />}
      <View style={s.cardBody}>
        <Text accessibilityRole="header" style={s.heading}>{venue.name}</Text>
        <Text style={s.body}>{venue.description}</Text>
        {!!venue.capacity && <Text style={s.label}>Upp till {venue.capacity} personer</Text>}
        {!!venue.address && <Text style={s.detail}>{venue.address}</Text>}
        <Button secondary title="Visa lokalen" onPress={() => setSelectedId(venue.id)} />
        <ContactActions onlyPhone phone={venue.phone} />
      </View>
    </View>)}
    {!venues.length && <ContactActions onlyPhone />}
    <Modal visible={!!selected} onRequestClose={() => setSelectedId(null)} animationType="slide" presentationStyle="fullScreen">
      {selected && <VenueDetails key={selected.id} venue={selected} onClose={() => setSelectedId(null)} />}
    </Modal>
  </HospitalityScreen>;
}

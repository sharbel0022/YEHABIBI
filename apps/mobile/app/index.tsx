import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useHospitality } from '../lib/hospitality';
import { ContactActions, HospitalityScreen } from '../lib/hospitality-ui';
import { Button, Photo, s } from '../lib/ui';
import { useCatering } from '../lib/store';
import LegacyHome from '../legacy/index';

export default function Home() {
  const { catalog: legacy } = useCatering();
  const { catalog } = useHospitality();
  const menus = catalog.menus.filter(menu => menu.published);
  const cover = menus.find(menu => menu.approved && menu.image);
  if (legacy.test_mode === true) return <LegacyHome />;
  return <HospitalityScreen title="Catering & fest." intro="Välj det du vill planera. Vi hjälper dig vidare personligen.">
    <View style={s.card}>
      <Photo url={cover?.image || '/images/catering-fest/catering.webp'} label={cover?.imageAlt || 'Libanesisk catering – bildexempel'} />
      <View style={s.cardBody}>
        {!cover && <Text style={s.detail}>Bildexempel från företagets bildmaterial.</Text>}
        <Text accessibilityRole="header" style={s.heading}>Catering för alla tillfällen</Text>
        <Text style={s.body}>Tre menyer och en plockmeny. Kontakt via mejl eller telefon.</Text>
        <Button title="Visa catering" onPress={() => router.push('/menyer')} />
      </View>
    </View>
    <View style={s.card}>
      <Photo url={catalog.venues[0]?.images[0]?.src || '/images/catering-fest/dukning.webp'} label={catalog.venues[0]?.images[0]?.alt || 'Bildexempel på festdukning, inte en verifierad lokal'} />
      <View style={s.cardBody}>
        {!catalog.venues.length && <Text style={s.detail}>Bildexempel på dukning. Lokalfoton inväntar godkännande.</Text>}
        <Text accessibilityRole="header" style={s.heading}>Oförglömliga event i våra festlokaler</Text>
        <Text style={s.body}>Hitta platsen för ditt tillfälle. All festbokning sker via telefon.</Text>
        <Button title="Visa festlokaler" onPress={() => router.push('/festlokaler')} />
      </View>
    </View>
    <View style={s.section}>
      <Text accessibilityRole="header" style={s.heading}>Våra cateringmenyer</Text>
      {!menus.length && <Text style={s.body}>Aktuella menyer presenteras här när de är publicerade. Kontakta oss för ditt tillfälle.</Text>}
      {menus.map(menu => <View style={s.card} key={menu.id}>
        <View style={s.cardBody}>
          <Text style={s.heading}>{menu.name}</Text>
          <Text style={s.price}>{menu.pricePerPerson === null ? 'Pris enligt offert' : `${menu.pricePerPerson} kr/person`}</Text>
          <Button secondary title="Visa meny" onPress={() => router.push({ pathname: '/menyer', params: { meny: menu.slug } })} />
        </View>
      </View>)}
    </View>
    <View style={s.section}><Text style={s.heading}>Mat att dela. Tillfällen att minnas.</Text>
      <Text style={s.body}>Libanesisk catering för bröllop, födelsedagar, studentfirande och företagets fest. Vi planerar maten och tillfället tillsammans med dig.</Text>
      <Button secondary title="Om oss" onPress={() => router.push('/om-oss')} />
    </View>
    <ContactActions />
  </HospitalityScreen>;
}

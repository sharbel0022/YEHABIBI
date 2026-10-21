import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useHospitality } from '../lib/hospitality';
import { ContactActions, Expandable, HospitalityScreen } from '../lib/hospitality-ui';
import { Button, Photo, s } from '../lib/ui';
import { useCatering } from '../lib/store';
import LegacyMenus from '../legacy/menyer';

export default function Catering() {
  const { catalog: legacy } = useCatering();
  const { catalog } = useHospitality();
  const params = useLocalSearchParams<{ meny?: string }>();
  if (legacy.test_mode === true) return <LegacyMenus />;
  const menus = catalog.menus.filter(menu => menu.published);
  return <HospitalityScreen title="Catering som passar ditt tillfälle." intro="Välj bland tre menyer eller skapa en egen plockmeny. Vi bekräftar innehåll och upplägg personligen.">
    {!menus.length && <View style={s.section}><Text style={s.body}>Aktuella menyer inväntar publicering. Kontakta oss så hjälper vi dig med din catering.</Text><ContactActions /></View>}
    {menus.map(menu => <View style={s.card} key={menu.id}>
      <Photo url={menu.image} label={menu.imageAlt || `${menu.name} – bildexempel`} />
      <View style={s.cardBody}>
        {!menu.approved && <Text style={s.detail}>Innehållsutkast · bildexempel</Text>}
        <Text accessibilityRole="header" style={s.heading}>{menu.name}</Text>
        <Text style={s.price}>{menu.pricePerPerson === null ? 'Pris enligt offert' : `${menu.pricePerPerson} kr/person`}</Text>
        <Text style={s.body}>{menu.description}</Text>
        {menu.pricePerPerson === null ? <Button secondary title="Skapa din egen catering" onPress={() => router.push('/plockmeny')} /> : <>
          <Expandable key={`${menu.slug}-${params.meny || ''}`} title="Visa innehåll" initiallyExpanded={params.meny === menu.slug}>
            <Text style={s.label}>Meze</Text>
            {menu.meze.map(dish => <Text key={dish} style={s.body}>• {dish}</Text>)}
            {!!menu.grill && <><Text style={s.label}>Grill</Text><Text style={s.body}>{menu.grill}</Text></>}
            <Text style={s.detail}>{menu.allergensVerified && menu.allergens.length ? `Allergener: ${menu.allergens.join(', ')}.` : 'Fråga oss om allergener och specialkost.'} Mängder och aktuella priser bekräftas av företaget.</Text>
          </Expandable>
          <Button title="Välj denna meny" onPress={() => router.push({ pathname: '/forfragan', params: { meny: menu.slug } })} />
          <ContactActions menu={menu.name} />
        </>}
      </View>
    </View>)}
    <Text style={s.detail}>Ingen onlinebetalning. Ett mejlutkast är inte en skickad förfrågan eller bekräftad bokning.</Text>
  </HospitalityScreen>;
}

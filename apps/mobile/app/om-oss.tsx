import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { HospitalityScreen } from '../lib/hospitality-ui';
import { Button, Photo, s } from '../lib/ui';

export default function About() {
  return <HospitalityScreen title="Mat att dela. Tillfällen att minnas.">
    <Photo url="/images/catering-fest/meze.webp" label="Libanesiska mezerätter – bildexempel" />
    <Text style={s.detail}>Bildexempel från företagets bildmaterial.</Text>
    <View style={s.section}>
      <Text style={s.heading}>Yei Habibi – Catering & Fest</Text>
      <Text style={s.body}>Här presenterar vi libanesisk catering och våra festlokaler. Välj bland tre menyer, fråga om en plockmeny eller ring oss om en festlokal.</Text>
      <Text style={s.body}>Catering planerar du med oss via mejl eller telefon. För en festlokal diskuterar vi datum och upplägg i ett telefonsamtal.</Text>
      <Button title="Se cateringmenyer" onPress={() => router.push('/menyer')} />
      <Button secondary title="Se festlokaler" onPress={() => router.push('/festlokaler')} />
    </View>
  </HospitalityScreen>;
}

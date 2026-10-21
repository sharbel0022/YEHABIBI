import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { buildCateringEmail, cateringMailto } from '@yehabibi/shared';
import { useHospitality } from './hospitality';
import { ContactActions, HospitalityScreen } from './hospitality-ui';
import { Button, Choices, Field, Notice, s } from './ui';

export function CateringInquiry({ custom = false }: { custom?: boolean }) {
  const { catalog } = useHospitality();
  const params = useLocalSearchParams<{ meny?: string }>();
  const menus = catalog.menus.filter(menu => menu.published);
  const initialMenu = custom ? menus.find(menu => menu.pricePerPerson === null) : menus.find(menu => menu.slug === params.meny) || menus[0];
  const [menuId, setMenuId] = useState(initialMenu?.id || '');
  const [form, setForm] = useState({ name: '', phone: '', email: '', people: '', date: '', time: '', fulfillment: 'Hämtning', allergies: '', message: '' });
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [opened, setOpened] = useState(false);
  const menu = menus.find(item => item.id === menuId) || initialMenu;
  const dishes = catalog.dishes.filter(dish => dish.published);
  function update(key: keyof typeof form, value: string) { setForm(previous => ({ ...previous, [key]: value })); setOpened(false); }
  async function prepare() {
    setError(''); setOpened(false);
    const eventDate = new Date(`${form.date}T12:00:00Z`);
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (!form.name.trim() || !/^[+\d()\s-]{7,35}$/.test(form.phone.trim()) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ||
        !/^\d+$/.test(form.people) || Number(form.people) < 1 || Number(form.people) > 10000 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(form.date) || !Number.isFinite(eventDate.getTime()) || eventDate.toISOString().slice(0, 10) !== form.date || form.date < today ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.time) || !menu) {
      setError('Fyll i namn, telefon, giltig e-post, antal personer (1–10 000), ett kommande datum (ÅÅÅÅ-MM-DD) och tid (TT:MM).');
      return;
    }
    const mailto = catalog.contact.emailVerified ? cateringMailto(catalog.contact.email, menu.name,
      buildCateringEmail({ ...form, menuName: menu.name, extraDishes: selected.map(id => dishes.find(dish => dish.id === id)?.name || '').filter(Boolean) })) : null;
    if (!mailto) { setError('Cateringens e-postadress behöver bekräftas. Ring oss för din förfrågan.'); return; }
    try { await Linking.openURL(mailto); setOpened(true); }
    catch { setError('Mejlappen kunde inte öppnas. Ring oss eller använd e-postadressen på kontaktsidan. Ingenting har skickats.'); }
  }
  if (!menu) return <HospitalityScreen title={custom ? 'Plockmeny' : 'Cateringförfrågan'} intro="Den här menyn är inte publicerad just nu. Ring oss så hjälper vi dig med önskemålen."><ContactActions onlyPhone /></HospitalityScreen>;
  return <HospitalityScreen title={custom ? 'Plockmeny – skapa din egen catering.' : 'Din cateringförfrågan.'}
    intro="Fyll i dina önskemål för ett mejlutkast. Du skickar sedan själv mejlet från din e-postapp.">
    {custom && <Text style={s.price}>Pris enligt offert</Text>}
    <View style={s.section}>
      {!custom && <><Text style={s.label}>Vald meny</Text><Choices selected={menu?.id || ''} values={menus.map(item => ({ value: item.id, label: item.name }))} onSelect={setMenuId} /></>}
      <Field label="Namn" autoComplete="name" textContentType="name" value={form.name} maxLength={120} onChangeText={value => update('name', value)} />
      <Field label="Telefonnummer" keyboardType="phone-pad" autoComplete="tel" value={form.phone} maxLength={35} onChangeText={value => update('phone', value)} />
      <Field label="E-postadress" keyboardType="email-address" autoComplete="email" autoCapitalize="none" value={form.email} maxLength={200} onChangeText={value => update('email', value)} />
      <Field label="Antal personer" keyboardType="number-pad" value={form.people} maxLength={5} onChangeText={value => update('people', value.replace(/\D/g, ''))} />
      <Field label="Datum (ÅÅÅÅ-MM-DD)" placeholder="2026-12-12" autoCapitalize="none" value={form.date} maxLength={10} onChangeText={value => update('date', value)} />
      <Field label="Önskad tid (TT:MM)" placeholder="18:00" value={form.time} maxLength={5} onChangeText={value => update('time', value)} />
      <Text style={s.label}>Hämtning eller leverans</Text>
      <Choices values={[{ value: 'Hämtning', label: 'Hämtning' }, { value: 'Leverans', label: 'Leverans' }]} selected={form.fulfillment} onSelect={value => update('fulfillment', value)} />
      <Text style={s.detail}>Leveransområde och eventuell kostnad bekräftas personligen.</Text>
    </View>
    <View style={s.section}>
      <Text accessibilityRole="header" style={s.heading}>{custom ? 'Önskade rätter' : 'Eventuella extra rätter'}</Text>
      <Text style={s.detail}>Välj det du önskar. Utbud, mängder och allergener bekräftas av företaget.</Text>
      {[...new Set(dishes.map(dish => dish.category))].map(category => <View style={s.section} key={category}>
        <Text style={s.label}>{category}</Text>
        {dishes.filter(dish => dish.category === category).map(dish => <Pressable key={dish.id} accessibilityRole="checkbox"
          accessibilityState={{ checked: selected.includes(dish.id) }} onPress={() => setSelected(previous => previous.includes(dish.id) ? previous.filter(id => id !== dish.id) : [...previous, dish.id])}
          style={[s.chip, selected.includes(dish.id) && s.chipSelected]}>
          <Text style={[s.chipText, selected.includes(dish.id) && { color: '#FFFFFF' }]}>{selected.includes(dish.id) ? '✓ ' : '○ '}{dish.name}</Text>
        </Pressable>)}
      </View>)}
      <Text style={s.detail}>Bröd, såser, desserter och andra önskemål kan du beskriva i meddelandet. Pris enligt offert; ingen totalsumma räknas ut här.</Text>
      <Field label="Allergier och specialönskemål" multiline value={form.allergies} maxLength={1000} onChangeText={value => update('allergies', value)} />
      <Field label="Övrigt meddelande" multiline value={form.message} maxLength={1500} onChangeText={value => update('message', value)} />
      <Text style={s.detail}>Uppgifterna används för ditt mejlutkast. När e-postappen öppnas måste du själv skicka mejlet. Företaget bekräftar innehåll, pris och tillgänglighet personligen.</Text>
      <Button title="Skicka cateringförfrågan" disabled={!catalog.contact.emailVerified} onPress={() => void prepare()} />
      {opened && <Notice text="Mejlappen har öppnats. Skicka mejlet där för att lämna din förfrågan. Webbplatsen kan inte bekräfta att det har skickats eller levererats." />}
      {!!error && <Notice text={error} />}
      <ContactActions onlyPhone />
    </View>
  </HospitalityScreen>;
}

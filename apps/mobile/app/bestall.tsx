import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View, type TextInputProps } from 'react-native';
import { router } from 'expo-router';
import {
  findDeliveryZone, formatSek, isValidEventDate, newOrderSchema, occasions, paymentLabels,
  type Fulfillment, type PaymentPreference,
} from '@yehabibi/shared';
import { apiUrl, newRequestId, openPolicy, request, type OrderReference } from '../lib/api';
import { getQuote, useCatering } from '../lib/store';
import { Amount, Button, Choices, colors, Field, Notice, Screen, Stepper, s } from '../lib/ui';

const emptyForm = {
  event_date: '', event_time: '', full_name: '', email: '', phone: '',
  address: '', postal_code: '', city: '', notes: '',
};
const steps = ['Välj mat', 'Datum & plats', 'Kontakt', 'Skicka'];

export default function OrderScreen() {
  const { catalog, selection, setGuests, setOccasion, rememberOrder, storageNotice } = useCatering();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(emptyForm);
  const [fulfillment, setFulfillment] = useState<Fulfillment>('pickup');
  const [payment, setPayment] = useState<PaymentPreference>('card');
  const [terms, setTerms] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState('');
  const inFlight = useRef(false);
  const retry = useRef({ payload: '', id: '' });
  const settings = catalog.settings;
  const menu = catalog.menus.find(item => item.id === selection.menuId);
  const items = Object.entries(selection.quantities).filter(([, quantity]) => quantity > 0)
    .map(([dish_id, quantity]) => ({ dish_id, quantity }));
  const zone = fulfillment === 'delivery' ? findDeliveryZone(catalog.delivery_zones, form.postal_code) : null;
  const quote = getQuote(catalog, selection, fulfillment, zone?.fee_ore || 0);
  const methods = catalog.payment_methods.filter(value =>
    value !== 'cash' || (fulfillment === 'pickup' && settings.cash_enabled));
  const canSubmit = catalog.orders_enabled && !catalog.demo && !!quote && methods.includes(payment) &&
    (fulfillment === 'pickup' ? settings.pickup_enabled : settings.delivery_enabled && !!zone);

  useEffect(() => {
    if (!settings.pickup_enabled && settings.delivery_enabled) setFulfillment('delivery');
  }, [settings.pickup_enabled, settings.delivery_enabled]);
  useEffect(() => {
    if (!methods.includes(payment) && methods.length) setPayment(methods[0]);
  }, [methods.join(','), payment]);

  function field(name: keyof typeof emptyForm, label: string, props: TextInputProps = {}) {
    return <Field label={label} value={form[name]}
      onChangeText={value => setForm(previous => ({ ...previous, [name]: value }))} {...props} />;
  }
  function payload(accepted: boolean) {
    return {
      ...form, ...(selection.menuId ? { menu_id: selection.menuId } : { items }),
      guests: selection.guests, occasion: selection.occasion, fulfillment,
      delivery_zone_id: zone?.id, payment_preference: payment, terms_accepted: accepted,
    };
  }
  function next() {
    setError('');
    if (step === 1 && !quote) return setError('Välj prissatt mat och kontrollera minsta antal personer.');
    if (step === 2) {
      if (!isValidEventDate(form.event_date, settings.min_advance_days) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.event_time)) {
        return setError(`Ange en giltig tid och ett datum minst ${settings.min_advance_days} dagar framåt, inom ett år.`);
      }
      if (fulfillment === 'delivery' && (!zone || !form.address.trim() || !form.city.trim())) {
        return setError('Fyll i en fullständig adress inom en aktiv leveranszon.');
      }
      if (fulfillment === 'pickup' && !settings.pickup_enabled) return setError('Hämtning är inte tillgänglig.');
    }
    if (step === 3 && !newOrderSchema.safeParse(payload(true)).success) {
      return setError('Kontrollera namn, e-post, telefon och dina beställningsuppgifter.');
    }
    setStep(step + 1);
  }
  async function policy(path: '/villkor' | '/integritet') {
    try { await openPolicy(path); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Sidan kunde inte öppnas.'); }
  }
  async function submit() {
    if (inFlight.current || !canSubmit || !terms) return;
    const parsed = newOrderSchema.safeParse(payload(terms));
    if (!parsed.success || !isValidEventDate(form.event_date, settings.min_advance_days)) {
      setError('Kontrollera alla uppgifter före förfrågan.'); return;
    }
    const encoded = JSON.stringify(parsed.data);
    if (retry.current.payload !== encoded) retry.current = { payload: encoded, id: newRequestId() };
    inFlight.current = true;
    setSending(true);
    setError('');
    try {
      const reference = await request<OrderReference>('/api/orders', {
        method: 'POST', body: JSON.stringify({ ...parsed.data, request_id: retry.current.id }),
      });
      await rememberOrder(reference);
      setSubmitted(reference.code);
      retry.current = { payload: '', id: '' };
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Förfrågan kunde inte skickas. Samma förfrågan kan provas igen.');
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }
  function summary() {
    return <View style={s.panel}>
      <Text style={s.heading}>{menu?.title || 'Din egen catering'}</Text>
      <Text style={s.detail}>{selection.guests} personer · {occasions[selection.occasion]}</Text>
      {menu ? <Text style={s.body}>{menu.price_ore > 0 ? `${selection.guests} × ${formatSek(menu.price_ore)}` : 'Menypriset inväntar bekräftelse.'}</Text> : items.map(item => {
        const dish = catalog.dishes.find(row => row.id === item.dish_id);
        return <View key={item.dish_id} style={s.row}>
          <Text style={s.body}>{item.quantity} × {dish?.title || 'Rätt som inte längre är tillgänglig'}</Text>
          <Text style={s.label}>{dish?.price_ore ? formatSek(dish.price_ore * item.quantity) : 'Pris bekräftas'}</Text>
        </View>;
      })}
      {quote && <>
        <View style={s.rule} />
        <Amount label="Mat" ore={quote.subtotal_ore} />
        {fulfillment === 'pickup' || zone
          ? <><Amount label={fulfillment === 'pickup' ? 'Hämtning' : 'Leverans'} ore={quote.delivery_fee_ore} />
              <Amount strong label="Totalt" ore={quote.total_ore} />
              <Amount label="Per person, avrundat" ore={Math.round(quote.total_ore / selection.guests)} /></>
          : <Text style={s.detail}>Leveransavgift visas för ett giltigt postnummer.</Text>}
        <Text style={s.detail}>Pris per person är en jämförelse, ingen uppdelad betalning. Servern kontrollerar priserna.</Text>
      </>}
    </View>;
  }

  if (submitted) return <Screen title="Förfrågan mottagen">
    <View style={s.panel}>
      <Text style={s.eyebrow}>{submitted}</Text>
      <Text style={s.heading}>Tack! Nu ser vi över din förfrågan.</Text>
      <Text style={s.body}>Maten är ännu inte bokad eller betald. Vi bekräftar tillgänglighet och pris innan betalning.</Text>
    </View>
    {!!storageNotice && <Notice text={storageNotice} />}
    <Button title="Följ min beställning  →" onPress={() => router.push('/ordrar')} />
    <Button secondary title="Planera en ny förfrågan" onPress={() => {
      setSubmitted(''); setForm(emptyForm); setTerms(false); setStep(1); router.push('/menyer');
    }} />
  </Screen>;

  return (
    <Screen key={step} title={steps[step - 1]} intro="En förfrågan först. Betalning efter ägarens godkännande.">
      <View style={[s.row, { alignItems: 'flex-start', gap: 6 }]}>
        {steps.map((label, index) => <View key={label} style={{ flex: 1, gap: 7 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: index < step ? colors.green : colors.line }} />
          <Text style={[s.detail, { color: index === step - 1 ? colors.green : colors.muted, fontSize: 11 }]}>{index + 1}. {label}</Text>
        </View>)}
      </View>
      {step === 1 && <>
        {summary()}
        <Button secondary title="Ändra meny eller rätter" onPress={() => router.push(selection.menuId ? '/menyer' : '/bygg')} />
        <Field label="Antal personer" value={String(selection.guests)} keyboardType="number-pad"
          onChangeText={value => setGuests(Number(value))} />
        <Stepper label="personer" min={menu?.min_people || settings.custom_min_people} value={selection.guests}
          onChange={difference => setGuests(selection.guests + difference)} />
        <Text style={s.detail}>Minst {menu?.min_people || settings.custom_min_people} personer.</Text>
      </>}
      {step === 2 && <View style={s.section}>
        <Choices values={Object.entries(occasions).map(([value, label]) => ({
          value: value as typeof selection.occasion, label,
        }))} selected={selection.occasion} onSelect={setOccasion} />
        {field('event_date', 'Datum (ÅÅÅÅ-MM-DD)', { placeholder: 'ÅÅÅÅ-MM-DD', keyboardType: 'numbers-and-punctuation', maxLength: 10 })}
        {field('event_time', 'Tid (TT:MM)', { placeholder: '17:30', keyboardType: 'numbers-and-punctuation', maxLength: 5 })}
        <Text style={s.detail}>Minst {settings.min_advance_days} dagar i förväg. Köket bekräftar tillgängligheten.</Text>
        <Choices values={[
          ...(settings.pickup_enabled ? [{ value: 'pickup' as const, label: 'Hämtning' }] : []),
          ...(settings.delivery_enabled ? [{ value: 'delivery' as const, label: 'Hemleverans' }] : []),
        ]} selected={fulfillment} onSelect={setFulfillment} />
        {fulfillment === 'pickup'
          ? <Text style={s.detail}>{settings.pickup_address || 'Hämtningsplats bekräftas av ägaren.'}</Text>
          : <>
              {field('address', 'Gatuadress', { autoComplete: 'street-address', maxLength: 220 })}
              {field('postal_code', 'Postnummer', { keyboardType: 'number-pad', autoComplete: 'postal-code', maxLength: 6 })}
              {field('city', 'Ort', { maxLength: 100 })}
              {zone ? <Amount label={`Leverans · ${zone.name}`} ore={zone.fee_ore} />
                : <Notice text="Ange ett postnummer inom en aktiv leveranszon. Kontakta oss om området saknas." />}
            </>}
      </View>}
      {step === 3 && <View style={s.section}>
        {field('full_name', 'För- och efternamn', { autoComplete: 'name', maxLength: 120 })}
        {field('email', 'E-post', { keyboardType: 'email-address', autoCapitalize: 'none', autoComplete: 'email', maxLength: 200 })}
        {field('phone', 'Telefon', { keyboardType: 'phone-pad', autoComplete: 'tel', maxLength: 30 })}
        {field('notes', 'Allergier och särskilda önskemål', { multiline: true, maxLength: 1000 })}
        <Text style={s.heading}>Önskat betalningssätt</Text>
        <Choices values={methods.map(value => ({ value, label: paymentLabels[value] }))}
          selected={payment} onSelect={setPayment} />
        <Text style={s.detail}>{payment === 'cash'
          ? 'Kontant endast vid hämtning. Ägaren registrerar betalningen när pengarna tagits emot.'
          : 'Ingen betalning sker nu. Tillgängliga betalningssätt visas i säker Checkout efter godkännandet. Apple Pay visas på stödda enheter.'}</Text>
        {!methods.length && <Notice text="Betalningssätt är ännu inte aktiverade av ägaren." />}
      </View>}
      {step === 4 && <>
        {summary()}
        <View style={s.panel}>
          <Text style={s.heading}>Din planering</Text>
          <Text style={s.body}>{form.event_date} kl. {form.event_time}</Text>
          <Text style={s.body}>{fulfillment === 'pickup' ? 'Hämtning' : `Leverans: ${form.address}, ${form.postal_code} ${form.city}`}</Text>
          <Text style={s.body}>{form.full_name} · {form.phone}</Text>
          <Text style={s.body}>{form.email}</Text>
          {!!form.notes && <Text style={s.detail}>{form.notes}</Text>}
          <Text style={s.detail}>Önskat betalningssätt: {paymentLabels[payment]}</Text>
        </View>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: terms }}
          onPress={() => setTerms(!terms)} style={[s.panel, { minHeight: 54 }]}>
          <Text style={s.body}>{terms ? '☑' : '☐'} Jag godkänner beställningsvillkoren och att uppgifterna används för min förfrågan. Jag förstår att ägaren måste godkänna före betalning.</Text>
        </Pressable>
        <View style={s.section}>
          <Button secondary title="Beställningsvillkor" disabled={!apiUrl} onPress={() => void policy('/villkor')} />
          <Button secondary title="Integritetspolicy" disabled={!apiUrl} onPress={() => void policy('/integritet')} />
        </View>
        {!catalog.orders_enabled && <Notice text="Förfrågningar öppnar när ägaren har verifierat priser, företagsuppgifter och betalningar." />}
      </>}
      {!!error && <Notice text={error} />}
      {step < 4 ? <Button title={`${steps[step]}  →`} disabled={step === 1 && !quote} onPress={next} />
        : <Button accent title={sending ? 'Skickar förfrågan…' : 'Skicka förfrågan  →'}
            disabled={!canSubmit || sending || !terms} onPress={() => void submit()} />}
      {step > 1 && <Button secondary title="Tillbaka" disabled={sending} onPress={() => { setError(''); setStep(step - 1); }} />}
    </Screen>
  );
}

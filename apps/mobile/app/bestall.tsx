import { useEffect, useState } from 'react';
import { Pressable, Text, View, type TextInputProps } from 'react-native';
import { router } from 'expo-router';
import {
  findDeliveryZone,
  isValidEventDate,
  newOrderSchema,
  occasions,
  paymentLabels,
  type Fulfillment,
  type PaymentPreference,
} from '@yehabibi/shared';
import { apiUrl, openPolicy, request, type OrderReference } from '../lib/api';
import { getQuote, useCatering } from '../lib/store';
import { Amount, Button, Choices, Field, Notice, Screen, Stepper, s } from '../lib/ui';

const emptyForm = { event_date: '', event_time: '', full_name: '', email: '', phone: '', address: '', postal_code: '', city: '', notes: '' };

export default function OrderScreen() {
  const { catalog, selection, setGuests, setOccasion, rememberOrder, storageNotice } = useCatering();
  const [form, setForm] = useState(emptyForm);
  const [fulfillment, setFulfillment] = useState<Fulfillment>('pickup');
  const [payment, setPayment] = useState<PaymentPreference>('card');
  const [zoneId, setZoneId] = useState('');
  const [terms, setTerms] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState('');
  const settings = catalog.settings;
  const menu = catalog.menus.find((item) => item.id === selection.menuId);
  const items = Object.entries(selection.quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([dish_id, quantity]) => ({ dish_id, quantity }));
  const zone =
    fulfillment === 'delivery'
      ? findDeliveryZone(catalog.delivery_zones, form.postal_code, zoneId || undefined)
      : null;
  const quote = getQuote(catalog, selection, fulfillment, zone?.fee_ore || 0);
  const methods = catalog.payment_methods.filter(
    (value) => value !== 'cash' || (fulfillment === 'pickup' && settings.cash_enabled),
  );
  const canSubmit =
    catalog.orders_enabled &&
    !catalog.demo &&
    !!quote &&
    methods.includes(payment) &&
    (fulfillment === 'pickup' ? settings.pickup_enabled : settings.delivery_enabled && !!zone);

  useEffect(() => {
    if (!settings.pickup_enabled && settings.delivery_enabled) setFulfillment('delivery');
  }, [settings.pickup_enabled, settings.delivery_enabled]);
  useEffect(() => {
    if (!methods.includes(payment) && methods.length) setPayment(methods[0]);
  }, [methods.join(','), payment]);
  useEffect(() => { setSubmitted(''); }, [selection]);

  function update(name: keyof typeof emptyForm, value: string) {
    setForm((previous) => ({ ...previous, [name]: value }));
    if (name === 'postal_code') setZoneId('');
  }

  function field(name: keyof typeof emptyForm, label: string, props: TextInputProps = {}) {
    return <Field label={label} value={form[name]} onChangeText={value => update(name, value)} {...props} />;
  }

  async function policy(path: '/villkor' | '/integritet') {
    try { await openPolicy(path); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Sidan kunde inte öppnas.'); }
  }

  async function submit() {
    if (sending || !canSubmit) return;
    setError('');
    const payload = {
      ...form,
      ...(selection.menuId ? { menu_id: selection.menuId } : { items }),
      guests: selection.guests,
      occasion: selection.occasion,
      fulfillment,
      delivery_zone_id: zone?.id,
      payment_preference: payment,
      terms_accepted: terms,
    };
    const parsed = newOrderSchema.safeParse(payload);
    if (!parsed.success) {
      setError(
        'Kontrollera datum, tid, kontaktuppgifter och att villkoren är godkända. Vid leverans behövs en fullständig adress.',
      );
      return;
    }
    if (!isValidEventDate(form.event_date, settings.min_advance_days)) {
      setError(`Välj ett datum minst ${settings.min_advance_days} dagar framåt, inom ett år.`);
      return;
    }
    if (fulfillment === 'delivery' && (!form.address.trim() || !form.city.trim())) {
      setError('Fyll i gatuadress och ort för leveransen.');
      return;
    }
    setSending(true);
    try {
      const reference = await request<OrderReference>('/api/orders', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      await rememberOrder(reference);
      setSubmitted(reference.code);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Förfrågan kunde inte skickas.');
    } finally {
      setSending(false);
    }
  }

  if (submitted)
    return (
      <Screen title="Tack för din förfrågan">
        <Text style={s.body}>
          Din förfrågan {submitted} är mottagen. Cedar Mezze återkommer med besked. Du betalar först efter
          ägarens godkännande.
        </Text>
        {!!storageNotice && <Notice text={storageNotice} />}
        <Button title="Följ min beställning" onPress={() => router.push('/ordrar')} />
        <Button secondary title="Skicka en ny förfrågan" onPress={() => { setSubmitted(''); setForm(emptyForm); setTerms(false); router.push('/menyer'); }} />
      </Screen>
    );

  return (
    <Screen title="Låt oss ordna maten" intro="Skicka en förfrågan. Ägaren bekräftar datum och beställning innan någon betalning sker." >
      <View style={s.section}>
        <Text style={s.heading}>
          {menu?.title || (items.length ? 'Din egen catering' : 'Välj en meny först')}
        </Text>
        {!menu && !items.length && (
          <Button title="Välj cateringmeny" onPress={() => router.push('/menyer')} />
        )}
        {items.map((item) => (
          <Text key={item.dish_id} style={s.detail}>
            {item.quantity} ×{' '}
            {catalog.dishes.find((dish) => dish.id === item.dish_id)?.title ||
              'Rätt som inte längre är tillgänglig'}
          </Text>
        ))}
        <Button secondary title="Ändra meny eller rätter" onPress={() => router.push(selection.menuId ? '/menyer' : '/bygg')} />
        <View style={s.row}>
          <Text style={s.label}>Antal personer</Text>
          <Stepper label="personer" min={menu?.min_people || settings.custom_min_people} value={selection.guests} onChange={(difference) => setGuests(selection.guests + difference)} />
        </View>
        <Choices values={Object.entries(occasions).map(([value, label]) => ({ value: value as typeof selection.occasion, label, }))} selected={selection.occasion} onSelect={setOccasion} />
      </View>
      <View style={s.section}>
        <Text style={s.heading}>När och var?</Text>
        {field('event_date', 'Datum (ÅÅÅÅ-MM-DD)', { placeholder: '2026-12-12', keyboardType: 'numbers-and-punctuation', maxLength: 10 })}
        {field('event_time', 'Tid (TT:MM)', { placeholder: '17:30', keyboardType: 'numbers-and-punctuation', maxLength: 5 })}
        <Text style={s.detail}>Boka minst {settings.min_advance_days} dagar i förväg.</Text>
        <Choices
          values={[
            ...(settings.pickup_enabled ? [{ value: 'pickup' as const, label: 'Hämtning' }] : []),
            ...(settings.delivery_enabled ? [{ value: 'delivery' as const, label: 'Leverans' }] : []),
          ]}
          selected={fulfillment}
          onSelect={setFulfillment}
        />
        {fulfillment === 'pickup' && (
          <Text style={s.detail}>{settings.pickup_address || 'Hämtningsplats bekräftas av ägaren.'}</Text>
        )}
        {fulfillment === 'delivery' && (
          <>
            {field('address', 'Gatuadress', { autoComplete: 'street-address', maxLength: 220 })}
            {field('postal_code', 'Postnummer', { keyboardType: 'number-pad', autoComplete: 'postal-code', maxLength: 6 })}
            {field('city', 'Ort', { maxLength: 100 })}
            {!!catalog.delivery_zones.length && (
              <Choices values={catalog.delivery_zones .filter((item) => item.active) .map((item) => ({ value: item.id, label: item.name }))} selected={zoneId || zone?.id || ''} onSelect={setZoneId} />
            )}
            {!zone && (
              <Notice text="Fyll i ett postnummer inom en aktiv leveranszon. Kontakta oss om ditt område saknas." />
            )}
          </>
        )}
      </View>
      <View style={s.section}>
        <Text style={s.heading}>Dina kontaktuppgifter</Text>
        {field('full_name', 'För- och efternamn', { autoComplete: 'name', maxLength: 120 })}
        {field('email', 'E-post', { keyboardType: 'email-address', autoCapitalize: 'none', autoComplete: 'email', maxLength: 200 })}
        {field('phone', 'Telefon', { keyboardType: 'phone-pad', autoComplete: 'tel', maxLength: 30 })}
        {field('notes', 'Önskemål och allergier', { multiline: true, maxLength: 1000 })}
      </View>
      <View style={s.section}>
        <Text style={s.heading}>Hur vill du betala?</Text>
        <Choices values={methods.map((value) => ({ value, label: paymentLabels[value] }))} selected={payment} onSelect={setPayment} />
        <Text style={s.detail}>
          {payment === 'cash'
            ? 'Betala vid hämtning efter godkännande. Ägaren registrerar mottagen betalning.'
            : 'Säker betalning öppnas efter godkännande. Apple Pay visas bara när Stripe och din enhet stöder det.'}
        </Text>
        {!methods.length && <Notice text="Betalningsmetoder är ännu inte konfigurerade av ägaren." />}
      </View>
      {quote && (
        <View style={s.section}>
          <Amount label="Mat" ore={quote.subtotal_ore} />
          {fulfillment === 'delivery' &&
            (zone ? (
              <Amount label="Leverans" ore={zone.fee_ore} />
            ) : (
              <Text style={s.detail}>Leveransavgift inväntar ett giltigt postnummer.</Text>
            ))}
          {(fulfillment === 'pickup' || zone) && <>
            <View style={s.rule} />
            <Amount strong label="Totalt" ore={quote.total_ore} />
            <Amount label="Totalt per person, avrundat" ore={Math.round(quote.total_ore / selection.guests)} />
          </>}
          <Text style={s.detail}>Priset kontrolleras när du skickar förfrågan.</Text>
        </View>
      )}
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: terms }} onPress={() => setTerms(!terms)} style={s.row} >
        <Text style={s.body}>
          {terms ? '☑' : '☐'} Jag godkänner att uppgifterna används för att hantera min förfrågan.
          Jag förstår att ägaren måste godkänna förfrågan innan betalning.
        </Text>
      </Pressable>
      <Button secondary title="Läs beställningsvillkor" disabled={!apiUrl} onPress={() => void policy('/villkor')} />
      <Button secondary title="Läs integritetspolicy" disabled={!apiUrl} onPress={() => void policy('/integritet')} />
      {!catalog.orders_enabled && (
        <Notice text="Beställningar öppnar när ägaren har verifierat priser, företagsuppgifter och betalningar." />
      )}
      {!!error && <Notice text={error} />}
      <Button title={sending ? 'Skickar förfrågan…' : 'Skicka förfrågan'} disabled={!canSubmit || sending || !terms} onPress={() => void submit()} />
    </Screen>
  );
}

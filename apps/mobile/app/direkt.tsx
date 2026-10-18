import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, Text, View, type TextInputProps } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  availablePaymentMethods, formatSek, onlinePaymentMethods, orderContactError, paymentMethodLabel,
  type AvailabilityResponse, type DirectOrderInput, type Fulfillment, type PaymentPreference,
} from '@yehabibi/shared';
import { api, apiUrl, clearRequestId, newRequestId, openPolicy, persistentRequestId } from '../lib/api';
import { useCatering } from '../lib/store';
import { Amount, Button, Choices, Field, Notice, Photo, Screen, Stepper, s } from '../lib/ui';

const emptyForm = { full_name: '', email: '', phone: '', address: '', postal_code: '', city: '', notes: '' };
const packageCount = (value: string | undefined) => Math.max(1, Math.min(100, Math.floor(Number(value)) || 1));

export default function DirectOrderScreen() {
  const params = useLocalSearchParams<{ menu?: string; quantity?: string }>();
  const { catalog, loading, catalogError, rememberOrder, storageNotice } = useCatering();
  const [menuId, setMenuId] = useState(params.menu || '');
  const [quantity, setQuantity] = useState(() => packageCount(params.quantity));
  const [fulfillment, setFulfillment] = useState<Fulfillment>('pickup');
  const [form, setForm] = useState(emptyForm);
  const [payment, setPayment] = useState<PaymentPreference>('swish');
  const [terms, setTerms] = useState(false);
  const [availability, setAvailability] = useState<{ key: string; data: AvailabilityResponse } | null>(null);
  const [availabilityError, setAvailabilityError] = useState('');
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedStartsAt, setSelectedStartsAt] = useState('');
  const [showAllSlots, setShowAllSlots] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [retryNotice, setRetryNotice] = useState('');
  const [submitted, setSubmitted] = useState('');
  const inFlight = useRef(false);
  const retry = useRef({ payload: '', id: '' });
  const settings = catalog.settings;
  const packages = catalog.menus.filter(menu => menu.active && menu.direct_order_enabled);
  const menu = menuId ? packages.find(item => item.id === menuId) : packages[0];
  const postalCode = form.postal_code.replace(/\s/g, '');
  const enabled = !loading && !catalogError && !catalog.demo && catalog.orders_enabled && catalog.direct_orders_enabled === true;
  const requestKey = JSON.stringify({ menu_id: menu?.id || '', quantity, fulfillment,
    ...(fulfillment === 'delivery' ? { postal_code: postalCode } : {}) });
  const canQuery = enabled && !!menu && (fulfillment === 'pickup' || /^\d{5}$/.test(postalCode));
  const current = availability?.key === requestKey ? availability.data : null;
  const selectedSlot = current?.slots.find(slot => slot.starts_at === selectedStartsAt);
  const online = onlinePaymentMethods(catalog.payment_methods, {
    applePay: Platform.OS === 'ios', googlePay: Platform.OS === 'android',
  }, catalog.test_mode === true);
  const methods = availablePaymentMethods(catalog, fulfillment)
    .filter(method => method === 'cash' || method === 'unpaid' || online.includes(method));
  const selectedPayment = methods.includes(payment) ? payment : methods[0];
  const canSubmit = enabled && !!current?.enabled && !!selectedSlot && !slotsLoading && !availabilityError && !!selectedPayment;

  useEffect(() => {
    setMenuId(params.menu || '');
    setQuantity(packageCount(params.quantity));
    setSubmitted('');
  }, [params.menu, params.quantity]);
  useEffect(() => {
    if (!settings.pickup_enabled && settings.delivery_enabled) setFulfillment('delivery');
  }, [settings.pickup_enabled, settings.delivery_enabled]);
  useFocusEffect(useCallback(() => {
    setRefreshKey(value => value + 1);
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') setRefreshKey(value => value + 1);
    });
    // Läs om tiden från servern även om formuläret ligger öppet länge.
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') setRefreshKey(value => value + 1);
    }, 60000);
    return () => { listener.remove(); clearInterval(timer); };
  }, []));
  useEffect(() => {
    if (!canQuery) {
      setAvailability(null); setAvailabilityError(''); setSlotsLoading(false); setSelectedStartsAt('');
      return;
    }
    const controller = new AbortController();
    setSlotsLoading(true); setAvailabilityError('');
    // Bara postnummer och antal skickas här. Servern äger klocka, zon, pris och kapacitet.
    const timer = setTimeout(() => {
      void api.getAvailability(JSON.parse(requestKey), { signal: controller.signal }).then(data => {
        if (controller.signal.aborted) return;
        setAvailability({ key: requestKey, data });
        // En bortfallen tid kräver ett nytt aktivt val; flytta aldrig kundens beställning automatiskt.
        setSelectedStartsAt(previous => data.slots.some(slot => slot.starts_at === previous) ? previous : '');
      }).catch(reason => {
        if (!controller.signal.aborted) {
          setAvailability(null);
          setAvailabilityError(reason instanceof Error ? reason.message : 'Lediga tider kunde inte hämtas. Försök igen.');
        }
      }).finally(() => { if (!controller.signal.aborted) setSlotsLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [requestKey, canQuery, refreshKey]);

  function field(name: keyof typeof emptyForm, label: string, props: TextInputProps = {}) {
    return <Field label={label} value={form[name]}
      onChangeText={value => setForm(previous => ({ ...previous, [name]: value }))} {...props} />;
  }
  async function policy(path: '/villkor' | '/integritet') {
    try { await openPolicy(path); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Sidan kunde inte öppnas.'); }
  }
  async function submit() {
    if (inFlight.current || !canSubmit || !terms || !current || !menu || !selectedSlot || !selectedPayment) return;
    const contactError = orderContactError(form);
    if (contactError) { setError(contactError); return; }
    if (fulfillment === 'delivery' && (!form.address.trim() || !form.city.trim() || !/^\d{5}$/.test(postalCode))) {
      setError('Ange gatuadress, ett giltigt postnummer och ort för hemleverans.'); return;
    }
    const input: DirectOrderInput = {
      menu_id: menu.id, quantity, fulfillment, scheduled_at: selectedSlot.starts_at,
      expected_total_ore: current.total_ore, full_name: form.full_name.trim(), email: form.email.trim(),
      phone: form.phone.trim(), notes: form.notes.trim(), payment_preference: selectedPayment,
      address: fulfillment === 'delivery' ? form.address.trim() : '',
      postal_code: fulfillment === 'delivery' ? postalCode : '', city: fulfillment === 'delivery' ? form.city.trim() : '',
      terms_accepted: true,
    };
    inFlight.current = true; setSending(true); setError('');
    try {
      const encoded = JSON.stringify(input);
      if (retry.current.payload !== encoded) {
        setRetryNotice('');
        let id: string;
        try { id = await persistentRequestId(`direct:${encoded}`); }
        catch {
          id = newRequestId();
          setRetryNotice('Återförsöksnyckeln kunde inte sparas. Behåll appen öppen om du behöver försöka igen.');
        }
        retry.current = { payload: encoded, id };
      }
      const reference = await api.createDirectOrder({ ...input, request_id: retry.current.id });
      await rememberOrder(reference);
      setSubmitted(reference.code);
      await clearRequestId().catch(() => setRetryNotice('Beställningen är mottagen. Behåll ordernumret; återförsöksminnet kunde inte tömmas.'));
      retry.current = { payload: '', id: '' };
      setForm(emptyForm); setTerms(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Beställningen kunde inte skickas. Du kan försöka igen.');
      // En gammal eller full tid får aldrig reserveras lokalt. Hämta ett nytt serverbesked.
      setRefreshKey(value => value + 1);
    } finally { inFlight.current = false; setSending(false); }
  }

  if (submitted) return <Screen title={catalog.test_mode === true ? 'Testbeställning mottagen' : 'Beställning mottagen'}>
    <View style={s.panel}>
      <Text style={s.eyebrow}>{submitted}</Text>
      <Text style={s.heading}>Tack! Din beställning finns hos köket.</Text>
      <Text style={s.body}>Följ kökets bekräftelse och din valda tid under Mina beställningar. Ingen betalning eller tillagning startas automatiskt.</Text>
      {catalog.test_mode === true && <Text style={s.detail}>Det här är en riktig order i den isolerade testdatabasen. Efter godkännandet kan du simulera vald betalning utan riktiga pengar.</Text>}
    </View>
    {!!storageNotice && <Notice text={storageNotice} />}
    {!!retryNotice && <Notice text={retryNotice} />}
    <Button title="Följ beställningen och betalningen  →" onPress={() => router.push('/ordrar')} />
    <Button secondary title="Se fler paket" onPress={() => { setSubmitted(''); router.push('/menyer'); }} />
  </Screen>;

  return <Screen title="Beställ nu" intro="Färdiga paket för hämtning eller hemleverans. Välj en tid som köket kan ta emot."
    keepFooterWithKeyboard footer={menu && <>
      <Amount strong label="Totalt" ore={current?.total_ore ?? menu.price_ore * quantity} />
      <Text style={s.detail}>{selectedSlot ? `Vald tid: ${selectedSlot.label}` : 'Välj en ledig tid'}{!current && fulfillment === 'delivery' ? ' · leveransavgift tillkommer' : ''}</Text>
      <Button title={sending ? 'Skickar beställning…' : 'Skicka beställning  →'} disabled={!canSubmit || !terms || sending} onPress={() => void submit()} />
    </>}>
    {!packages.length && <View style={s.panel}>
      <Text style={s.heading}>Färdiga paket kommer här</Text>
      <Text style={s.body}>Köket har ännu inte publicerat paket för direktbeställning. Du kan fortfarande planera catering.</Text>
      <Button secondary title="Boka catering" onPress={() => router.push('/bygg')} />
    </View>}
    {!!packages.length && <>
      <Text accessibilityRole="header" style={s.heading}>1. Välj paket och antal</Text>
      <Choices selected={menu?.id || ''} values={packages.map(item => ({ value: item.id, label: item.title }))}
        onSelect={value => { setMenuId(value); setSelectedStartsAt(''); setTerms(false); }} />
      {!menu && <Notice text="Det valda paketet är inte längre tillgängligt. Välj ett publicerat paket ovan." />}
    </>}
    {menu && <>
      <View style={s.card}>
        <Photo url={menu.image_url} label={menu.title} />
        <View style={s.cardBody}>
          <Text style={s.heading}>{menu.title}</Text>
          <Text style={s.body}>{menu.description}</Text>
          <Text style={s.detail}>{menu.included.join(' · ')}</Text>
          <Text style={s.detail}>{menu.package_portions || 1} portioner per paket · Allergener: {menu.allergens.join(', ') || 'Fråga köket'}</Text>
          <Text style={s.price}>{formatSek(menu.price_ore)} / paket</Text>
          <View style={s.row}><Text style={s.label}>Antal paket</Text>
            <Stepper label="paket" value={quantity} min={1} max={100} onChange={difference => setQuantity(previous => Math.max(1, Math.min(100, previous + difference)))} />
          </View>
          <Text style={s.detail}>Tillagning: {current?.preparation_minutes ?? menu.preparation_minutes ?? 30} minuter{!current ? ' som grundtid; större antal kan ta längre tid' : ''}.</Text>
        </View>
      </View>
      {!enabled && <Notice text={catalog.demo ? 'Förhandsvisning. Direktbeställningar öppnar när köket har konfigurerat och godkänt företagsmiljön.' : 'Direktbeställningar är pausade eller inte öppna. Försök igen senare eller boka catering.'} />}
      <View style={s.section}>
        <Text accessibilityRole="header" style={s.heading}>2. Hämtning eller hemleverans</Text>
        <Choices selected={fulfillment} values={[
          ...(settings.pickup_enabled ? [{ value: 'pickup' as const, label: 'Hämtning' }] : []),
          ...(settings.delivery_enabled ? [{ value: 'delivery' as const, label: 'Hemleverans' }] : []),
        ]} onSelect={value => { setFulfillment(value); setSelectedStartsAt(''); }} />
        {fulfillment === 'pickup' ? <>
          <Text style={s.label}>Hämtningsadress</Text>
          <Text style={s.body}>{current?.pickup_address || settings.pickup_address || 'Köket behöver publicera en hämtningsadress.'}</Text>
          <Amount label="Hämtning" ore={current?.delivery_fee_ore || 0} />
        </> : <>
          {field('address', 'Gatuadress', { autoComplete: 'street-address', maxLength: 220 })}
          {field('postal_code', 'Postnummer', { keyboardType: 'number-pad', autoComplete: 'postal-code', maxLength: 6 })}
          {field('city', 'Ort', { maxLength: 100 })}
          {!/^\d{5}$/.test(postalCode) && <Text style={s.detail}>Ange fem siffror för att kontrollera leveransområde och avgift.</Text>}
          {!!current?.delivery_zone_id && <Amount label="Leveransavgift" ore={current.delivery_fee_ore} />}
          {current && !current.delivery_zone_id && <Button secondary title="Välj hämtning i stället" onPress={() => setFulfillment('pickup')} />}
          <Text style={s.detail}>Leveranstiden använder kökets konfigurerade transportbuffert.</Text>
        </>}
      </View>
      <View style={s.section}>
        <Text accessibilityRole="header" style={s.heading}>3. Välj tid</Text>
        <Text style={s.detail}>Tiderna kommer från serverns klocka i Europe/Stockholm. Tillagning, öppettider och kapacitet kontrolleras igen när beställningen skickas.</Text>
        {slotsLoading && <Text accessibilityRole="progressbar" style={s.body}>Hämtar lediga tider från köket…</Text>}
        {!!availabilityError && <Notice text={availabilityError} />}
        {!!current?.reason && <Notice text={current.reason} />}
        {current && current.slots.length === 0 && !current.reason && <Notice text="Inga lediga tider finns just nu. Prova ett annat antal, hämtning eller försök igen senare." />}
        {!!current?.slots.length && <>
          <Text style={s.label}>Nästa lediga {fulfillment === 'pickup' ? 'hämtning' : 'leverans'}: {current.slots[0].label}</Text>
          <Choices selected={selectedStartsAt} values={(showAllSlots ? current.slots : current.slots.slice(0, 8))
            .map(slot => ({ value: slot.starts_at, label: slot.label }))} onSelect={setSelectedStartsAt} />
          {current.slots.length > 8 && <Button secondary title={showAllSlots ? 'Visa färre tider' : 'Visa senare lediga tider'} onPress={() => setShowAllSlots(previous => !previous)} />}
        </>}
        <Button secondary title={slotsLoading ? 'Uppdaterar tider…' : 'Uppdatera lediga tider'} disabled={!canQuery || slotsLoading} onPress={() => setRefreshKey(value => value + 1)} />
      </View>
      <View style={s.section}>
        <Text accessibilityRole="header" style={s.heading}>4. Kontakt och betalning</Text>
        {field('full_name', 'För- och efternamn', { autoComplete: 'name', maxLength: 120 })}
        {field('email', 'E-post', { keyboardType: 'email-address', autoCapitalize: 'none', autoComplete: 'email', maxLength: 200 })}
        {field('phone', 'Telefon', { keyboardType: 'phone-pad', autoComplete: 'tel', maxLength: 30 })}
        {field('notes', 'Allergier och särskilda önskemål', { multiline: true, maxLength: 1000 })}
        <Text style={s.label}>{catalog.test_mode === true ? 'Simulerat betalningssätt' : 'Önskat betalningssätt'}</Text>
        <Choices selected={selectedPayment || 'unpaid'} values={methods.map(value => ({ value, label: paymentMethodLabel(value, catalog.test_mode === true) }))} onSelect={setPayment} />
        {!methods.length && <Notice text={catalog.payment_unavailable_reason || 'Inga betalningssätt är aktiverade. Kontakta köket.'} />}
        <Text style={s.detail}>{selectedPayment === 'cash' ? 'Kontant vid hämtning. Köket registrerar betalningen.' : catalog.test_mode === true
          ? 'Alla onlinebetalningar simuleras. Inga riktiga pengar, plånböcker eller kort används.'
          : 'Ingen betalning sker när beställningen skickas. Följ nästa steg under Mina beställningar.'}</Text>
      </View>
      <View style={s.panel}>
        <Text accessibilityRole="header" style={s.heading}>Din beställning</Text>
        <Text style={s.body}>{quantity} × {menu.title} · {quantity * (menu.package_portions || 1)} portioner</Text>
        <Text style={s.body}>{fulfillment === 'pickup' ? 'Hämtning' : `Hemleverans: ${form.address}, ${form.postal_code} ${form.city}`}</Text>
        <Text style={s.body}>Vald tid: {selectedSlot?.label || 'Välj en ledig tid'}</Text>
        <Amount label="Mat" ore={current?.subtotal_ore ?? quantity * menu.price_ore} />
        {current && <Amount label={fulfillment === 'pickup' ? 'Hämtning' : 'Leverans'} ore={current.delivery_fee_ore} />}
        <Amount strong label="Totalt" ore={current?.total_ore ?? quantity * menu.price_ore} />
        {!current && fulfillment === 'delivery' && <Text style={s.detail}>Leveransavgiften tillkommer när servern verifierat postnumret.</Text>}
      </View>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: terms }} onPress={() => setTerms(previous => !previous)} style={s.panel}>
        <Text style={s.body}>{terms ? '☑' : '☐'} Jag godkänner beställningsvillkoren och att mina uppgifter används för beställningen. Ingen betalning eller tillagning startas automatiskt.</Text>
      </Pressable>
      <Button secondary title="Beställningsvillkor" disabled={!apiUrl} onPress={() => void policy('/villkor')} />
      <Button secondary title="Integritetspolicy" disabled={!apiUrl} onPress={() => void policy('/integritet')} />
      {!!error && <Notice text={error} />}
      {!!retryNotice && <Notice text={retryNotice} />}
      <Button secondary title="Boka större catering" onPress={() => router.push('/bygg')} />
    </>}
  </Screen>;
}

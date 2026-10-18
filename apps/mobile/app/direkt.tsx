import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, Text, View, type TextInputProps } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { availablePaymentMethods, canPayOrder, formatScheduledTime, formatSek, itemsFromQuantities, onlinePaymentMethods, orderContactError, paymentMethodLabel,
  type AvailabilityResponse, type DirectOrderInput, type Fulfillment, type OnlinePaymentMethod, type PaymentPreference } from '@yehabibi/shared';
import { api, apiUrl, clearRequestId, newRequestId, openPolicy, openWebsite, persistentRequestId } from '../lib/api';
import { useCatering } from '../lib/store';
import { Amount, Button, Choices, Field, Notice, Photo, Screen, Stepper, s } from '../lib/ui';

const emptyForm = { full_name: '', email: '', phone: '', address: '', postal_code: '', city: '', notes: '' };
const count = (value?: string) => Math.max(1, Math.min(100, Math.floor(Number(value)) || 1));
const stepLabels = ['Mat och tid', 'Granska', 'Kontakt och betalning'];
function parseExtras(value?: string) {
  const result: Record<string, number> = {};
  for (const part of (value || '').split(',').slice(0, 40)) {
    const [id, quantity] = part.split(':'); const amount = Number(quantity);
    if (/^[\da-f-]{36}$/i.test(id) && Number.isInteger(amount) && amount > 0 && amount <= 100) result[id] = amount;
  }
  return result;
}
export default function DirectOrderScreen() {
  const params = useLocalSearchParams<{ menu?: string; quantity?: string; addons?: string; campaign?: string }>();
  const { catalog, loading, catalogError, rememberOrder, storageNotice } = useCatering();
  const [menuId, setMenuId] = useState(params.menu || '');
  const [quantity, setQuantity] = useState(() => count(params.quantity));
  const [extras, setExtras] = useState(() => parseExtras(params.addons));
  const [step, setStep] = useState(1);
  const [fulfillment, setFulfillment] = useState<Fulfillment>('pickup');
  const [form, setForm] = useState(emptyForm);
  const [payment, setPayment] = useState<PaymentPreference>('swish');
  const [terms, setTerms] = useState(false);
  const [availability, setAvailability] = useState<{ key: string; data: AvailabilityResponse } | null>(null);
  const [availabilityError, setAvailabilityError] = useState('');
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedStartsAt, setSelectedStartsAt] = useState('');
  const [timeMode, setTimeMode] = useState<'asap' | 'choose' | ''>('');
  const [showAllSlots, setShowAllSlots] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [reviewed, setReviewed] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [retryNotice, setRetryNotice] = useState('');
  const [paymentFallback, setPaymentFallback] = useState('');
  const [submitted, setSubmitted] = useState<{ code: string; title: string; quantity: number; time: string; total: number } | null>(null);
  const inFlight = useRef(false);
  const retry = useRef({ payload: '', id: '' });
  const settings = catalog.settings;
  const packages = catalog.menus.filter(menu => menu.active && menu.direct_order_enabled);
  const menu = menuId ? packages.find(item => item.id === menuId) : packages[0];
  const group = menu?.package_group || menu?.id;
  const families = packages.filter((item, index) => packages.findIndex(other => (other.package_group || other.id) === (item.package_group || item.id)) === index);
  const variants = packages.filter(item => (item.package_group || item.id) === group);
  const allowed = catalog.dishes.filter(dish => dish.active && dish.direct_addon_enabled && dish.price_ore > 0 && menu?.allowed_addon_ids?.includes(dish.id));
  const addons = itemsFromQuantities(extras);
  const invalidExtras = addons.some(item => !allowed.some(dish => dish.id === item.dish_id));
  const postalCode = form.postal_code.replace(/\s/g, '');
  const enabled = !loading && !catalogError && !catalog.demo && catalog.orders_enabled && catalog.direct_orders_enabled === true;
  const orderable = menu && (!menu.availability_state || menu.availability_state === 'available') && !invalidExtras;
  const requestKey = JSON.stringify({ menu_id: menu?.id || '', quantity, fulfillment, addons,
    ...(params.campaign ? { campaign_id: params.campaign } : {}), ...(fulfillment === 'delivery' ? { postal_code: postalCode } : {}) });
  const canQuery = !submitted && enabled && !!orderable && (fulfillment === 'pickup' || /^\d{5}$/.test(postalCode));
  const current = availability?.key === requestKey ? availability.data : null;
  const slot = current?.slots.find(item => item.starts_at === selectedStartsAt);
  const slotLabel = slot ? `${slot.label}${fulfillment === 'delivery' && slot.ends_at ? ` – ${formatScheduledTime(slot.ends_at)}` : ''}` : 'Välj en ledig tid';
  const online = onlinePaymentMethods(catalog.payment_methods, { applePay: Platform.OS === 'ios', googlePay: Platform.OS === 'android' }, catalog.test_mode === true);
  const methods = availablePaymentMethods(catalog, fulfillment).filter(method => method === 'cash' || method !== 'unpaid' && online.includes(method));
  const selectedPayment = methods.includes(payment) ? payment : methods[0];
  const canContinue = enabled && !!orderable && !!current?.enabled && !!slot && !slotsLoading && !availabilityError;
  const quoteKey = `${requestKey}:${current?.total_ore}:${JSON.stringify(current?.lines)}:${slot?.starts_at}:${slot?.ends_at}`;
  function changed() { setSelectedStartsAt(''); setTimeMode(''); setReviewed(''); setError(''); }
  useEffect(() => { setMenuId(params.menu || ''); setQuantity(count(params.quantity)); setExtras(parseExtras(params.addons)); setSubmitted(null); setStep(1); changed(); }, [params.menu, params.quantity, params.addons, params.campaign]);
  useEffect(() => { if (!settings.pickup_enabled && settings.delivery_enabled) setFulfillment('delivery'); }, [settings.pickup_enabled, settings.delivery_enabled]);
  useFocusEffect(useCallback(() => {
    if (submitted) return;
    setRefreshKey(value => value + 1);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') setRefreshKey(value => value + 1); });
    const timer = setInterval(() => { if (AppState.currentState === 'active' && !inFlight.current) setRefreshKey(value => value + 1); }, 30000);
    return () => { listener.remove(); clearInterval(timer); };
  }, [submitted]));
  useEffect(() => {
    if (!canQuery) { setSlotsLoading(false); return; }
    const controller = new AbortController(); setSlotsLoading(true); setAvailabilityError('');
    const timer = setTimeout(() => void api.getAvailability(JSON.parse(requestKey), { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      setAvailability({ key: requestKey, data }); setSelectedStartsAt(previous => data.slots.some(item => item.starts_at === previous) ? previous : '');
    }).catch(reason => { if (!controller.signal.aborted) { setAvailability(null); setAvailabilityError(reason instanceof Error ? reason.message : 'Lediga tider kunde inte hämtas.'); } })
      .finally(() => { if (!controller.signal.aborted) setSlotsLoading(false); }), 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [requestKey, canQuery, refreshKey]);
  function field(name: keyof typeof emptyForm, label: string, props: TextInputProps = {}) {
    return <Field label={label} value={form[name]} editable={!sending} onChangeText={value => setForm(previous => ({ ...previous, [name]: value }))} {...props}/>;
  }
  async function policy(path: '/villkor' | '/integritet') { try { await openPolicy(path); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Sidan kunde inte öppnas.'); } }
  function next() {
    setError(''); if (!canContinue) { setStep(1); return setError('Välj ett tillgängligt paket och en aktuell tid.'); }
    if (step === 2) setReviewed(quoteKey); setStep(step + 1);
  }
  async function submit() {
    if (inFlight.current || !canContinue || !terms || !current || !menu || !slot || !selectedPayment) return;
    if (reviewed !== quoteKey) { setStep(2); return setError('Pris eller tid har uppdaterats. Granska beställningen igen.'); }
    const contactError = orderContactError(form); if (contactError) return setError(contactError);
    if (fulfillment === 'delivery' && (!form.address.trim() || !form.city.trim())) return setError('Ange fullständig leveransadress.');
    const input: DirectOrderInput = { ...JSON.parse(requestKey), ...form, address: fulfillment === 'delivery' ? form.address.trim() : '', postal_code: fulfillment === 'delivery' ? postalCode : '', city: fulfillment === 'delivery' ? form.city.trim() : '', scheduled_at: slot.starts_at, expected_total_ore: current.total_ore, payment_preference: selectedPayment, terms_accepted: true };
    inFlight.current = true; setSending(true); setError('');
    try {
      const encoded = JSON.stringify(input);
      if (retry.current.payload !== encoded) {
        let id: string; try { id = await persistentRequestId(`direct:${encoded}`); } catch { id = newRequestId(); setRetryNotice('Återförsöksnyckeln kunde inte sparas. Behåll appen öppen om du försöker igen.'); }
        retry.current = { payload: encoded, id };
      }
      const reference = await api.createDirectOrder({ ...input, request_id: retry.current.id }); await rememberOrder(reference);
      setSubmitted({ code: reference.code, title: menu.title, quantity, time: slotLabel, total: current.total_ore });
      await clearRequestId().catch(() => setRetryNotice('Ordern är mottagen. Behåll ordernumret.')); retry.current = { payload: '', id: '' };
      if (selectedPayment !== 'cash') {
        try {
          const [status, verifiedCatalog] = await Promise.all([api.getPaymentStatus(reference), api.getCatalog()]);
          if (canPayOrder(status.order)) {
            const session = await api.createPayment({ code: reference.code, token: reference.token }, selectedPayment as OnlinePaymentMethod);
            await openWebsite(session.checkout_url, true, verifiedCatalog.test_mode === true && session.test_mode === true);
          } else setPaymentFallback('Köket behöver först godkänna beställningen. Följ besked via Mina beställningar.');
        } catch (reason) { setPaymentFallback(`Ordern är sparad. ${reason instanceof Error ? reason.message : 'Betalningen kunde inte öppnas.'} Fortsätt via Mina beställningar; skapa inte en ny order.`); }
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Beställningen kunde inte skickas.'); setRefreshKey(value => value + 1); }
    finally { inFlight.current = false; setSending(false); }
  }
  function summary() {
    return <View style={s.panel}><Text style={s.heading}>{quantity} × {menu?.title} {menu?.size_label}</Text><Text style={s.body}>{quantity * (menu?.package_portions || 1)} portioner · {fulfillment === 'pickup' ? 'Hämtning' : `Hemleverans ${postalCode}`}</Text><Text style={s.label}>{slotLabel}</Text>
      {current?.lines?.map((line, index) => <View style={s.row} key={index}><View style={{ flex: 1 }}><Text style={s.body}>{line.quantity} × {line.title}</Text><Text style={s.detail}>{formatSek(line.unit_price_ore)} / {line.unit_label || 'paket'}</Text></View><Text style={s.label}>{formatSek(line.total_ore)}</Text></View>)}
      {current && <><Amount label="Mat" ore={current.subtotal_ore}/><Amount label={fulfillment === 'pickup' ? 'Hämtning' : 'Leverans'} ore={current.delivery_fee_ore}/><Amount strong label="Totalt" ore={current.total_ore}/><Text style={s.detail}>{formatSek(Math.round(current.total_ore / (quantity * (menu?.package_portions || 1))))} / person som jämförelse. Paketpriset multipliceras bara med antalet paket.</Text></>}
    </View>;
  }
  if (submitted) return <Screen title="Beställning mottagen"><View style={s.panel}><Text style={s.eyebrow}>{submitted.code}</Text><Text style={s.heading}>{submitted.quantity} × {submitted.title}</Text><Text style={s.body}>{submitted.time} · {formatSek(submitted.total)}</Text><Text style={s.body}>Tiden hålls tillfälligt. En reservation är inte en bekräftelse. Följ kökets besked och betalningen på din privata ordersida.</Text></View>{sending && <Text style={s.body}>Kontrollerar nästa betalningssteg…</Text>}{!!paymentFallback && <Notice text={paymentFallback}/>}<Button title="Fortsätt till betalning och orderstatus →" onPress={() => router.push('/ordrar')}/>{!!storageNotice && <Notice text={storageNotice}/>}{!!retryNotice && <Notice text={retryNotice}/>}</Screen>;
  return <Screen key={step} title={stepLabels[step - 1]} intro={`Steg ${step} av 3 · Beställ ett färdigt paket utan kundkonto.`} keepFooterWithKeyboard footer={menu && <>
    {current ? <Amount strong label="Totalt" ore={current.total_ore}/> : <Text style={s.label}>Total kontrolleras av köket</Text>}<Text style={s.detail}>{slotLabel}</Text><Button title={sending ? 'Skickar…' : step === 1 ? 'Granska beställningen →' : step === 2 ? 'Kontakt och betalning →' : selectedPayment === 'cash' ? 'Reservera · kontant vid hämtning →' : `Reservera och fortsätt till ${catalog.test_mode ? 'testbetalning' : 'betalning'} →`} disabled={!canContinue || sending || step === 3 && (!terms || !selectedPayment)} onPress={() => step < 3 ? next() : void submit()}/>
  </>}>
    <View style={s.row}>{stepLabels.map((label, index) => <Pressable key={label} accessibilityRole="button" disabled={sending || index + 1 > step} onPress={() => { setStep(index + 1); setError(''); }}><Text style={[s.detail, index + 1 === step && s.label]}>{index + 1}. {label}</Text></Pressable>)}</View>
    {!enabled && <Notice text="Direktbeställningar är pausade eller ännu inte öppna. Företagets godkännande krävs för riktig drift."/>}
    {step === 1 && <>
      <Text style={s.heading}>Färdigt paket</Text><Choices selected={group || ''} values={families.map(item => ({ value: item.package_group || item.id, label: item.package_group || item.title }))} onSelect={value => { setMenuId(packages.find(item => (item.package_group || item.id) === value)?.id || ''); setExtras({}); changed(); }}/>
      {!!variants.length && <><Text style={s.label}>Paketstorlek</Text><Choices selected={menu?.id || ''} values={variants.map(item => ({ value: item.id, label: `${item.size_label || `${item.package_portions || 1} portioner`} · ${formatSek(item.price_ore)} / paket` }))} onSelect={value => { setMenuId(value); setExtras({}); changed(); }}/></>}
      {!menu && <Notice text="Det tidigare paketet erbjuds inte längre. Välj ett publicerat paket."/>}
      {menu && <View style={s.card}><Photo url={menu.image_url} label={menu.image_url ? menu.title : 'Inspirationsbild – paketbild saknas'}/><View style={s.cardBody}>{(!menu.image_url || catalog.test_mode || catalog.demo) && <Text style={s.detail}>Inspirationsbild – {catalog.test_mode ? 'syntetiskt testpaket, ingen godkänd produktbild.' : 'köket behöver bekräfta den exakta paketbilden.'}</Text>}<Text style={s.heading}>{menu.title}</Text><Text style={s.body}>{menu.description}</Text><Text style={s.detail}>{menu.included.join(' · ')}</Text><Text style={s.detail}>Allergener: {menu.allergens.join(', ') || 'Fråga köket före köp'}. {menu.package_portions || 1} portioner / paket.</Text><Text style={s.price}>{formatSek(menu.price_ore)} / paket</Text><View style={s.row}><Text style={s.label}>Antal paket</Text><Stepper value={quantity} min={1} max={100} label="paket" onChange={difference => { setQuantity(value => Math.max(1, Math.min(100, value + difference))); changed(); }}/></View>{menu.availability_state && menu.availability_state !== 'available' && <Notice text={menu.availability_state === 'sold_out' ? 'Paketet är slutsålt.' : 'Paketet är pausat.'}/>}</View></View>}
      {!!allowed.length && <Text style={s.heading}>Tillbehör</Text>}{allowed.map(dish => <View style={s.panel} key={dish.id}><Text style={s.label}>{dish.title}</Text><Text style={s.detail}>{formatSek(dish.price_ore)} / {dish.portion_label} · Allergener: {dish.allergens.join(', ') || 'Fråga köket'}</Text><Stepper label={dish.title} value={extras[dish.id] || 0} min={0} max={100} onChange={difference => { setExtras(old => ({ ...old, [dish.id]: Math.max(0, Math.min(100, (old[dish.id] || 0) + difference)) })); changed(); }}/></View>)}
      {invalidExtras && <View><Notice text="Tidigare tillbehör erbjuds inte längre. Ta bort dem för att fortsätta."/><Button secondary title="Ta bort tidigare tillbehör" onPress={() => { setExtras({}); changed(); }}/></View>}
      <Text style={s.detail}>Paketets innehåll byts inte automatiskt. Boka egen catering för särskilda menyval.</Text>
      <Choices selected={fulfillment} values={[...(settings.pickup_enabled ? [{ value: 'pickup' as const, label: 'Hämtning' }] : []), ...(settings.delivery_enabled ? [{ value: 'delivery' as const, label: 'Hemleverans' }] : [])]} onSelect={value => { setFulfillment(value); changed(); }}/>
      {fulfillment === 'pickup' ? <Text style={s.body}>Hämtning: {current?.pickup_address || settings.pickup_address || 'Köket behöver publicera adress.'} · 0 kr</Text> : <><Field label="Postnummer" value={form.postal_code} keyboardType="number-pad" maxLength={6} onChangeText={value => { setForm(old => ({ ...old, postal_code: value })); changed(); }}/><Text style={s.detail}>{current?.delivery_zone_id ? `Aktiv leveranszon · ${formatSek(current.delivery_fee_ore)}` : 'Servern kontrollerar leveranszon och avgift. Fullständig adress anges i sista steget.'}</Text></>}
      <Text style={s.heading}>Välj tid</Text>{slotsLoading && <Text accessibilityRole="progressbar">Hämtar lediga tider…</Text>}{!!availabilityError && <Notice text={availabilityError}/>}{!!current?.reason && <Notice text={current.reason}/>}{!!current?.slots.length && <>
        <Text style={s.label}>Nästa lediga tid: {current.slots[0].label}</Text><Button secondary={timeMode !== 'asap'} title="Så snart som möjligt" onPress={() => { setTimeMode('asap'); setSelectedStartsAt(current.slots[0].starts_at); }}/><Button secondary={timeMode !== 'choose'} title="Välj tid" onPress={() => { setTimeMode('choose'); setSelectedStartsAt(''); }}/>
        {timeMode === 'choose' && <><Choices selected={selectedStartsAt} values={(showAllSlots ? current.slots : current.slots.slice(0, 8)).map(item => ({ value: item.starts_at, label: `${item.label}${fulfillment === 'delivery' && item.ends_at ? ` – ${formatScheduledTime(item.ends_at)}` : ''}` }))} onSelect={setSelectedStartsAt}/>{current.slots.length > 8 && <Button secondary title={showAllSlots ? 'Visa färre tider' : 'Visa senare lediga tider'} onPress={() => setShowAllSlots(value => !value)}/>}</>}
        {!!timeMode && !slot && <Notice text="Välj en aktuell tid. En bortfallen tid ersätts aldrig automatiskt."/>}</>}
      {fulfillment === 'delivery' && !current?.slots.length && settings.pickup_enabled && <Button secondary title="Välj hämtning i stället" onPress={() => { setFulfillment('pickup'); changed(); }}/>}<Button secondary title="Uppdatera lediga tider" disabled={!canQuery || slotsLoading} onPress={() => setRefreshKey(value => value + 1)}/><Text style={s.detail}>Tiderna och priset kommer från servern i Europe/Stockholm. {current ? `Förberedelse: ${current.preparation_minutes} minuter.` : ''}</Text>
    </>}
    {step === 2 && <>{summary()}<Button secondary title="Ändra mat, leveranssätt eller tid" onPress={() => setStep(1)}/><Text style={s.detail}>Dina andra val finns kvar när du går tillbaka.</Text></>}
    {step === 3 && <>
      {field('full_name', 'För- och efternamn', { autoComplete: 'name', maxLength: 120 })}{field('email', 'E-post', { keyboardType: 'email-address', autoCapitalize: 'none', autoComplete: 'email', maxLength: 200 })}{field('phone', 'Telefon', { keyboardType: 'phone-pad', autoComplete: 'tel', maxLength: 30 })}
      {fulfillment === 'delivery' && <>{field('address', 'Gatuadress', { autoComplete: 'street-address', maxLength: 220 })}{field('city', 'Ort', { maxLength: 100 })}<Text style={s.body}>Postnummer: {postalCode}</Text><Button secondary title="Ändra postnummer" onPress={() => setStep(1)}/></>}
      {field('notes', 'Allergier och leveransinstruktioner (frivilligt)', { multiline: true, maxLength: 1000 })}<Text style={s.heading}>{catalog.test_mode ? 'Simulerat betalningssätt' : 'Betalningssätt'}</Text><Choices selected={selectedPayment || ''} values={methods.map(value => ({ value, label: paymentMethodLabel(value, catalog.test_mode === true) }))} onSelect={setPayment}/>
      <Text style={s.detail}>{selectedPayment === 'cash' ? 'Betala kontant vid hämtning enligt kökets regler. Köket registrerar betalningen.' : 'Nästa sida öppnar betalningen när köket tillåter det. Beställningen bekräftas först när servern verifierat betalning och kapacitet.'} {catalog.test_mode ? 'Inga riktiga pengar används.' : ''}</Text>
      <Pressable disabled={sending} accessibilityRole="checkbox" accessibilityState={{ checked: terms }} onPress={() => setTerms(value => !value)} style={s.panel}><Text style={s.body}>{terms ? '☑' : '☐'} Jag godkänner beställningsvillkoren och har läst integritetspolicyn.</Text></Pressable><Button secondary title="Beställningsvillkor" disabled={!apiUrl || sending} onPress={() => void policy('/villkor')}/><Button secondary title="Integritetspolicy" disabled={!apiUrl || sending} onPress={() => void policy('/integritet')}/>
    </>}
    {!!error && <Notice text={error}/>}{!!retryNotice && <Notice text={retryNotice}/>}{step > 1 && <Button secondary title="Tillbaka" disabled={sending} onPress={() => setStep(step - 1)}/>}<Button secondary title="Boka större catering" onPress={() => router.push('/bygg')}/>
  </Screen>;
}

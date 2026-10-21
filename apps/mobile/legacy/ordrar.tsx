import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  canPayOrder, directOrderStatus, directReorderDraft, formatScheduledTime, formatSek, orderPaymentMethods, orderProgress, orderTimelineLabels, paymentMethodLabel,
  paymentStatusLabels, statusLabels, type OnlinePaymentMethod, type PublicOrder,
} from '@yehabibi/shared';
import { api, openWebsite, registerOrderPush } from '../lib/api';
import { mobileOnlinePaymentMethods } from '../lib/payment-methods';
import { useCatering } from '../lib/store';
import { Amount, Button, Choices, colors, Notice, Screen, s } from '../lib/ui';

export default function Orders() {
  const { references, storageNotice, catalog, catalogError, loading: catalogLoading, refresh: refreshCatalog } = useCatering();
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [updated, setUpdated] = useState('');
  const [selectedMethods, setSelectedMethods] = useState<Record<string, OnlinePaymentMethod>>({});
  const inFlight = useRef(false);
  const refreshing = useRef(false);
  const methods = catalogError ? [] : mobileOnlinePaymentMethods(catalog);
  const directMethods = catalogError ? [] : mobileOnlinePaymentMethods(catalog, 'direct');
  const refresh = useCallback(async () => {
    if (!references.length || refreshing.current) return;
    refreshing.current = true;
    setLoading(true);
    setError('');
    const results = await Promise.allSettled(references.map(reference => api.getPaymentStatus(reference)));
    const fresh = results.flatMap(result => result.status === 'fulfilled' ? [result.value.order] : []);
    setOrders(previous => references.flatMap(reference => {
      const order = fresh.find(item => item.code === reference.code) || previous.find(item => item.code === reference.code);
      return order ? [order] : [];
    }));
    if (results.some(result => result.status === 'rejected')) {
      setError('Några beställningar kunde inte hämtas. Kontrollera anslutningen och uppdatera igen.');
    }
    if (fresh.length) setUpdated(new Intl.DateTimeFormat('sv-SE', {
      hour: '2-digit', minute: '2-digit',
    }).format(new Date()));
    setLoading(false);
    refreshing.current = false;
  }, [references]);

  useFocusEffect(useCallback(() => {
    void refresh();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') { void refresh(); void refreshCatalog(); }
    }, 15000);
    return () => clearInterval(timer);
  }, [refresh, refreshCatalog]));
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh();
    });
    return () => listener.remove();
  }, [refresh]);

  async function action(order: PublicOrder, kind: 'pay' | 'accept' | 'push') {
    if (inFlight.current) return;
    const reference = references.find(item => item.code === order.code);
    if (!reference) return;
    inFlight.current = true;
    setBusy(order.code); setError(''); setNotice('');
    try {
      if (kind === 'pay') {
        const available = orderPaymentMethods(order.order_type === 'direct' ? directMethods : methods, order);
        const method = available.find(item => item === selectedMethods[order.code]) ||
          available.find(item => item === order.payment_preference) || available[0];
        if (!canPayOrder(order) || !method || catalogLoading || catalogError) throw new Error('Betalningssättet är inte tillgängligt. Uppdatera och försök igen.');
        const session = await api.createPayment(reference, method);
        await openWebsite(session.checkout_url, true, catalog.test_mode === true && session.test_mode === true);
        setNotice(catalog.test_mode === true ? 'Den lokala betalningssimulationen har öppnats. Backend uppdaterar teststatus; inga pengar används.' : 'Betalningssidan har öppnats. Betald visas först när backend har verifierat resultatet.');
      }
      if (kind === 'accept' && order.proposal) {
        await api.acceptPriceChange(reference, order.proposal.revision);
        setNotice('Du har godkänt förslaget. Nästa steg visas i din beställning.');
      }
      if (kind === 'push') {
        await registerOrderPush(reference, catalog.test_mode === true);
        setNotice(catalog.test_mode === true ? 'Testnotiser registrerade för den lokala testinkorgen. Inga riktiga pushnotiser skickas.' : 'Statusnotiser för den här beställningen är aktiverade på enheten.');
      }
      // Betald visas först när backend har verifierat betalningen.
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Åtgärden kunde inte genomföras.');
    } finally { inFlight.current = false; setBusy(''); }
  }

  return (
    <Screen title="Mina beställningar" intro="Från första förfrågan till maten är framme. Här ser du alltid serverns bekräftade status.">
      {!!storageNotice && <Notice text={storageNotice} />}
      {!!notice && <Notice text={notice} />}
      {!!error && <Notice text={error} />}
      {!references.length && <View style={s.panel}>
        <Text style={s.heading}>Din nästa fina stund börjar här</Text>
        <Text style={s.body}>Dina förfrågningar sparas privat på den här enheten. När du har skickat en meny kan du följa status och godkänna eventuella ändringar här.</Text>
        <Button title="Utforska menyerna  →" onPress={() => router.push('/menyer')} />
      </View>}
      {!!references.length && <Button secondary title={loading ? 'Uppdaterar…' : 'Uppdatera orderstatus'}
        disabled={loading} onPress={() => void refresh()} />}
      {!!updated && <Text style={s.detail}>Senast uppdaterad {updated}</Text>}
      {orders.map(order => {
        const stage = orderProgress(order) - 1;
        const directStatus = order.order_type === 'direct' ? directOrderStatus(order) : null;
        const reorder = directReorderDraft(order);
        // Keep the verified panel mounted during background polling so focus and scroll stay stable.
        const canPay = !error && !catalogError && canPayOrder(order);
        const available = orderPaymentMethods(order.order_type === 'direct' ? directMethods : methods, order);
        const method = available.find(item => item === selectedMethods[order.code]) ||
          available.find(item => item === order.payment_preference) || available[0];
        return <View key={order.code} style={s.card}>
          <View style={s.cardBody}>
            <Text style={s.eyebrow}>{order.code}</Text>
            <Text style={s.heading}>{order.menu_title}</Text>
            <Text style={s.eyebrow}>{order.order_type === 'direct' ? 'DIREKTBESTÄLLNING' : 'CATERING'}</Text>
            <Text style={s.body}>{order.order_type === 'direct' && formatScheduledTime(order.scheduled_at) || `${order.event_date} kl. ${order.event_time}`} · {order.order_type === 'direct'
              ? `${order.package_quantity || 1} paket · ${order.guests} portioner` : `${order.guests} personer`}</Text>
            <View style={[s.panel, { backgroundColor: colors.mint }]}>
              <Text style={s.price}>{directStatus?.label || statusLabels[order.status]}</Text>
              {directStatus && <Text style={s.body}>{directStatus.detail}</Text>}
              {directStatus && order.capacity_status === 'held' && order.hold_expires_at && <Text style={s.detail}>Reservation till {formatScheduledTime(order.hold_expires_at)}. Servern avgör när kapaciteten kan frigöras.</Text>}
              <Text style={s.body}>{catalog.test_mode === true || order.payment_provider === 'local_test' ? 'Simulerad betalning' : 'Betalning'}: {paymentStatusLabels[order.payment_status]}</Text>
              <Text style={s.detail}>{paymentMethodLabel(order.payment_preference, catalog.test_mode === true || order.payment_provider === 'local_test')} · {order.fulfillment === 'pickup' ? 'Hämtning' : 'Leverans'}</Text>
            </View>
            {order.payment_review_required && <Notice text={`${order.payment_refund_status === 'needs_review' ? 'Återbetalningen behöver kontrolleras av köket.' : 'Betalningen behöver kontrolleras av köket.'} Kontakta oss innan du betalar igen.`} />}
            {!!order.payment_transaction_reference && <Text style={s.detail}>Transaktionsreferens: {order.payment_transaction_reference}</Text>}
            {order.payment_refund_status === 'pending' && <Notice text="Återbetalning begärd. Väntar på leverantörens bekräftelse." />}
            {stage >= 0 && <View style={s.section}>{(directStatus ? ['Bekräftad', 'Tillagas', order.fulfillment === 'pickup' ? 'Klar för hämtning' : 'På väg', 'Slutförd'] : orderTimelineLabels(order)).map((label, index) =>
              <Text key={label} style={[s.detail, { color: (directStatus ? index < directStatus.progress : index <= stage && (index !== 4 || order.payment_status === 'paid')) ? colors.green : colors.muted }]}>
                {(directStatus ? index < directStatus.progress : index <= stage && (index !== 4 || order.payment_status === 'paid')) ? '✓' : '○'}  {label}
              </Text>)}</View>}
            {order.items.map((item, index) => <View key={index} style={s.row}>
              <Text style={s.body}>{item.quantity} × {item.title}</Text>
              <Text style={s.label}>{formatSek(item.total_ore)}</Text>
            </View>)}
            <View style={s.rule} />
            {!!order.price_adjustment_ore && <Amount label="Godkänd prisjustering" ore={order.price_adjustment_ore} />}
            <Amount label="Leverans" ore={order.delivery_fee_ore} />
            <Amount strong label="Aktuellt totalpris" ore={order.total_ore} />
            {order.status === 'changes_requested' && order.proposal && <View style={s.panel}>
              <Text style={s.heading}>Ett förslag från köket</Text>
              <Text style={s.body}>{order.proposal.message}</Text>
              <Amount label="Tidigare totalpris" ore={order.total_ore} />
              <Amount label="Föreslagen justering" ore={order.proposal.price_adjustment_ore} />
              <Amount strong label="Nytt totalpris" ore={order.proposal.total_ore} />
              <Text style={s.detail}>Du behöver godkänna det nya priset uttryckligen. Ingen betalning sker när du godkänner.</Text>
              <Button title={`Godkänn ${formatSek(order.proposal.total_ore)}`} disabled={!!busy}
                onPress={() => void action(order, 'accept')} />
            </View>}
            {!directStatus && order.status === 'new' && <Text style={s.detail}>Förfrågan är mottagen. Köket bekräftar tillgänglighet och pris.</Text>}
            {reorder && <><Button title="Beställ samma igen →" onPress={() => router.push({ pathname: '/direkt', params: { menu: reorder.menu_id, quantity: reorder.quantity, addons: reorder.addons.map(item => `${item.dish_id}:${item.quantity}`).join(',') } })}/><Text style={s.detail}>Ett nytt utkast med aktuella priser. Välj en ny tid; tidigare betalning kopieras aldrig.</Text></>}
            {directStatus && order.capacity_status === 'released' && order.payment_status === 'unpaid' && <Button title="Starta en ny beställning →" onPress={() => router.push('/menyer')}/>}
            {order.payment_preference === 'cash' && order.payment_status !== 'paid' && <Text style={s.detail}>Kontant vid hämtning. Ägaren registrerar betalningen när pengarna har tagits emot.</Text>}
            {canPay && available.length > 0 && <View style={s.section}>
              <Text style={s.heading}>{order.payment_provider ? 'Fortsätt din betalning' : 'Välj betalningssätt'}</Text>
              <Choices values={available.map(value => ({ value, label: paymentMethodLabel(value, catalog.test_mode === true) }))}
                selected={method} onSelect={value => setSelectedMethods(previous => ({ ...previous, [order.code]: value }))} />
              {!!order.payment_provider && <Text style={s.detail}>Det påbörjade försöket använder samma metod. Kontakta köket om du behöver ändra.</Text>}
              {catalog.test_mode === true && <Text style={s.detail}>Lokal simulation av vald metod. Inga pengar, plånböcker eller kort används.</Text>}
              <Button title={catalog.test_mode === true ? 'Öppna betalningssimulation  →' : 'Öppna säker betalning  →'} disabled={!!busy || loading || catalogLoading} onPress={() => void action(order, 'pay')} />
            </View>}
            {canPay && !available.length && <Notice text={catalog.payment_unavailable_reason || 'Onlinebetalning är ännu inte aktiverad för din enhet. Kontakta köket om betalning.'} />}
            {!['completed', 'rejected', 'cancelled'].includes(order.status) && <Button secondary title={catalog.test_mode === true ? 'Simulera statusnotiser' : 'Aktivera statusnotiser'}
              disabled={!!busy} onPress={() => void action(order, 'push')} />}
            {order.payment_status === 'pending' && <Text style={s.detail}>Betalningen bekräftas av betalleverantören. Återkomsten från betalningssidan räcker inte som kvitto.</Text>}
          </View>
        </View>;
      })}
    </Screen>
  );
}

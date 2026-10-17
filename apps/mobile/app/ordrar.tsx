import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  formatSek, paymentLabels, paymentStatusLabels, statusLabels, type PublicOrder,
} from '@yehabibi/shared';
import { getOrder, openWebsite, registerOrderPush, request } from '../lib/api';
import { useCatering } from '../lib/store';
import { Amount, Button, colors, Notice, Screen, s } from '../lib/ui';

const stages = [
  { status: 'new', label: 'Mottagen' },
  { status: 'reviewing', label: 'Granskning' },
  { status: 'approved', label: 'Godkänd' },
  { status: 'preparing', label: 'Tillagas' },
  { status: 'ready', label: 'Klar / på väg' },
  { status: 'completed', label: 'Slutförd' },
];

export default function Orders() {
  const { references, storageNotice } = useCatering();
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [updated, setUpdated] = useState('');
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (!references.length) return;
    setLoading(true);
    setError('');
    const results = await Promise.allSettled(references.map(reference => getOrder(reference)));
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
  }, [references]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
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
      if (kind === 'pay') await openWebsite(order.checkout_url, true);
      if (kind === 'accept' && order.proposal) {
        await request(`/api/orders/${encodeURIComponent(reference.code)}?token=${encodeURIComponent(reference.token)}`, {
          method: 'PATCH', body: JSON.stringify({ action: 'accept_changes', revision: order.proposal.revision }),
        });
        setNotice('Du har godkänt förslaget. Nästa steg visas i din beställning.');
      }
      if (kind === 'push') {
        await registerOrderPush(reference);
        setNotice('Statusnotiser för den här beställningen är aktiverade på enheten.');
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
        const stage = stages.findIndex(item => item.status === (order.status === 'dispatched' ? 'ready' : order.status));
        const canPay = !error && !loading && ['approved', 'preparing', 'ready'].includes(order.status) &&
          ['unpaid', 'pending', 'failed'].includes(order.payment_status) &&
          order.payment_preference !== 'cash' && !!order.checkout_url;
        return <View key={order.code} style={s.card}>
          <View style={s.cardBody}>
            <Text style={s.eyebrow}>{order.code}</Text>
            <Text style={s.heading}>{order.menu_title}</Text>
            <Text style={s.body}>{order.event_date} kl. {order.event_time} · {order.guests} personer</Text>
            <View style={[s.panel, { backgroundColor: colors.mint }]}>
              <Text style={s.price}>{statusLabels[order.status]}</Text>
              <Text style={s.body}>Betalning: {paymentStatusLabels[order.payment_status]}</Text>
              <Text style={s.detail}>{paymentLabels[order.payment_preference]} · {order.fulfillment === 'pickup' ? 'Hämtning' : 'Leverans'}</Text>
            </View>
            {stage >= 0 && <View style={s.section}>{stages.map((item, index) =>
              <Text key={item.status} style={[s.detail, { color: index <= stage ? colors.green : colors.muted }]}>
                {index < stage ? '✓' : index === stage ? '●' : '○'}  {item.label}
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
            {order.status === 'new' && <Text style={s.detail}>Förfrågan är mottagen. Köket bekräftar tillgänglighet och pris.</Text>}
            {order.payment_preference === 'cash' && order.payment_status !== 'paid' && <Text style={s.detail}>Kontant vid hämtning. Ägaren registrerar betalningen när pengarna har tagits emot.</Text>}
            {canPay && <Button title="Öppna säker betalning  →" disabled={!!busy} onPress={() => void action(order, 'pay')} />}
            {!['completed', 'rejected', 'cancelled'].includes(order.status) && <Button secondary title="Aktivera statusnotiser"
              disabled={!!busy} onPress={() => void action(order, 'push')} />}
            {order.payment_status === 'pending' && <Text style={s.detail}>Betalningen bekräftas av betalleverantören. Återkomsten från betalningssidan räcker inte som kvitto.</Text>}
          </View>
        </View>;
      })}
    </Screen>
  );
}

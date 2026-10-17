import { useCallback, useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  formatSek,
  paymentLabels,
  paymentStatusLabels,
  statusLabels,
  type PublicOrder,
} from '@yehabibi/shared';
import { getOrder, openWebsite } from '../lib/api';
import { useCatering } from '../lib/store';
import { Button, Notice, Screen, s } from '../lib/ui';

export default function Orders() {
  const { references, storageNotice } = useCatering();
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState('');

  const refresh = useCallback(async () => {
    if (!references.length) return;
    setLoading(true);
    setError('');
    const results = await Promise.allSettled(references.map((reference) => getOrder(reference)));
    const fresh = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value.order] : []));
    setOrders(fresh);
    if (results.some((result) => result.status === 'rejected'))
      setError('Några beställningar kunde inte hämtas. Kontrollera anslutningen och uppdatera igen.');
    if (fresh.length)
      setUpdated(new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' }).format(new Date()));
    setLoading(false);
  }, [references]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => listener.remove();
  }, [refresh]);

  async function pay(url: string) {
    try {
      await openWebsite(url, true);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Betalningslänken kunde inte öppnas.');
    }
  }

  return (
    <Screen
      title="Mina beställningar"
      intro="Följ de förfrågningar du har skickat från den här enheten. Ägaren bekräftar först, sedan kan du betala."
    >
      {!!storageNotice && <Notice text={storageNotice} />}
      {!references.length && (
        <View style={s.cardBody}>
          <Text style={s.heading}>Här samlas dina förfrågningar</Text>
          <Text style={s.body}>
            När du skickar en förfrågan sparas en privat orderreferens på den här enheten. Du får också en
            privat länk i bekräftelsen om företagets mejltjänst är aktiverad.
          </Text>
          <Text style={s.detail}>I webbläsaren finns referenserna kvar under den aktuella sessionen.</Text>
        </View>
      )}
      {!!references.length && (
        <Button
          secondary
          title={loading ? 'Uppdaterar…' : 'Uppdatera orderstatus'}
          disabled={loading}
          onPress={() => void refresh()}
        />
      )}
      {!!updated && <Text style={s.detail}>Senast uppdaterad {updated}</Text>}
      {!!error && <Notice text={error} />}
      {orders.map((order) => (
        <View key={order.code} style={s.card}>
          <View style={s.cardBody}>
            <Text style={s.eyebrow}>{order.code}</Text>
            <Text style={s.heading}>{order.menu_title}</Text>
            <Text style={s.body}>
              {order.event_date} kl. {order.event_time} · {order.guests} personer
            </Text>
            <Text style={s.price}>{statusLabels[order.status]}</Text>
            <Text style={s.body}>Betalning: {paymentStatusLabels[order.payment_status]}</Text>
            <Text style={s.detail}>
              {paymentLabels[order.payment_preference]} ·{' '}
              {order.fulfillment === 'pickup' ? 'Hämtning' : 'Leverans'}
            </Text>
            <View style={s.rule} />
            <Text style={s.price}>{formatSek(order.total_ore)}</Text>
            {order.payment_preference === 'cash' && order.payment_status !== 'paid' && (
              <Text style={s.detail}>
                Kontantbetalning registreras av ägaren när du har betalat vid hämtning.
              </Text>
            )}
            {order.status === 'new' && (
              <Text style={s.detail}>Mottagen. Vi återkommer med besked om din förfrågan.</Text>
            )}
            {order.status === 'approved' &&
              order.payment_status === 'pending' &&
              order.payment_preference !== 'cash' &&
              !!order.checkout_url && (
                <Button title="Öppna säker betalning" onPress={() => void pay(order.checkout_url!)} />
              )}
          </View>
        </View>
      ))}
    </Screen>
  );
}

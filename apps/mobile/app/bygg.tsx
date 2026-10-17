import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatSek } from '@yehabibi/shared';
import { getQuote, useCatering } from '../lib/store';
import { Amount, Button, Choices, Notice, Photo, Screen, Stepper, s } from '../lib/ui';

export default function Builder() {
  const { catalog, selection, setGuests, changeDish } = useCatering();
  const quote = selection.menuId ? null : getQuote(catalog, selection);
  return (
    <Screen
      title="Dina favoriter. Er buffé."
      intro="Antalet gäller stycken eller portioner enligt varje rätt. Lägg till precis det ni vill dela."
    >
      <View style={s.section}>
        <View style={s.row}>
          <Text style={s.heading}>Antal personer</Text>
          <Stepper
            value={selection.guests}
            min={catalog.settings.custom_min_people}
            label="personer"
            onChange={(difference) => setGuests(selection.guests + difference)}
          />
        </View>
        <Choices
          values={[5, 8, 10, 20].filter(value => value >= catalog.settings.custom_min_people).map((value) => ({ value: String(value), label: `${value} personer` }))}
          selected={String(selection.guests)}
          onSelect={(value) => setGuests(Number(value))}
        />
      </View>
      {!catalog.dishes.length && (
        <Notice text="Ägaren har ännu inte publicerat styckpriser för enskilda rätter. Se våra färdiga menyer så länge." />
      )}
      {catalog.dishes
        .filter((dish) => dish.active)
        .map((dish) => {
          const quantity = selection.quantities[dish.id] || 0;
          return (
            <View key={dish.id} style={s.card}>
              {dish.image_url && <Photo url={dish.image_url} />}
              <View style={s.cardBody}>
                <Text style={s.heading}>{dish.title}</Text>
                <Text style={s.body}>{dish.description}</Text>
                <Text style={s.detail}>
                  Portion: {dish.portion_label}. Allergener:{' '}
                  {dish.allergens.join(', ') || 'Kontakta oss för information'}
                </Text>
                <Text style={s.price}>
                  {dish.price_ore > 0
                    ? `${formatSek(dish.price_ore)} / ${dish.portion_label}`
                    : 'Pris inväntar bekräftelse'}
                </Text>
                <View style={s.row}>
                  <Text style={s.body}>Antal</Text>
                  <Stepper
                    label={dish.title}
                    value={quantity}
                    onChange={(difference) => changeDish(dish.id, difference)}
                  />
                </View>
                <Text style={s.detail}>
                  {dish.price_ore > 0
                    ? `Radpris: ${quantity} × ${formatSek(dish.price_ore)} = ${formatSek(quantity * dish.price_ore)}`
                    : 'Radpris visas när priset är bekräftat.'}
                </Text>
              </View>
            </View>
          );
        })}
      {quote && (
        <View style={s.cardBody}>
          <Amount strong label="Summa mat" ore={quote.subtotal_ore} />
          <Amount label="Mat per person, avrundat" ore={quote.price_per_person_ore} />
          <Text style={s.detail}>
            Eventuell leverans visas i nästa steg. Servern kontrollerar alltid priserna på nytt.
          </Text>
        </View>
      )}
      <Button title="Fortsätt till förfrågan" disabled={!quote} onPress={() => router.push('/bestall')} />
      <Button secondary title="Se färdiga menyer" onPress={() => router.push('/menyer')} />
    </Screen>
  );
}

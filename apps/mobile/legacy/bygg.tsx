import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatSek } from '@yehabibi/shared';
import { getQuote, useCatering } from '../lib/store';
import { Amount, Button, categories, Choices, DishCard, Notice, Screen, Stepper, s } from '../lib/ui';

export default function Builder() {
  const { catalog, selection, setGuests, chooseCustom, storageNotice } = useCatering();
  const [category, setCategory] = useState('alla');
  const count = Object.values(selection.quantities).filter(quantity => quantity > 0).length;
  const quote = selection.menuId ? null : getQuote(catalog, selection);
  const dishes = catalog.dishes.filter(dish => dish.active &&
    (category === 'alla' || (category === 'valda' ? selection.quantities[dish.id] > 0 : dish.category === category)));
  return (
    <Screen title="Bygg din egen meny" intro="Välj fritt, anpassa antal och se priset direkt." footer={<>
      {quote ? <>
        <Amount strong label={`${count} rätter · mat`} ore={quote.subtotal_ore} />
        <Text style={s.detail}>{selection.guests} personer · {formatSek(quote.price_per_person_ore)}/person som jämförelse, avrundat. Leverans väljs i nästa steg.</Text>
      </> : <Text style={s.detail}>{count ? 'Valen saknar bekräftat pris eller rätt gästantal.' : 'Lägg till rätter för att se matens pris.'}</Text>}
      <Button title="Fortsätt till beställning  →" disabled={!quote} onPress={() => router.push('/bestall')} />
    </>}>
      <View style={s.panel}>
        <Text style={s.label}>Hur många samlas ni?</Text>
        <Stepper value={selection.guests} min={catalog.settings.custom_min_people} label="personer"
          onChange={difference => setGuests(selection.guests + difference)} />
        <Choices values={[6, 10, 25].filter(value => value >= catalog.settings.custom_min_people)
          .map(value => ({ value: String(value), label: `${value} personer` }))}
          selected={String(selection.guests)} onSelect={value => setGuests(Number(value))} />
        <Text style={s.detail}>Från {catalog.settings.custom_min_people} personer. Portionsförslagen kommer från köket och kan ändras.</Text>
      </View>
      {selection.menuId && <View style={s.panel}>
        <Text style={s.body}>Du har valt ett cateringpaket. Byt till en egen meny för att välja enskilda rätter.</Text>
        <Button title="Bygg egen meny" onPress={chooseCustom} />
      </View>}
      <Choices selected={category} onSelect={setCategory} values={[
        { value: 'alla', label: 'Alla rätter' }, { value: 'valda', label: `Din meny (${count})` },
        ...Object.entries(categories).map(([value, label]) => ({ value, label })),
      ]} />
      {!dishes.length && <View style={s.panel}>
        <Text style={s.body}>{category === 'valda' ? 'Din meny väntar på dina favoriter.' : 'Inga rätter är publicerade här ännu.'}</Text>
        <Button secondary title="Utforska alla rätter" onPress={() => setCategory('alla')} />
      </View>}
      {dishes.map(dish => <DishCard key={dish.id} dish={dish} />)}
      {!!storageNotice && <Notice text={storageNotice} />}
      <Button secondary title="Se färdiga cateringpaket" onPress={() => router.push('/menyer')} />
    </Screen>
  );
}

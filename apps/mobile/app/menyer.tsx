import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { getQuote, useCatering } from '../lib/store';
import { Amount, Button, categories, Choices, DishCard, MenuCard, Screen, s } from '../lib/ui';

export default function Menus() {
  const { catalog, selection, chooseMenu } = useCatering();
  const [category, setCategory] = useState('alla');
  const count = Object.values(selection.quantities).filter(quantity => quantity > 0).length;
  const quote = getQuote(catalog, selection);
  const dishes = catalog.dishes.filter(dish => dish.active && (category === 'alla' || dish.category === category));
  return (
    <Screen title="Våra menyer" intro="Små rätter. Stora upplevelser. Välj ett paket eller dina egna favoriter.">
      <View style={s.panel}>
        <Text style={s.heading}>{count ? `${count} rätter i din meny` : 'Precis som ni vill ha det'}</Text>
        {quote && <Amount label="Mat" ore={quote.subtotal_ore} />}
        <Button title={count ? 'Fortsätt med din meny  →' : 'Bygg din egen catering  →'} onPress={() => router.push('/bygg')} />
      </View>
      <Choices selected={category} onSelect={setCategory} values={[
        { value: 'alla', label: 'Alla rätter' },
        ...Object.entries(categories).map(([value, label]) => ({ value, label })),
        { value: 'paket', label: 'Cateringpaket' },
      ]} />
      {category !== 'paket' && <View style={s.dishGrid}>
        {dishes.map(dish => <DishCard key={dish.id} dish={dish} compact />)}
      </View>}
      {category !== 'paket' && !dishes.length && <Text style={s.detail}>Inga rätter är publicerade i den här kategorin ännu.</Text>}
      {(category === 'alla' || category === 'paket') && <>
        <Text accessibilityRole="header" style={s.heading}>Färdiga cateringpaket</Text>
        {catalog.menus.filter(menu => menu.active).map(menu => <MenuCard key={menu.id} menu={menu}
          onChoose={() => { chooseMenu(menu.id); router.push('/bestall'); }} />)}
      </>}
      {!!count && <Button title={`Granska dina ${count} rätter  →`} onPress={() => router.push('/bygg')} />}
    </Screen>
  );
}

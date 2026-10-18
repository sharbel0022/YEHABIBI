import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatSek } from '@yehabibi/shared';
import { getQuote, useCatering } from '../lib/store';
import { Amount, Button, categories, Choices, DirectPackageCard, DishCard, MenuCard, Screen, s } from '../lib/ui';

export default function Menus() {
  const { catalog, selection, chooseMenu, loading, catalogError } = useCatering();
  const [category, setCategory] = useState('alla');
  const [packageQuantities, setPackageQuantities] = useState<Record<string, number>>({});
  const [packageSizes, setPackageSizes] = useState<Record<string, string>>({});
  const directPackages = catalog.menus.filter(menu => menu.active && menu.direct_order_enabled);
  const packageGroups = directPackages.filter((item, index) => directPackages.findIndex(other => (other.package_group || other.id) === (item.package_group || item.id)) === index);
  const directEnabled = !loading && !catalogError && catalog.orders_enabled && !catalog.demo && catalog.direct_orders_enabled === true;
  const count = Object.values(selection.quantities).filter(quantity => quantity > 0).length;
  const quote = getQuote(catalog, selection);
  const dishes = catalog.dishes.filter(dish => dish.active && (category === 'alla' || dish.category === category));
  return (
    <Screen title="Våra menyer" intro="Beställ ett färdigt paket för hämtning eller hemleverans. Planera större tillfällen med Boka catering." footer={count > 0 && <>
      {quote ? <Amount strong label={`${count} rätter · mat`} ore={quote.subtotal_ore} />
        : <Text style={s.detail}>Rätterna behöver bekräftade priser innan du kan beställa.</Text>}
      <Button title="Fortsätt till beställning  →" disabled={!quote} onPress={() => router.push('/bestall')} />
      <Button secondary title="Ändra antal och meny" onPress={() => router.push('/bygg')} />
    </>}>
      {!!directPackages.length && <View style={s.section}>
        <Text accessibilityRole="header" style={s.heading}>Beställ nu</Text>
        <Text style={s.body}>Välj antal paket. Nästa steg visar kökets lediga tider i svensk tid.</Text>
        {packageGroups.map(first => { const group = first.package_group || first.id; const variants = directPackages.filter(item => (item.package_group || item.id) === group); const menu = variants.find(item => item.id === packageSizes[group]) || first; return <View key={group}>
          {variants.length > 1 && <><Text style={s.label}>{first.package_group || first.title} · välj storlek</Text><Choices selected={menu.id} values={variants.map(item => ({ value: item.id, label: `${item.size_label || `${item.package_portions || 1} portioner`} · ${formatSek(item.price_ore)}` }))} onSelect={value => setPackageSizes(old => ({ ...old, [group]: value }))}/></>}
          <DirectPackageCard menu={menu}
          quantity={packageQuantities[menu.id] || 1} enabled={directEnabled}
          onChange={difference => setPackageQuantities(previous => ({ ...previous,
            [menu.id]: Math.max(1, Math.min(100, (previous[menu.id] || 1) + difference)),
          }))}
          onOrder={() => router.push({ pathname: '/direkt', params: { menu: menu.id, quantity: packageQuantities[menu.id] || 1 } })} /></View>; })}
      </View>}
      <View style={s.panel}>
        <Text style={s.eyebrow}>BOKA CATERING</Text>
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
        {catalog.menus.filter(menu => menu.active && menu.catering_enabled !== false).map(menu => <MenuCard key={menu.id} menu={menu}
          onChoose={() => { chooseMenu(menu.id); router.push('/bestall'); }} />)}
      </>}
      {!!count && <Button title={`Granska dina ${count} rätter  →`} onPress={() => router.push('/bygg')} />}
    </Screen>
  );
}

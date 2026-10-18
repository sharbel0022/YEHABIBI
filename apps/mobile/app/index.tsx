import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { type Occasion } from '@yehabibi/shared';
import { useCatering } from '../lib/store';
import { Button, colors, DirectPackageCard, DishCard, Hero, MenuCard, Photo, Screen, s } from '../lib/ui';

const occasions: { value: Occasion; title: string; detail: string; icon: string }[] = [
  { value: 'hemma', title: 'Hemma', detail: 'Familj & vänner', icon: '⌂' },
  { value: 'fest', title: 'Fest', detail: 'Stunder att fira', icon: '♧' },
  { value: 'foretag', title: 'Företag', detail: 'Möten & event', icon: '▢' },
];

export default function Home() {
  const { catalog, selection, setOccasion, chooseMenu } = useCatering();
  const [packageQuantities, setPackageQuantities] = useState<Record<string, number>>({});
  const direct = catalog.menus.filter(menu => menu.active && menu.direct_order_enabled);
  const packages = direct.filter((item, index) => direct.findIndex(other => (other.package_group || other.id) === (item.package_group || item.id)) === index);
  const now = Date.now();
  const campaigns = catalog.campaigns.filter(campaign => campaign.active &&
    Date.parse(campaign.starts_at) <= now && Date.parse(campaign.ends_at) >= now);
  return (
    <Screen>
      <View style={s.section}>
        <Text style={s.eyebrow}>FRÅN LIBANON. MED KÄRLEK.</Text>
        <Text accessibilityRole="header" style={s.title}>Libanesiska smaker. För idag och fina tillfällen.</Text>
        <Text style={s.body}>Generösa smaker. Fina stunder. Mat att dela.</Text>
      </View>
      <Hero video={catalog.settings.hero_video_url} poster={catalog.settings.hero_poster_url} />
      <View style={s.section}>
        <Button title="Beställ nu  →" onPress={() => router.push('/direkt')} />
        <Button secondary title="Boka catering  →" onPress={() => router.push('/bygg')} />
        <Text style={s.detail}>Färdiga paket med lediga hämtningstider och hemleverans. För större tillfällen kan du bygga din egen catering.</Text>
      </View>
      {!!packages.length && <View style={s.section}><Text style={s.heading}>Färdiga paket · Beställ nu</Text>{packages.slice(0, 3).map(menu => <DirectPackageCard key={menu.id} menu={menu} quantity={packageQuantities[menu.id] || 1} enabled={!catalog.demo && catalog.orders_enabled && catalog.direct_orders_enabled === true} onChange={difference => setPackageQuantities(old => ({ ...old, [menu.id]: Math.max(1, Math.min(100, (old[menu.id] || 1) + difference)) }))} onOrder={() => router.push({ pathname: '/direkt', params: { menu: menu.id, quantity: packageQuantities[menu.id] || 1 } })}/>)}<Button secondary title="Se alla paket och storlekar" onPress={() => router.push('/menyer')}/></View>}
      <View style={[s.row, { alignItems: 'stretch', gap: 9 }]}>
        {occasions.map(item => <Pressable
          key={item.value} accessibilityRole="radio" accessibilityLabel={`${item.title}, ${item.detail}`}
          accessibilityState={{ checked: selection.occasion === item.value }}
          onPress={() => { setOccasion(item.value); router.push('/menyer'); }}
          style={[s.panel, { flex: 1, padding: 12, alignItems: 'center', gap: 5 },
            selection.occasion === item.value && { backgroundColor: colors.mint }]}
        >
          <Text style={{ color: colors.red, fontSize: 28 }}>{item.icon}</Text>
          <Text style={s.label}>{item.title}</Text>
          <Text style={[s.detail, { textAlign: 'center', fontSize: 11 }]}>{item.detail}</Text>
        </Pressable>)}
      </View>
      <Button title="Se menyer och beställ  →" onPress={() => router.push('/menyer')} />
      <Text style={[s.detail, { textAlign: 'center' }]}>Färska råvaror  ·  Äkta smaker  ·  Flexibel catering</Text>
      {!!catalog.dishes.length && <View style={s.section}>
        <Text accessibilityRole="header" style={s.heading}>Favoriter att dela</Text>
        <Text style={s.detail}>Lägg till direkt och bygg sedan vidare på din meny.</Text>
        <View style={s.dishGrid}>{catalog.dishes.filter(dish => dish.active).slice(0, 4)
          .map(dish => <DishCard key={dish.id} dish={dish} compact />)}</View>
        <Button secondary title="Öppna din meny" onPress={() => router.push('/bygg')} />
      </View>}
      <Text accessibilityRole="header" style={s.heading}>Färdiga cateringpaket</Text>
      {catalog.menus.filter(menu => menu.active && menu.catering_enabled !== false).slice(0, 2).map(menu => <MenuCard
        key={menu.id} menu={menu} onChoose={() => { chooseMenu(menu.id); router.push('/bestall'); }}
      />)}
      {campaigns.map(campaign => <View style={s.card} key={campaign.id}>
        {/\.(mp4|webm|mov|m3u8)([?#]|$)/i.test(campaign.media_url || '')
          ? <Hero video={campaign.media_url} poster="/images/hero.webp" /> : <Photo url={campaign.media_url} />}
        <View style={s.cardBody}>
          <Text style={s.eyebrow}>JUST NU</Text>
          <Text style={s.heading}>{campaign.title}</Text>
          <Text style={s.body}>{campaign.description}</Text>
          {campaign.menu_ids.map(id => { const menu = catalog.menus.find(item => item.id === id); return menu ? <Button key={id} secondary title={`${menu.title} · ${menu.direct_order_enabled ? 'Beställ paket' : 'Boka catering'}`} onPress={() => { if (menu.direct_order_enabled) router.push({ pathname: '/direkt', params: { menu: id, campaign: campaign.id } }); else { chooseMenu(id); router.push({ pathname: '/bestall', params: { campaign: campaign.id } }); } }}/> : null; })}
          {!campaign.menu_ids.length && <Button secondary title="Fråga om cateringkampanjen" onPress={() => router.push('/bestall')}/>}
        </View>
      </View>)}
      <View style={s.panel}>
        <Text style={s.heading}>Enkelt från första valet</Text>
        <Text style={s.body}>Beställ ett färdigt paket och välj en ledig tid. Eller planera catering som köket granskar före betalning.</Text>
        <Text style={s.detail}>{catalog.settings.service_area}</Text>
      </View>
    </Screen>
  );
}

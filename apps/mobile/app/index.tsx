import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { occasions } from '@yehabibi/shared';
import { useCatering } from '../lib/store';
import { Button, Choices, Hero, MenuCard, Photo, Screen, s } from '../lib/ui';

export default function Home() {
  const { catalog, selection, setOccasion, chooseMenu } = useCatering();
  function choose(id: string) {
    chooseMenu(id);
    router.push('/bestall');
  }
  return (
    <Screen>
      <Hero video={catalog.settings.hero_video_url} poster={catalog.settings.hero_poster_url} />
      <View style={s.section}>
        <Text style={s.eyebrow}>FRÅN LIBANON. MED KÄRLEK.</Text>
        <Text accessibilityRole="header" style={s.title}>
          Äkta libanesisk catering
        </Text>
        <Text style={s.body}>{catalog.settings.tagline}</Text>
        <Button title="Beställ catering" onPress={() => router.push('/menyer')} />
      </View>
      <View style={s.section}>
        <Text style={s.heading}>För stunder att samlas kring</Text>
        <Choices
          values={Object.entries(occasions).map(([value, label]) => ({
            value: value as typeof selection.occasion,
            label,
          }))}
          selected={selection.occasion}
          onSelect={setOccasion}
        />
        <Text style={s.detail}>{catalog.settings.service_area}</Text>
      </View>
      <Text accessibilityRole="header" style={s.heading}>
        Våra cateringmenyer
      </Text>
      {catalog.menus
        .filter((menu) => menu.active)
        .slice(0, 3)
        .map((menu) => (
          <MenuCard key={menu.id} menu={menu} onChoose={() => choose(menu.id)} />
        ))}
      {catalog.campaigns.map((campaign) => {
        const isVideo = /\.(mp4|webm|mov|m3u8)([?#]|$)/i.test(campaign.media_url || '');
        return <View style={s.card} key={campaign.id}>
          {isVideo ? <Hero video={campaign.media_url} poster="/images/hero.webp" /> : <Photo url={campaign.media_url} />}
          <View style={s.cardBody}>
            <Text style={s.eyebrow}>JUST NU</Text>
            <Text style={s.heading}>{campaign.title}</Text>
            <Text style={s.body}>{campaign.description}</Text>
            <Button secondary title="Se våra menyer" onPress={() => router.push('/menyer')} />
          </View>
        </View>;
      })}
    </Screen>
  );
}

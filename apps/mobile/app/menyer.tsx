import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useCatering } from '../lib/store';
import { Button, MenuCard, Screen, s } from '../lib/ui';

export default function Menus() {
  const { catalog, chooseMenu } = useCatering();
  return (
    <Screen title="En meny för er stund" intro="Välj en färdig buffé eller sätt ihop era egna favoriter.">
      {catalog.menus
        .filter((menu) => menu.active)
        .map((menu) => (
          <MenuCard
            key={menu.id}
            menu={menu}
            onChoose={() => {
              chooseMenu(menu.id);
              router.push('/bestall');
            }}
          />
        ))}
      <View style={[s.cardBody, { backgroundColor: '#F4F7F4' }]}>
        <Text style={s.heading}>Precis som ni vill ha det</Text>
        <Text style={s.body}>
          Välj rätter, antal och storlek på sällskapet. Du ser priset för varje rad och per person.
        </Text>
        <Button title="Bygg din egen catering" onPress={() => router.push('/bygg')} />
      </View>
    </Screen>
  );
}

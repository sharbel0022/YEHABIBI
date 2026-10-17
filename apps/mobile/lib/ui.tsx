import { useEffect, useState, type PropsWithChildren } from 'react';
import {
  AccessibilityInfo,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { formatSek, safeExternalUrl, type Menu } from '@yehabibi/shared';
import { useCatering } from './store';

export const colors = {
  green: '#155A43',
  text: '#202B27',
  red: '#B63842',
  line: '#DEE6E1',
  soft: '#F4F7F4',
  muted: '#63746A',
};
const photos: Record<string, ImageSourcePropType> = {
  '/images/hero.webp': require('../assets/hero.webp'),
  '/images/mezze.webp': require('../assets/mezze.webp'),
  '/images/grill.webp': require('../assets/grill.webp'),
  '/images/fest.webp': require('../assets/fest.webp'),
};

export function Photo({ url, hero = false }: { url?: string | null; hero?: boolean }) {
  const source = photos[url || ''] || (safeExternalUrl(url) ? { uri: url! } : photos['/images/hero.webp']);
  return (
    <Image
      source={source}
      style={hero ? s.hero : s.photo}
      accessibilityLabel="Libanesisk catering från Cedar Mezze"
    />
  );
}

export function Hero({ video, poster }: { video: string | null; poster: string | null }) {
  return safeExternalUrl(video) ? <HeroVideo key={video} url={video!} poster={poster} /> : <Photo url={poster} hero />;
}

function HeroVideo({ url, poster }: { url: string; poster: string | null }) {
  const [reducedMotion, setReducedMotion] = useState(true);
  const [firstFrame, setFirstFrame] = useState(false);
  const player = useVideoPlayer(url, (instance) => {
    instance.muted = true;
    instance.loop = true;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (reducedMotion) player.pause();
    else player.play();
  }, [player, reducedMotion]);
  return (
    <View style={s.section}>
      <View style={s.hero}>
        <Photo url={poster} hero />
        {status !== 'error' && <VideoView
          player={player}
          style={[StyleSheet.absoluteFill, { opacity: firstFrame ? 1 : 0 }]}
          onFirstFrameRender={() => setFirstFrame(true)}
          contentFit="cover"
          nativeControls
          accessibilityLabel="Matvideo med pausknapp"
        />}
      </View>
      {status === 'error' && <Text style={s.detail}>Videon kunde inte spelas. Matbilden visas i stället.</Text>}
      {status !== 'error' && reducedMotion && !firstFrame && <Button secondary title="Spela matvideo" onPress={() => player.play()} />}
    </View>
  );
}

export function Screen({ children, title, intro }: PropsWithChildren<{ title?: string; intro?: string }>) {
  const { loading, refresh, notice } = useCatering();
  return (
    <SafeAreaView style={s.screen} edges={['left', 'right']}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.green} />
        }
      >
        {title && (
          <View style={s.section}>
            <Text style={s.eyebrow}>CEDAR MEZZE · VÄSTERÅS</Text>
            <Text accessibilityRole="header" style={s.title}>
              {title}
            </Text>
            {intro && <Text style={s.body}>{intro}</Text>}
          </View>
        )}
        {!!notice && <Notice text={notice} />}
        {children}
        <Text style={s.footer}>Tillagat med omsorg. Delat med glädje.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        disabled && s.disabled,
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: colors.green }]}>{title}</Text>
    </Pressable>
  );
}

export function Notice({ text }: { text: string }) {
  return (
    <View style={s.notice}>
      <Text style={s.noticeText} accessibilityRole="alert">
        {text}
      </Text>
    </View>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={[s.input, props.multiline && { minHeight: 92, textAlignVertical: 'top' }]}
        placeholderTextColor={colors.muted}
        {...props}
      />
    </View>
  );
}

export function Stepper({
  value,
  onChange,
  label,
  min = 0,
  max = 1000,
}: {
  value: number;
  onChange: (difference: number) => void;
  label: string;
  min?: number;
  max?: number;
}) {
  return (
    <View style={s.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Minska ${label}`}
        accessibilityState={{ disabled: value <= min }}
        disabled={value <= min}
        onPress={() => onChange(-1)}
        style={s.stepButton}
      >
        <Text style={s.stepText}>−</Text>
      </Pressable>
      <Text style={s.quantity} accessibilityLabel={`${label}: ${value}`}>
        {value}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Öka ${label}`}
        accessibilityState={{ disabled: value >= max }}
        disabled={value >= max}
        onPress={() => onChange(1)}
        style={s.stepButton}
      >
        <Text style={s.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

export function Choices<T extends string>({
  values,
  selected,
  onSelect,
}: {
  values: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={s.choices}>
      {values.map((item) => (
        <Pressable
          key={item.value}
          accessibilityRole="radio"
          accessibilityState={{ checked: selected === item.value }}
          onPress={() => onSelect(item.value)}
          style={[s.chip, selected === item.value && s.chipSelected]}
        >
          <Text style={[s.chipText, selected === item.value && { color: '#FFFFFF' }]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function MenuCard({ menu, onChoose }: { menu: Menu; onChoose: () => void }) {
  return (
    <View style={s.card}>
      <Photo url={menu.image_url} />
      <View style={s.cardBody}>
        <Text style={s.eyebrow}>FRÅN {menu.min_people} PERSONER</Text>
        <Text accessibilityRole="header" style={s.heading}>
          {menu.title}
        </Text>
        <Text style={s.body}>{menu.description}</Text>
        <Text style={s.detail}>{menu.included.join(' · ')}</Text>
        <Text style={s.detail}>
          Allergener: {menu.allergens.join(', ') || 'Kontakta oss för information'}
        </Text>
        <Text style={s.price}>
          {menu.price_ore > 0 ? `${formatSek(menu.price_ore)} / person` : 'Pris inväntar ägarens bekräftelse'}
        </Text>
        <Button title="Välj meny" onPress={onChoose} />
      </View>
    </View>
  );
}

export function Amount({ label, ore, strong = false }: { label: string; ore: number; strong?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={strong ? s.heading : s.body}>{label}</Text>
      <Text style={strong ? s.price : s.body}>{formatSek(ore)}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 20, gap: 22, paddingBottom: 40, width: '100%', maxWidth: 760, alignSelf: 'center' },
  section: { gap: 12 },
  title: { color: colors.text, fontSize: 34, lineHeight: 39, fontWeight: '700', letterSpacing: -1 },
  heading: { color: colors.text, fontSize: 21, lineHeight: 27, fontWeight: '600' },
  body: { color: colors.text, fontSize: 16, lineHeight: 24, flexShrink: 1 },
  detail: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  eyebrow: { color: colors.green, fontWeight: '700', fontSize: 10, letterSpacing: 2, lineHeight: 18 },
  hero: { width: '100%', height: 330, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.soft },
  photo: { width: '100%', height: 215, backgroundColor: colors.soft },
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  cardBody: { padding: 18, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  price: { color: colors.green, fontWeight: '700', fontSize: 17, lineHeight: 25 },
  button: {
    minHeight: 50,
    backgroundColor: colors.green,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#FFFFFF', fontSize: 15, lineHeight: 21, fontWeight: '600' },
  secondary: { backgroundColor: colors.soft, borderColor: colors.line, borderWidth: 1 },
  disabled: { opacity: 0.45 },
  notice: { padding: 14, backgroundColor: '#FBF4E9', borderLeftWidth: 3, borderLeftColor: colors.red },
  noticeText: { color: colors.text, fontSize: 13, lineHeight: 20 },
  field: { gap: 7 },
  label: { color: colors.text, fontSize: 14, fontWeight: '600' },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    color: colors.text,
    fontSize: 16,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 3,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.green, borderColor: colors.green },
  chipText: { color: colors.green, fontSize: 14, fontWeight: '600' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 3,
  },
  stepButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 24, color: colors.green },
  quantity: { minWidth: 32, textAlign: 'center', fontSize: 16, color: colors.text },
  rule: { height: 1, backgroundColor: colors.line },
  footer: { color: colors.muted, fontSize: 12, lineHeight: 20, textAlign: 'center', marginTop: 10 },
});

import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Redirect, type Href } from 'expo-router';
import { useCatering } from './store';
import { colors, s } from './ui';

/** Vänta på serverns besked innan interna testlänkar bedöms. */
export function LegacyBoundary({ children, fallback }: PropsWithChildren<{ fallback: Href }>) {
  const { catalog, loading } = useCatering();
  if (catalog.test_mode === true) return children;
  if (loading) return <View style={[s.screen, { padding: 24, gap: 16, justifyContent: 'center' }]}><ActivityIndicator color={colors.green} /><Text style={s.body}>Hämtar aktuellt innehåll…</Text></View>;
  return <Redirect href={fallback} />;
}

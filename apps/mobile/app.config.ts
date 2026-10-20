import type { ConfigContext, ExpoConfig } from 'expo/config';

// APP_ENV påverkar appens identitet, aldrig kundens data eller API-behörigheter.
export default ({ config }: ConfigContext): ExpoConfig => {
  const environment = process.env.APP_ENV || 'development';
  const suffix = environment === 'production' ? '' : environment === 'preview' ? '.preview' : '.dev';
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || 'a93fde8c-7227-4824-af1f-9bcffe77221d';
  return {
    ...config,
    name: `Cedar Mezze${suffix === '.dev' ? ' Dev' : suffix === '.preview' ? ' Test' : ''}`,
    slug: 'cedar-mezze',
    owner: 'sharbel1423',
    version: '4.4.0',
    scheme: `cedarmezze${suffix.replace('.', '-')}`,
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    icon: './assets/icon.png',
    ios: {
      supportsTablet: true,
      bundleIdentifier: `se.cedarmezze.app${suffix}`,
      config: { usesNonExemptEncryption: false },
    },
    android: { package: `se.cedarmezze.app${suffix}` },
    web: { bundler: 'metro', output: 'static', favicon: './assets/icon.png' },
    plugins: [
      'expo-router',
      'expo-secure-store',
      '@react-native-community/datetimepicker',
      ['expo-notifications', { color: '#155A43', defaultChannel: 'orders' }],
      ['expo-splash-screen', { image: './assets/icon.png', imageWidth: 160, backgroundColor: '#FFFFFF' }],
    ],
    experiments: { typedRoutes: true },
    extra: {
      appEnvironment: environment,
      ...(environment === 'test' && process.env.EXPO_PUBLIC_REMOTE_TEST === 'true'
        ? { remoteTestApiOrigin: process.env.EXPO_PUBLIC_API_URL } : {}),
      ...(projectId ? { eas: { projectId } } : {}),
    },
  };
};

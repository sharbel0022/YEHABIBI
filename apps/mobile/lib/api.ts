import { Linking, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { fetch as expoFetch } from 'expo/fetch';
import { createApiClient } from '@yehabibi/api-client';
import { localApiStorageKey, safeExternalUrl, safePaymentUrl, type OrderReference } from '@yehabibi/shared';
import { createRemoteDeviceAuth, createRemoteTestFetch, remoteTestConfiguration, remoteTestStorageKey } from './remote-test';

export const apiUrl = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');
export type { OrderReference } from '@yehabibi/shared';
export const remoteTest = remoteTestConfiguration({
  requested: process.env.EXPO_PUBLIC_REMOTE_TEST === 'true',
  development: typeof __DEV__ !== 'undefined' && __DEV__,
  environment: Constants.expoConfig?.extra?.appEnvironment || '',
  apiUrl,
});
const scopedStorageKey = (key: string) => remoteTest.requested ? remoteTestStorageKey(key, apiUrl) : localApiStorageKey(key, apiUrl);
const storageKey = scopedStorageKey('cedar-mezze-orders-v1');
const draftKey = scopedStorageKey('cedar-mezze-selection-v4');
const requestKey = scopedStorageKey('cedar-mezze-request-v1');
const remoteCredentialKey = scopedStorageKey('cedar-mezze-remote-device-v443');
export const remoteDeviceAuth = createRemoteDeviceAuth({
  automatic: true,
  configuration: remoteTest,
  native: Platform.OS !== 'web',
  // Ingen webbläsarlagring eller offentlig miljövariabel innehåller enhetens credential.
  storage: {
    read: () => SecureStore.getItemAsync(remoteCredentialKey),
    write: value => SecureStore.setItemAsync(remoteCredentialKey, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
    remove: () => SecureStore.deleteItemAsync(remoteCredentialKey),
  },
  randomBytes: async () => (await import('expo-crypto')).getRandomBytesAsync(32),
  // RN:s globala XHR-fetch kan följa redirects trots redirect:'error'. Expo stoppar dem nativt.
  fetch: expoFetch,
});

// Bara adressen och utvecklingsläget är mobilspecifika; kontrakt/fel delas med webben.
export const api = createApiClient({
  baseUrl: apiUrl,
  requireBaseUrl: true,
  allowHttp: typeof __DEV__ !== 'undefined' && __DEV__ && !remoteTest.requested,
  allowPrivateRemoteTest: remoteTest.enabled,
  fetch: createRemoteTestFetch({ configuration: remoteTest, auth: remoteDeviceAuth, fetch: remoteTest.enabled ? expoFetch : undefined }),
});
export const getCatalog = api.getCatalog;
export const getOrder = api.getOrderStatus;

export async function readOrderReferences(): Promise<OrderReference[]> {
  const value =
    Platform.OS === 'web'
      ? typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem(storageKey)
        : null
      : await SecureStore.getItemAsync(storageKey);
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed)
    ? parsed
        .filter(
          (item): item is OrderReference =>
            item &&
            typeof item.code === 'string' &&
            typeof item.token === 'string' &&
            item.code.length < 100 &&
            item.token.length < 300,
        )
        .slice(0, 20)
    : [];
}

export async function saveOrderReferences(references: OrderReference[]) {
  const value = JSON.stringify(references.slice(0, 20));
  if (Platform.OS === 'web') sessionStorage.setItem(storageKey, value);
  else await SecureStore.setItemAsync(storageKey, value);
}

// Endast menyval sparas i utkastet. Kontaktuppgifter stannar i formuläret.
export async function readMenuDraft(): Promise<unknown> {
  const value = Platform.OS === 'web'
    ? typeof localStorage !== 'undefined' ? localStorage.getItem(draftKey) : null
    : await SecureStore.getItemAsync(draftKey);
  return value ? JSON.parse(value) : null;
}

export async function saveMenuDraft(selection: unknown) {
  const value = JSON.stringify(selection);
  if (Platform.OS === 'web') localStorage.setItem(draftKey, value);
  else await SecureStore.setItemAsync(draftKey, value);
}

// Ett återförsöks-ID är ingen behörighetsnyckel. Samma förfrågan använder samma ID.
export function newRequestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value & 3) | 8).toString(16);
  });
}

// Endast SHA-256 och UUID sparas, aldrig formulärets kontaktuppgifter.
// En identisk förfrågan kan därför återförsökas även efter att appen startats om.
export async function persistentRequestId(payload: string) {
  const Crypto = await import('expo-crypto');
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, payload);
  const previous = Platform.OS === 'web' ? sessionStorage.getItem(requestKey) : await SecureStore.getItemAsync(requestKey);
  const saved = previous ? JSON.parse(previous) : null;
  if (saved?.hash === hash && typeof saved.id === 'string' && /^[a-f0-9-]{36}$/i.test(saved.id)) return saved.id as string;
  const id = Crypto.randomUUID();
  const value = JSON.stringify({ hash, id });
  if (Platform.OS === 'web') sessionStorage.setItem(requestKey, value);
  else await SecureStore.setItemAsync(requestKey, value);
  return id;
}

export async function clearRequestId() {
  if (Platform.OS === 'web') sessionStorage.removeItem(requestKey);
  else await SecureStore.deleteItemAsync(requestKey);
}

export async function registerOrderPush(reference: OrderReference, testMode = false) {
  if (testMode) {
    const catalog = await api.getCatalog();
    if (catalog.test_mode !== true) throw new Error('Servern har inte verifierat ett isolerat testläge.');
    return api.registerOrderPush(reference, 'ExpoPushToken[isolated_test_device_0001]');
  }
  if (Platform.OS === 'web' || Constants.appOwnership === 'expo') {
    throw new Error('Pushnotiser kräver den installerade utvecklingsappen eller EAS-appen. I Expo Go följer du status här och via e-post.');
  }
  const Device = await import('expo-device');
  if (!Device.isDevice) throw new Error('Pushnotiser behöver provas på en fysisk iPhone eller Android.');
  // Ladda inte native-modulen i Expo Go, som saknar stöd för fjärrnotiser.
  const Notifications = await import('expo-notifications');
  Notifications.setNotificationHandler({ handleNotification: async () => ({
    shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true,
  }) });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('orders', {
      name: 'Beställningar', importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const permission = await Notifications.getPermissionsAsync();
  const granted = permission.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) throw new Error('Notiser är inte tillåtna. Du kan ändra detta i telefonens inställningar.');
  const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) throw new Error('Expo-projektet för pushnotiser är inte konfigurerat.');
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  await api.registerOrderPush(reference, token.data);
}

export async function openWebsite(value: string | null | undefined, checkout = false, verifiedTestMode = false) {
  const url = checkout ? safePaymentUrl(value, apiUrl, verifiedTestMode, remoteTest.enabled) : safeExternalUrl(value);
  if (!url) {
    throw new Error('Den här länken är inte tillgänglig. Kontakta Yei Habibi.');
  }
  // Leverantören hanterar eventuellt appbyte och SCA på sin officiella sida.
  // Återkomsten är aldrig en betalningsbekräftelse; kunden läser backend igen.
  if (checkout) await Linking.openURL(url);
  else await WebBrowser.openBrowserAsync(url);
}

export async function openPolicy(path: '/villkor' | '/integritet') {
  if (!apiUrl) throw new Error('Företagets webbplats är ännu inte konfigurerad.');
  const url = new URL(path, `${apiUrl}/`);
  if (url.protocol !== 'https:' && !(__DEV__ && url.protocol === 'http:')) {
    throw new Error('Företagets webbplats måste använda HTTPS.');
  }
  await WebBrowser.openBrowserAsync(url.toString());
}

// Samma tydligt avstängda förhandsvisning som på webben.
export { previewCatalog as demoCatalog } from '@yehabibi/shared';

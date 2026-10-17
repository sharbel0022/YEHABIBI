import { Linking, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { safeExternalUrl, type Catalog, type PublicOrder } from '@yehabibi/shared';

export const apiUrl = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');
export type OrderReference = { code: string; token: string };
const storageKey = 'cedar-mezze-orders-v1';

// Bara publika API-anrop här. Databas- och Stripe-nycklar finns endast på servern.
export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (!apiUrl) throw new Error('API-adressen saknas. Appen visar en demonstration.');
  const endpoint = new URL(apiUrl);
  if (
    endpoint.protocol !== 'https:' &&
    !(typeof __DEV__ !== 'undefined' && __DEV__ && endpoint.protocol === 'http:')
  ) {
    throw new Error('API-adressen måste använda HTTPS i en publicerad app.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(typeof data.error === 'string' ? data.error : 'Kunde inte nå servern. Försök igen.');
    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Servern svarade inte i tid. Försök igen om en stund.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const getCatalog = () => request<Catalog>('/api/catalog');
export const getOrder = ({ code, token }: OrderReference) =>
  request<{ order: PublicOrder }>(
    `/api/orders/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}`,
  );

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

export async function openWebsite(value: string | null | undefined, checkout = false) {
  const url = safeExternalUrl(value);
  if (!url || (checkout && new URL(url).hostname !== 'checkout.stripe.com')) {
    throw new Error('Den här länken är inte tillgänglig. Kontakta Cedar Mezze.');
  }
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

// V2:s exempelmenyer ger en tydlig förhandsvisning utan påhittade priser/order.
export const demoCatalog: Catalog = {
  demo: true,
  orders_enabled: false,
  dishes: [],
  campaigns: [],
  delivery_zones: [],
  payment_methods: [],
  menus: [
    {
      id: 'demo-mezze',
      slug: 'mezze-klassiker',
      title: 'Mezze Klassiker',
      description: 'Ett generöst urval kalla och varma libanesiska favoriter.',
      included: ['Hummus', 'Baba ganoush', 'Tabbouleh', 'Falafel', 'Vinblad'],
      allergens: ['Sesam', 'Vete'],
      price_ore: 0,
      min_people: 10,
      image_url: '/images/mezze.webp',
      active: true,
      sort_order: 1,
    },
    {
      id: 'demo-grill',
      slug: 'grill-och-mezze',
      title: 'Grill & Mezze',
      description: 'Det bästa från grillen tillsammans med klassiska mezerätter.',
      included: ['Kafta', 'Kycklingspett', 'Hummus', 'Sallad', 'Ris'],
      allergens: ['Sesam', 'Vete'],
      price_ore: 0,
      min_people: 10,
      image_url: '/images/grill.webp',
      active: true,
      sort_order: 2,
    },
    {
      id: 'demo-fest',
      slug: 'familjebuffe',
      title: 'Familjebuffé',
      description: 'En festlig buffé för stora och små sällskap.',
      included: ['Blandade meze', 'Grillrätter', 'Sallader', 'Bröd'],
      allergens: ['Sesam', 'Vete'],
      price_ore: 0,
      min_people: 15,
      image_url: '/images/fest.webp',
      active: true,
      sort_order: 3,
    },
  ],
  settings: {
    id: 1,
    brand_name: 'Cedar Mezze',
    tagline: 'Mer än mat – en del av vår kultur.',
    description: 'Äkta libanesiska smaker för hem, fest och företag.',
    service_area: 'Västerås med omnejd (bekräftas före lansering)',
    location_city: 'Västerås',
    contact_email: '',
    contact_phone: '',
    hero_video_url: null,
    hero_poster_url: '/images/hero.webp',
    google_review_url: null,
    google_maps_url: null,
    instagram_url: null,
    facebook_url: null,
    tiktok_url: null,
    pickup_address: '',
    delivery_enabled: true,
    pickup_enabled: true,
    cash_enabled: false,
    delivery_fee_ore: 0,
    min_advance_days: 2,
    custom_min_people: 5,
    delivery_zones: [],
    campaign_title: '',
    campaign_description: '',
    campaign_image_url: null,
    campaign_start_date: null,
    campaign_end_date: null,
    campaign_enabled: false,
  },
};

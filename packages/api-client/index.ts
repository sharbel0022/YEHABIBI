import type {
  Catalog, Menu, OnlinePaymentMethod, OrderInput, OrderReceipt, OrderReference, OrderStatusResponse,
  PaymentSessionResponse, PushRegistrationResponse, Settings, AvailabilityInput, AvailabilityResponse, DirectOrderInput,
} from '@yehabibi/shared';
import { safePaymentUrl } from '@yehabibi/shared';

export type ApiErrorKind = 'configuration' | 'network' | 'timeout' | 'aborted' | 'http' | 'response';

/** Samma läsbara fel på webben och i appen; status finns kvar för t.ex. en ny offert. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(message: string, kind: ApiErrorKind, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

export type ApiClientOptions = {
  /** Tom adress använder webbens befintliga origin. Expo anger EXPO_PUBLIC_API_URL. */
  baseUrl?: string;
  requireBaseUrl?: boolean;
  /** HTTP får bara aktiveras uttryckligen i lokal utveckling. */
  allowHttp?: boolean;
  timeoutMs?: number;
  fetch?: typeof fetch;
};
export type RequestOptions = { signal?: AbortSignal };

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function isCatalog(value: unknown): value is Catalog {
  return isObject(value) && Array.isArray(value.dishes) && Array.isArray(value.menus) &&
    Array.isArray(value.campaigns) && Array.isArray(value.delivery_zones) &&
    Array.isArray(value.payment_methods) && isObject(value.settings) &&
    typeof value.demo === 'boolean' && typeof value.orders_enabled === 'boolean' &&
    (value.direct_orders_enabled === undefined || typeof value.direct_orders_enabled === 'boolean') &&
    (value.test_mode === undefined || typeof value.test_mode === 'boolean');
}

function isOrderResponse(value: unknown): value is OrderStatusResponse {
  return isObject(value) && isObject(value.order) && typeof value.order.code === 'string' &&
    typeof value.order.status === 'string' && typeof value.order.payment_status === 'string' &&
    Number.isSafeInteger(value.order.total_ore) && Array.isArray(value.order.items);
}

function isReceipt(value: unknown): value is OrderReceipt {
  return isObject(value) && typeof value.code === 'string' && typeof value.token === 'string' &&
    typeof value.tracking_url === 'string';
}

function isAvailability(value:unknown):value is AvailabilityResponse {
  const instant=(input:unknown)=>typeof input==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(input) && Number.isFinite(Date.parse(input));
  const money=(input:unknown)=>Number.isSafeInteger(input) && Number(input)>=0;
  return isObject(value) && instant(value.server_now) &&
    value.timezone==='Europe/Stockholm' && typeof value.enabled==='boolean' && typeof value.pickup_address==='string' &&
    money(value.total_ore) && money(value.subtotal_ore) && money(value.delivery_fee_ore) &&
    money(value.preparation_minutes) && (value.reason===undefined || typeof value.reason==='string') &&
    (value.delivery_zone_id===null || typeof value.delivery_zone_id==='string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value.delivery_zone_id)) &&
    (value.kitchen_units===undefined || money(value.kitchen_units)) &&
    (value.delivery_window_minutes===undefined || money(value.delivery_window_minutes)) &&
    (value.lines===undefined || Array.isArray(value.lines) && value.lines.every(line=>isObject(line) && typeof line.title==='string' &&
      money(line.unit_price_ore) && money(line.total_ore) && Number.isSafeInteger(line.quantity) && Number(line.quantity)>0)) &&
    Array.isArray(value.slots) && value.slots.every(slot=>isObject(slot) && typeof slot.starts_at==='string' &&
      instant(slot.starts_at) && typeof slot.label==='string' && typeof slot.event_date==='string' &&
      (slot.ends_at===undefined || instant(slot.ends_at)) && (slot.preparation_starts_at===undefined || instant(slot.preparation_starts_at)) &&
      typeof slot.event_time==='string' && Number.isInteger(slot.remaining_capacity) && Number(slot.remaining_capacity)>0);
}

function isPaymentSession(value: unknown, origin: string, verifiedTestMode: boolean): value is PaymentSessionResponse {
  if (!isObject(value) || typeof value.checkout_url !== 'string' ||
      !['unpaid', 'pending', 'paid', 'failed', 'refunded'].includes(String(value.payment_status))) return false;
  if (value.test_mode !== undefined && typeof value.test_mode !== 'boolean' ||
      value.test_mode === true && !verifiedTestMode || verifiedTestMode && value.test_mode !== true) return false;
  return Boolean(safePaymentUrl(value.checkout_url, origin, verifiedTestMode && value.test_mode === true));
}

function apiBase(options: ApiClientOptions) {
  const base = (options.baseUrl || '').trim().replace(/\/+$/, '');
  if (!base && !options.requireBaseUrl) return '';
  if (!base) throw new ApiError('API-adressen saknas. Appen visar en demonstration.', 'configuration');
  let url: URL;
  try { url = new URL(base); }
  catch { throw new ApiError('API-adressen är felaktig. Kontrollera appens konfiguration.', 'configuration'); }
  if (url.protocol !== 'https:' && !(options.allowHttp && url.protocol === 'http:')) {
    throw new ApiError('API-adressen måste använda HTTPS i en publicerad app.', 'configuration');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ApiError('API-adressen får inte innehålla inloggningsuppgifter, sökvillkor eller fragment.', 'configuration');
  }
  return base;
}

/** Publika kontrakt till en enda Next.js-backend. Inga databas- eller betalningsnycklar behövs. */
export function createApiClient(options: ApiClientOptions = {}) {
  const timeoutMs = options.timeoutMs ?? 15000;
  let verifiedTestMode = false;
  const paymentOrigin = () => apiBase(options) || (typeof location !== 'undefined' ? location.origin : '');

  async function request<T>(
    path: string, valid: (value: unknown) => value is T,
    init: RequestInit = {}, requestOptions: RequestOptions = {},
  ): Promise<T> {
    const base = apiBase(options);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new ApiError('API:ts tidsgräns måste vara större än noll.', 'configuration');
    }
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    if (requestOptions.signal?.aborted) abort();
    requestOptions.signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await (options.fetch ?? globalThis.fetch)(`${base}${path}`, {
        ...init,
        cache: 'no-store',
        signal: controller.signal,
        headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      });
      const data: unknown = await response.json().catch(error => {
        if (controller.signal.aborted) throw error;
        return null;
      });
      if (!response.ok) {
        const message = isObject(data) && typeof data.error === 'string'
          ? data.error : 'Kunde inte nå servern. Försök igen.';
        throw new ApiError(message, 'http', response.status);
      }
      if (!valid(data)) {
        throw new ApiError('Servern svarade inte med giltiga uppgifter. Försök igen eller kontakta köket.', 'response');
      }
      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (timedOut) throw new ApiError('Servern svarade inte i tid. Försök igen om en stund.', 'timeout');
      if (controller.signal.aborted) throw new ApiError('Hämtningen avbröts. Du kan försöka igen.', 'aborted');
      throw new ApiError('Kunde inte ansluta till servern. Kontrollera din anslutning och försök igen.', 'network');
    } finally {
      clearTimeout(timeout);
      requestOptions.signal?.removeEventListener('abort', abort);
    }
  }

  const orderPath = ({ code, token }: OrderReference) =>
    `/api/orders/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}`;
  const getCatalog = async (requestOptions?: RequestOptions) => {
    try {
      const catalog = await request('/api/catalog', isCatalog, {}, requestOptions);
      verifiedTestMode = catalog.test_mode === true;
      return catalog;
    } catch (error) { verifiedTestMode = false; throw error; }
  };

  return {
    getCatalog,
    // Meny och företagsinställningar hämtas ur samma katalog; inga parallella routes.
    async getMenu(idOrSlug: string, requestOptions?: RequestOptions): Promise<Menu | null> {
      const catalog = await getCatalog(requestOptions);
      return catalog.menus.find(menu => menu.id === idOrSlug || menu.slug === idOrSlug) ?? null;
    },
    async getSettings(requestOptions?: RequestOptions): Promise<Settings> {
      return (await getCatalog(requestOptions)).settings;
    },
    createOrder(input: OrderInput, requestOptions?: RequestOptions) {
      return request('/api/orders', isReceipt, { method: 'POST', body: JSON.stringify(input) }, requestOptions);
    },
    getAvailability(input: AvailabilityInput, requestOptions?: RequestOptions) {
      return request('/api/availability',isAvailability,{method:'POST',body:JSON.stringify(input)},requestOptions);
    },
    createDirectOrder(input: DirectOrderInput, requestOptions?: RequestOptions) {
      return request('/api/orders/direct',isReceipt,{method:'POST',body:JSON.stringify(input)},requestOptions);
    },
    getOrderStatus(reference: OrderReference, requestOptions?: RequestOptions) {
      return request(orderPath(reference), isOrderResponse, {}, requestOptions);
    },
    async createPayment(reference: OrderReference, method: OnlinePaymentMethod, requestOptions?: RequestOptions) {
      const result = await request('/api/payments/create', (value): value is PaymentSessionResponse =>
        isPaymentSession(value, paymentOrigin(), verifiedTestMode), {
        method: 'POST', body: JSON.stringify({ code:reference.code, token:reference.token, payment_method: method }),
      }, requestOptions);
      const url = safePaymentUrl(result.checkout_url, paymentOrigin(), verifiedTestMode && result.test_mode === true);
      if (!url) throw new ApiError('Betalningslänken kunde inte verifieras.', 'response');
      return { ...result, checkout_url: url };
    },
    getPaymentStatus(reference: OrderReference, requestOptions?: RequestOptions) {
      return request(`/api/payments/status?code=${encodeURIComponent(reference.code)}&token=${encodeURIComponent(reference.token)}`,
        isOrderResponse, {}, requestOptions);
    },
    acceptPriceChange(reference: OrderReference, revision: number, requestOptions?: RequestOptions) {
      return request(orderPath(reference), isOrderResponse, {
        method: 'PATCH', body: JSON.stringify({ action: 'accept_changes', revision }),
      }, requestOptions);
    },
    registerOrderPush(reference: OrderReference, pushToken: string, requestOptions?: RequestOptions) {
      const registered = (value: unknown): value is PushRegistrationResponse =>
        isObject(value) && value.registered === true;
      return request(orderPath(reference), registered, {
        method: 'PATCH', body: JSON.stringify({ action: 'register_push', push_token: pushToken }),
      }, requestOptions);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

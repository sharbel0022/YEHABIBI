import { ApiError } from '@yehabibi/api-client';

export type RemoteTestConfiguration = { requested: boolean; enabled: boolean; origin: string; error: string };

/** Ingen behörighet följer med Metro-paketet. Miljöflaggan väljer bara ett strikt kontrakt. */
export function remoteTestConfiguration(input: { requested: boolean; development: boolean; environment: string; apiUrl: string }): RemoteTestConfiguration {
  const result = { requested: input.requested, enabled: false, origin: '', error: '' };
  if (!input.requested) return result;
  if (!input.development || input.environment !== 'test') {
    return { ...result, error: 'Privat fjärrtestning kräver Expo i utvecklingsläge och APP_ENV=test.' };
  }
  try {
    const url = new URL(input.apiUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+ts\.net$/i.test(url.hostname)) throw new Error('origin');
    return { ...result, enabled: true, origin: url.origin };
  } catch {
    return { ...result, error: 'Privat fjärrtestning kräver den exakta privata HTTPS-adressen från dev:remote.' };
  }
}

export function validRemoteTestCredential(value: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** Testbackendens orderreferenser och enhetsbehörighet delar aldrig produktionens lagringsnycklar. */
export function remoteTestStorageKey(key: string, origin: string) {
  const scope = Array.from(origin).map(character => character.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  return `${key}.remote-${scope}`;
}

/** 256 slumpbitar från expo-crypto. Ingen btoa-, Math.random- eller URL-lagring behövs. */
export function remoteDeviceCredential(bytes: Uint8Array) {
  if (bytes.length !== 32) throw new Error('Enhetsregistreringen kräver 32 säkra slumpbyte.');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '', bits = 0, value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 6) { bits -= 6; result += alphabet[(value >>> bits) & 63]; }
  }
  if (bits) result += alphabet[(value << (6 - bits)) & 63];
  return result;
}

export type RemoteDeviceEnrollment = { id: string; comparison_code: string; status: 'pending'; expires_at: string } | { id: string; status: 'approved' };
export type RemoteDeviceState = {
  status: 'unregistered' | 'saved' | 'pending' | 'approved' | 'unavailable' | 'revoked' | 'invalid' | 'locked';
  saved: boolean;
  forgetting: boolean;
  message: string;
  enrollment?: RemoteDeviceEnrollment;
};
const connectionMessage = 'Kunde inte nå den privata testservern. Kontrollera datorn, internet och Tailscale på telefonen. Anslutningen återupptas automatiskt när de är tillgängliga.';
const interrupted = () => new ApiError('Anslutningsförsöket avbröts. Anslut igen för att fortsätta.', 'aborted');
const blockedStatus = (status: RemoteDeviceState['status']) => status === 'revoked' || status === 'invalid' || status === 'locked';
class RemoteDeviceDenied extends ApiError {}

/** Hemligheten lämnar bara SecureStore för exakt privat HTTPS-origin; sessionen finns enbart i minnet. */
export function createRemoteDeviceAuth(options: {
  automatic?: boolean;
  configuration: RemoteTestConfiguration;
  native: boolean;
  storage: { read: () => Promise<string | null>; write: (value: string) => Promise<void>; remove: () => Promise<void> };
  randomBytes: () => Promise<Uint8Array>;
  fetch?: typeof fetch;
  now?: () => number;
}) {
  let credential = '', token = '', expiresAt = 0, generation = 0, loaded = false;
  let state: RemoteDeviceState = { status: 'unregistered', saved: false, forgetting: false, message: '' };
  let reading: Promise<boolean> | undefined;
  let enrolling: Promise<RemoteDeviceEnrollment> | undefined;
  let refreshing: Promise<string> | undefined;
  let removing: Promise<void> | undefined;
  let storageMutation = Promise.resolve();
  const listeners = new Set<() => void>();
  const now = options.now ?? Date.now;
  const emit = (patch: Partial<RemoteDeviceState>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  const guard = () => {
    if (!options.configuration.enabled) throw new ApiError(options.configuration.error || 'Privat fjärrtestning är avstängd.', 'configuration');
    if (!options.native) throw new ApiError('Registrera telefonen i Expo Go på iPhone eller Android. Enhetsnycklar sparas bara i telefonens SecureStore; fjärrregistrering i webbläsaren stöds inte.', 'configuration');
    if (state.forgetting) throw new ApiError('Telefonens registrering tas bort. Vänta tills det är klart.', 'aborted');
  };
  const assertCurrent = (attempt: number) => { if (attempt !== generation) throw interrupted(); };
  const mutateStorage = (action: () => Promise<void>) => {
    const next = storageMutation.catch(() => {}).then(action);
    storageMutation = next;
    return next;
  };
  const invalidateSession = (rejectedToken?: string) => {
    if (!rejectedToken || rejectedToken === token) { token = ''; expiresAt = 0; }
  };
  const markUnavailable = (message = connectionMessage) => {
    invalidateSession();
    if (!blockedStatus(state.status)) emit({ status: 'unavailable', message });
  };
  const rejectDevice = (code: 'device_revoked' | 'device_invalid' | 'device_pending') => {
    invalidateSession();
    const status = code === 'device_revoked' ? 'revoked' : code === 'device_invalid' ? 'invalid' : 'pending';
    const message = status === 'revoked' ? 'Datorn har återkallat den här telefonens behörighet. Glöm registreringen och be datorn godkänna telefonen igen.'
      : status === 'invalid' ? 'Telefonens registrering är ogiltig eller har återställts på datorn. Glöm registreringen och godkänn telefonen igen.'
        : 'Telefonen väntar på godkännande från datorn. Jämför koden på båda skärmarna.';
    if (status !== 'pending') { generation++; refreshing = undefined; enrolling = undefined; reading = undefined; }
    emit({ status, message });
    return new RemoteDeviceDenied(message, 'http', 401);
  };

  async function load() {
    guard();
    if (loaded) return Boolean(credential);
    if (reading) return reading;
    const attempt = generation;
    const promise = (async () => {
      const saved = await options.storage.read();
      assertCurrent(attempt);
      credential = saved && validRemoteTestCredential(saved) ? saved : '';
      loaded = true;
      emit({ saved: Boolean(credential), status: saved && !credential && !options.automatic ? 'invalid' : credential ? 'saved' : 'unregistered',
        message: saved && !credential ? 'Telefonens sparade registrering är ogiltig. Glöm registreringen och godkänn telefonen på datorn igen.' : '' });
      return Boolean(credential);
    })();
    reading = promise;
    try { return await promise; } finally { if (reading === promise) reading = undefined; }
  }

  async function exchange(path: '/__remote/device/enroll' | '/__remote/device/session', attempt: number): Promise<Record<string, unknown>> {
    guard(); assertCurrent(attempt);
    if (!validRemoteTestCredential(credential)) throw new ApiError('Registrera och godkänn telefonen på datorn första gången.', 'configuration');
    // Ingen inkommande URL eller redirect kan styra vart enhetshemligheten skickas.
    const address = new URL(path, options.configuration.origin);
    if (address.origin !== options.configuration.origin) throw new ApiError('Felaktig privat testadress.', 'configuration');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await (options.fetch ?? globalThis.fetch)(address.href, {
        method: 'POST', body: JSON.stringify({ credential }), headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        redirect: 'error', credentials: 'omit', cache: 'no-store', signal: controller.signal,
      });
      assertCurrent(attempt);
      const data = await response.json().catch(() => null) as Record<string, unknown> | null;
      assertCurrent(attempt);
      if (!response.ok) {
        const code = data?.code;
        if (response.status === 401 && (code === 'device_revoked' || code === 'device_invalid' || code === 'device_pending')) {
          throw rejectDevice(code);
        }
        markUnavailable(response.status === 403 ? 'Den privata Tailscale-anslutningen kunde inte verifieras. Kontrollera Tailscale på telefonen och datorn. Telefonens registrering finns kvar.' : connectionMessage);
        throw new ApiError(state.message, 'http', response.status);
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ApiError('Testservern svarade inte med giltiga uppgifter.', 'response');
      return data;
    } catch (error) {
      if (error instanceof RemoteDeviceDenied) throw error;
      assertCurrent(attempt);
      if (error instanceof ApiError) throw error;
      markUnavailable();
      throw new ApiError(connectionMessage, 'network');
    } finally { clearTimeout(timer); }
  }

  async function enroll() {
    guard();
    if (enrolling) return enrolling;
    const attempt = generation;
    const promise = (async () => {
      await load(); assertCurrent(attempt);
      if (blockedStatus(state.status)) throw new ApiError(state.message || 'Anslut telefonen igen.', 'configuration');
      if (!credential) {
        const generated = remoteDeviceCredential(await options.randomBytes());
        assertCurrent(attempt);
        // Spara före första nätverksanropet: ett förlorat svar får aldrig skapa en ny enhet.
        await mutateStorage(() => options.storage.write(generated));
        assertCurrent(attempt);
        credential = generated;
        emit({ saved: true, status: 'saved', message: '' });
      }
      const data = await exchange('/__remote/device/enroll', attempt);
      if (typeof data.id !== 'string' || !/^[A-Za-z0-9_-]{4,100}$/.test(data.id) ||
          !['pending', 'approved'].includes(String(data.status)) || data.status === 'pending' &&
          (typeof data.comparison_code !== 'string' || !/^[A-Za-z0-9 -]{4,100}$/.test(data.comparison_code) || typeof data.expires_at !== 'string')) {
        throw new ApiError('Testservern svarade inte med giltiga registreringsuppgifter.', 'response');
      }
      assertCurrent(attempt);
      const enrollment = data as RemoteDeviceEnrollment;
      emit({ enrollment, status: enrollment.status, message: enrollment.status === 'pending' ? 'Väntar på godkännande på datorn.' : '' });
      return enrollment;
    })();
    enrolling = promise;
    try { return await promise; } finally { if (enrolling === promise) enrolling = undefined; }
  }

  async function getSessionToken() {
    guard();
    const attempt = generation;
    await load(); assertCurrent(attempt);
    if (blockedStatus(state.status)) throw new ApiError(state.message || 'Appen är låst. Välj Anslut igen för att fortsätta.', 'configuration');
    if (token && expiresAt > now() + 30000) return token;
    if (refreshing) return refreshing;
    const promise = (async () => {
      if (options.automatic && state.status !== 'approved') await enroll();
      const data = await exchange('/__remote/device/session', attempt);
      const expiration = typeof data.expires_at === 'string' ? Date.parse(data.expires_at) : NaN;
      if (typeof data.token !== 'string' || !validRemoteTestCredential(data.token) || !Number.isFinite(expiration) || expiration <= now()) {
        throw new ApiError('Testservern svarade inte med en giltig testsession.', 'response');
      }
      assertCurrent(attempt);
      token = data.token; expiresAt = expiration;
      emit({ status: 'approved', message: '' });
      return token;
    })();
    refreshing = promise;
    try { return await promise; } finally { if (refreshing === promise) refreshing = undefined; }
  }

  function lock() {
    generation++; invalidateSession(); enrolling = undefined; refreshing = undefined; reading = undefined;
    emit({ status: 'locked', message: 'Testappen är låst på den här telefonen. Välj Anslut igen för att fortsätta.' });
  }
  function unlock() {
    if (state.forgetting) return;
    if (state.status === 'locked') emit({ status: credential ? 'saved' : 'unregistered', message: '' });
  }
  function forget() {
    if (removing) return removing;
    emit({ forgetting: true });
    lock();
    // Behåll lås och minne om SecureStore inte kan rensas. Ingen bakgrundsanslutning får vinna loppet.
    const promise = (async () => {
      try {
        await mutateStorage(() => options.storage.remove());
        generation++; invalidateSession();
        credential = ''; loaded = true;
        emit({ saved: false, status: 'unregistered', message: '', enrollment: undefined });
      } finally {
        emit({ forgetting: false });
        removing = undefined;
      }
    })();
    removing = promise;
    return promise;
  }
  return {
    load, enroll, getSessionToken, invalidateSession, markUnavailable, rejectDevice, lock, unlock, forget,
    generation: () => generation,
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

export type RemoteDeviceAuth = ReturnType<typeof createRemoteDeviceAuth>;

/** Alla kund-API:er använder kortlivad session; enhetens credential skickas aldrig till kund-API:et. */
export function createRemoteTestFetch(options: {
  configuration: RemoteTestConfiguration;
  auth: Pick<RemoteDeviceAuth, 'getSessionToken' | 'invalidateSession' | 'markUnavailable' | 'rejectDevice' | 'generation'>;
  fetch?: typeof fetch;
}): typeof fetch {
  return async (input, init) => {
    const { configuration, auth } = options;
    if (configuration.error) throw new ApiError(configuration.error, 'configuration');
    if (!configuration.enabled) return (options.fetch ?? globalThis.fetch)(input, init);
    const address = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(address);
    if (url.origin !== configuration.origin || url.username || url.password || !url.pathname.startsWith('/api/')) {
      throw new ApiError('Testbehörigheten får bara skickas till den godkända privata testservern.', 'configuration');
    }
    const attempt = auth.generation();
    const assertCurrent = () => { if (attempt !== auth.generation()) throw interrupted(); };
    try {
      let session = await auth.getSessionToken();
      assertCurrent();
      const send = () => {
        const headers = new Headers(input instanceof Request ? input.headers : undefined);
        new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
        headers.set('X-Yehabibi-Remote-Token', session);
        return (options.fetch ?? globalThis.fetch)(input instanceof Request ? input.clone() : input, { ...init, headers, redirect: 'error', credentials: 'omit' });
      };
      let response = await send();
      assertCurrent();
      const denial = response.status === 401 ? await response.clone().json().catch(() => null) : null;
      assertCurrent();
      if (denial?.code === 'device_revoked' || denial?.code === 'device_invalid' || denial?.code === 'device_pending') throw auth.rejectDevice(denial.code);
      // Endast en gateway-avvisning FÖRE upstream får spelas om. En kundorders 401 får inte upprepas.
      if (denial?.code === 'remote_session_invalid') {
        assertCurrent();
        auth.invalidateSession(session);
        session = await auth.getSessionToken();
        assertCurrent();
        response = await send();
        assertCurrent();
        const secondDenial = response.status === 401 ? await response.clone().json().catch(() => null) : null;
        assertCurrent();
        if (secondDenial?.code === 'device_revoked' || secondDenial?.code === 'device_invalid' || secondDenial?.code === 'device_pending') throw auth.rejectDevice(secondDenial.code);
        if (secondDenial?.code === 'remote_session_invalid') {
          auth.markUnavailable('Testsessionen kunde inte verifieras. Appen försöker ansluta igen automatiskt.');
          throw new ApiError('Testsessionen kunde inte verifieras. Appen försöker ansluta igen automatiskt.', 'http', 401);
        }
      }
      if (response.status === 403) {
        auth.markUnavailable('Tailscale-anslutningen eller behörigheten kunde inte verifieras. Kontrollera Tailscale på telefonen och datorn. Telefonens registrering finns kvar.');
        throw new ApiError('Tailscale-anslutningen eller behörigheten kunde inte verifieras. Telefonens registrering finns kvar.', 'http', 403);
      }
      return response;
    } catch (error) {
      if (error instanceof RemoteDeviceDenied) throw error;
      assertCurrent();
      if (error instanceof ApiError || init?.signal?.aborted) throw error;
      auth.markUnavailable();
      throw new ApiError(connectionMessage, 'network');
    }
  };
}

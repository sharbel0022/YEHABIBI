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

/** Testbackendens orderreferenser och behörighet får aldrig dela produktionens lagringsnycklar. */
export function remoteTestStorageKey(key: string, origin: string) {
  const scope = Array.from(origin).map(character => character.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  return `${key}.remote-${scope}`;
}

/** Gäller alla API-metoder, inklusive status, prisacceptans, betalning och pushregistrering. */
export function createRemoteTestFetch(options: {
  configuration: RemoteTestConfiguration;
  credential: () => string;
  onUnauthorized: () => void;
  fetch?: typeof fetch;
}): typeof fetch {
  return async (input, init) => {
    const { configuration } = options;
    if (configuration.error) throw new ApiError(configuration.error, 'configuration');
    if (!configuration.enabled) return (options.fetch ?? globalThis.fetch)(input, init);
    const address = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(address);
    if (url.origin !== configuration.origin || url.username || url.password || !url.pathname.startsWith('/api/')) {
      throw new ApiError('Fjärrtestnyckeln får bara skickas till den godkända privata testservern.', 'configuration');
    }
    const credential = options.credential();
    if (!validRemoteTestCredential(credential)) {
      throw new ApiError('Anslut den privata testappen med sessionsnyckeln från PowerShell.', 'configuration');
    }
    const headers = new Headers(init?.headers);
    headers.set('X-Yehabibi-Remote-Token', credential);
    try {
      const response = await (options.fetch ?? globalThis.fetch)(input, { ...init, headers, redirect: 'error', credentials: 'omit' });
      if (response.status === 401 || response.status === 403) {
        options.onUnauthorized();
        throw new ApiError('Testsessionen är låst eller saknar behörighet. Anslut på nytt med aktuell sessionsnyckel.', 'http', response.status);
      }
      return response;
    } catch (error) {
      if (error instanceof ApiError || init?.signal?.aborted) throw error;
      throw new ApiError('Kunde inte nå den privata testservern. Kontrollera datorn, internet och Tailscale på telefonen och försök igen.', 'network');
    }
  };
}

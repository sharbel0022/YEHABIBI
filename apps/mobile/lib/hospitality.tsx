import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { defaultHospitalityCatalog, publicHospitalityCatalog, publicHospitalityCatalogSchema, type HospitalityCatalog } from '@yehabibi/shared';
import { apiUrl, remoteDeviceAuth, remoteTest } from './api';
import { createRemoteTestFetch } from './remote-test';
import { fetch as expoFetch } from 'expo/fetch';

type HospitalityStore = { catalog: HospitalityCatalog; loading: boolean; error: string; refresh: () => Promise<void> };
const Context = createContext<HospitalityStore | null>(null);
const transport = createRemoteTestFetch({ configuration: remoteTest, auth: remoteDeviceAuth, fetch: remoteTest.enabled ? expoFetch : undefined });

/** Samma innehållskatalog som webbplatsen. Kunduppgifter skickas aldrig under läsningen. */
async function fetchHospitality(): Promise<HospitalityCatalog> {
  if (!apiUrl) throw new Error('Visar innehållsutkast. Företagets webbanslutning är ännu inte konfigurerad.');
  const origin = new URL(apiUrl);
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' ||
      origin.protocol !== 'https:' && !(typeof __DEV__ !== 'undefined' && __DEV__ && !remoteTest.requested && origin.protocol === 'http:')) {
    throw new Error('Företagets webbanslutning behöver en giltig och säker adress.');
  }
  const response = await transport(`${origin.origin}/api/hospitality`, {
    headers: { Accept: 'application/json' }, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error('Det aktuella innehållet kunde inte hämtas. Försök igen.');
  const value: unknown = await response.json();
  const parsed = publicHospitalityCatalogSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('Innehållssvaret var ofullständigt. Visar innehållsutkast.');
  }
  return parsed.data;
}

export function HospitalityProvider({ children }: PropsWithChildren) {
  const [catalog, setCatalog] = useState<HospitalityCatalog>(publicHospitalityCatalog(defaultHospitalityCatalog));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef<Promise<void> | null>(null);
  const refresh = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    const request = (async () => {
      setLoading(true);
      try { setCatalog(await fetchHospitality()); setError(''); }
      catch (reason) {
        // Gamla lokalfakta visas inte som aktuella när anslutningen är bruten.
        setCatalog(publicHospitalityCatalog(defaultHospitalityCatalog));
        setError(reason instanceof Error ? reason.message : 'Innehållet kunde inte hämtas.');
      } finally { setLoading(false); inFlight.current = null; }
    })();
    inFlight.current = request;
    return request;
  }, []);
  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => subscription.remove();
  }, [refresh]);
  return <Context.Provider value={{ catalog, loading, error, refresh }}>{children}</Context.Provider>;
}

export function useHospitality() {
  const context = useContext(Context);
  if (!context) throw new Error('HospitalityProvider saknas.');
  return context;
}

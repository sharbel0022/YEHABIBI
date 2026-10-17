'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Catalog } from '@yehabibi/shared';
import { api } from '@/lib/api-client';

/** Serverns första vy bevarar SEO. Fokus och manuell uppdatering hämtar aktuella adminändringar. */
export function useCatalog(initialCatalog: Catalog) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const mounted = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError('');
    try {
      const current = await api.getCatalog();
      if (mounted.current) setCatalog(current);
    } catch (reason) {
      if (mounted.current) {
        setCatalog(previous => ({ ...previous, orders_enabled: false }));
        setError(reason instanceof Error ? reason.message : 'Menyn kunde inte uppdateras. Försök igen.');
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mounted.current = false;
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  return { catalog, loading, error, refresh };
}

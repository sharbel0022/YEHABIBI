'use client';

import { useEffect, useState } from 'react';
import { testModeBanner } from '@yehabibi/shared';
import { api } from '@/lib/api-client';

export function TestModeBanner({ initialTestMode }: { initialTestMode: boolean }) {
  const [testMode, setTestMode] = useState(initialTestMode);
  useEffect(() => {
    let active = true;
    void api.getCatalog().then(catalog => { if (active) setTestMode(catalog.test_mode === true); })
      .catch(() => { /* Ett nätverksfel får inte dölja en redan verifierad testmiljö. */ });
    return () => { active = false; };
  }, []);
  return testMode ? <div role="status" style={{ padding: '12px 18px', background: '#fff4d6', color: '#533c0a',
    borderBottom: '1px solid #d29922', textAlign: 'center', fontWeight: 700 }}>{testModeBanner}</div> : null;
}

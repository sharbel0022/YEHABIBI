'use client';
import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export function AdminLogin() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) throw new Error('Ägarinloggning är inte konfigurerad.');
      const client = createBrowserClient(url, key);
      const callback = `${window.location.origin}/auth/callback`;
      const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: callback, shouldCreateUser: false } });
      if (error) throw error;
      setMessage('Om e-postadressen är godkänd kommer en inloggningslänk att skickas.');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Kunde inte skicka länk.'); }
    finally { setBusy(false); }
  }
  return <section className="shell section inner-page"><div className="admin-panel admin-login"><span className="eyebrow">ENDAST ÄGARE</span><h1 style={{fontSize:'2.6rem'}}>Logga in</h1><p>Vi skickar en engångslänk till den registrerade administratören.</p>
    <form onSubmit={login}><div className="field"><label htmlFor="admin-email">E-post</label><input id="admin-email" type="email" value={email} onChange={event=>setEmail(event.target.value)} required autoComplete="email"/></div><button className="btn btn-primary" disabled={busy}>{busy?'Skickar...':'Skicka inloggningslänk'}</button></form>{message&&<p role="status" className="preview-note">{message}</p>}
  </div></section>;
}

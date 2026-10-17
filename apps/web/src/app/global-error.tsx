'use client';

/** Även databasfel i huvudlayouten behöver en begriplig återhämtningsväg. */
export default function GlobalError() {
  return <html lang="sv"><body style={{ margin: 0, background: '#fff', color: '#202B27', fontFamily: 'Inter,system-ui,sans-serif' }}>
    <main style={{ maxWidth: 600, margin: '12vh auto', padding: 24 }}><h1 style={{ color: '#155A43', fontFamily: 'Georgia,serif' }}>Sidan kunde inte hämtas.</h1>
      <p>Vi kunde inte läsa informationen just nu. Försök igen om en stund.</p>
      <button type="button" onClick={() => window.location.reload()} style={{ background: '#155A43', color: '#fff', border: 0, borderRadius: 12, padding: '14px 22px', font: 'inherit', cursor: 'pointer' }}>Försök igen</button>
      <a href="/" style={{ display: 'inline-block', marginLeft: 20, color: '#155A43' }}>Till startsidan</a>
    </main>
  </body></html>;
}

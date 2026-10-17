'use client';

type Props = { loading: boolean; error: string; refresh: () => Promise<void> };

export function CatalogRefresh({ loading, error, refresh }: Props) {
  return <div className="catalog-refresh">
    <button type="button" className="text-link" disabled={loading} onClick={() => void refresh()}>
      {loading ? 'Uppdaterar menyn…' : 'Uppdatera menyn'}
    </button>
    {error && <p className="form-error" role="alert">{error} Dina val finns kvar. Kontrollera aktuella priser innan du skickar.</p>}
  </div>;
}

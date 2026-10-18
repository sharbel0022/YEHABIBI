/** Visning av en redan serverbokad tid; används aldrig för att beräkna lediga tider. */
export function formatScheduledTime(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset',
  }).format(new Date(value));
}

import { createHash } from 'node:crypto';
import type { HospitalityCatalog } from '@yehabibi/shared';

export const INQUIRY_RECIPIENT = 'sharbelrasho@gmail.com';
export type CateringInquiryInput = {
  requestId: string; startedAt: number; website: string;
  name: string; email: string; phone: string; people: number; date: string; time: string;
  fulfillment: 'pickup' | 'delivery'; address: string; message: string; allergies: string;
  menuIds: string[]; dishQuantities: Record<string, number>;
};
export type InquiryValidation = { ok: true; value: CateringInquiryInput } | { ok: false; error: string };
const keys = ['requestId','startedAt','website','name','email','phone','people','date','time','fulfillment','address','message','allergies','menuIds','dishQuantities'];
const plainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const oneLine = (v: unknown, min: number, max: number): v is string => typeof v === 'string' && v.trim().length >= min && v.length <= max && !/[\u0000-\u001f\u007f]/u.test(v);
const longText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v);

/** All identifiers must already be present in the current public catalog. */
export function validateCateringInquiry(input: unknown, catalog: HospitalityCatalog, now = Date.now()): InquiryValidation {
  const fail = (error: string): InquiryValidation => ({ok:false,error});
  if (!plainObject(input) || Object.keys(input).some(k => !keys.includes(k)) || keys.some(k => !(k in input))) return fail('Kontrollera uppgifterna i formuläret.');
  if (!oneLine(input.requestId,36,36) || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.requestId)) return fail('Ladda om formuläret och försök igen.');
  if (input.website !== '' || typeof input.startedAt !== 'number' || !Number.isSafeInteger(input.startedAt) || input.startedAt > now - 1000 || input.startedAt < now - 24*60*60*1000) return fail('Kontrollera formuläret och försök igen.');
  if (!oneLine(input.name,2,120)) return fail('Fyll i ditt namn.');
  if (!oneLine(input.email,3,254) || !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(input.email)) return fail('Fyll i en giltig e-postadress.');
  if (!oneLine(input.phone,7,30) || !/^\+?[\d ()-]{7,30}$/.test(input.phone) || input.phone.replace(/\D/g,'').length < 7) return fail('Fyll i ett giltigt telefonnummer.');
  if (typeof input.people !== 'number' || !Number.isInteger(input.people) || input.people < 1 || input.people > 1000) return fail('Välj mellan 1 och 1 000 personer.');
  const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  if (!oneLine(input.date,10,10) || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(input.date+'T12:00:00Z')) || new Date(input.date+'T12:00:00Z').toISOString().slice(0,10) !== input.date || input.date < today || input.date > String(Number(today.slice(0,4))+2)+today.slice(4)) return fail('Välj ett giltigt datum från idag och högst två år framåt.');
  if (!oneLine(input.time,5,5) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.time)) return fail('Välj en giltig tid.');
  const localTime = new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
  if (input.date === today && input.time <= localTime) return fail('Välj en tid som ligger framåt i tiden.');
  if (input.fulfillment !== 'pickup' && input.fulfillment !== 'delivery') return fail('Välj hämtning eller leverans.');
  if (!oneLine(input.address, input.fulfillment === 'delivery' ? 5 : 0, 300)) return fail('Fyll i leveransadress.');
  if (!longText(input.message,2000) || !longText(input.allergies,1000)) return fail('Förkorta meddelandet eller allergiinformationen.');
  if (!Array.isArray(input.menuIds) || input.menuIds.length > 3 || input.menuIds.some(id => typeof id !== 'string' || !catalog.menus.some(m => m.id === id && m.id !== 'plockmeny' && m.published && (catalog.preview || (m.approved && m.allergensVerified)))) || new Set(input.menuIds).size !== input.menuIds.length) return fail('Menyn har ändrats. Välj dina menyer på nytt.');
  if (!plainObject(input.dishQuantities) || Object.keys(input.dishQuantities).length > 100 || Object.entries(input.dishQuantities).some(([id,quantity]) => !catalog.dishes.some(d => d.id === id && d.published && (catalog.preview || d.approved)) || typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000)) return fail('Kontrollera dina valda rätter och antal.');
  if (!input.menuIds.length && !Object.keys(input.dishQuantities).length) return fail('Välj minst en meny eller rätt.');
  return {ok:true,value:{
    requestId:input.requestId.toLowerCase(),startedAt:input.startedAt,website:'',name:input.name.trim(),email:input.email.trim().toLowerCase(),phone:input.phone.trim(),people:input.people,date:input.date,time:input.time,
    fulfillment:input.fulfillment,address:input.address.trim(),message:input.message.trim(),allergies:input.allergies.trim(),
    menuIds:[...input.menuIds].sort(),dishQuantities:Object.fromEntries(Object.entries(input.dishQuantities).sort(([a],[b])=>a.localeCompare(b))) as Record<string,number>,
  }};
}

export function inquiryRecipientReady(catalog: HospitalityCatalog): boolean {
  return catalog.contact.emailVerified && catalog.contact.email.trim().toLowerCase() === INQUIRY_RECIPIENT;
}

/** Plain text only. Prices and item names are never accepted from the browser. */
export function formatCateringInquiry(input: CateringInquiryInput, catalog: HospitalityCatalog) {
  const reference = `C-${input.requestId}`;
  const menus = input.menuIds.map(id => catalog.menus.find(m=>m.id===id)!);
  const dishes = Object.entries(input.dishQuantities).map(([id,quantity])=>({dish:catalog.dishes.find(d=>d.id===id)!,quantity}));
  if (menus.some(m=>!m) || dishes.some(d=>!d.dish)) throw new Error('Catalog changed');
  const text = [
    'NY CATERINGFÖRFRÅGAN',`Referens: ${reference}`,'',
    `Namn: ${input.name}`,`E-post: ${input.email}`,`Telefon: ${input.phone}`,
    `Antal personer: ${input.people}`,`Önskat datum: ${input.date}`,`Önskad tid: ${input.time} (svensk tid)`,
    `Upplägg: ${input.fulfillment === 'delivery' ? 'Leverans' : 'Hämtning'}`,input.fulfillment === 'delivery' ? `Leveransadress: ${input.address}` : '',
    '', 'VALDA MENYER', ...menus.map(menu=>`${menu.name} – ${input.people} personer${menu.pricePerPerson !== null ? `, visat riktpris ${menu.pricePerPerson} kr/person` : ', pris enligt offert'}`),
    '', 'VALDA RÄTTER', ...dishes.map(({dish,quantity})=>`${quantity} × ${dish.name}`),
    '',`Allergier och specialkost: ${input.allergies || 'Ej angivet'}`,`Meddelande: ${input.message || 'Ej angivet'}`,
    '', 'Betalningsönskemål: Betala på plats. Ingen betalning har genomförts på webbplatsen.',
    'Detta är en förfrågan. Tillgänglighet, mängder, allergier, slutligt pris och betalningsupplägg bekräftas personligen.',
  ].filter(line=>line !== undefined).join('\n');
  const payload = {to:[INQUIRY_RECIPIENT],reply_to:input.email,subject:`Cateringförfrågan ${reference}`,text};
  // The complete canonical provider payload participates: changed catalog names/prices cannot reuse a stale key.
  const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return {reference,payload,idempotencyKey:`catering/${input.requestId}/${fingerprint}`};
}

export function inquiryOriginAllowed(origin: string | null, requestUrl: string, configuredUrl?: string): boolean {
  if (!origin) return false;
  try {
    const source = new URL(origin);
    if (source.origin !== origin || !['https:','http:'].includes(source.protocol)) return false;
    const target = new URL(configuredUrl || requestUrl);
    return source.origin === target.origin;
  } catch { return false; }
}

export type InquiryMailSettings = { enabled:boolean; apiKey:string; from:string };
export function inquiryMailSettingsReady(settings: InquiryMailSettings): boolean {
  return settings.enabled && !!settings.apiKey.trim() && settings.from.length < 320 && !/[\r\n]/.test(settings.from) && /(?:^|<)[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/.test(settings.from.trim());
}

/** Injectable transport permits contract verification without sending a real email. */
export async function sendCateringInquiryWithTransport(input: CateringInquiryInput, catalog: HospitalityCatalog, settings: InquiryMailSettings, transport: typeof fetch = fetch, now = Date.now()): Promise<{ok:true;reference:string}|{ok:false;unavailable?:boolean}> {
  if (!inquiryMailSettingsReady(settings) || !inquiryRecipientReady(catalog)) return {ok:false,unavailable:true};
  const checked=validateCateringInquiry(input,catalog,now);
  if (!checked.ok) return {ok:false};
  const {reference,payload}=formatCateringInquiry(checked.value,catalog);
  const providerPayload={from:settings.from.trim(),...payload};
  const fingerprint=createHash('sha256').update(JSON.stringify(providerPayload)).digest('hex');
  try {
    const response = await transport('https://api.resend.com/emails',{
      method:'POST',signal:AbortSignal.timeout(8000),
      headers:{Authorization:`Bearer ${settings.apiKey}`,'Content-Type':'application/json','Idempotency-Key':`catering/${checked.value.requestId}/${fingerprint}`},
      body:JSON.stringify(providerPayload),
    });
    if (!response.ok) return {ok:false};
    const accepted: unknown = await response.json();
    if (!accepted || typeof accepted !== 'object' || !('id' in accepted) || typeof accepted.id !== 'string' || !accepted.id.trim()) return {ok:false};
    return {ok:true,reference};
  } catch { return {ok:false}; }
}

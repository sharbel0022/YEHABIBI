import 'server-only';
import { adminDb } from '@/lib/supabase';
import type { CateringOrder } from '@/types/domain';

export const isExpoPushToken = (token:string) => /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/.test(token);

const expoHeaders = () => ({'Content-Type':'application/json',...(process.env.EXPO_ACCESS_TOKEN ? {Authorization:`Bearer ${process.env.EXPO_ACCESS_TOKEN}`} : {})});
/** Körs före nästa push och kan även begäras i admin efter cirka 15 minuter. */
export async function checkOwnerPushReceipts(adminUserId?:string,signal=AbortSignal.timeout(15000)) {
  if(process.env.NOTIFICATIONS_ENABLED!=='true')return 0;
  const db = adminDb(signal);
  let query = db.from('owner_push_tokens').select('token,last_ticket_id').not('last_ticket_id','is',null).lte('last_ticket_at',new Date(Date.now()-15*60000).toISOString()).limit(10);
  if(adminUserId) query = query.eq('admin_user_id',adminUserId);
  const {data,error} = await query;
  if(error || !data?.length) return 0;
  const response = await fetch('https://exp.host/--/api/v2/push/getReceipts',{method:'POST',signal:AbortSignal.any([signal,AbortSignal.timeout(8000)]),headers:expoHeaders(),body:JSON.stringify({ids:data.map(row=>row.last_ticket_id)})});
  if(!response.ok) throw new Error('Pushkvitton kunde inte hämtas.');
  const result = await response.json();
  let checked = 0;
  await Promise.all(data.map(async row=>{
    const receipt = result.data?.[row.last_ticket_id];
    if(!receipt) return;
    if(receipt.details?.error==='DeviceNotRegistered') await db.from('owner_push_tokens').delete().eq('token',row.token);
    else {
      if(receipt.status==='error') console.error('Owner push receipt reported delivery failure');
      await db.from('owner_push_tokens').update({last_ticket_id:null,last_ticket_at:null}).eq('token',row.token);
    }
    checked++;
  }));
  return checked;
}

/** Push är ett frivilligt komplement. Befintliga ordermejl skickas alltid separat. */
export async function notifyOwnerPush(order:CateringOrder,title?:string) {
  if(process.env.NOTIFICATIONS_ENABLED!=='true'||process.env.OWNER_PUSH_ENABLED !== 'true') return;
  const signal=AbortSignal.timeout(25000);
  await checkOwnerPushReceipts(undefined,signal).catch(()=>console.error('Owner push receipts unavailable'));
  const db = adminDb(signal);
  const {data,error} = await db.from('owner_push_tokens').select('token,admin_user_id').limit(10);
  if(error || !data?.length) return;
  // En borttagen administratör ska inte fortsätta få notifieringar.
  const allowed = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map(value=>value.trim());
  const tokens:string[] = [];
  await Promise.all(data.map(async record=>{
    const {data:{user}} = await db.auth.admin.getUserById(record.admin_user_id);
    if(user?.email && user.email_confirmed_at && allowed.includes(user.email.toLowerCase()) && isExpoPushToken(record.token)) tokens.push(record.token);
  }));
  if(!tokens.length) return;
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send',{
      method:'POST',signal:AbortSignal.any([signal,AbortSignal.timeout(8000)]),
      headers:expoHeaders(),
      body:JSON.stringify(tokens.map(to=>({to,sound:'default',title:title || (order.payment_preference==='cash'?'Kontantförfrågan – obetald':'Ny cateringförfrågan'),body:`${order.code} har uppdaterats i admin.`,data:{path:'/admin/orders'},ttl:3600})))
    });
    if(!response.ok) { console.error('Owner push service unavailable'); return; }
    const result = await response.json();
    const tickets = Array.isArray(result.data) ? result.data : [];
    // Expo anger DeviceNotRegistered för enheter som inte längre tar emot push.
    await Promise.all(tickets.map((ticket:{id?:string;details?:{error?:string}},index:number)=>{
      if(ticket.details?.error==='DeviceNotRegistered') return db.from('owner_push_tokens').delete().eq('token',tokens[index]);
      if(ticket.id) return db.from('owner_push_tokens').update({last_ticket_id:ticket.id,last_ticket_at:new Date().toISOString()}).eq('token',tokens[index]);
      return Promise.resolve();
    }));
  } catch { console.error('Owner push delivery failed; email fallback remains active'); }
}

/** Kunden registrerar sin enhet med samma hemliga token som skyddar orderlänken. */
export async function notifyCustomerPush(order:CateringOrder,message:string) {
  if(process.env.NOTIFICATIONS_ENABLED!=='true'||process.env.CUSTOMER_PUSH_ENABLED!=='true') return;
  const signal=AbortSignal.timeout(25000);
  await checkCustomerPushReceipts(order.id,signal).catch(()=>console.error('Customer push receipts unavailable'));
  const db = adminDb(signal);
  const {data,error} = await db.from('order_push_tokens').select('token').eq('order_id',order.id).limit(5);
  if(error || !data?.length) return;
  const tokens = data.map(row=>row.token).filter(isExpoPushToken);
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',signal:AbortSignal.any([signal,AbortSignal.timeout(8000)]),headers:expoHeaders(),
      body:JSON.stringify(tokens.map(to=>({to,sound:'default',title:'Yehabibi · din beställning',body:`${order.code}: ${message}`,data:{code:order.code},ttl:3600}))) });
    if(!response.ok) { console.error('Customer push unavailable; email remains active'); return; }
    const result = await response.json();
    const tickets = Array.isArray(result.data)?result.data:[];
    await Promise.all(tickets.map((ticket:{id?:string;details?:{error?:string}},index:number)=>{
      const row = db.from('order_push_tokens');
      if(ticket.details?.error==='DeviceNotRegistered') return row.delete().eq('token',tokens[index]).eq('order_id',order.id);
      if(ticket.id) return row.update({last_ticket_id:ticket.id,last_ticket_at:new Date().toISOString()}).eq('token',tokens[index]).eq('order_id',order.id);
      return Promise.resolve();
    }));
  } catch { console.error('Customer push failed; email remains active'); }
}

async function checkCustomerPushReceipts(orderId:string,signal:AbortSignal) {
  const db = adminDb(signal);
  const {data,error} = await db.from('order_push_tokens').select('token,last_ticket_id').eq('order_id',orderId)
    .not('last_ticket_id','is',null).lte('last_ticket_at',new Date(Date.now()-15*60000).toISOString());
  if(error || !data?.length) return;
  const response = await fetch('https://exp.host/--/api/v2/push/getReceipts',{method:'POST',signal:AbortSignal.any([signal,AbortSignal.timeout(8000)]),headers:expoHeaders(),body:JSON.stringify({ids:data.map(row=>row.last_ticket_id)})});
  if(!response.ok) throw new Error('Pushkvitton kunde inte hämtas.');
  const result = await response.json();
  await Promise.all(data.map(async row=>{
    const receipt = result.data?.[row.last_ticket_id];
    if(!receipt) return;
    if(receipt.details?.error==='DeviceNotRegistered') await db.from('order_push_tokens').delete().eq('order_id',orderId).eq('token',row.token);
    else {
      if(receipt.status==='error') console.error('Customer push receipt reported delivery failure');
      await db.from('order_push_tokens').update({last_ticket_id:null,last_ticket_at:null}).eq('order_id',orderId).eq('token',row.token);
    }
  }));
}

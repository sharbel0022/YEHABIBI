import { isSupabaseReady } from '@/lib/config';
export async function GET(){return Response.json({service:'Cedar Mezze',status:'ok',ordersConfigured:isSupabaseReady()&&process.env.ORDERS_ENABLED==='true'},{headers:{'Cache-Control':'no-store'}})}

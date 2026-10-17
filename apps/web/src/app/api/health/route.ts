import { ordersReady } from '@/lib/data';
export async function GET(){return Response.json({service:'Cedar Mezze',status:'ok',ordersConfigured:ordersReady()},{headers:{'Cache-Control':'no-store'}})}

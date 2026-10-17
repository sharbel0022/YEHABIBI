import 'server-only';
import { createHmac,createHash,timingSafeEqual } from 'node:crypto';
import { siteUrl } from '@/lib/config';

export function trackingToken(orderId:string) {
  const secret=process.env.ORDER_LINK_SECRET;
  if(!secret || secret.length<32)throw new Error('Tracking link secret not configured');
  return createHmac('sha256',secret).update(orderId).digest('hex');
}
export function trackingHash(token:string){return createHash('sha256').update(token).digest('hex');}
export function verifyTrackingToken(token:string, hash:string) {
  if(!/^[a-f0-9]{64}$/.test(token) || !/^[a-f0-9]{64}$/.test(hash)) return false;
  return timingSafeEqual(Buffer.from(trackingHash(token),'hex'),Buffer.from(hash,'hex'));
}
export function trackingLink(order:{id:string;code:string}){
  return `${siteUrl()}/order/${encodeURIComponent(order.code)}?token=${trackingToken(order.id)}`;
}

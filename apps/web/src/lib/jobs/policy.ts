import { timingSafeEqual } from 'node:crypto';

/** A separate server secret; anon keys and user sessions never authorize workers. */
export function authorizedJobRequest(header: string | null, secret: string | undefined) {
  if (!secret || secret.length < 32 || !header?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7)), expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function retryAfterSeconds(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const delay = /^\d+$/.test(value) ? Number(value) : Math.ceil((Date.parse(value) - now) / 1000);
  // Invalid or unreasonable provider headers do not cause an immediate retry loop.
  return Number.isFinite(delay) ? Math.max(1, Math.min(604800, delay)) : undefined;
}

export class DeliveryRetryError extends Error {
  readonly retryAfter: number | undefined;
  constructor(retryAfter?: number) { super('Notification delivery pending'); this.retryAfter = retryAfter; }
}

/** An approved reserve channel remains reachable even when the primary throws. */
export async function deliverWithFallback(primary:()=>Promise<boolean>,backup?:()=>Promise<boolean>) {
  let failure:unknown;
  try { if(await primary())return true; } catch(error) { failure=error; }
  if(backup) { try { if(await backup())return true; } catch(error) { failure=error; } }
  if(failure)throw failure;
  return false;
}

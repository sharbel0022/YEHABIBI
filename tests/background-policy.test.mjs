import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizedJobRequest,retryAfterSeconds,deliverWithFallback,DeliveryRetryError} from '../apps/web/src/lib/jobs/policy.ts';

test('internal workers require an independent strong bearer secret',()=>{
  const secret='worker-only-'.repeat(4);
  assert.equal(authorizedJobRequest(`Bearer ${secret}`,secret),true);
  for(const header of [null,'Bearer anon','Basic '+secret,`Bearer ${secret}x`,`Bearer ${secret.slice(1)}`]) assert.equal(authorizedJobRequest(header,secret),false);
  assert.equal(authorizedJobRequest('Bearer short','short'),false);
  assert.equal(authorizedJobRequest('Bearer anything',undefined),false);
});
test('Retry-After supports seconds and HTTP date without hot retry loops',()=>{
  const now=Date.parse('2026-10-19T12:00:00Z');
  assert.equal(retryAfterSeconds('120',now),120);
  assert.equal(retryAfterSeconds('Mon, 19 Oct 2026 12:03:00 GMT',now),180);
  assert.equal(retryAfterSeconds('0',now),1);
  assert.equal(retryAfterSeconds('invalid',now),undefined);
  assert.equal(retryAfterSeconds(null,now),undefined);
});
test('approved backup works when primary fails and no unapproved fallback is called',async()=>{
  let backupCalls=0;
  assert.equal(await deliverWithFallback(async()=>{throw new DeliveryRetryError(120);},async()=>{backupCalls++;return true;}),true);
  assert.equal(backupCalls,1);
  assert.equal(await deliverWithFallback(async()=>true,async()=>{backupCalls++;return true;}),true);
  assert.equal(backupCalls,1);
  await assert.rejects(deliverWithFallback(async()=>{throw new DeliveryRetryError(120);}),error=>error.retryAfter===120);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcTotal, canUseCash, canTransition, isValidEventDate,
  stripePaymentTypes, safeExternalUrl, escapeHtml, formatSek
} from '../packages/shared/pricing/index.ts';

test('summa: pris per person + leveransavgift i öre', () => {
  assert.deepEqual(calcTotal(27900,20,'delivery',9900),{
    subtotal_ore:558000,delivery_fee_ore:9900,total_ore:567900
  });
  assert.equal(calcTotal(27900,20,'pickup',9900).total_ore,558000);
});

test('ogiltiga priser och alltför stora totalsummor stoppas', () => {
  assert.throws(()=>calcTotal(-1,10,'delivery',0));
  assert.throws(()=>calcTotal(10000000,1000,'delivery',0));
  assert.throws(()=>calcTotal(100,0,'pickup',0));
});

test('kontant får bara användas för hämtning och om ägaren tillåter det', () => {
  assert.equal(canUseCash('cash','delivery',true),false);
  assert.equal(canUseCash('cash','pickup',false),false);
  assert.equal(canUseCash('cash','pickup',true),true);
  assert.equal(canUseCash('card','delivery',true),true);
});

test('ägaren får inte slutföra en order som inte är betald', () => {
  assert.equal(canTransition('new','complete','unpaid','card'),false);
  assert.equal(canTransition('approved','complete','unpaid','card'),false);
  assert.equal(canTransition('approved','complete','paid','card'),true);
  assert.equal(canTransition('approved','cash_paid','unpaid','cash'),true);
  assert.equal(canTransition('approved','cash_paid','unpaid','card'),false);
  assert.equal(canTransition('rejected','approve','unpaid','cash'),false);
});

test('Swish måste vara aktiverat och kort används för Apple Pay', () => {
  assert.deepEqual(stripePaymentTypes('card',false),['card']);
  assert.deepEqual(stripePaymentTypes('apple_pay',false),['card']);
  assert.deepEqual(stripePaymentTypes('swish',true),['swish']);
  assert.throws(()=>stripePaymentTypes('swish',false));
  assert.throws(()=>stripePaymentTypes('cash',true));
});

test('datum ska ligga inom tillåtet bokningsfönster i Sverige', () => {
  const now=new Date('2026-10-13T09:00:00Z');
  assert.equal(isValidEventDate('2026-10-15',2,now),true);
  assert.equal(isValidEventDate('2026-10-14',2,now),false);
  assert.equal(isValidEventDate('2026-02-30',1,now),false);
  assert.equal(isValidEventDate('2028-01-01',2,now),false);
});

test('bara säkra externa länkar används', () => {
  assert.equal(safeExternalUrl('javascript:alert(1)'),null);
  assert.equal(safeExternalUrl('http://example.com'),null);
  assert.equal(safeExternalUrl('https://example.com/test'),'https://example.com/test');
});

test('utgående mejl HTML-escapas', () => {
  assert.equal(escapeHtml('<script>x</script>'),'&lt;script&gt;x&lt;/script&gt;');
  assert.match(formatSek(12900),/129/);
});

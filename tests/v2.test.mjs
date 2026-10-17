import test from 'node:test';
import assert from 'node:assert/strict';
import {calcItemsTotal, deliveryFeeFor, campaignIsActive} from '../packages/shared/pricing/index.ts';

test('bygg eget räknas i öre med styckpriser och pris per person',()=>{
 const p=calcItemsTotal([{unit_price_ore:8900,quantity:2},{unit_price_ore:2500,quantity:12},{unit_price_ore:6500,quantity:6},{unit_price_ore:8000,quantity:1}],6,'delivery',9900);
 assert.deepEqual(p,{subtotal_ore:94800,delivery_fee_ore:9900,total_ore:104700,per_person_ore:17450});
});
test('hämtning kostar inget extra',()=>{
 assert.equal(calcItemsTotal([{unit_price_ore:2500,quantity:10}],5,'pickup',9900).total_ore,25000);
});
test('ogiltiga och mycket stora val stoppas',()=>{
 assert.throws(()=>calcItemsTotal([],5,'pickup',0));
 assert.throws(()=>calcItemsTotal([{unit_price_ore:-1,quantity:2}],5,'pickup',0));
 assert.throws(()=>calcItemsTotal([{unit_price_ore:2500,quantity:101}],5,'pickup',0));
 assert.throws(()=>calcItemsTotal([{unit_price_ore:5000000,quantity:100}],5,'pickup',0));
});
test('leveranszon: längsta matchande postnummerprefix används',()=>{
 const zones=[{postal_prefix:'72',fee_ore:9900},{postal_prefix:'722',fee_ore:4900}];
 assert.equal(deliveryFeeFor('722 12',14900,zones),4900);
 assert.equal(deliveryFeeFor('723 12',14900,zones),9900);
 assert.equal(deliveryFeeFor('831 00',14900,zones),14900);
});
test('säsongskampanj syns bara under sin period',()=>{
 assert.equal(campaignIsActive(true,'2026-12-01','2026-12-31','2026-12-24'),true);
 assert.equal(campaignIsActive(true,'2026-12-01','2026-12-31','2027-01-01'),false);
 assert.equal(campaignIsActive(false,null,null,'2026-12-24'),false);
});

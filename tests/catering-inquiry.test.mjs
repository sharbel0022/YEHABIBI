import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultHospitalityCatalog, publicHospitalityCatalog } from '../packages/shared/index.ts';
import { validateCateringInquiry, formatCateringInquiry, inquiryOriginAllowed, inquiryRecipientReady, inquiryMailSettingsReady, sendCateringInquiryWithTransport, INQUIRY_RECIPIENT } from '../apps/web/src/lib/catering-inquiry.ts';

const now = Date.parse('2026-10-22T10:00:00Z');
const catalog = () => publicHospitalityCatalog(structuredClone(defaultHospitalityCatalog));
const input = () => ({requestId:'8a0b5d2d-67da-4e07-80c9-6625361ed964',startedAt:now-5000,website:'',name:'Syntetisk testkund',email:'synthetic@example.com',phone:'0701234567',people:20,date:'2026-10-23',time:'14:30',fulfillment:'pickup',address:'',message:'Syntetiskt testmeddelande',allergies:'',menuIds:['meny-1'],dishQuantities:{}});
const valid = (patch={},cat=catalog()) => validateCateringInquiry({...input(),...patch},cat,now);

test('accepts fixed menus, dish-only selection, and delivery with an address',()=>{
  assert.equal(valid().ok,true);
  assert.equal(valid({menuIds:[],dishQuantities:{'meze-1':3}}).ok,true);
  assert.equal(valid({fulfillment:'delivery',address:'Syntetisk adress 1'}).ok,true);
  assert.equal(valid({fulfillment:'delivery'}).ok,false);
});
test('rejects all caller-supplied recipients, sender, prices, payment URLs and unknown fields',()=>{
  for (const patch of [{to:'other@example.com'},{from:'other@example.com'},{price:1},{checkoutUrl:'https://example.com'},{payment:'paid'}]) assert.equal(valid(patch).ok,false);
});
test('rejects unknown, unpublished or unapproved selections without silently dropping them',()=>{
  for (const patch of [{menuIds:['bad']},{menuIds:['meny-1','bad']},{menuIds:['plockmeny']},{dishQuantities:{'missing':2}},{menuIds:[],dishQuantities:{}}]) assert.equal(valid(patch).ok,false);
  const cat=catalog();cat.menus[0].published=false;assert.equal(valid({},cat).ok,false);
  cat.menus[0].published=true;cat.preview=false;assert.equal(valid({},cat).ok,false);
  assert.equal(valid({menuIds:[],dishQuantities:{'meze-1':1}},cat).ok,false);
});
test('rejects duplicate menu IDs and invalid dish quantities or guest counts',()=>{
  assert.equal(valid({menuIds:['meny-1','meny-1']}).ok,false);
  for (const quantity of [0,-1,1.5,1001,'2',null,NaN]) assert.equal(valid({dishQuantities:{'meze-1':quantity}}).ok,false);
  for (const people of [0,-1,1.5,1001,'20',null]) assert.equal(valid({people}).ok,false);
});
test('uses calendar-valid Stockholm dates and rejects past local times',()=>{
  for (const date of ['2026-02-30','2026-10-21','2029-10-23','2026-13-01','tomorrow']) assert.equal(valid({date}).ok,false);
  assert.equal(valid({date:'2026-10-22',time:'11:59'}).ok,false);
  assert.equal(valid({date:'2026-10-22',time:'12:01'}).ok,true);
  for (const time of ['25:00','12:99','1:00','14:30\r\n']) assert.equal(valid({time}).ok,false);
  const atMidnight=Date.parse('2026-10-22T22:30:00Z');
  assert.equal(validateCateringInquiry({...input(),startedAt:atMidnight-5000,date:'2026-10-22'},catalog(),atMidnight).ok,false);
});
test('limits input lengths, rejects header control characters, invalid contact details and bots',()=>{
  for (const patch of [{name:'x'},{email:'x'},{email:'person@example.com\r\nBcc: someone@example.com'},{phone:'bad'},{message:'x'.repeat(2001)},{allergies:'x'.repeat(1001)},{website:'bot'},{startedAt:now},{startedAt:now-25*60*60*1000},{requestId:'not-a-uuid'}]) assert.equal(valid(patch).ok,false);
  assert.equal(valid({message:'Rad 1\nRad 2'}).ok,true);
});
test('canonical payload uses current server catalog, fixed recipient and pay-on-site wording',()=>{
  const cat=catalog();cat.menus[0].name='Verifierad aktuell meny';cat.menus[0].pricePerPerson=251;
  const checked=valid({dishQuantities:{'meze-1':2}},cat);assert.equal(checked.ok,true);
  const mail=formatCateringInquiry(checked.value,cat);
  assert.deepEqual(mail.payload.to,[INQUIRY_RECIPIENT]);assert.equal(mail.payload.reply_to,'synthetic@example.com');
  assert.match(mail.payload.text,/Verifierad aktuell meny – 20 personer, visat riktpris 251 kr\/person/);
  assert.match(mail.payload.text,/2 × Hummus/);assert.match(mail.payload.text,/Betala på plats/);
  assert.match(mail.payload.text,/Ingen betalning har genomförts/);assert.match(mail.payload.text,/Detta är en förfrågan/);
  assert.equal('html' in mail.payload,false);
});
test('idempotency key is stable across retries/order changes and changes for modified content/catalog',()=>{
  const cat=catalog();
  const a=valid({menuIds:['meny-2','meny-1'],dishQuantities:{'meze-2':2,'meze-1':1}},cat).value;
  const b=valid({menuIds:['meny-1','meny-2'],dishQuantities:{'meze-1':1,'meze-2':2},startedAt:now-10000},cat).value;
  const mail=formatCateringInquiry(a,cat);
  assert.equal(mail.idempotencyKey,formatCateringInquiry(b,cat).idempotencyKey);
  assert.notEqual(mail.idempotencyKey,formatCateringInquiry({...b,message:'Ett annat meddelande'},cat).idempotencyKey);
  cat.menus[0].pricePerPerson=999;
  assert.notEqual(mail.idempotencyKey,formatCateringInquiry(b,cat).idempotencyKey);
});
test('fails closed when recipient verification or recipient address changes',()=>{
  assert.equal(inquiryRecipientReady(catalog()),true);
  const cat=catalog();cat.contact.emailVerified=false;assert.equal(inquiryRecipientReady(cat),false);
  cat.contact.emailVerified=true;cat.contact.email='different@example.com';assert.equal(inquiryRecipientReady(cat),false);
});
test('origin is mandatory and restricted to exact configured public origin',()=>{
  const target='https://yehabibi.example/api/catering/inquiry';
  assert.equal(inquiryOriginAllowed(null,target),false);
  assert.equal(inquiryOriginAllowed('null',target),false);
  assert.equal(inquiryOriginAllowed('https://yehabibi.example',target),true);
  assert.equal(inquiryOriginAllowed('https://yehabibi.example.evil.test',target),false);
  assert.equal(inquiryOriginAllowed('https://yehabibi.example/extra',target),false);
  assert.equal(inquiryOriginAllowed('https://yehabibi.example', 'http://internal:3000/api', 'https://yehabibi.example'),true);
  assert.equal(inquiryOriginAllowed('http://internal:3000','http://internal:3000/api','https://yehabibi.example'),false);
});

const mailSettings=()=>({enabled:true,apiKey:'synthetic-test-key',from:'Yei Habibi <synthetic@example.com>'});
test('transport succeeds only after provider acceptance with a nonempty ID',async()=>{
  let calls=0;
  const result=await sendCateringInquiryWithTransport(input(),catalog(),mailSettings(),async(url,options)=>{
    calls++;
    assert.equal(url,'https://api.resend.com/emails');assert.equal(options.method,'POST');
    const body=JSON.parse(options.body);
    assert.deepEqual(body.to,['sharbelrasho@gmail.com']);assert.equal(body.reply_to,'synthetic@example.com');
    assert.equal(body.from,mailSettings().from);assert.match(body.text,/Betala på plats/);
    assert.equal('cc' in body,false);assert.equal('bcc' in body,false);
    assert.match(options.headers['Idempotency-Key'],/^catering\/[a-f0-9-]{36}\/[a-f0-9]{64}$/);
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({id:'synthetic-provider-id'});
  },now);
  assert.deepEqual(result,{ok:true,reference:`C-${input().requestId}`});assert.equal(calls,1);
});
test('transport never reports success for missing ID, provider rejection, invalid JSON or timeout',async()=>{
  for (const transport of [async()=>Response.json({}),async()=>Response.json({id:''}),async()=>Response.json({id:5}),async()=>Response.json({id:'ignored'},{status:429}),async()=>new Response('invalid json'),async()=>{throw new DOMException('synthetic timeout','TimeoutError');}]) {
    assert.deepEqual(await sendCateringInquiryWithTransport(input(),catalog(),mailSettings(),transport,now),{ok:false});
  }
});
test('disabled mail, invalid sender or unverified/different recipient never call the provider',async()=>{
  let calls=0;const transport=async()=>{calls++;return Response.json({id:'unreachable'});};
  for (const settings of [{...mailSettings(),enabled:false},{...mailSettings(),apiKey:''},{...mailSettings(),from:'invalid'},{...mailSettings(),from:'a@example.com\r\nBcc: b@example.com'}]) {
    assert.equal(inquiryMailSettingsReady(settings),false);
    assert.deepEqual(await sendCateringInquiryWithTransport(input(),catalog(),settings,transport,now),{ok:false,unavailable:true});
  }
  const cat=catalog();cat.contact.email='other@example.com';
  assert.deepEqual(await sendCateringInquiryWithTransport(input(),cat,mailSettings(),transport,now),{ok:false,unavailable:true});
  cat.contact.email='sharbelrasho@gmail.com';cat.contact.emailVerified=false;
  assert.deepEqual(await sendCateringInquiryWithTransport(input(),cat,mailSettings(),transport,now),{ok:false,unavailable:true});
  assert.equal(calls,0);
});
test('invalid client payload is rejected before transport rather than forwarded',async()=>{
  let calls=0;const transport=async()=>{calls++;return Response.json({id:'unreachable'});};
  for (const patch of [{to:'other@example.com'},{from:'attacker@example.com'},{dishQuantities:{missing:5}},{fulfillment:'delivery',address:''},{menuIds:['missing']}]) {
    assert.deepEqual(await sendCateringInquiryWithTransport({...input(),...patch},catalog(),mailSettings(),transport,now),{ok:false});
  }
  assert.equal(calls,0);
});
test('provider key and body are identical on retries; changed sender/content use a new key',async()=>{
  const observed=[];const transport=async(_url,options)=>{observed.push(options);return Response.json({id:'synthetic-id'});};
  await sendCateringInquiryWithTransport(input(),catalog(),mailSettings(),transport,now);
  await sendCateringInquiryWithTransport({...input(),startedAt:now-10000},catalog(),mailSettings(),transport,now);
  assert.equal(observed[0].headers['Idempotency-Key'],observed[1].headers['Idempotency-Key']);
  assert.equal(observed[0].body,observed[1].body);
  await sendCateringInquiryWithTransport({...input(),message:'Changed synthetic message'},catalog(),mailSettings(),transport,now);
  await sendCateringInquiryWithTransport(input(),catalog(),{...mailSettings(),from:'Other <synthetic@example.com>'},transport,now);
  assert.notEqual(observed[0].headers['Idempotency-Key'],observed[2].headers['Idempotency-Key']);
  assert.notEqual(observed[0].headers['Idempotency-Key'],observed[3].headers['Idempotency-Key']);
});

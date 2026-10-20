import test from 'node:test';
import assert from 'node:assert/strict';
import {selectPrivateDevice,privateServerIdentity,assertUnusedServePort,ownsServePort,resolveServeIdentity,createServeIdentityResolver} from '../test-support/remote/tailscale.mjs';
import {canRecoverAfterReboot,currentBootId} from '../test-support/remote/reboot.mjs';
import {serverPaused,requestServerRefresh} from '../scripts/remote-server.mjs';
const status=()=>({BackendState:'Running',Self:{Online:true,DNSName:'testpc.testtail.ts.net.',UserID:42},CertDomains:['testpc.testtail.ts.net'],Peer:{mobile:{ID:'phone1',OS:'iOS',DNSName:'phone.testtail.ts.net.',HostName:'phone',UserID:42,Online:false,InNetworkMap:true}},User:{42:{LoginName:'test@example.test'}}});
test('server accepts only owner-account phone nodes automatically and can start with zero or multiple phones',()=>{
  const map=status();map.Peer.mobile.TailscaleIPs=['100.64.0.2'];
  assert.equal(privateServerIdentity(map).dns,'testpc.testtail.ts.net');
  assert.equal(resolveServeIdentity(map,{sourceIp:'100.64.0.2',login:'test@example.test'},[],true).nodeId,'phone1');
  map.Peer.mobile.OS='windows';assert.equal(resolveServeIdentity(map,{sourceIp:'100.64.0.2',login:'test@example.test'},[],true),null);
  map.Peer={};assert.doesNotThrow(()=>privateServerIdentity(map));
  assert.equal(serverPaused({bootId:'current'},'current'),true);
  assert.equal(serverPaused({bootId:'before-reboot'},'current'),false);
  assert.equal(serverPaused(null,'current'),false);
});

test('native OS boot identifier is stable across independent processes, with no wall-clock timestamp recovery',async()=>{
  const first=await currentBootId(),second=await currentBootId();
  assert.equal(first,second);assert.match(first,/^(?:windows|linux):[a-f\d-]{36}$/i);
  assert.equal(canRecoverAfterReboot({state:{marker:'test',bootId:first},bootId:second,marker:'test'}),false);
});

test('scheduled credential renewal stops only its authenticated own loopback controller and never redirects secrets',async()=>{
  let calls=0;
  const state={marker:'YEHABIBI_PRIVATE_REMOTE_V442',pid:123,controlOrigin:'http://127.0.0.1:12345',controlToken:'synthetic-control-token'};
  const send=async(url,options)=>{calls++;assert.equal(url.href,'http://127.0.0.1:12345/stop');assert.equal(options.redirect,'error');assert.equal(options.headers['x-yehabibi-control'],state.controlToken);return Response.json({stopping:true});};
  assert.equal(await requestServerRefresh({state,pid:123,fetch:send}),true);
  for(const change of [{pid:456},{marker:'foreign'},{controlOrigin:'https://external.example'},{controlOrigin:'http://127.0.0.1:12345?credential=private'},{controlOrigin:'http://user@127.0.0.1:12345'}])
    assert.equal(await requestServerRefresh({state:{...state,...change},pid:123,fetch:send}),false);
  assert.equal(calls,1);
});

test('private remote selects an enrolled own-account mobile without pretending an offline phone was tested',()=>{
  const result=selectPrivateDevice(status());assert.equal(result.dns,'testpc.testtail.ts.net');assert.equal(result.deviceId,'phone1');assert.equal(result.online,false);assert.deepEqual(result.allowedLogins,['test@example.test']);
  const unknown=status();unknown.Peer.mobile.UserID=43;assert.throws(()=>selectPrivateDevice(unknown),/testanvändare/);
  const stopped=status();stopped.BackendState='NeedsLogin';assert.throws(()=>selectPrivateDevice(stopped),/logga själv in/);
  const duplicate=status();duplicate.Peer.other={...duplicate.Peer.mobile,ID:'phone2',HostName:'another'};assert.throws(()=>selectPrivateDevice(duplicate),/--device/);assert.equal(selectPrivateDevice(duplicate,'phone1').deviceId,'phone1');
});
test('Serve preflight refuses existing ports including foreground sessions and refuses Funnel',()=>{
  assert.doesNotThrow(()=>assertUnusedServePort({TCP:{443:{HTTPS:true}},Web:{'testpc.testtail.ts.net:443':{Handlers:{'/':{Proxy:'http://127.0.0.1:3000'}}}}},8443));
  for(const value of [{TCP:{8443:{HTTPS:true}}},{Web:{'testpc.testtail.ts.net:8443':{Handlers:{}}}},{Foreground:{ownedElsewhere:{TCP:{8443:{HTTPS:true}}}}},{AllowFunnel:{'testpc.testtail.ts.net:443':true}}])assert.throws(()=>assertUnusedServePort(value,8443));
});
test('cleanup owns exactly one matching HTTPS proxy and never resets another handler or Funnel',()=>{
  const lease={dns:'testpc.testtail.ts.net',port:8443,target:'http://127.0.0.1:12345'};
  const config={TCP:{8443:{HTTPS:true}},Web:{'testpc.testtail.ts.net:8443':{Handlers:{'/':{Proxy:lease.target}}}}};
  assert.equal(ownsServePort(config,lease),true);
  const other=structuredClone(config);other.Web['testpc.testtail.ts.net:8443'].Handlers['/other']={Text:'owned elsewhere'};assert.equal(ownsServePort(other,lease),false);
  const changed=structuredClone(config);changed.Web['testpc.testtail.ts.net:8443'].Handlers['/'].Proxy='http://127.0.0.1:54321';assert.equal(ownsServePort(changed,lease),false);
  const funnel={...config,AllowFunnel:{'testpc.testtail.ts.net:8443':true}};assert.equal(ownsServePort(funnel,lease),false);
  const otherHost=structuredClone(config);otherHost.Web['someone-else.testtail.ts.net:8443']={Handlers:{'/':{Text:'foreign service'}}};assert.equal(ownsServePort(otherHost,lease),false);
  const foreground={...config,Foreground:{foreign:{TCP:{8443:{HTTPS:true}}}}};assert.equal(ownsServePort(foreground,lease),false);
});

test('Serve identity comes from current local netmap and exact proxy source IP, never client node headers',()=>{
  const map=status();map.Peer.mobile.TailscaleIPs=['100.64.0.2','fd7a:115c:a1e0::2'];
  const input={sourceIp:'100.64.0.2',login:'test@example.test'};
  assert.deepEqual(resolveServeIdentity(map,input,['phone1']),{nodeId:'phone1',login:'test@example.test'});
  assert.deepEqual(resolveServeIdentity(map,{...input,sourceIp:'fd7a:115c:a1e0::2'},['phone1']),{nodeId:'phone1',login:'test@example.test'});
  for(const sourceIp of ['',undefined,'100.64.0.2, 100.64.0.3','100.64.0.2:123','[fd7a:115c:a1e0::2]','127.0.0.1','100.64.0.3'])
    assert.equal(resolveServeIdentity(map,{...input,sourceIp,nodeId:'phone1'},['phone1']),null);
  assert.equal(resolveServeIdentity(map,{...input,login:'other@example.test'},['phone1']),null);
  assert.equal(resolveServeIdentity(map,input,['another-phone']),null);
  for(const change of [{InNetworkMap:false},{Tags:['tag:test']},{UserID:43},{ShareeNode:true},{AltSharerUserID:43}]){
    const denied=structuredClone(map);Object.assign(denied.Peer.mobile,change);assert.equal(resolveServeIdentity(denied,input,['phone1']),null);
  }
  const stopped=structuredClone(map);stopped.BackendState='NeedsLogin';assert.equal(resolveServeIdentity(stopped,input,['phone1']),null);
});

test('live identity refresh coalesces reads, fails closed after Tailscale loss and recovers',async()=>{
  let time=0,reads=0,available=true;
  const map=status();map.Peer.mobile.TailscaleIPs=['100.64.0.2'];
  const resolve=createServeIdentityResolver({allowedNodeIds:['phone1'],now:()=>time,readStatus:async()=>{reads++;if(!available)throw new Error('offline');return map;}});
  const input={sourceIp:'100.64.0.2',login:'test@example.test'};
  const results=await Promise.all([resolve(input),resolve(input),resolve(input)]);
  assert.equal(reads,1);assert.ok(results.every(value=>value?.nodeId==='phone1'));
  time=3001;available=false;assert.equal(await resolve(input),null);
  available=true;assert.equal((await resolve(input)).nodeId,'phone1');
});

test('only a verified different OS boot permits stale session recovery; never infer ownership from reused PIDs',()=>{
  const before='windows:11111111-1111-4111-8111-111111111111',after='windows:22222222-2222-4222-8222-222222222222';
  const marker='TEST',state={marker,bootId:before,pid:123},lock={...state};
  assert.equal(canRecoverAfterReboot({state,lock,bootId:after,marker}),true);
  assert.equal(canRecoverAfterReboot({lock,bootId:after,marker}),true);
  for(const override of [{bootId:before},{bootId:''},{state:{marker,pid:123}},{lock:{marker:'foreign',bootId:before}},{lock:{marker,bootId:after}},{state:{marker,bootId:'2026-10-20T08:11:00.000Z'}}])
    assert.equal(canRecoverAfterReboot({state,lock,bootId:after,marker,...override}),false);
  assert.equal(canRecoverAfterReboot({bootId:after,marker}),false);
});

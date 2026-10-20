import test from 'node:test';
import assert from 'node:assert/strict';
import {selectPrivateDevice,assertUnusedServePort,ownsServePort,resolveServeIdentity,createServeIdentityResolver} from '../test-support/remote/tailscale.mjs';
import {canRecoverAfterReboot} from '../test-support/remote/reboot.mjs';
const status=()=>({BackendState:'Running',Self:{Online:true,DNSName:'testpc.testtail.ts.net.',UserID:42},CertDomains:['testpc.testtail.ts.net'],Peer:{mobile:{ID:'phone1',OS:'iOS',DNSName:'phone.testtail.ts.net.',HostName:'phone',UserID:42,Online:false,InNetworkMap:true}},User:{42:{LoginName:'test@example.test'}}});
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
  const marker='TEST',state={marker,bootId:'boot-before',pid:123},lock={...state};
  assert.equal(canRecoverAfterReboot({state,lock,bootId:'boot-after',marker}),true);
  assert.equal(canRecoverAfterReboot({lock,bootId:'boot-after',marker}),true);
  for(const override of [{bootId:'boot-before'},{bootId:''},{state:{marker,pid:123}},{lock:{marker:'foreign',bootId:'boot-before'}},{lock:{marker,bootId:'boot-after'}}])
    assert.equal(canRecoverAfterReboot({state,lock,bootId:'boot-after',marker,...override}),false);
  assert.equal(canRecoverAfterReboot({bootId:'boot-after',marker}),false);
});

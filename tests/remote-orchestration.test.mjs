import test from 'node:test';
import assert from 'node:assert/strict';
import {selectPrivateDevice,assertUnusedServePort,ownsServePort} from '../test-support/remote/tailscale.mjs';
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

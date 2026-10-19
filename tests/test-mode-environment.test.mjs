import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { cleanProcessEnvironment, freePort, waitReady } from '../test-support/local/environment.mjs';

async function fixture(handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return { server, port, url: `http://127.0.0.1:${port}`, close: async () => {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  } };
}

test('isolated child environment excludes provider/runtime settings and avoids Windows libintl locale abort',()=>{
  const previous=Object.fromEntries(['LANG','LC_ALL','GHCRTS','ADYEN_API_KEY'].map(key=>[key,process.env[key]]));
  try {
    Object.assign(process.env,{LANG:'C.UTF-8',LC_ALL:'C.UTF-8',GHCRTS:'-N99',ADYEN_API_KEY:'synthetic-must-not-inherit'});
    const environment=cleanProcessEnvironment();
    assert.equal(environment.GHCRTS,undefined);assert.equal(environment.ADYEN_API_KEY,undefined);
    if(process.platform==='win32'){assert.equal(environment.LANG,'C');assert.equal(environment.LC_ALL,'C');}
  } finally {
    for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});

test('fixed test ports reject an occupied loopback port without disturbing its owner', async () => {
  const occupied = await fixture((request, response) => response.end('existing healthy app'));
  try {
    await assert.rejects(freePort(occupied.port), { code: 'EADDRINUSE' });
    assert.equal(await fetch(occupied.url).then(response => response.text()), 'existing healthy app');
  } finally { await occupied.close(); }
  assert.equal(await freePort(occupied.port), occupied.port, 'A released fixed port can be selected.');
});

test('web readiness requires the current isolated session identity', async () => {
  const isolationId = randomUUID(); let requests = 0;
  const endpoint = await fixture((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ isolation_id: ++requests === 1 ? randomUUID() : isolationId }));
  });
  try {
    await waitReady(endpoint.url, [], 'synthetic-only', isolationId);
    assert.equal(requests, 2, 'Another healthy test session cannot satisfy readiness.');
  } finally { await endpoint.close(); }
});

test('a successful readiness response cannot hide a process that exited during the request', async () => {
  const isolationId = randomUUID(), child = { exitCode: null, signalCode: null };
  const endpoint = await fixture((request, response) => {
    child.exitCode = 1;
    response.end(JSON.stringify({ isolation_id: isolationId }));
  });
  try {
    await assert.rejects(waitReady(endpoint.url, [child], 'synthetic-only', isolationId), /Testprocess avslutades \(1\)/);
  } finally { await endpoint.close(); }
});

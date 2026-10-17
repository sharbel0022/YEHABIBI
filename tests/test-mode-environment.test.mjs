import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { freePort, waitReady } from '../test-support/local/environment.mjs';

async function fixture(handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return { server, port, url: `http://127.0.0.1:${port}`, close: async () => {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  } };
}

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

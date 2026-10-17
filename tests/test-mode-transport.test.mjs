import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { cleanProcessEnvironment, repositoryRoot, redacted } from '../test-support/local/environment.mjs';

test('private notification transport blocks redirects before reaching a second origin', async () => {
  let reached = 0;
  const sink = http.createServer((request, response) => { reached++; response.end('must never receive credentials'); });
  await new Promise(resolve => sink.listen(0, '127.0.0.1', resolve));
  const target = `http://127.0.0.1:${sink.address().port}`;
  const source = http.createServer((request, response) => { response.writeHead(302, { Location: target }); response.end(); });
  await new Promise(resolve => source.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${source.address().port}`;
  try {
    const script = `await import(${JSON.stringify(pathToFileURL(path.join(repositoryRoot, 'test-support/local/transport.mjs')).href)});
      for(const url of [${JSON.stringify(origin)},'https://api.resend.com/emails','https://exp.host/--/api/v2/push/send']) {
        let rejected=false;try{await fetch(url)}catch{rejected=true}if(!rejected)process.exit(3);
      }`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { windowsHide: true, stdio: 'ignore',
      env: { ...cleanProcessEnvironment(), APP_ENV: 'test', NODE_ENV: 'development', TEST_BACKEND_ORIGIN: origin, TEST_PAYMENT_SECRET: 'a'.repeat(64) } });
    assert.equal(await new Promise(resolve => child.once('exit', resolve)), 0);
    assert.equal(reached, 0, 'Redirect target must never receive a request');
  } finally {
    source.closeAllConnections(); sink.closeAllConnections();
    await Promise.all([new Promise(resolve => source.close(resolve)), new Promise(resolve => sink.close(resolve))]);
  }
});

test('private logs and inbox remove order tokens and simulator capabilities', () => {
  const token = 'ab'.repeat(32);
  const output = redacted(`GET /api/orders/CM-123?token=${token}\n{"token":"${token}"}\nGET /__test/payment/lt_${token}/simulate`);
  assert.equal(output.includes(token), false);
  assert.match(output, /REDACTED/);
});

// Regression for ignored JSON credentials being compilable through Metro's
// public bundleEntry parameter. This uses synthetic sentinels, never real keys.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { repositoryRoot as root, cleanProcessEnvironment } from '../test-support/local/environment.mjs';

fs.mkdirSync(path.join(root, '.tmp'), { recursive: true });
const id = randomUUID(), sentinel = randomBytes(32).toString('hex');
const relativeJson = `.tmp/metro-denial-${id}.json`;
const relativeAsset = `.tmp/metro-denial-${id}.png`;
const relativeEnvironment = `.env.metro-denial-${id}.json`;
const files = [relativeJson, relativeAsset, relativeEnvironment].map(relative => path.join(root, relative));
fs.writeFileSync(files[0], JSON.stringify({ sentinel }));
fs.writeFileSync(files[1], sentinel);
fs.writeFileSync(files[2], JSON.stringify({ sentinel }));

let child, log;
try {
  const reservation = net.createServer();
  await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, 'localhost', resolve); });
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const base = `http://localhost:${port}`;
  child = spawn(process.execPath, [path.join(root, 'node_modules/expo/bin/cli'), 'start', '--go', '--localhost', '--port', String(port)], {
    cwd: path.join(root, 'apps/mobile'),
    env: { ...cleanProcessEnvironment(), EXPO_NO_DOTENV: '1' },
    windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
  });
  let spawnFailure;
  child.once('error', error => { spawnFailure = error; });
  log = fs.createWriteStream(path.join(root, '.tmp', `metro-security-${id}.log`));
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => log.write(chunk));
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    assert.ok(!spawnFailure && child.exitCode === null && child.signalCode === null, 'Owned Metro process could not start; see .tmp/metro-security-*.log.');
    try {
      ready = (await fetch(`${base}/status`, { signal: AbortSignal.timeout(1000) }).then(response => response.text())).includes('packager-status:running');
    } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Owned Metro did not become ready; see .tmp/metro-security-*.log.');
  const probes = [
    ['bundleEntry ignored JSON', '/index.bundle?platform=ios&dev=true&bundleEntry=' + encodeURIComponent(relativeJson + '.bundle')],
    ['direct ignored JSON entry', '/' + relativeJson + '.bundle?platform=ios&dev=true'],
    ['ignored JSON source map', '/index.map?platform=ios&dev=true&bundleEntry=' + encodeURIComponent(relativeJson + '.bundle')],
    ['dotenv JSON entry', '/index.bundle?platform=ios&dev=true&bundleEntry=' + encodeURIComponent(relativeEnvironment + '.bundle')],
    ['encoded asset traversal', '/assets/%2e%2e%2f%2e%2e%2f' + relativeAsset + '?platform=ios'],
    ['workspace private asset', '/assets/' + relativeAsset + '?platform=ios'],
  ];
  for (const [label, suffix] of probes) {
    const response = await fetch(base + suffix, { signal: AbortSignal.timeout(30000) });
    const body = await response.text();
    assert.equal(body.includes(sentinel), false, `${label} leaked the synthetic sentinel.`);
    assert.equal(response.ok, false, `${label} unexpectedly returned HTTP ${response.status}.`);
  }
  const symbolicate = await fetch(base + '/symbolicate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stack: [{ file: files[0], methodName: 'probe', lineNumber: 1, column: 0 }] }),
    signal: AbortSignal.timeout(30000),
  });
  assert.equal((await symbolicate.text()).includes(sentinel), false, 'Symbolication leaked the synthetic sentinel.');
  const normal = await fetch(base + '/index.bundle?platform=ios&dev=true&bundleEntry=packages%2Fshared%2Fpackage.json.bundle', { signal: AbortSignal.timeout(30000) });
  assert.equal(normal.status, 200, 'Normal shared JSON must remain compilable.');
  assert.equal((await normal.text()).includes('@yehabibi/shared'), true, 'Positive control did not return the expected shared package.');
  console.log('Metro security integration PASS: 6 denied private bundle/source/assets probes; symbolication does not leak; normal shared JSON works. No real credentials used.');
} finally {
  if (child?.pid && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    else { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5000))]);
    if (process.platform !== 'win32') { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
  }
  log?.end();
  for (const file of files) if (fs.existsSync(file)) fs.unlinkSync(file);
}

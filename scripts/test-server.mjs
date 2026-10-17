import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { activeSessionPath, cleanProcessEnvironment, freePort, repositoryRoot, startTestEnvironment, stopActiveSession } from '../test-support/local/environment.mjs';

const args = new Set(process.argv.slice(2));
if (args.has('--stop')) {
  process.stdout.write(await stopActiveSession() ? 'Den egna lokala testservern har stoppats.\n' : 'Ingen aktiv testsession.\n');
} else if (args.has('--mobile')) {
  if (!fs.existsSync(activeSessionPath)) throw new Error('Starta npm run test:server först.');
  const saved = JSON.parse(fs.readFileSync(activeSessionPath, 'utf8'));
  if (saved.marker !== 'YEHABIBI_ISOLATED_LOCAL_TEST') throw new Error('Okänd testsession.');
  const api = args.has('--android') ? saved.androidApi : saved.origin;
  const metroPort = saved.metroPort || await freePort();
  process.stdout.write(`Expo använder samma isolerade API: ${api}\nAndroid-emulator: välj --android. Fysisk telefon kräver skyddad privat åtkomst; localhost kan inte nås från telefonen.\n`);
  // Android's 10.0.2.2 maps to IPv4 loopback; Windows localhost may otherwise bind Metro to ::1 only.
  const child = spawn(process.execPath, ['--dns-result-order=ipv4first', path.join(repositoryRoot, 'node_modules/expo/bin/cli'), 'start', args.has('--dev-client') ? '--dev-client' : '--go', '--localhost', '--port', String(metroPort), ...(args.has('--android') && !args.has('--no-open') ? ['--android'] : [])], {
    cwd: path.join(repositoryRoot, 'apps/mobile'), windowsHide: true, stdio: 'inherit', env: { ...cleanProcessEnvironment(), EXPO_NO_DOTENV: '1', APP_ENV: 'test', EXPO_PUBLIC_API_URL: api },
  });
  await new Promise(resolve => child.once('exit', resolve));
} else {
  if (args.has('--reset')) await stopActiveSession();
  if (fs.existsSync(activeSessionPath)) throw new Error('En testsession finns redan. Använd --reset för en ny tom databas eller --stop.');
  let complete;
  const finished = new Promise(resolve => { complete = resolve; });
  const session = await startTestEnvironment({ persistent: true, onStop: () => complete() });
  // Never print private order URLs, provider sessions, database keys or the control secret.
  process.stdout.write(`TESTLÄGE – INGA RIKTIGA BESTÄLLNINGAR\nWebb: ${session.origin}\nTestadmin: ${session.adminLogin}\nTestlösenord: ${session.adminPassword}\nLokal inkorg efter inloggning: ${session.inbox}\nAndroid API: ${session.androidApi}\nCtrl+C stoppar bara dessa testprocesser. --reset startar en ny tom isolerad databas.\n`);
  const shutdown = () => session.stop().then(complete);
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  await finished;
}

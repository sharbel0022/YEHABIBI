import fs from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const execute = promisify(execFile);

/** Stable across process restarts, different after a real OS reboot. Never infer
 * ownership from a saved PID: Windows can reuse it for an unrelated process. */
export async function currentBootId() {
  if (process.platform === 'win32') {
    const {stdout} = await execute('powershell.exe', ['-NoProfile','-NonInteractive','-File',
      fileURLToPath(new URL('./windows-boot.ps1',import.meta.url))],
    {windowsHide:true, timeout:15000});
    const value = stdout.trim();
    if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)) throw new Error('Windows omstartsidentitet kunde inte verifieras.');
    return `windows:${value}`;
  }
  if (process.platform === 'linux') return `linux:${fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim()}`;
  throw new Error('Automatisk återställning efter OS-omstart stöds på Windows och Linux.');
}

export function canRecoverAfterReboot({state, lock, bootId, marker}) {
  const records = [state, lock].filter(Boolean);
  const verified=value=>typeof value==='string'&&/^(?:windows|linux):[a-f\d-]{36}$/i.test(value);
  return Boolean(verified(bootId) && records.length && records.every(record => record.marker === marker
    && verified(record.bootId) && record.bootId.split(':')[0]===bootId.split(':')[0] && record.bootId !== bootId));
}

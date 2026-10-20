import fs from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute = promisify(execFile);

/** Stable across process restarts, different after a real OS reboot. Never infer
 * ownership from a saved PID: Windows can reuse it for an unrelated process. */
export async function currentBootId() {
  if (process.platform === 'win32') {
    const {stdout} = await execute('powershell.exe', ['-NoProfile','-NonInteractive','-Command',
      "(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o')"],
    {windowsHide:true, timeout:15000});
    const value = stdout.trim();
    if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value)) throw new Error('Windows omstartsidentitet kunde inte verifieras.');
    return value;
  }
  if (process.platform === 'linux') return fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();
  throw new Error('Automatisk återställning efter OS-omstart stöds på Windows och Linux.');
}

export function canRecoverAfterReboot({state, lock, bootId, marker}) {
  const records = [state, lock].filter(Boolean);
  return Boolean(bootId && records.length && records.every(record => record.marker === marker
    && typeof record.bootId === 'string' && record.bootId && record.bootId !== bootId));
}

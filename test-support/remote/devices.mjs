import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const enrollmentLifetime = 10 * 60 * 1000;
const maxPending = 25, maxDevices = 1000;
const messages = {
  device_invalid: 'Telefonens enhetsbehörighet är ogiltig. Registrera telefonen från datorn.',
  device_pending: 'Telefonen väntar på godkännande på datorn. Jämför registreringskoden innan du godkänner.',
  device_revoked: 'Datorn har återkallat telefonens åtkomst. Ny registrering kräver att du uttryckligen återställer telefonens anslutning.',
  device_identity: 'Enhetsbehörigheten tillhör en annan Tailscale-enhet.',
  device_rate_limited: 'För många anslutningsförsök. Vänta en minut och försök igen.',
  enrollment_limit: 'För många registreringsförsök. Vänta eller återkalla väntande registreringar på datorn.',
  enrollment_expired: 'Registreringen har gått ut. Öppna anslutningen i telefonen igen.',
  invalid_registration: 'Registreringen eller jämförelsekoden stämmer inte.',
};
export function deviceError(code, status = 401) { return Object.assign(new Error(messages[code] || messages.device_invalid), { code, status }); }

function identityValue(identity) {
  const nodeId = identity?.nodeId, login = identity?.login?.toLowerCase();
  if (typeof nodeId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(nodeId)
    || typeof login !== 'string' || !/^[^\s,;<>]{1,200}$/.test(login)) throw deviceError('device_identity', 403);
  return { nodeId, login };
}
function credentialValue(value) {
  // Exactly 32 random bytes encoded as base64url; no keys supplied in URLs or public Expo configuration.
  if (typeof value !== 'string' || !/^[A-Za-z\d_-]{43}$/.test(value)
    || Buffer.from(value, 'base64url').toString('base64url') !== value) throw deviceError('device_invalid');
  return value;
}
const digest = value => createHash('sha256').update(value).digest('hex');
const fingerprint = value => digest(`yehabibi-device-v1\0${value}`);
const binding = (value, identity) => digest(`yehabibi-device-binding-v1\0${identity.nodeId}\0${identity.login}\0${value}`);
const safeEqual = (left, right) => typeof left === 'string' && typeof right === 'string' && left.length === right.length
  && timingSafeEqual(Buffer.from(left), Buffer.from(right));
function metadata(record) {
  return { id: record.id, status: record.status, nodeId: record.nodeId, login: record.login, created_at: record.created_at,
    ...(record.approved_at ? { approved_at: record.approved_at } : {}), ...(record.revoked_at ? { revoked_at: record.revoked_at } : {}),
    ...(record.status === 'pending' ? { comparison_code: record.comparison_code, expires_at: record.expires_at } : {}) };
}

/** Persistent, locally approved customer devices. Only hashes, public metadata and comparison codes reach disk.
 * Every operation reloads the atomic registry so a separate CLI revoke takes effect on the very next API call.
 * An inaccessible or malformed registry always fails closed; ordinary stop never deletes it.
 */
export function createDeviceRegistry({ file, now = Date.now, bootId }) {
  if (typeof file !== 'string' || !file) throw new Error('En lokal fil för enhetsregistret krävs.');
  if (bootId !== undefined && (typeof bootId !== 'string' || !bootId || bootId.length > 256)) throw new Error('Ogiltigt lokalt start-ID för enhetsregistret.');
  file = resolve(file);
  const load = () => {
    if (!existsSync(file)) return [];
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (data.version !== 1 || !Array.isArray(data.devices) || data.devices.length > maxDevices) throw new Error('Ogiltigt lokalt enhetsregister. Åtkomst nekas.');
    const ids = new Set(), hashes = new Set();
    for (const record of data.devices) {
      const identity = identityValue(record);
      if (!/^[a-f\d-]{36}$/.test(record.id || '') || ids.has(record.id) || hashes.has(record.credential_hash)
        || !/^[a-f\d]{64}$/.test(record.credential_hash || '') || !/^[a-f\d]{64}$/.test(record.binding_hash || '')
        || !['pending', 'approved', 'revoked'].includes(record.status) || record.login !== identity.login
        || !Number.isFinite(Date.parse(record.created_at))
        || (record.status === 'pending' && (!/^[A-F\d]{4}-[A-F\d]{4}-[A-F\d]{4}$/.test(record.comparison_code || '') || !Number.isFinite(Date.parse(record.expires_at))))) {
        throw new Error('Ogiltigt lokalt enhetsregister. Åtkomst nekas.');
      }
      ids.add(record.id); hashes.add(record.credential_hash);
    }
    return data.devices;
  };
  const mutate = callback => {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const lock = `${file}.lock`;
    let descriptor;
    try {
      if (existsSync(lock)) {
        // The active controller serializes normal CLI changes. Recover only a lock
        // whose owner demonstrably exited; never terminate a PID or guess by age.
        const previous = readFileSync(lock, 'utf8');
        let owner, previousBoot;
        try { const parsed = JSON.parse(previous); owner = parsed.pid; previousBoot = parsed.bootId; } catch { /* malformed lock fails closed */ }
        if (Number.isSafeInteger(owner) && owner > 0) {
          // The controller supplies an OS-derived boot ID. A proven new boot also
          // handles a stale PID that Windows has reused for an unrelated process.
          let exited = Boolean(bootId && typeof previousBoot === 'string' && previousBoot && bootId !== previousBoot);
          if (!exited) try { process.kill(owner, 0); } catch (error) { exited = error.code === 'ESRCH'; }
          if (exited && readFileSync(lock, 'utf8') === previous) unlinkSync(lock);
        }
      }
      descriptor = openSync(lock, 'wx', 0o600);
      writeFileSync(descriptor, JSON.stringify({ pid: process.pid, ...(bootId ? { bootId } : {}) }));
    }
    catch { throw new Error('Enhetsregistret är låst. Försök igen när det andra kommandot är klart.'); }
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      const records = load(), result = callback(records);
      writeFileSync(temporary, JSON.stringify({ version: 1, devices: records }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      renameSync(temporary, file); chmodSync(file, 0o600);
      return result;
    } finally {
      closeSync(descriptor); unlinkSync(lock);
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  };
  const match = (records, credential, identity) => {
    const record = records.find(item => safeEqual(item.credential_hash, fingerprint(credential)));
    // A revoked secret stays revoked even if presented under a new node or login.
    if (record?.status === 'revoked') throw deviceError('device_revoked');
    if (record && (!safeEqual(record.binding_hash, binding(credential, identity))
      || record.nodeId !== identity.nodeId || record.login !== identity.login)) throw deviceError('device_identity', 403);
    return record;
  };
  return {
    requestEnrollment({ credential, identity }) {
      credentialValue(credential); identity = identityValue(identity);
      return mutate(records => {
        const current = match(records, credential, identity), time = now();
        if (current?.status === 'approved') return { id: current.id, status: 'approved' };
        if (current && Date.parse(current.expires_at) > time) return { id: current.id, status: 'pending', comparison_code: current.comparison_code, expires_at: current.expires_at };
        // Expired pending requests grant nothing and may be pruned. Approved and revoked records persist.
        for (let index = records.length - 1; index >= 0; index--) if (records[index].status === 'pending' && Date.parse(records[index].expires_at) <= time) records.splice(index, 1);
        if (records.length >= maxDevices || records.filter(item => item.status === 'pending').length >= maxPending) throw deviceError('enrollment_limit', 429);
        const record = { id: randomUUID(), status: 'pending', ...identity, credential_hash: fingerprint(credential), binding_hash: binding(credential, identity),
          comparison_code: randomBytes(6).toString('hex').toUpperCase().match(/.{4}/g).join('-'),
          created_at: new Date(time).toISOString(), expires_at: new Date(time + enrollmentLifetime).toISOString() };
        records.push(record);
        return { id: record.id, status: 'pending', comparison_code: record.comparison_code, expires_at: record.expires_at };
      });
    },
    list() { return load().map(metadata); },
    approve(id, comparisonCode) {
      return mutate(records => {
        const record = records.find(item => item.id === id);
        if (!record || record.status !== 'pending' || !safeEqual(record.comparison_code, comparisonCode)) throw deviceError('invalid_registration', 400);
        if (Date.parse(record.expires_at) <= now()) throw deviceError('enrollment_expired', 410);
        record.status = 'approved'; record.approved_at = new Date(now()).toISOString();
        delete record.comparison_code; delete record.expires_at;
        return metadata(record);
      });
    },
    revoke(id) {
      return mutate(records => {
        const record = records.find(item => item.id === id);
        if (!record) throw deviceError('invalid_registration', 400);
        record.status = 'revoked'; record.revoked_at = new Date(now()).toISOString();
        delete record.comparison_code; delete record.expires_at;
        return metadata(record);
      });
    },
    revokeAll() {
      return mutate(records => {
        for (const record of records) { record.status = 'revoked'; record.revoked_at = new Date(now()).toISOString(); delete record.comparison_code; delete record.expires_at; }
        return records.length;
      });
    },
    authenticate(credential, identity) {
      credentialValue(credential); identity = identityValue(identity);
      const record = match(load(), credential, identity);
      if (record?.status === 'pending') throw deviceError('device_pending');
      return record?.status === 'approved' ? metadata(record) : null;
    },
  };
}

import fs from 'node:fs';
import path from 'node:path';
import {isIP} from 'node:net';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute = promisify(execFile);

export function tailscaleExecutable() {
  const installed = process.platform === 'win32' ? path.join(process.env.ProgramFiles || 'C:/Program Files', 'Tailscale/tailscale.exe') : null;
  return installed && fs.existsSync(installed) ? installed : 'tailscale';
}
export async function tailscale(args) {
  try { return (await execute(tailscaleExecutable(), args, {windowsHide:true, timeout:20000, maxBuffer:2*1024*1024})).stdout.trim(); }
  catch (error) { throw new Error(`Tailscale ${args[0]} misslyckades. Kontrollera installation, inloggning och behörighet i Tailscale. ${error.code || ''}`); }
}
export const tailscaleJson = async args => JSON.parse(await tailscale(args));

/** Only call behind our private Serve target. Serve overwrites X-Forwarded-For
 * and removes caller identity headers. The local netmap, not a client node-ID
 * header, supplies the stable device identity. Tagged/shared nodes fail closed. */
export function resolveServeIdentity(status, {sourceIp, login}, allowedNodeIds, allowOwnPhones = false) {
  if (status?.BackendState !== 'Running' || !status.Self?.Online || typeof sourceIp !== 'string'
    || !isIP(sourceIp) || typeof login !== 'string') return null;
  const matches = Object.values(status.Peer || {}).filter(peer => peer.TailscaleIPs?.includes(sourceIp));
  if (matches.length !== 1) return null;
  const peer = matches[0], user = status.User?.[String(peer.UserID)];
  if (!peer.InNetworkMap || peer.Tags?.length || peer.ShareeNode || peer.AltSharerUserID || peer.UserID !== status.Self.UserID
    || !(allowOwnPhones ? ['iOS','android','Android'].includes(peer.OS) : allowedNodeIds?.includes(peer.ID)) || !user?.LoginName
    || user.LoginName.toLowerCase() !== login.toLowerCase()) return null;
  return {nodeId:peer.ID, login:user.LoginName.toLowerCase()};
}

export function createServeIdentityResolver({allowedNodeIds, allowOwnPhones = false, readStatus = () => tailscaleJson(['status','--json']), now = Date.now}) {
  let cached, expires = 0, pending;
  return async input => {
    if (!cached || expires <= now()) {
      if (!pending) pending = Promise.resolve().then(readStatus).then(status => {
        cached = status; expires = now() + 3000; return status;
      }).catch(() => { cached = null; expires = 0; return null; }).finally(() => { pending = null; });
      await pending;
    }
    return resolveServeIdentity(cached, input, allowedNodeIds, allowOwnPhones);
  };
}
export function privateServerIdentity(status) {
  if (status.BackendState !== 'Running' || !status.Self?.Online) throw new Error('Tailscale är inte anslutet. Servern väntar på anslutning.');
  const dns = String(status.Self.DNSName || '').replace(/\.$/, '').toLowerCase();
  const owner = status.User?.[String(status.Self.UserID)];
  if (!/^[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$/.test(dns) || !status.CertDomains?.includes(dns) || !owner?.LoginName || status.Self.Tags?.length) throw new Error('Datorn behöver egen Tailscale-inloggning, MagicDNS och HTTPS.');
  const phones = Object.values(status.Peer || {}).filter(peer => ['iOS','android','Android'].includes(peer.OS)
    && peer.UserID === status.Self.UserID && peer.InNetworkMap && !peer.Tags?.length && !peer.ShareeNode && !peer.AltSharerUserID);
  const device = phones[0];
  return { dns, deviceId:device?.ID, deviceName:device ? String(device.DNSName || device.HostName).replace(/\.$/, '') : '',
    online:device?.Online === true, allowedLogins:[owner.LoginName], phoneIps:phones.flatMap(peer => peer.TailscaleIPs || []) };
}
export function selectPrivateDevice(status, selector) {
  if (status.BackendState !== 'Running' || !status.Self?.Online) throw new Error('Tailscale är inte anslutet. Öppna Tailscale och logga själv in.');
  const dns = String(status.Self.DNSName || '').replace(/\.$/, '').toLowerCase();
  if (!/^[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$/.test(dns) || !status.CertDomains?.includes(dns)) throw new Error('Aktivera MagicDNS och HTTPS för datorn i Tailscale innan fjärrtest.');
  const peers = Object.values(status.Peer || {}).filter(peer => ['iOS','android','Android'].includes(peer.OS));
  const matching = selector ? peers.filter(peer => [peer.ID,peer.HostName,String(peer.DNSName).replace(/\.$/,'')].some(value => value === selector)) : peers;
  if (matching.length !== 1) throw new Error('Välj en registrerad telefon med --device <DNS-namn eller node-ID>. Alla godkända telefoner måste finnas i samma privata tailnet.');
  const device = matching[0], user = status.User?.[String(device.UserID)];
  if (!device.InNetworkMap || !user?.LoginName || device.UserID !== status.Self.UserID) throw new Error('Telefonen måste tillhöra samma inloggade testanvändare; delade eller taggade enheter godkänns inte automatiskt.');
  return {dns, deviceId:device.ID, deviceName:String(device.DNSName || device.HostName).replace(/\.$/,''), online:device.Online === true, allowedLogins:[user.LoginName]};
}
export function assertUnusedServePort(config, port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('HTTPS-port måste vara 1024–65535.');
  function inspect(value) {
    if (!value || typeof value !== 'object') return;
    if (value.TCP?.[String(port)] || Object.keys(value.Web || {}).some(key => key.endsWith(`:${port}`))) throw new Error(`Tailscale-port ${port} används redan; befintlig konfiguration ändras inte.`);
    if (Object.values(value.AllowFunnel || {}).some(Boolean)) throw new Error('Funnel är aktivt. Fjärrtest startas inte med publik Funnel.');
    for (const item of Object.values(value.Foreground || {})) inspect(item);
  }
  inspect(config);
}
export function ownsServePort(config, lease) {
  const key = `${lease.dns}:${lease.port}`;
  if (Object.keys(config.Web || {}).some(name => name !== key && name.endsWith(`:${lease.port}`))) return false;
  const foregroundUsesPort = value => value && typeof value === 'object' && (value.TCP?.[String(lease.port)]
    || Object.keys(value.Web || {}).some(name => name.endsWith(`:${lease.port}`)) || Object.values(value.Foreground || {}).some(foregroundUsesPort));
  if (Object.values(config.Foreground || {}).some(foregroundUsesPort)) return false;
  const handler = config.Web?.[`${lease.dns}:${lease.port}`]?.Handlers;
  const tcp = config.TCP?.[String(lease.port)];
  return tcp?.HTTPS === true && Object.keys(tcp).length === 1 && handler && Object.keys(handler).length === 1
    && handler['/']?.Proxy === lease.target && Object.keys(handler['/']).length === 1
    && !config.AllowFunnel?.[`${lease.dns}:${lease.port}`];
}
export async function releaseServe(lease) {
  const config = await tailscaleJson(['serve','status','--json']);
  if (!ownsServePort(config,lease)) throw new Error('Serve-konfigurationen har ändrats. Den lämnas orörd; granska porten manuellt.');
  await tailscale(['serve',`--https=${lease.port}`,'off']);
}

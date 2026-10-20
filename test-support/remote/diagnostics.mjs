import { isIP } from 'node:net';

const routeFamilies = new Set(['login', 'catalog', 'availability', 'orders', 'payment', 'admin', 'health', 'other']);
const rejections = new Set(['host', 'identity', 'origin', 'session', 'route', 'rate_limit', 'upstream', 'malformed', 'none', 'other']);
const apiFamilies = new Set(['catalog', 'availability', 'orders', 'payment']);
const safeStatus = value => Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
const timestamp = value => {
  const milliseconds = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(milliseconds) && milliseconds > 0 && milliseconds <= 8640000000000000 ? milliseconds : null;
};
const iso = value => value === null ? null : new Date(value).toISOString();

function normalizedIp(value) {
  if (typeof value !== 'string' || value.length > 64 || !/^[a-f\d:.]+$/i.test(value)) return null;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(value);
  if (mapped && isIP(mapped[1]) === 4) return mapped[1];
  if (isIP(value) === 4) return value;
  if (isIP(value) === 6) return new URL(`http://[${value}]/`).hostname;
  return null;
}

/** X-Forwarded-For is overwritten by Tailscale Serve. Never use these observations
 * to grant access: existing Host, identity, origin and credential guards decide that.
 * https://github.com/tailscale/tailscale/blob/main/ipn/ipnlocal/serve.go
 */
export function createIngressRecorder({ phoneIps = [], selfIps = [], now = () => Date.now() } = {}) {
  const phone = new Set(phoneIps.map(normalizedIp).filter(Boolean));
  const self = new Set(selfIps.map(normalizedIp).filter(Boolean));
  const stats = { phoneRequests: 0, selfRequests: 0, otherRequests: 0, unknownRequests: 0, deniedPhoneRequests: 0,
    lastPhoneRequestAt: null, lastPhoneAuthenticatedApiAt: null, lastPhoneStatus: null,
    lastPhoneCategory: null, lastPhoneRejection: null };
  const recent = [];
  return {
    record({ sourceIp, routeFamily, status, rejection = 'none', authenticatedApi = false } = {}) {
      const ip = normalizedIp(sourceIp);
      const source = !ip ? 'unknown' : phone.has(ip) ? 'selected_phone' : self.has(ip) ? 'self' : 'other';
      const category = routeFamilies.has(routeFamily) ? routeFamily : 'other';
      const outcome = rejections.has(rejection) ? rejection : 'other';
      const code = safeStatus(status), at = iso(timestamp(now()));
      if (!at) return;
      stats[`${source === 'selected_phone' ? 'phone' : source}Requests`]++;
      if (source === 'selected_phone') {
        stats.lastPhoneRequestAt = at; stats.lastPhoneStatus = code;
        stats.lastPhoneCategory = category; stats.lastPhoneRejection = outcome;
        if (code >= 400 && code < 500) stats.deniedPhoneRequests++;
        if (authenticatedApi === true && apiFamilies.has(category) && code >= 200 && code < 300 && outcome === 'none') {
          stats.lastPhoneAuthenticatedApiAt = at;
        }
      }
      recent.push({ at, source, category, status: code, rejection: outcome });
      if (recent.length > 20) recent.shift();
    },
    snapshot() { return { ...stats, recent: recent.map(event => ({ ...event })) }; },
  };
}

/** PC self-HTTPS, encrypted peer transport and phone-origin HTTP are separate facts.
 * TSMP bypasses the phone OS stack; even a successful ping cannot verify Safari.
 * https://tailscale.com/docs/reference/ping-types
 */
export function classifyPhoneConnection({ peer, transportReachable = false, transportCheckedAt,
  ingress = {}, pcHttpsSelfCheck = false, now = Date.now(), freshnessMs = 120000 } = {}) {
  const current = timestamp(now) ?? Date.now();
  const maxAge = Number.isFinite(freshnessMs) && freshnessMs > 0 ? freshnessMs : 120000;
  const fresh = value => { const at = timestamp(value); return at !== null && current >= at && current - at <= maxAge; };
  const requestAt = timestamp(ingress.lastPhoneRequestAt), authenticatedAt = timestamp(ingress.lastPhoneAuthenticatedApiAt);
  const phoneHttpObserved = fresh(requestAt);
  const authenticatedPhoneApiObserved = fresh(authenticatedAt);
  const transportVerified = transportReachable === true && fresh(transportCheckedAt ?? current);
  const peerReportedOnline = peer?.Online === true;
  const status = safeStatus(ingress.lastPhoneStatus);
  const latestFailed = phoneHttpObserved && (authenticatedAt === null || requestAt >= authenticatedAt);
  const result = { code: 'unverified', ready: false, pcHttpsSelfCheck: pcHttpsSelfCheck === true,
    peerReportedOnline, transportVerified, phoneHttpObserved, authenticatedPhoneApiObserved,
    lastPhoneRequestAt: iso(requestAt), lastPhoneAuthenticatedApiAt: iso(authenticatedAt),
    lastPhoneStatus: status, blockers: [], message: '' };
  const blocked = (code, message) => { result.code = code; result.message = message; result.blockers.push({ code, message }); return result; };
  if (!peer) return blocked('phone_missing', 'Den valda telefonen saknas i datorns Tailscale-nätverkskarta. Telefonens anslutning är inte verifierad.');
  if (!peerReportedOnline) return blocked('phone_offline', 'Tailscale rapporterar inte den valda telefonen som ansluten. Datorns fungerande HTTPS-självtest bevisar inte att telefonen kan nå servern.');
  if (latestFailed && [401, 403].includes(status)) return blocked('phone_gateway_denied', 'Telefonens HTTPS-anrop når gatewayen men nekas av åtkomstskyddet. Granska den maskerade nekandekategorin; nätvägen till gatewayen fungerar.');
  if (latestFailed && status >= 500) return blocked('phone_backend_error', 'Telefonens HTTPS-anrop når gatewayen men backend svarar med fel. Telefonens nätväg ska inte rapporteras som orsaken.');
  if (authenticatedPhoneApiObserved) {
    result.code = 'authenticated_api_observed'; result.ready = true;
    result.message = 'Ett aktuellt autentiserat API-anrop från telefonens Tailscale-adress har observerats. Det verifierar inte Expo Go eller ett fysiskt 4G/5G-test.';
    return result;
  }
  if (phoneHttpObserved) return blocked('phone_https_observed', 'Telefonens HTTPS-anrop har nått gatewayen. Ett aktuellt autentiserat kund-API-anrop från telefonen saknas fortfarande.');
  if (transportVerified) return blocked('phone_transport_only', 'Krypterad Tailscale-transport till telefonen svarar. Inget aktuellt HTTPS-anrop från telefonen har nått gatewayen; Safari, DNS och appens API är inte verifierade.');
  return blocked('phone_not_verified', 'Telefonens onlineflagga räcker inte som anslutningsbevis. Varken aktuell verifierad transport eller ett HTTPS-anrop från telefonen har observerats.');
}

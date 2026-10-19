import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAudit } from '../scripts/security-audit.mjs';

function fixture() {
  const id = 'GHSA-test-test-test';
  const report = { auditReportVersion: 2, metadata: { vulnerabilities: { high: 2, total: 2 } }, vulnerabilities: {
    leaf: { severity: 'high', via: [{ url: `https://github.com/advisories/${id}` }], nodes: ['node_modules/leaf'] },
    parent: { severity: 'high', via: ['leaf', 'parent'], nodes: ['node_modules/parent'] },
  } };
  const policy = { advisories: { [id]: { owner: 'Maintainer', reason: 'No patch', reviewBy: '2026-10-26' } }, packages: {
    leaf: { severity: 'high', advisories: [id], nodes: { 'node_modules/leaf': '1.0.0' } },
    parent: { severity: 'high', advisories: [id], nodes: { 'node_modules/parent': '2.0.0' } },
  } };
  const lock = { packages: { 'node_modules/leaf': { version: '1.0.0' }, 'node_modules/parent': { version: '2.0.0' } } };
  return { report, policy, lock };
}
const today = new Date('2026-10-19T12:00:00Z');
test('audit gate permits only dated reviewed paths and handles cyclic metavulnerabilities', () => {
  const { report, policy, lock } = fixture();
  assert.deepEqual(evaluateAudit(report, policy, lock, today), []);
});
test('audit gate rejects new advisories, escalations, paths and version changes', () => {
  for (const mutate of [
    ({ report }) => { report.vulnerabilities.leaf.via.push({ url: 'https://github.com/advisories/GHSA-new1-new1-new1' }); },
    ({ report }) => { report.vulnerabilities.leaf.severity = 'critical'; },
    ({ report }) => { report.vulnerabilities.leaf.nodes.push('node_modules/other/node_modules/leaf'); },
    ({ lock }) => { lock.packages['node_modules/leaf'].version = '1.0.1'; },
  ]) {
    const f = fixture(); mutate(f);
    assert.ok(evaluateAudit(f.report, f.policy, f.lock, today).length > 0);
  }
});
test('audit gate rejects expired exceptions and incomplete registry evidence', () => {
  const { report, policy, lock } = fixture();
  assert.ok(evaluateAudit(report, policy, lock, new Date('2026-10-27T00:00:00Z')).length > 0);
  assert.ok(evaluateAudit({ error: { code: 'ENETUNREACH' } }, policy, lock, today).length > 0);
  const incomplete = { ...report, vulnerabilities: {} };
  assert.ok(evaluateAudit(incomplete, policy, lock, today).length > 0);
});
test('audit gate permits patched risks to disappear without retaining an expired waiver', () => {
  const { policy, lock } = fixture();
  const clean = { auditReportVersion: 2, metadata: { vulnerabilities: { total: 0 } }, vulnerabilities: {} };
  assert.deepEqual(evaluateAudit(clean, policy, lock, new Date('2026-10-27T00:00:00Z')), []);
});

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

test('audit gate permits a reviewed advisory to disappear from retained transitive findings', () => {
  const { report, policy, lock } = fixture();
  const removedId = 'GHSA-gone-gone-gone';
  policy.advisories[removedId] = { owner: 'Maintainer', reason: 'Previously reviewed dependency risk', reviewBy: '2026-10-18' };
  policy.packages.leaf.advisories.push(removedId);
  policy.packages.parent.advisories.push(removedId);
  // Both packages remain vulnerable to their original live advisory. The
  // removed advisory's expired waiver is irrelevant to the current report.
  assert.deepEqual(evaluateAudit(report, policy, lock, today), []);
});

test('a globally reviewed advisory on a new dependency path is still rejected after another advisory disappears', () => {
  const { report, policy, lock } = fixture();
  const removedId = 'GHSA-gone-gone-gone';
  const otherPathId = 'GHSA-path-path-path';
  policy.packages.parent.advisories.push(removedId);
  policy.advisories[otherPathId] = { owner: 'Maintainer', reason: 'Reviewed only for another package', reviewBy: '2026-10-26' };
  report.vulnerabilities.parent.via.push({ url: `https://github.com/advisories/${otherPathId}` });
  assert.ok(evaluateAudit(report, policy, lock, today).some(error => error.startsWith('parent: advisory set changed')));
});

test('reduced advisory sets still require unchanged severity, nodes, version and a live waiver', () => {
  for (const mutate of [
    ({ report }) => { report.vulnerabilities.parent.severity = 'critical'; },
    ({ report }) => { report.vulnerabilities.parent.nodes = ['node_modules/other/node_modules/parent']; },
    ({ lock }) => { lock.packages['node_modules/parent'].version = '2.0.1'; },
    ({ policy }) => { policy.advisories['GHSA-test-test-test'].reviewBy = '2026-10-18'; },
  ]) {
    const f = fixture();
    f.policy.packages.parent.advisories.push('GHSA-gone-gone-gone');
    mutate(f);
    assert.ok(evaluateAudit(f.report, f.policy, f.lock, today).length > 0);
  }
});

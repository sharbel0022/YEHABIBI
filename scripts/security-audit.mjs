import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = filename => JSON.parse(readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));

/** Every exception binds an advisory, severity, locked version and dependency location. */
export function evaluateAudit(report, policy, lock, now = new Date()) {
  const errors = [];
  if (report?.auditReportVersion !== 2 || !report.vulnerabilities || !report.metadata?.vulnerabilities || report.error) {
    return ['Registry response is missing a complete npm audit v2 report.'];
  }
  if (report.metadata.vulnerabilities.total !== Object.keys(report.vulnerabilities).length) {
    return ['Registry vulnerability count does not match its detailed records.'];
  }
  const advisories = policy.advisories || {};
  const reviewed = new Set();
  function idsFor(name, seen = new Set()) {
    if (seen.has(name)) return [];
    const next = new Set([...seen, name]);
    return [...new Set((report.vulnerabilities[name]?.via || []).flatMap(via =>
      typeof via === 'string' ? idsFor(via, next) : [via.url?.match(/GHSA-[\w-]+/)?.[0] || `UNKNOWN-${via.source}`]))].sort();
  }
  for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
    const expected = policy.packages?.[name];
    const ids = idsFor(name);
    if (!expected || !ids.length) { errors.push(`${name}: unreviewed vulnerability/dependency path.`); continue; }
    if (vulnerability.severity !== expected.severity) errors.push(`${name}: severity changed to ${vulnerability.severity}.`);
    // Registry updates may remove a reviewed root advisory from a transitive
    // package without removing its other findings. Only additions expand risk.
    if (ids.some(id => !expected.advisories.includes(id))) errors.push(`${name}: advisory set changed (${ids.join(', ')}).`);
    for (const id of ids) {
      const exception = advisories[id];
      if (!exception) { errors.push(`${name}: unreviewed ${id}.`); continue; }
      if (!reviewed.has(id) && (!exception.owner || !exception.reason || !exception.reviewBy
        || !/^\d{4}-\d{2}-\d{2}$/.test(exception.reviewBy)
        || now > new Date(`${exception.reviewBy}T23:59:59Z`))) errors.push(`${id}: missing or expired risk review.`);
      reviewed.add(id);
    }
    const nodes = [...vulnerability.nodes].sort();
    if (JSON.stringify(nodes) !== JSON.stringify(Object.keys(expected.nodes).sort())) errors.push(`${name}: dependency locations changed.`);
    for (const node of nodes) if (lock.packages?.[node]?.version !== expected.nodes[node]) errors.push(`${name}: locked version changed at ${node}.`);
  }
  return errors;
}

export function runAudit(args) {
  // Arguments are fixed locally; never interpolate input or credentials into a shell command.
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', '--json', ...args], {
    cwd: root, encoding: 'utf8', shell: process.platform === 'win32', windowsHide: true, timeout: 180000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || ![0, 1].includes(result.status)) throw new Error(`npm audit unavailable: ${result.error?.message || `exit ${result.status}`}`);
  const report = JSON.parse(result.stdout.replace(/^\uFEFF/, ''));
  if (report.error) throw new Error('npm registry audit returned an error.');
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const policy = readJson(path.join(root, 'docs/security/audit-policy.json'));
    const lock = readJson(path.join(root, 'package-lock.json'));
    const directory = path.join(root, '.tmp/security-audit');
    mkdirSync(directory, { recursive: true });
    let failed = false;
    for (const [name, args] of [['all', []], ['production', ['--omit=dev']]]) {
      const report = runAudit(args);
      writeFileSync(path.join(directory, `${name}.json`), `${JSON.stringify(report, null, 2)}\n`);
      const errors = evaluateAudit(report, policy, lock);
      process.stdout.write(`${name}: ${JSON.stringify(report.metadata.vulnerabilities)}; ${Object.keys(policy.advisories).length} dated advisory exceptions (see docs/SECURITY_REVIEW.md).\n`);
      for (const error of errors) process.stderr.write(`${error}\n`);
      failed ||= errors.length > 0;
    }
    process.exitCode = failed ? 1 : 0;
  } catch (error) {
    process.stderr.write(`Security gate failed closed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

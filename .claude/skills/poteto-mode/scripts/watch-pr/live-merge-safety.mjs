// Opt-in live verification. Creates and deletes only its own private fixture repo.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

if (process.argv.slice(2).join(' ') !== '--live-disposable') {
  console.error('Usage: bun watch-pr/live-merge-safety.mjs --live-disposable');
  process.exit(2);
}
const gh = (...args) => execFileSync('gh', args, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
});
const api = (...args) => JSON.parse(gh('api', ...args));
const login = api('user').login;
const name = `pstack-merge-safety-fixture-${randomUUID()}`;
let created = false;
const repository = `${login}/${name}`;
const path = `repos/${repository}`;
const shippingCli = fileURLToPath(new URL('./ship-pr', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'pstack-live-shipping-'));
const ship = (...args) => JSON.parse(execFileSync('bun', [shippingCli, ...args], { encoding: 'utf8' }));
function inspect(pr) {
  const result = ship('inspect', '--repo', repository, '--pr', String(pr));
  assert.equal(result.kind, 'inspected');
  return result.record;
}
function cancel(record, expectedKind) {
  const file = join(scratch, 'landing.json');
  writeFileSync(file, JSON.stringify({ kind: 'inspected', record }));
  let result;
  try {
    result = ship('cancel-pending', '--record', file);
  } catch (error) {
    result = JSON.parse(error.stdout);
    assert.notEqual(error.status, 0);
  }
  assert.equal(result.kind, expectedKind);
}
async function waitFor(label, read, matches) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const facts = read();
    if (matches(facts)) return facts;
    await delay(1000);
  }
  throw new Error(`fixture did not reach ${label}`);
}
async function waitForMergeable(pr, head, base, baseOid) {
  await waitFor('expected REST revision and mergeability',
    () => api(`${path}/pulls/${pr}`),
    facts => facts.head.sha === head && facts.base.ref === base && facts.mergeable === true);
  return waitFor('expected GraphQL revision', () => inspect(pr),
    facts => facts.revision.headRefOid === head && facts.revision.baseRefName === base &&
      (baseOid === undefined || facts.revision.baseRefOid === baseOid));
}
try {
  const repo = api('user/repos', '-X', 'POST', '-f', `name=${name}`, '-F', 'private=true', '-F', 'auto_init=true', '-f', 'description=Disposable pstack merge-safety verification fixture');
  created = true;
  assert.equal(repo.full_name, repository);
  assert.equal(repo.private, true);
  console.log(`Created private disposable fixture ${repository}`);
  const base = repo.default_branch;
  const baseSha = api(`${path}/git/ref/heads/${base}`).object.sha;
  api(`${path}/git/refs`, '-X', 'POST', '-f', 'ref=refs/heads/fixture-child', '-f', `sha=${baseSha}`);
  const add = api(`${path}/contents/fixture.txt`, '-X', 'PUT', '-f', 'branch=fixture-child', '-f', 'message=Add fixture', '-f', `content=${Buffer.from('first\n').toString('base64')}`);
  const approvedHead = add.commit.sha;
  const pr = api(`${path}/pulls`, '-X', 'POST', '-f', 'title=Disposable merge safety test', '-f', 'head=fixture-child', '-f', `base=${base}`).number;
  const original = inspect(pr);
  assert.equal(original.revision.headRefOid, approvedHead);
  assert.equal(original.revision.baseRefName, base);
  assert.equal(original.pending.autoMerge, false);
  assert.equal(original.pending.queueEntryId, null);
  cancel(original, 'cancelled');
  console.log('PASS: both pending mechanisms read independently as absent');

  const next = api(`${path}/contents/fixture.txt`, '-X', 'PUT', '-f', 'branch=fixture-child', '-f', 'message=Change after verification', '-f', `sha=${add.content.sha}`, '-f', `content=${Buffer.from('second\n').toString('base64')}`);
  const beforeBaseMove = await waitForMergeable(pr, next.commit.sha, base);
  cancel(original, 'changed');
  const advancedBase = api(`${path}/contents/base-fixture.txt`, '-X', 'PUT', '-f', `branch=${base}`, '-f', 'message=Advance base', '-f', `content=${Buffer.from('base advance\n').toString('base64')}`);
  await waitForMergeable(pr, next.commit.sha, base, advancedBase.commit.sha);
  cancel(beforeBaseMove, 'changed');
  console.log('PASS: canonical cancellation rejects changed head and base revision records');
  let refused = false;
  try {
    gh('pr', 'merge', String(pr), '--repo', repository, '--squash', '--match-head-commit', approvedHead);
  } catch (error) {
    if (!/head.*(changed|modified|match)|expected.*head|head.*expected/i.test(String(error.stderr))) throw error;
    refused = true;
  }
  assert.equal(refused, true, 'service must reject the old verified head');
  assert.equal(inspect(pr).state, 'OPEN');
  console.log('PASS: stale head rejected by live gh merge; PR remains open');

  // Exercise the service mutation directly as well as gh's possible preflight.
  let atomicRefusal = false;
  try {
    api(`${path}/pulls/${pr}/merge`, '-X', 'PUT', '-f', `sha=${approvedHead}`, '-f', 'merge_method=squash');
  } catch (error) {
    if (!/HTTP 409/.test(String(error.stderr))) throw error;
    atomicRefusal = true;
  }
  assert.equal(atomicRefusal, true, 'merge endpoint must reject mismatched sha');
  assert.equal(inspect(pr).state, 'OPEN');
  console.log('PASS: REST merge endpoint rejects stale sha with HTTP 409');

  api(`${path}/git/refs`, '-X', 'POST', '-f', 'ref=refs/heads/fixture-destination', '-f', `sha=${baseSha}`);
  api(`${path}/pulls/${pr}`, '-X', 'PATCH', '-f', 'base=fixture-destination');
  const retargeted = await waitForMergeable(pr, next.commit.sha, 'fixture-destination');
  assert.equal(retargeted.revision.headRefOid, next.commit.sha);
  assert.equal(retargeted.revision.baseRefName, 'fixture-destination');
  console.log('PASS: destination changes independently of head; requires reassessment');
  api(`${path}/pulls/${pr}`, '-X', 'PATCH', '-f', `base=${base}`);
  await waitForMergeable(pr, next.commit.sha, base);
  gh('pr', 'merge', String(pr), '--repo', repository, '--squash', '--match-head-commit', next.commit.sha);
  const merged = await waitFor('merged state', () => inspect(pr), facts => facts.state === 'MERGED');
  assert.equal(merged.state, 'MERGED');
  assert.equal(merged.revision.headRefOid, next.commit.sha);
  assert.equal(merged.revision.baseRefName, base);
  assert.ok(merged.mergeCommitOid);
  assert.equal(api(`${path}/git/ref/heads/${base}`).object.sha, merged.mergeCommitOid);
  const file = api(`${path}/contents/fixture.txt?ref=${base}`);
  assert.equal(Buffer.from(file.content, 'base64').toString(), 'second\n');
  console.log('PASS: guarded current head merged into intended base with expected content');
  console.log('LIMIT: active auto-merge, merge queue gates, and Origin are not exercised. No protection settings changed.');
} finally {
  rmSync(scratch, { recursive: true, force: true });
  if (created) {
    // A throw here would replace the error that got us into finally.
    try {
      gh('repo', 'delete', repository, '--yes');
      console.log(`Deleted private disposable fixture ${repository}`);
    } catch (error) {
      console.error(`Could not delete private fixture ${repository}: ${String(error.stderr ?? error.message).trim()}`);
      console.error(`Delete it by hand:\n  gh repo delete ${repository} --yes`);
      process.exitCode = 1;
    }
  }
}

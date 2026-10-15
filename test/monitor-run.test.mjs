// End-to-end run of scripts/monitor.mjs against a local page and a faked Claude answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const filler = 'Visitor information for the museum. '.repeat(10);
let pageBody = `<p>${filler}</p><p>Tickets go on sale on the 10th of each month at 10:00 (Japan time).</p>`;

test('first run saves a snapshot, a rule change produces a proposal', async () => {
  const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<html><body>${pageBody}</body></html>`); });
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/tickets`;
  const root = mkdtempSync(join(tmpdir(), 'jtc-'));
  mkdirSync(join(root, 'data/facilities'), { recursive: true });
  const facility = { id: 'demo', name: 'Demo Museum', shortName: 'Demo', watchUrls: [url], officialUrl: url, rule: { type: 'monthly', day: 10, time: '10:00', monthsAhead: 1 }, status: 'secondary', sources: [], lastVerifiedAt: '2026-10-01T00:00:00+09:00' };
  writeFileSync(join(root, 'data/facilities/demo.json'), JSON.stringify(facility));
  writeFileSync(join(root, 'data/changelog.json'), '[]');
  const fake = join(root, 'fake.json');
  writeFileSync(fake, JSON.stringify({ ruleChanged: true, ruleType: 'monthly', day: 1, time: '12:00', monthsAhead: 1, windowStartDay: null, days: null, resultsDay: null, paymentDay: null, checkFromDaysBefore: null, evidenceQuote: 'Tickets go on sale on the 1st of each month at 12:00 (Japan time).', summary: 'Release moved from the 10th at 10:00 to the 1st at 12:00 JST.' }));
  const run = () => new Promise((resolve, reject) => {
    // Run in a child process so the server in this process keeps answering.
    import('node:child_process').then(({ execFile }) => execFile(process.execPath, ['scripts/monitor.mjs'], { env: { ...process.env, JTC_ROOT: root, MONITOR_FAKE_EXTRACTION: fake } }, (err, out) => (err ? reject(err) : resolve(out))));
  });
  try {
    const first = await run();
    assert.match(first, /first snapshot saved/);
    const second = await run();
    assert.match(second, /unchanged/);

    pageBody = `<p>${filler}</p><p>Tickets go on sale on the 1st of each month at 12:00 (Japan time).</p>`;
    const third = await run();
    assert.match(third, /1 proposal\(s\), 1 rule file\(s\) changed/);
    const updated = JSON.parse(readFileSync(join(root, 'data/facilities/demo.json'), 'utf8'));
    assert.deepEqual(updated.rule, { type: 'monthly', day: 1, time: '12:00', monthsAhead: 1 });
    assert.equal(updated.status, 'official');
    const body = readFileSync(join(root, 'data/monitor/pr-body.md'), 'utf8');
    assert.match(body, /\*\*Before:\*\* Tickets go on sale on the 10th/);
    assert.match(body, /\*\*After:\*\* Tickets go on sale on the 1st/);
    assert.equal(JSON.parse(readFileSync(join(root, 'data/changelog.json'), 'utf8')).length, 1);
  } finally {
    server.close();
  }
});

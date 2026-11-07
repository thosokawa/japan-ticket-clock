// Daily check of every official booking page.
//   unchanged page          -> refresh lastCheckedAt in data/monitor/status.json
//   changed page            -> ask Claude whether the release rule changed
//     rule unchanged        -> refresh the facility's lastVerifiedAt
//     rule changed          -> write the proposed rule into the facility file and a PR body;
//                              the workflow opens a pull request for a person to approve
//   fetch failing 3+ days   -> listed in data/monitor/alerts.md for the workflow to raise
//
// Usage: node scripts/monitor.mjs [--dry-run] [--only=<facility-id>]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlToText, dropVolatileLines, sha256, lineDiff, quoteAppears } from '../src/monitor/text.mjs';
import { describeRule } from '../src/rules.mjs';

// JTC_ROOT lets tests run against a copy of the data.
const root = process.env.JTC_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const only = [...args].find((a) => a.startsWith('--only='))?.slice(7);
const now = new Date();
const today = now.toISOString().slice(0, 10);
const MIN_TEXT = 200; // shorter than this usually means a bot wall or a JavaScript-only page
const USER_AGENT = 'JapanTicketClockBot/0.1 (+https://github.com/thosokawa/japan-ticket-clock; checks booking rules once a day)';

const monitorDir = join(root, 'data/monitor');
const snapDir = join(monitorDir, 'snapshots');
mkdirSync(snapDir, { recursive: true });
const statusPath = join(monitorDir, 'status.json');
const status = existsSync(statusPath) ? JSON.parse(readFileSync(statusPath, 'utf8')) : {};
// Claude's last answer per page. While a review pull request is open, main keeps the old snapshot,
// so the same page shows up as changed every day; the saved answer is reused instead of asking again.
const answersPath = join(monitorDir, 'claude-answers.json');
const answers = existsSync(answersPath) ? JSON.parse(readFileSync(answersPath, 'utf8')) : {};
let usageSummary = () => 'Claude usage: none';
const slug = (url) => url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 120);

async function fetchPlain(url) {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, 'accept-language': 'en,ja;q=0.8' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return dropVolatileLines(htmlToText(await res.text()));
}

// Real browser for pages that need JavaScript or turn away simple clients. Optional dependency.
let browser;
async function fetchWithBrowser(url) {
  const { chromium } = await import('playwright');
  browser ??= await chromium.launch();
  const page = await browser.newPage({ userAgent: USER_AGENT });
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    return dropVolatileLines(htmlToText(await page.content()));
  } finally {
    await page.close();
  }
}

async function getText(url) {
  try {
    const text = await fetchPlain(url);
    if (text.length >= MIN_TEXT) return { text, via: 'fetch' };
  } catch {
    // fall through to the browser
  }
  return { text: await fetchWithBrowser(url), via: 'browser' };
}

const facilityFiles = readdirSync(join(root, 'data/facilities')).filter((f) => f.endsWith('.json'));
const proposals = [];
const alerts = [];
let changedFiles = 0;

for (const file of facilityFiles) {
  const fPath = join(root, 'data/facilities', file);
  const facility = JSON.parse(readFileSync(fPath, 'utf8'));
  if (only && facility.id !== only) continue;

  for (const url of facility.watchUrls) {
    const key = `${facility.id}:${url}`;
    const st = (status[key] ??= { failures: 0 });
    let page;
    try {
      page = await getText(url);
      if (page.text.length < MIN_TEXT) throw new Error(`page text too short (${page.text.length} chars)`);
    } catch (e) {
      st.failures += 1;
      st.lastError = `${today}: ${e.message}`;
      console.log(`✗ ${key} (${st.failures} in a row): ${e.message}`);
      if (st.failures >= 3) alerts.push(`- ${facility.shortName}: ${url} has failed ${st.failures} days in a row (${e.message})`);
      continue;
    }
    st.failures = 0;
    st.lastCheckedAt = now.toISOString();
    st.via = page.via;

    const snapPath = join(snapDir, facility.id, `${slug(url)}.txt`);
    const previous = existsSync(snapPath) ? readFileSync(snapPath, 'utf8') : null;
    const hash = sha256(page.text);
    if (previous !== null && sha256(previous) === hash) {
      console.log(`= ${key} unchanged`);
      continue;
    }
    mkdirSync(dirname(snapPath), { recursive: true });
    if (!dryRun) writeFileSync(snapPath, page.text);
    if (previous === null) {
      console.log(`+ ${key} first snapshot saved`);
      continue;
    }

    const mod = await import('../src/monitor/extract-rule.mjs');
    const { extractRule, toRule } = mod;
    usageSummary = mod.usageSummary;
    const ruleHash = sha256(JSON.stringify(facility.rule));
    const saved = answers[key];
    let result;
    if (saved && saved.pageHash === hash && saved.ruleHash === ruleHash) {
      console.log(`~ ${key} changed; same page as last time, reusing Claude's answer`);
      result = { ok: true, extraction: saved.extraction };
    } else {
      console.log(`~ ${key} changed; asking Claude`);
      // MONITOR_FAKE_EXTRACTION (a JSON file) replaces the Claude call in tests.
      result = process.env.MONITOR_FAKE_EXTRACTION
        ? { ok: true, extraction: JSON.parse(readFileSync(process.env.MONITOR_FAKE_EXTRACTION, 'utf8')) }
        : await extractRule({ facility, url, pageText: page.text });
      if (result.ok) answers[key] = { pageHash: hash, ruleHash, extraction: result.extraction, answeredAt: today };
    }
    const diff = lineDiff(previous, page.text);
    if (!result.ok) {
      proposals.push({ facility, url, diff, note: `Automatic reading failed (${result.reason}). Please check this page by hand.` });
      continue;
    }
    const x = result.extraction;
    if (!x.ruleChanged) {
      console.log(`  rule unchanged: ${x.summary}`);
      facility.lastVerifiedAt = now.toISOString();
      if (!dryRun) writeFileSync(fPath, JSON.stringify(facility, null, 2) + '\n');
      continue;
    }
    const rule = toRule(x);
    const quoted = quoteAppears(x.evidenceQuote, page.text);
    const note = !rule
      ? 'Claude reported a change but the proposed rule is incomplete. The rule file was not changed; please check by hand.'
      : !quoted
        ? 'The evidence sentence Claude gave could not be found on the page. The rule file was not changed; please check by hand.'
        : null;
    if (note) {
      proposals.push({ facility, url, diff, extraction: x, note });
      continue;
    }
    const before = describeRule(facility.rule);
    facility.rule = rule;
    facility.status = 'official';
    facility.lastVerifiedAt = now.toISOString();
    facility.sources = [{ url, quote: x.evidenceQuote, checkedAt: today }, ...facility.sources.filter((s) => s.url !== url)];
    if (!dryRun) {
      writeFileSync(fPath, JSON.stringify(facility, null, 2) + '\n');
      const clPath = join(root, 'data/changelog.json');
      const changelog = JSON.parse(readFileSync(clPath, 'utf8'));
      changelog.push({ date: today, facility: facility.id, text: x.summary });
      writeFileSync(clPath, JSON.stringify(changelog, null, 2) + '\n');
    }
    changedFiles += 1;
    proposals.push({ facility, url, diff, extraction: x, before, after: describeRule(rule) });
  }
}
await browser?.close();

if (!dryRun) {
  writeFileSync(statusPath, JSON.stringify(status, null, 2) + '\n');
  writeFileSync(answersPath, JSON.stringify(answers, null, 2) + '\n');
  writeFileSync(join(monitorDir, 'alerts.md'), alerts.length ? `Official pages that could not be read:\n\n${alerts.join('\n')}\n` : '');
}

// Pull request body for the reviewer. Written only when there is something to review.
if (proposals.length) {
  const fence = (lines) => lines.slice(0, 15).map((l) => `    ${l}`).join('\n') || '    (none)';
  const body = [
    `Daily check on ${today} found ${proposals.length} official page change(s) to review.`,
    '',
    ...proposals.flatMap((p) => [
      `## ${p.facility.shortName}`,
      `Page: ${p.url}`,
      '',
      p.note ? `**Needs a manual check:** ${p.note}` : `**Before:** ${p.before}\n\n**After:** ${p.after}\n\n**Evidence on the page:** “${p.extraction.evidenceQuote}”`,
      '',
      'Lines added on the page:',
      fence(p.diff.added),
      '',
      'Lines removed from the page:',
      fence(p.diff.removed),
      '',
    ]),
    'Merging this pull request publishes the change and adds it to the public changelog. Close it to discard.',
  ].join('\n');
  if (!dryRun) writeFileSync(join(monitorDir, 'pr-body.md'), body);
  console.log(`\n${proposals.length} proposal(s), ${changedFiles} rule file(s) changed.`);
} else if (!dryRun && existsSync(join(monitorDir, 'pr-body.md'))) {
  writeFileSync(join(monitorDir, 'pr-body.md'), '');
}
console.log(usageSummary());

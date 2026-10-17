import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { facilityPage, homePage, difficultyText, esc } from '../src/templates.mjs';

const dir = new URL('../data/facilities/', import.meta.url);
const facilities = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
const FACT_KEYS = ['location', 'price', 'visitLength', 'bookAhead'];

test('every facility has a category, an intro and supported facts', () => {
  for (const f of facilities) {
    assert.ok(['attractions', 'trains', 'events', 'sights'].includes(f.category), `${f.id}: category`);
    assert.ok(f.intro && f.intro.length > 40, `${f.id}: intro`);
    assert.ok(f.facts && Object.keys(f.facts).every((k) => FACT_KEYS.includes(k)), `${f.id}: facts keys`);
  }
});

test('facility page shows the intro and only the facts that are present', () => {
  const site = { name: 'Test', baseUrl: 'https://example.com', operator: 'Test' };
  const f = facilities.find((x) => x.id === 'nintendo-museum');
  const html = facilityPage({ site, f, affiliates: {}, changelog: [], now: new Date('2026-10-17T00:00:00Z') });
  assert.ok(html.indexOf('class="intro"') > html.indexOf('class="lede"'));
  assert.match(html, /<dt>Where<\/dt><dd>Uji, Kyoto Prefecture<\/dd>/);
  assert.doesNotMatch(html, /<dt>Price<\/dt>/);
});

test('every facility has booking steps, visitor tips, popularity and difficulty', () => {
  const ranks = facilities.map((f) => f.popularity).sort((a, b) => a - b);
  assert.deepEqual(ranks, facilities.map((_, i) => i + 1), 'popularity ranks are unique and run 1..N');
  for (const f of facilities) {
    assert.ok(Array.isArray(f.bookingSteps) && f.bookingSteps.length >= 4 && f.bookingSteps.length <= 9, `${f.id}: bookingSteps`);
    assert.ok(f.bookingSteps.every((x) => typeof x === 'string' && x.length > 10), `${f.id}: bookingSteps are strings`);
    assert.ok(Array.isArray(f.visitorTips) && f.visitorTips.length >= 2 && f.visitorTips.length <= 5, `${f.id}: visitorTips`);
    assert.ok(f.visitorTips.every((x) => typeof x === 'string' && x.length > 10), `${f.id}: visitorTips are strings`);
    assert.ok(typeof f.popularityNote === 'string' && f.popularityNote.length > 20, `${f.id}: popularityNote`);
    assert.ok(['minutes', 'days', 'available'].includes(f.difficulty), `${f.id}: difficulty`);
    assert.ok(typeof f.difficultyNote === 'string' && f.difficultyNote.length > 20, `${f.id}: difficultyNote`);
    assert.equal(f.howToBuy, undefined, `${f.id}: howToBuy was replaced by bookingSteps`);
    assert.equal(f.rulesToKnow, undefined, `${f.id}: rulesToKnow was merged into visitorTips`);
  }
});

const site = { name: 'Test', baseUrl: 'https://example.com', operator: 'Test' };
const now = new Date('2026-10-17T00:00:00Z');

test('facility page shows the steps in order, the tips and the difficulty', () => {
  const f = facilities.find((x) => x.id === 'ghibli-museum');
  const html = facilityPage({ site, f, affiliates: {}, changelog: [], now });
  assert.match(html, /<h2>How to book, step by step<\/h2>\s*<ol class="steps">/);
  const items = [...html.matchAll(/<ol class="steps">(.*?)<\/ol>/gs)][0][1].match(/<li>/g);
  assert.equal(items.length, f.bookingSteps.length);
  assert.ok(html.indexOf(esc(f.bookingSteps[0])) < html.indexOf(esc(f.bookingSteps[1])));
  assert.match(html, /<h2>Good to know for overseas visitors<\/h2>/);
  assert.doesNotMatch(html, /Rules to know|How to buy<\/h2>/);
  assert.match(html, /How hard to get:<\/strong> Usually sells out within minutes of release/);
  assert.ok(html.indexOf('class="difficulty"') < html.indexOf('class="next"'), 'difficulty sits by the status badge, above the release box');
  assert.match(html, /id="basis"/);
});

test('lottery places say so instead of "sells out"', () => {
  const f = facilities.find((x) => x.id === 'nintendo-museum');
  assert.equal(difficultyText(f), 'Given out by lottery, and hard to win');
  assert.equal(difficultyText(f, 'short'), 'Lottery, hard to win');
  assert.equal(difficultyText({ difficulty: 'available', rule: { type: 'monthly' } }, 'short'), 'Usually available');
});

test('home list rows carry a difficulty label and sort keys; sort control lists the three orders', () => {
  const html = homePage({ site, facilities, now, affiliates: {} });
  const rows = [...html.matchAll(/<li class="card"[^>]*>/g)].map((m) => m[0]);
  assert.equal(rows.length, facilities.length);
  for (const r of rows) assert.match(r, /data-soonest="\d+" data-popular="\d+" data-hardest="[012]"/);
  assert.equal((html.match(/class="diff diff-/g) ?? []).length, facilities.length);
  assert.match(html, /data-by="soonest"[^>]*>Opening soonest</);
  assert.match(html, /data-by="popular"[^>]*>Most popular</);
  assert.match(html, /data-by="hardest"[^>]*>Hardest to get</);
  assert.match(html, /<ul class="what">/);
});

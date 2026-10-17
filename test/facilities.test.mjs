import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { facilityPage } from '../src/templates.mjs';

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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseForVisit, upcomingReleases, describeRule, jstDate } from '../src/rules.mjs';

const iso = (d) => d.toISOString();

test('monthly rule, next month (Ghibli Museum)', () => {
  const rule = { type: 'monthly', day: 10, time: '10:00', monthsAhead: 1 };
  const r = releaseForVisit(rule, '2026-12-25');
  assert.equal(iso(r.opensAt), '2026-11-10T01:00:00.000Z'); // 10:00 JST
  assert.equal(r.timeKnown, true);
});

test('monthly rule, two months ahead crossing a year (Ghibli Park)', () => {
  const rule = { type: 'monthly', day: 10, time: '14:00', monthsAhead: 2 };
  assert.equal(iso(releaseForVisit(rule, '2027-01-05').opensAt), '2026-11-10T05:00:00.000Z');
  // Official example: December 2026 goes on sale October 10th 2026 at 2 p.m. JST.
  assert.equal(iso(releaseForVisit(rule, '2026-12-01').opensAt), iso(jstDate(2026, 10, 10, '14:00')));
});

test('monthly rule with window starting on the 11th (Kirby Cafe)', () => {
  const rule = { type: 'monthly', day: 10, time: '18:00', monthsAhead: 1, windowStartDay: 11 };
  // Feb 11 - Mar 10 opens Jan 10.
  assert.equal(iso(releaseForVisit(rule, '2027-02-11').opensAt), iso(jstDate(2027, 1, 10, '18:00')));
  assert.equal(iso(releaseForVisit(rule, '2027-03-10').opensAt), iso(jstDate(2027, 1, 10, '18:00')));
  assert.equal(iso(releaseForVisit(rule, '2027-03-11').opensAt), iso(jstDate(2027, 2, 10, '18:00')));
});

test('days_before rule crosses month boundary (Pokemon Cafe)', () => {
  const rule = { type: 'days_before', days: 31, time: '18:00' };
  assert.equal(iso(releaseForVisit(rule, '2026-12-01').opensAt), iso(jstDate(2026, 10, 31, '18:00')));
});

test('lottery rule (Nintendo Museum)', () => {
  const rule = { type: 'lottery', monthsAhead: 3, resultsDay: 1, paymentDay: 7 };
  const r = releaseForVisit(rule, '2027-02-14');
  assert.equal(r.kind, 'lottery');
  assert.equal(iso(r.opensAt), iso(jstDate(2026, 11, 1)));
  assert.equal(iso(r.steps[1].at), iso(jstDate(2026, 12, 1, '12:00')));
  assert.equal(iso(r.steps[2].at), iso(jstDate(2026, 12, 7, '23:59')));
});

test('upcoming monthly releases skip ones already past', () => {
  const rule = { type: 'monthly', day: 10, time: '10:00', monthsAhead: 1 };
  const now = jstDate(2026, 10, 15, '20:00');
  const list = upcomingReleases(rule, now, 2);
  assert.equal(list.length, 2);
  assert.equal(iso(list[0].opensAt), iso(jstDate(2026, 11, 10, '10:00')));
  assert.equal(list[0].coversFrom, '2026-12-01');
  assert.equal(list[0].coversTo, '2026-12-31');
});

test('upcoming lottery includes the current open month', () => {
  const rule = { type: 'lottery', monthsAhead: 3, resultsDay: 1, paymentDay: 7 };
  const list = upcomingReleases(rule, jstDate(2026, 10, 15, '20:00'), 1);
  assert.equal(list[0].coversFrom, '2027-01-01');
  assert.equal(list[0].coversTo, '2027-01-31');
});

test('describeRule ordinals', () => {
  assert.match(describeRule({ type: 'monthly', day: 10, time: '10:00', monthsAhead: 1 }), /10th of each month at 10:00 JST/);
  assert.match(describeRule({ type: 'monthly', day: 10, time: '18:00', monthsAhead: 1, windowStartDay: 11 }), /11th to the 10th/);
  assert.match(describeRule({ type: 'lottery', monthsAhead: 3, resultsDay: 1, paymentDay: 7 }), /1st of the next month.*7th/);
});

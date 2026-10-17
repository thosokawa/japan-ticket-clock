import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseForVisit, upcomingReleases, describeRule, jstDate, hasFixedReleases } from '../src/rules.mjs';

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

test('months_before rule, same date earlier (JR one month, Disney hotels four months)', () => {
  const jr = { type: 'months_before', monthsAhead: 1, time: '10:00' };
  assert.equal(iso(releaseForVisit(jr, '2026-12-25').opensAt), iso(jstDate(2026, 11, 25, '10:00')));
  // Crosses a year.
  assert.equal(iso(releaseForVisit(jr, '2027-01-15').opensAt), iso(jstDate(2026, 12, 15, '10:00')));
  // Official example: an Oct 31 stay opens July 1 at 11:00 (there is no June 31).
  const hotel = { type: 'months_before', monthsAhead: 4, time: '11:00' };
  assert.equal(iso(releaseForVisit(hotel, '2026-10-31').opensAt), iso(jstDate(2026, 7, 1, '11:00')));
});

test('months_before rule, dates missing in the earlier month open on the 1st of the next', () => {
  const disney = { type: 'months_before', monthsAhead: 2, time: '14:00' };
  assert.equal(iso(releaseForVisit(disney, '2027-04-28').opensAt), iso(jstDate(2027, 2, 28, '14:00')));
  assert.equal(iso(releaseForVisit(disney, '2027-04-29').opensAt), iso(jstDate(2027, 3, 1, '14:00')));
  assert.equal(iso(releaseForVisit(disney, '2027-04-30').opensAt), iso(jstDate(2027, 3, 1, '14:00')));
  // Leap year: Feb 29 exists.
  assert.equal(iso(releaseForVisit(disney, '2028-04-29').opensAt), iso(jstDate(2028, 2, 29, '14:00')));
  assert.equal(upcomingReleases(disney, jstDate(2026, 10, 17)).length, 0);
});

const sumo = {
  type: 'fixed_dates',
  sales: [
    { event: 'March 2027 tournament', opensAt: '2027-02-06', time: '10:00', coversFrom: '2027-03-14', coversTo: '2027-03-28' },
    { event: 'January 2027 tournament', opensAt: '2026-12-05', time: '10:00', coversFrom: '2027-01-10', coversTo: '2027-01-24' },
    { event: 'November 2026 tournament', opensAt: '2026-09-19', time: '10:00', coversFrom: '2026-11-08', coversTo: '2026-11-22' },
  ],
};

test('fixed_dates rule: visit inside a covered event, and outside any', () => {
  const r = releaseForVisit(sumo, '2027-01-12');
  assert.equal(r.kind, 'release');
  assert.equal(iso(r.opensAt), iso(jstDate(2026, 12, 5, '10:00')));
  assert.equal(r.timeKnown, true);
  assert.equal(releaseForVisit(sumo, '2027-02-01'), null);
});

test('fixed_dates upcoming: sorted, past sales skipped, event name kept', () => {
  const list = upcomingReleases(sumo, jstDate(2026, 10, 17, '12:00'), 5);
  assert.equal(list.length, 2);
  assert.equal(list[0].event, 'January 2027 tournament');
  assert.equal(list[0].label, 'Tickets go on sale');
  assert.equal(list[1].coversFrom, '2027-03-14');
  assert.equal(hasFixedReleases(sumo), true);
  assert.equal(hasFixedReleases({ type: 'months_before', monthsAhead: 1 }), false);
});

test('fixed_dates lottery window stays listed while open; estimated dates are checks', () => {
  const rule = {
    type: 'fixed_dates',
    kind: 'lottery',
    sales: [
      { event: 'November 2026 tours', opensAt: '2026-10-05', time: '15:00', closesAt: '2026-10-12', closesTime: '23:59', coversFrom: '2026-11-01', coversTo: '2026-11-30' },
      { event: 'December 2026 tours', opensAt: '2026-11-01', estimated: true, coversFrom: '2026-12-01', coversTo: '2026-12-31' },
    ],
  };
  const [open] = upcomingReleases(rule, jstDate(2026, 10, 8, '12:00'), 1);
  assert.equal(open.label, 'Lottery entries open now');
  assert.equal(iso(open.closesAt), iso(jstDate(2026, 10, 12, '23:59')));
  const [next] = upcomingReleases(rule, jstDate(2026, 10, 13), 1);
  assert.equal(next.estimated, true);
  assert.equal(next.timeKnown, false);
  assert.match(next.label, /not announced/);
  assert.equal(releaseForVisit(rule, '2026-12-24').kind, 'check');
  assert.equal(releaseForVisit(rule, '2026-11-24').kind, 'lottery');
});

test('describeRule for the new rule types', () => {
  assert.match(describeRule({ type: 'months_before', monthsAhead: 1, time: '10:00' }), /10:00 JST, for the same date one month later/);
  assert.match(describeRule({ type: 'months_before', monthsAhead: 4, time: '11:00' }), /four months later/);
  assert.match(describeRule(sumo), /fixed dates/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText, dropVolatileLines, lineDiff, quoteAppears, sha256 } from '../src/monitor/text.mjs';
import { toRule } from '../src/monitor/extract-rule.mjs';

test('htmlToText drops scripts and navigation, keeps content lines', () => {
  const html = `<html><head><style>p{}</style><script>var x=1</script></head><body>
  <nav>Menu</nav><h1>Tickets</h1><p>Sales start on the 10th&nbsp;at 10:00 (JST).</p><footer>©</footer></body></html>`;
  assert.equal(htmlToText(html), 'Tickets\nSales start on the 10th at 10:00 (JST).');
});

test('same text gives same hash; diff lists changed lines', () => {
  assert.equal(sha256('a\nb'), sha256('a\nb'));
  assert.deepEqual(lineDiff('a\nb\nc', 'a\nc\nd'), { added: ['d'], removed: ['b'] });
});

test('quoteAppears ignores whitespace but rejects invented quotes', () => {
  const page = 'Reservations for December 2026 go on sale\nOctober 10th 2026 at 2 p.m. (Japan time).';
  assert.equal(quoteAppears('Reservations for December 2026 go on sale October 10th 2026 at 2 p.m.', page), true);
  assert.equal(quoteAppears('Tickets go on sale on the 1st', page), false);
  assert.equal(quoteAppears('', page), false);
});

const base = { ruleChanged: true, day: null, time: null, monthsAhead: null, windowStartDay: null, days: null, resultsDay: null, paymentDay: null, checkFromDaysBefore: null, evidenceQuote: 'x', summary: 'x' };

test('toRule builds a monthly rule and drops unrelated fields', () => {
  assert.deepEqual(toRule({ ...base, ruleType: 'monthly', day: 10, time: '14:00', monthsAhead: 2, days: 5 }), { type: 'monthly', day: 10, time: '14:00', monthsAhead: 2 });
});

test('toRule builds a months_before rule', () => {
  assert.deepEqual(toRule({ ...base, ruleType: 'months_before', monthsAhead: 2, time: '14:00', day: 1 }), { type: 'months_before', monthsAhead: 2, time: '14:00' });
});

test('toRule rejects incomplete or malformed rules', () => {
  assert.equal(toRule({ ...base, ruleType: 'monthly', day: 10 }), null);
  assert.equal(toRule({ ...base, ruleType: 'days_before', days: 31, time: '6pm' }), null);
  assert.equal(toRule({ ...base, ruleType: 'unknown' }), null);
});

test('dropVolatileLines removes daily dates and sun times, keeps rule text', () => {
  const text = ['チェックイン日', '2026/10/26', '2026.10.25.Sun', '2026年10月25日(日)', '日の出 5:53', '日の入 16:57', 'Sales start on 2026/12/01 at 13:00'].join('\n');
  assert.equal(dropVolatileLines(text), 'チェックイン日\nSales start on 2026/12/01 at 13:00');
});

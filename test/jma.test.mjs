import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseForecast, weatherLabel, translateWeather } from '../src/jma.mjs';

// Shape follows the published JMA JSON (trimmed).
const fixture = [{
  publishingOffice: '甲府地方気象台',
  reportDatetime: '2026-10-15T17:00:00+09:00',
  timeSeries: [
    { timeDefines: ['2026-10-15T17:00:00+09:00', '2026-10-16T00:00:00+09:00'],
      areas: [
        { area: { name: '中・西部', code: '190010' }, weatherCodes: ['100', '200'], weathers: ['晴れ', 'くもり'] },
        { area: { name: '東部・富士五湖', code: '190020' }, weatherCodes: ['101', '203'], weathers: ['晴れ　時々　くもり', 'くもり　時々　雨'] },
      ] },
    { timeDefines: ['2026-10-15T18:00:00+09:00', '2026-10-16T00:00:00+09:00', '2026-10-16T06:00:00+09:00'],
      areas: [{ area: { name: '東部・富士五湖', code: '190020' }, pops: ['10', '20', '40'] }] },
  ],
}];

test('parses the Fuji Five Lakes area', () => {
  const f = parseForecast(fixture, '190020');
  assert.equal(f.area, '東部・富士五湖');
  assert.equal(f.days.length, 2);
  assert.equal(f.days[0].weatherEn, 'Mostly sunny');
  assert.deepEqual(f.days[1].pops, [{ time: '00:00', pop: 20 }, { time: '06:00', pop: 40 }]);
});

test('labels and translation', () => {
  assert.equal(weatherLabel('302'), 'Rain');
  assert.equal(translateWeather('くもり　時々　雨'), 'cloudy at times rain');
});

test('unknown area throws', () => {
  assert.throws(() => parseForecast(fixture, '999999'));
});

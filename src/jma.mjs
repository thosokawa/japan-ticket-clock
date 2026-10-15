// Parse the Japan Meteorological Agency forecast JSON (bosai/forecast/data/forecast/{area}.json)
// into a small, display-ready shape. We show JMA's forecast as published, with attribution;
// we do not produce our own forecast (Meteorological Service Act, Article 17).

// English label for a JMA weather code, by code family (1xx sunny, 2xx cloudy, 3xx rain, 4xx snow).
export function weatherLabel(code) {
  return { 1: 'Mostly sunny', 2: 'Mostly cloudy', 3: 'Rain', 4: 'Snow' }[String(code)[0]] ?? 'Unknown';
}

// Word-for-word English rendering of JMA's Japanese weather text. JMA's original is shown alongside.
const WORDS = [
  ['所により', 'in places '], ['時々', ' at times '], ['一時', ' briefly '], ['後', ', later '],
  ['晴れ', 'sunny'], ['くもり', 'cloudy'], ['雨', 'rain'], ['雪', 'snow'], ['雷を伴う', 'with thunder'],
  ['夜遅く', 'late night'], ['夜', 'night'], ['朝', 'morning'], ['昼前', 'late morning'], ['昼過ぎ', 'early afternoon'],
  ['夕方', 'evening'], ['明け方', 'dawn'], ['日中', 'daytime'], ['から', ' from '], ['では', ':'], ['　', ' '],
];
export function translateWeather(ja) {
  let s = ja;
  for (const [from, to] of WORDS) s = s.split(from).join(to);
  return s.replace(/[^\x00-\x7F]+/g, ' ').replace(/\s+/g, ' ').replace(/\s,/g, ',').trim();
}

/**
 * json: the parsed JMA array. areaCode: e.g. '190020' (東部・富士五湖).
 * Returns { reportDatetime, office, area, days: [{ date, weatherCode, weatherJa, weatherEn, pops: [{time, pop}] }] }
 */
export function parseForecast(json, areaCode) {
  const report = json[0];
  const [weatherSeries, popSeries] = report.timeSeries;
  const wArea = weatherSeries.areas.find((a) => a.area.code === areaCode);
  const pArea = popSeries?.areas.find((a) => a.area.code === areaCode);
  if (!wArea) throw new Error(`Area ${areaCode} not found`);
  const days = weatherSeries.timeDefines.map((t, i) => ({
    date: t.slice(0, 10),
    weatherCode: wArea.weatherCodes?.[i] ?? null,
    weatherJa: wArea.weathers?.[i] ?? '',
    weatherEn: weatherLabel(wArea.weatherCodes?.[i] ?? ''),
    weatherText: translateWeather(wArea.weathers?.[i] ?? ''),
    pops: [],
  }));
  if (pArea) {
    popSeries.timeDefines.forEach((t, i) => {
      const day = days.find((d) => d.date === t.slice(0, 10));
      if (day && pArea.pops[i] !== '') day.pops.push({ time: t.slice(11, 16), pop: Number(pArea.pops[i]) });
    });
  }
  return { reportDatetime: report.reportDatetime, office: report.publishingOffice, area: wArea.area.name, days };
}

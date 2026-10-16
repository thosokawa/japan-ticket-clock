// Static site build: data/*.json -> dist/
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homePage, facilityPage, plannerPage, fujiPage, simplePage, esc } from '../src/templates.mjs';
import { upcomingReleases, describeRule } from '../src/rules.mjs';
import { buildCalendar } from '../src/ics.mjs';
import { parseForecast } from '../src/jma.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const now = process.env.BUILD_NOW ? new Date(process.env.BUILD_NOW) : new Date();

const site = readJson('site.config.json');
const affiliates = readJson('config/affiliates.json');
const changelog = readJson('data/changelog.json');
const facilities = readdirSync(join(root, 'data/facilities'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => readJson(`data/facilities/${f}`))
  .sort((a, b) => a.priority - b.priority);

rmSync(dist, { recursive: true, force: true });
const write = (path, content) => {
  const full = join(dist, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
};

// Pages
write('index.html', homePage({ site, facilities, now }));
for (const f of facilities) write(`tickets/${f.id}/index.html`, facilityPage({ site, f, affiliates, changelog, now }));
write('planner/index.html', plannerPage({ site, facilities }));

// Mt Fuji: use the forecast fetched by scripts/fetch-jma.mjs if present.
let forecasts = { north: null };
const fcPath = join(root, 'data/jma/190000.json');
if (existsSync(fcPath)) {
  try {
    forecasts.north = parseForecast(JSON.parse(readFileSync(fcPath, 'utf8')), '190020');
  } catch (e) {
    console.warn('JMA forecast could not be parsed:', e.message);
  }
}
write('mt-fuji-visibility/index.html', fujiPage({ site, forecasts, affiliates }));

write('changelog/index.html', simplePage({
  site, title: 'Rule changes and updates', path: '/changelog/',
  html: `<h1>Rule changes and updates</h1><p class="lede">Every change we make to a release rule is listed here, newest first.</p>
<ul>${[...changelog].reverse().map((c) => `<li><strong>${esc(c.date)}</strong> <a href="/tickets/${esc(c.facility)}/">${esc(facilities.find((f) => f.id === c.facility)?.shortName ?? c.facility)}</a>: ${esc(c.text)}</li>`).join('')}</ul>`,
}));
write('about/index.html', simplePage({
  site, title: 'About and methodology', path: '/about/',
  html: `<h1>About ${esc(site.name)}</h1>
<p>${esc(site.name)} tracks when Japan's most popular attractions open their bookings, and shows those times in your own time zone.</p>
<h2>How we check</h2>
<ul><li>Every official booking page is checked automatically once a day.</li>
<li>When a page changes, the new rule is extracted and a person reviews it before anything on this site changes.</li>
<li>Each page shows when it was last checked, its sources, and whether the rule is confirmed on the official site.</li></ul>
<h2>What we don't do</h2>
<ul><li>We don't sell or resell tickets, and we don't book on your behalf.</li><li>We don't make our own weather forecasts; the Mt Fuji page shows the Japan Meteorological Agency's forecast.</li></ul>
<h2>Affiliate links</h2><p>Some “Other ways in” links are affiliate links. If you book through them we may earn a commission, at no extra cost to you. This never changes the release times we publish.</p>
<h2>Operator</h2><p>${esc(site.name)} is run by ${esc(site.operator)}, based in Japan. Contact: <a href="mailto:${esc(site.contactEmail)}">${esc(site.contactEmail)}</a></p>`,
}));
write('privacy/index.html', simplePage({
  site, title: 'Privacy', path: '/privacy/',
  html: `<h1>Privacy</h1><ul><li>We use privacy-friendly analytics that do not set cookies.</li><li>Calendar reminders are created on your own device or calendar; we don't receive your calendar data.</li><li>Affiliate partners may set cookies when you follow their links, under their own privacy policies.</li></ul>`,
}));

// Subscribable calendars: next 12 releases per facility with fixed monthly or lottery dates.
for (const f of facilities) {
  if (!['monthly', 'lottery'].includes(f.rule.type)) continue;
  const events = upcomingReleases(f.rule, now, 12).map((n) => ({
    uid: `${f.id}-${n.opensAt.toISOString().slice(0, 10)}@${new URL(site.baseUrl).hostname}`,
    start: n.opensAt,
    minutes: 30,
    title: `${f.shortName}: ${n.label.toLowerCase()} (${n.coversFrom.slice(0, 7)})`,
    description: `${describeRule(f.rule)}\nBook: ${f.officialUrl}\nSold out? ${site.baseUrl}/tickets/${f.id}/`,
    url: `${site.baseUrl}/tickets/${f.id}/`,
    alarmMinutes: 15,
  }));
  write(`calendars/${f.id}.ics`, buildCalendar(events, { name: `${f.shortName} release dates`, now }));
}

// Machine-readable data for search engines and AI assistants.
const publicData = facilities.map(({ id, name, city, officialUrl, rule, status, lastVerifiedAt, sources }) => ({ id, name, city, officialUrl, rule, ruleText: describeRule(rule), status, lastVerifiedAt, sources }));
write('data/facilities.json', JSON.stringify({ generatedAt: now.toISOString(), timezone: 'Asia/Tokyo', facilities: publicData }, null, 2));
write('llms.txt', `# ${site.name}\n\n> ${site.tagline}\n\nRelease rules for popular Japanese attractions, checked daily against official sources. Machine-readable data: ${site.baseUrl}/data/facilities.json\n\n${facilities.map((f) => `- [${f.shortName}](${site.baseUrl}/tickets/${f.id}/): ${describeRule(f.rule)} (status: ${f.status}, last checked ${f.lastVerifiedAt})`).join('\n')}\n- [Mt Fuji today](${site.baseUrl}/mt-fuji-visibility/): official JMA forecast for the Fuji Five Lakes and live cameras.\n`);
const paths = ['/', '/planner/', '/mt-fuji-visibility/', '/changelog/', '/about/', ...facilities.map((f) => `/tickets/${f.id}/`)];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${site.baseUrl}${p}</loc><lastmod>${now.toISOString().slice(0, 10)}</lastmod></url>`).join('\n')}\n</urlset>\n`);
// indexable: false keeps search engines out until the site name and domain are final.
write('robots.txt', site.indexable === false ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nSitemap: ${site.baseUrl}/sitemap.xml\n`);

// Static assets plus the shared modules the browser needs.
cpSync(join(root, 'public'), dist, { recursive: true });
cpSync(join(root, 'src/rules.mjs'), join(dist, 'assets/rules.mjs'));
cpSync(join(root, 'src/ics.mjs'), join(dist, 'assets/ics.mjs'));
write('assets/facilities.json', JSON.stringify(facilities.map(({ id, shortName, officialUrl, rule }) => ({ id, shortName, officialUrl, rule }))));

console.log(`Built ${paths.length} pages for ${facilities.length} facilities into dist/`);

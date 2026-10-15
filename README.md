# Japan Ticket Clock (working name)

English site that shows when popular Japanese attractions open bookings, in the visitor's own time zone, with calendar reminders and a Mt Fuji forecast page. Design: `/mnt/project-files/mvp/mvp-design.md`.

## Commands
- `npm test`: rule engine and JMA parser tests (Node 20+, no dependencies)
- `npm run fetch:jma`: download the JMA forecast for Yamanashi (Fuji Five Lakes) into `data/jma/`
- `npm run build`: generate the static site into `dist/` (`BUILD_NOW=2026-10-15T11:40:00Z` pins the clock)
- `npm run serve`: preview `dist/` at http://localhost:4321

## Layout
- `data/facilities/*.json`: one file per attraction: release rule, how to buy, sold-out alternatives, FAQ, sources, verification status
- `data/changelog.json`: public log of rule changes
- `src/rules.mjs`: release-rule engine (`monthly`, `days_before`, `lottery`, `rolling`), shared with the browser
- `src/templates.mjs`, `scripts/build.mjs`: static page generation
- `public/assets/app.js`: local-time display, countdowns, Google Calendar links, trip planner, .ics download
- `config/affiliates.json`: affiliate link templates (placeholders until programs approve the site)

## Not built yet (see design doc)
- Daily official-page monitor (fetch, diff, Claude extraction, pull request for human approval)
- Browser push notifications (OneSignal)
- Official confirmation for Kirby Café, Pokémon Café, Shibuya Sky (status `unconfirmed`)

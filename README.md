# Japan Ticket Clock (working name)

English site that shows when popular Japanese attractions open bookings, in the visitor's own time zone, with calendar reminders and a Mt Fuji forecast page. Design: `/mnt/project-files/mvp/mvp-design.md`.

## Commands
- `npm test`: rule engine and JMA parser tests (Node 20+, no dependencies)
- `npm run fetch:jma`: download the JMA forecast for Yamanashi (Fuji Five Lakes) into `data/jma/`
- `npm run build`: generate the static site into `dist/` (`BUILD_NOW=2026-10-15T11:40:00Z` pins the clock)
- `npm run serve`: preview `dist/` at http://localhost:4321

## Layout
- `data/facilities/*.json`: one file per attraction: release rule, booking steps, tips for overseas visitors, popularity rank and difficulty (each with its basis), sold-out alternatives, FAQ, sources, verification status
- `data/changelog.json`: public log of rule changes
- `src/rules.mjs`: release-rule engine (`monthly`, `days_before`, `lottery`, `rolling`), shared with the browser
- `src/templates.mjs`, `scripts/build.mjs`: static page generation
- `public/assets/app.js`: local-time display, countdowns, Google Calendar links, trip planner, .ics download
- `config/affiliates.json`: affiliate link templates (placeholders until programs approve the site)

## Daily official-page check
`.github/workflows/monitor.yml` runs `scripts/monitor.mjs` every morning (06:05 JST):
1. Fetches every `watchUrls` page (plain fetch, then a real browser via Playwright if the page is empty or blocked).
2. Compares the text with the last snapshot in `data/monitor/snapshots/`.
3. If the page changed, Claude (`claude-opus-5-5`, override with `MONITOR_MODEL`) reads it and says whether the release rule changed, quoting the sentence it relied on.
4. A rule change is applied to the facility file only if the rule is complete and the quote really appears on the page. It then arrives as a pull request (`monitor/rule-changes`) for a person to merge. Otherwise the pull request asks for a manual check.
5. Pages failing three days in a row open a GitHub issue.

Setup: add the `ANTHROPIC_API_KEY` secret and allow Actions to create pull requests (Settings > Actions > General).
Run locally: `node scripts/monitor.mjs --dry-run --only=ghibli-park`.

## Not built yet (see design doc)
- Browser push notifications (OneSignal)
- Official confirmation for Kirby Café, Pokémon Café, Shibuya Sky (status `unconfirmed`)

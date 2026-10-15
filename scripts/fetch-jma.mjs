// Download the JMA forecast JSON for Yamanashi (includes the Fuji Five Lakes area).
// Run before the build, e.g. from a scheduled GitHub Action.
import { writeFileSync, mkdirSync } from 'node:fs';
const AREAS = ['190000'];
mkdirSync('data/jma', { recursive: true });
for (const code of AREAS) {
  const res = await fetch(`https://www.jma.go.jp/bosai/forecast/data/forecast/${code}.json`);
  if (!res.ok) throw new Error(`JMA ${code}: HTTP ${res.status}`);
  writeFileSync(`data/jma/${code}.json`, await res.text());
  console.log(`Saved data/jma/${code}.json`);
}

// Porto Verde v7 — gta6-01 entrypoint (Node 22, standard library only).
// Hands the game in: copies game/ and screenshots/ beside this file into the
// output directory and writes /output/dossier.json with the vendored make.fun
// library. Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function fail(msg) {
  console.error('main.ts: ' + msg);
  process.exit(1);
}

const gameDir = join(repoRoot, 'game');
const shotsDir = join(repoRoot, 'screenshots');
if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
if (!existsSync(shotsDir)) fail('screenshots/ is missing');
const shots = readdirSync(shotsDir).filter((f) => !f.startsWith('.'));
if (shots.length < 3 || shots.length > 4) fail(`need 3 or 4 screenshots, found ${shots.length}`);
for (const f of shots) {
  const st = statSync(join(shotsDir, f));
  if (st.size > 262144) fail(`screenshot ${f} is over 256 KiB (${st.size} bytes)`);
}

mkdirSync(outDir, { recursive: true });
cpSync(gameDir, join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });

// The scorer's caps (reference/gate.json): game/ at most 993 entries and
// 48 MiB, screenshots at most 4 files of 256 KiB, dossier text 160 KiB.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
console.log(`Porto Verde v7 handed in: ${shots.length} screenshots, dossier written to ${outDir}/dossier.json`);

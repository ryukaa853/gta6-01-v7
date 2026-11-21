// Takes the 4 dossier screenshots from the real running game (1280x800 JPEG).
// Each shot uses its ?shot= staging; driving shots hold W so the car is moving.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 8902;
const EXE = process.env.HOME + '/.cache/ms-playwright/chromium-1187/chrome-linux/chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plan = JSON.parse(readFileSync(join(ROOT, 'shots.json'), 'utf8'));

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: ROOT, stdio: 'pipe' });
await sleep(1500);
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

for (const shot of plan) {
  await page.goto(`http://localhost:${PORT}/${shot.query}`, { waitUntil: 'load' });
  // the chase needs a few extra seconds for the cruisers to close in
  await sleep(shot.name === '2-chase.jpg' ? 8500 : 3000);
  // drive a little so wheels / motion read in the frame (start + chase + taxi)
  if (shot.name !== '4-vault.jpg') {
    await page.keyboard.down('KeyW');
    await sleep(1400);
    await page.keyboard.up('KeyW');
    await sleep(400);
  }
  const out = join(ROOT, 'screenshots', shot.name);
  let quality = 80;
  await page.screenshot({ path: out, type: 'jpeg', quality });
  let size = statSync(out).size;
  if (size > 262144) {
    quality = 62;
    await page.screenshot({ path: out, type: 'jpeg', quality });
    size = statSync(out).size;
  }
  console.log(`${shot.name}: ${size} bytes (quality ${quality})${size > 262144 ? ' — OVER 256KiB!' : ''}`);
}
console.log(errors.length === 0 ? 'shots: zero console errors' : 'shots: ERRORS: ' + errors.join(' | '));
await browser.close();
server.kill();
process.exit(errors.length === 0 ? 0 : 1);

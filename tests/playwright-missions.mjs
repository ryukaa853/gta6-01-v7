// Full M1–M5 playthrough of Porto Verde v7 in headless Chromium (Playwright).
// Missions complete through their real triggers; the test only teleports the
// player between objectives (the __verde hook) instead of driving across town.
// Fails on any console error or any non-localhost request.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 8902;
const BASE = `http://localhost:${PORT}/`;
const EXE = process.env.HOME + '/.cache/ms-playwright/chromium-1187/chrome-linux/chrome';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, extra) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures += 1;
}
async function waitFor(page, fn, timeout, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(fn)) return true;
    await sleep(200);
  }
  console.log('TIMEOUT waiting for: ' + label);
  return false;
}

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: ROOT, stdio: 'pipe' });
await sleep(1500);

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const errors = [];
const external = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('request', (r) => { if (!r.url().startsWith('http://localhost')) external.push(r.url()); });
page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));

await page.goto(BASE + '?seed=20261122', { waitUntil: 'load' });
await sleep(2500);
check('page loads, WebGL canvas present', await page.evaluate(() => !!document.querySelector('canvas.webgl')));
check('menu visible on load', await page.evaluate(() => !document.getElementById('menu').classList.contains('hidden')));

// ---- M1 via the real menu button -------------------------------------------
await page.click('.missionRow >> nth=0 >> button');
await sleep(400);
check('M1 starts from menu click', await page.evaluate(() => window.__verde.state().mission?.id === 1));
await page.evaluate(() => window.__verde.teleport(-105, -27));
await page.keyboard.press('KeyE');
await sleep(400);
check('M1: steal car (on foot -> in car)', await page.evaluate(() => !window.__verde.state().onFoot));
check('M1: stealing raises wanted', await page.evaluate(() => window.__verde.state().wanted >= 1));
const cash0 = await page.evaluate(() => window.__verde.state().cash);
await page.evaluate(() => window.__verde.teleport(-168, 168));
check('M1 completes at Luna Garage', await waitFor(page, () => window.__verde.state().done['1'] === true, 8000, 'M1 done'));
check('M1 pays $350', await page.evaluate((c) => window.__verde.state().cash >= c + 350, cash0));
check('M2 unlocked after M1', await page.evaluate(() => window.__verde.state().unlocked >= 2));

// ---- M2 deliveries -----------------------------------------------------------
await page.evaluate(() => window.__verde.startMission(2));
for (const [x, z] of [[-168, -168], [168, -168], [0, 186]]) {
  await page.evaluate(([a, b]) => window.__verde.teleport(a, b), [x, z]);
  await sleep(400);
}
check('M2 completes after 3 deliveries', await waitFor(page, () => window.__verde.state().done['2'] === true, 8000, 'M2 done'));

// ---- M3 hot pursuit (45s survive; keep teleporting to stay ahead of cruisers)
// NOTE: headless SwiftShader runs at low FPS and dt is clamped, so game time
// runs slower than wall time — poll with a generous wall timeout.
let m3Done = false;
for (let attempt = 1; attempt <= 2 && !m3Done; attempt++) {
  await page.evaluate(() => window.__verde.startMission(3));
  const corners = [[-175, -35], [175, 35], [-35, 175], [35, -175], [105, 105], [-105, -105]];
  const t0 = Date.now();
  let busted = false;
  while (Date.now() - t0 < 240000) {
    const st = await page.evaluate(() => window.__verde.state());
    if (st.mission && st.mission.id === 3 && st.mission.stage === 1) break;
    if (st.mission === null) break; // failed / busted cleared it
    if (await page.evaluate(() => !document.getElementById('gameover').classList.contains('hidden'))) { busted = true; break; }
    const c = corners[Math.floor(Math.random() * corners.length)];
    await page.evaluate(([a, b]) => window.__verde.teleport(a, b), c);
    await sleep(3000);
  }
  if (busted) {
    console.log(`M3 attempt ${attempt}: busted during the chase — respawning`);
    await page.click('#btnRespawn');
    await sleep(500);
    continue;
  }
  const m3 = await page.evaluate(() => window.__verde.state().mission);
  if (m3 && m3.id === 3 && m3.stage === 1) {
    await page.evaluate(() => window.__verde.teleport(168, 168));
    m3Done = await waitFor(page, () => window.__verde.state().done['3'] === true, 8000, 'M3 done');
  } else if (m3 === null) {
    console.log(`M3 attempt ${attempt}: mission ended without completing`);
  }
}
check('M3 completes at Casa Verde', m3Done);
if (!m3Done) { console.log('M3 FAILED — stopping here to avoid cascade'); await browser.close(); server.kill(); process.exit(1); }

// ---- M4 taxi -----------------------------------------------------------------
await page.evaluate(() => window.__verde.startMission(4));
// the player may still be sitting in the M1 sedan — get out first, away from it
await page.keyboard.press('KeyF');
await sleep(400);
await page.evaluate(() => window.__verde.teleport(150, -150));
await page.keyboard.press('KeyE');
await sleep(400);
check('M4: entered the taxi', await page.evaluate(() => !window.__verde.state().onFoot));
await page.keyboard.press('KeyT');
await sleep(400);
const shiftOn = await page.evaluate(() => window.__verde.state().taxi.shift === true);
check('M4: taxi shift started', shiftOn);
if (!shiftOn) {
  console.log('M4 DIAG:', JSON.stringify(await page.evaluate(() => ({
    over: window.__verde.S.over, paused: window.__verde.S.paused, started: window.__verde.S.started,
    onFoot: window.__verde.S.player.onFoot, cls: window.__verde.S.player.vehicle?.cls,
    wanted: window.__verde.S.wanted, hp: window.__verde.S.player.hp,
    mission: window.__verde.S.missions.active?.id ?? null,
    toast: document.getElementById('toast').textContent,
    gameoverHidden: document.getElementById('gameover').classList.contains('hidden'),
  }))));
  console.log('M4 FAILED to start shift — stopping'); await browser.close(); server.kill(); process.exit(1);
}
for (let fare = 0; fare < 3; fare++) {
  // go to pickup
  await waitFor(page, () => !!window.__verde.S.taxi.fare, 5000, 'fare exists');
  const pick = await page.evaluate(() => window.__verde.S.taxi.fare && window.__verde.S.taxi.fare.pickup);
  if (!pick) { console.log('M4: no pickup — fare state lost'); break; }
  await page.evaluate(([a, b]) => window.__verde.teleport(a, b), [pick.x, pick.z]);
  await waitFor(page, () => !!window.__verde.S.taxi.fare && !!window.__verde.S.taxi.fare.dest, 5000, 'fare dest');
  const dest = await page.evaluate(() => window.__verde.S.taxi.fare && window.__verde.S.taxi.fare.dest);
  if (!dest) { console.log('M4: no dest — fare state lost'); break; }
  await page.evaluate(([a, b]) => window.__verde.teleport(a, b), [dest.x, dest.z]);
  await sleep(400);
}
check('M4 completes after 3 fares', await waitFor(page, () => window.__verde.state().done['4'] === true, 8000, 'M4 done'));

// ---- M5 vault ----------------------------------------------------------------
await page.evaluate(() => window.__verde.startMission(5));
// park the taxi far from the depot van, get out, then walk to the van
await page.evaluate(() => window.__verde.teleport(0, 0));
await page.keyboard.press('KeyF');
await sleep(400);
await page.evaluate(() => window.__verde.teleport(168, -186));
await page.keyboard.press('KeyE');
await sleep(400);
check('M5: stole the depot van', await page.evaluate(() => !window.__verde.state().onFoot));
await page.evaluate(() => window.__verde.teleport(0, -186));
await sleep(500);
check('M5: reached Banco Verde (stage 2)', await page.evaluate(() => window.__verde.state().mission?.stage === 2));
await page.keyboard.press('KeyF');
await sleep(400);
await page.keyboard.down('KeyE');
const vaultOk = await waitFor(page, () => window.__verde.state().vaultProgress >= 1 || window.__verde.state().mission?.stage === 3, 40000, 'vault cracked');
await page.keyboard.up('KeyE');
check('M5: vault cracked (hold E)', vaultOk);
check('M5: escape stage is wanted 3', await page.evaluate(() => window.__verde.state().wanted >= 3));
await page.evaluate(() => window.__verde.teleport(168, 168));
check('M5 completes at Casa Verde', await waitFor(page, () => window.__verde.state().done['5'] === true, 8000, 'M5 done'));

// ---- combat + save -----------------------------------------------------------
const ammoBefore = await page.evaluate(() => window.__verde.S.player.ammo);
await page.mouse.click(320, 200);
await sleep(300);
const ammoAfter = await page.evaluate(() => window.__verde.S.player.ammo);
check('pistol fires (ammo decreases)', ammoAfter < ammoBefore, `${ammoBefore} -> ${ammoAfter}`);
await page.keyboard.press('KeyR');
await sleep(4500); // reload is 1.1 game-seconds; headless game time runs slower than wall time
check('reload refills magazine', await page.evaluate(() => window.__verde.S.player.ammo === 12));
check('save exists in localStorage', await page.evaluate(() => !!localStorage.getItem('portoverde-save-v7')));
const finalCash = await page.evaluate(() => window.__verde.state().cash);
console.log('final cash: $' + finalCash);
check('final cash sane (> $2500 after 5 missions)', finalCash > 2500);

// ---- hygiene -----------------------------------------------------------------
check('zero console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
check('zero external requests', external.length === 0, external.slice(0, 3).join(' | '));

await browser.close();
server.kill();
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

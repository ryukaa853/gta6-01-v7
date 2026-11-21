// HUD: cash, health, wanted stars, objective, speed, ammo, taxi panel, vault
// bar — and the circular minimap drawn on a 2D canvas: streets, the player
// arrow, mission and fare beacons, police, helicopter and cash stashes.
import { WORLD, LANDMARKS, MISSION_DEFS, fmtCash, fmtTime, clamp } from './state.js';
import { missionObjectiveText } from './missions.js';
import { clockLabel } from './daycycle.js';

const $ = (id) => document.getElementById(id);

export function buildMissionList(S, container, onPick) {
  container.innerHTML = '';
  for (const m of MISSION_DEFS) {
    const locked = m.id > S.missions.unlocked;
    const done = !!S.missions.done[m.id];
    const row = document.createElement('div');
    row.className = 'missionRow' + (locked ? ' locked' : '') + (done ? ' done' : '');
    row.innerHTML = `<div class="num">${m.id}</div><div class="body"><div class="name">${m.name}</div>` +
      `<div class="desc">${locked ? 'Complete mission ' + (m.id - 1) + ' to unlock.' : m.desc}</div></div>` +
      `<div class="pay">${fmtCash(m.pay)}</div>`;
    if (!locked) {
      const btn = document.createElement('button');
      btn.className = 'btn ghost';
      btn.textContent = 'PLAY';
      btn.onclick = () => onPick(m.id);
      row.appendChild(btn);
    }
    container.appendChild(row);
  }
}

let toastTimer = null;
export function showToast(msg, ms) {
  const el = $('toast');
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, ms || 3200);
}

let bannerTimer = null;
export function showBanner(title, sub) {
  const el = $('banner');
  el.innerHTML = title + (sub ? `<small>${sub}</small>` : '');
  el.style.display = 'block';
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { el.style.display = 'none'; }, 2600);
}

export function updateHud(S, ctx) {
  $('cashVal').textContent = fmtCash(S.player.cash);
  $('hpBar').style.width = clamp(S.player.hp, 0, 100) + '%';
  let stars = '';
  for (let i = 1; i <= 5; i++) stars += `<span class="${i <= S.wanted ? '' : 'off'}">★</span>`;
  $('stars').innerHTML = stars;
  $('clockVal').textContent = clockLabel(S);
  $('dayVal').textContent = 'DAY ' + S.day;
  const obj = missionObjectiveText(S);
  $('objTitle').textContent = obj.title;
  $('objText').textContent = obj.text;
  $('objTimer').textContent = obj.timer;
  const p = S.player;
  $('speedVal').textContent = String(Math.round(Math.abs(p.onFoot ? p.speed * 3.6 : (p.vehicle ? p.vehicle.speed * 3.6 : 0))));
  $('speedLbl').textContent = p.onFoot ? 'KM/H • ON FOOT' : `KM/H • ${p.vehicle ? p.vehicle.cls.toUpperCase() : ''}`;
  $('ammoVal').textContent = p.reloading > 0 ? 'RELOADING…' : `${p.ammo} / ${p.magSize}`;
  $('crosshair').style.display = p.onFoot ? 'block' : 'none';
  const taxi = $('taxiPanel');
  if (S.taxi.shift && S.taxi.fare) {
    taxi.classList.add('on');
    $('taxiFare').textContent = 'FARE $' + (120 + Math.round((S.taxi.fare.timeLeft / 90) * 60)) + ' • ' + S.taxi.faresDone + '/3';
    $('taxiTimer').textContent = 'Meter: ' + fmtTime(S.taxi.fare.timeLeft);
  } else {
    taxi.classList.remove('on');
  }
  const vault = $('vaultWrap');
  if (S.vault.cracking || S.vault.progress > 0.01) {
    vault.classList.add('on');
    $('vaultBar').style.width = Math.round(S.vault.progress * 100) + '%';
  } else {
    vault.classList.remove('on');
  }
  drawMinimap(S, ctx);
}

function drawMinimap(S, ctx) {
  const cv = $('minimap');
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const cx = W / 2, cy = H / 2;
  const scale = W / (WORLD.bound * 2 + 60);
  const toMap = (x, z) => [cx + x * scale, cy + z * scale];
  g.clearRect(0, 0, W, H);
  // sea to the south
  g.fillStyle = '#1d4a63';
  g.fillRect(0, cy + WORLD.bound * scale, W, H);
  // land
  g.fillStyle = '#3a3428';
  g.fillRect(cx - WORLD.bound * scale, cy - WORLD.bound * scale, WORLD.bound * 2 * scale, WORLD.bound * 2 * scale);
  // roads
  g.strokeStyle = '#5a5f6a';
  g.lineWidth = 5;
  for (const s of WORLD.streets) {
    const [x1, y1] = toMap(-WORLD.bound, s);
    const [x2, y2] = toMap(WORLD.bound, s);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    const [x3, y3] = toMap(s, -WORLD.bound);
    const [x4, y4] = toMap(s, WORLD.bound);
    g.beginPath(); g.moveTo(x3, y3); g.lineTo(x4, y4); g.stroke();
  }
  const dot = (x, z, color, r) => {
    const [mx, my] = toMap(x, z);
    g.fillStyle = color;
    g.beginPath(); g.arc(mx, my, r, 0, Math.PI * 2); g.fill();
  };
  // landmarks
  for (const lm of Object.values(LANDMARKS)) dot(lm.x, lm.z, '#8a7a5a', 3);
  // cash stashes
  for (const st of S.stashes) if (!st.taken) dot(st.x, st.z, '#7dff9a', 3);
  // mission target
  const run = S.missions.active;
  if (run && run.target) {
    const [mx, my] = toMap(run.target.x, run.target.z);
    g.strokeStyle = '#ffd94d'; g.lineWidth = 2;
    g.beginPath(); g.arc(mx, my, 7 + Math.sin(S.elapsed * 5) * 2, 0, Math.PI * 2); g.stroke();
    dot(run.target.x, run.target.z, '#ffd94d', 4);
  }
  // taxi fare target
  if (S.taxi.shift && S.taxi.fare) {
    const tgt = ctx.taxiState === 'pickup' ? S.taxi.fare.pickup : S.taxi.fare.dest;
    if (tgt) dot(tgt.x, tgt.z, '#7dff9a', 5);
  }
  // police + helicopter
  for (const c of ctx.cops || []) dot(c.x, c.z, '#ff4040', 3.5);
  if (ctx.heli) dot(ctx.heli.x, ctx.heli.z, '#ff8040', 4);
  // traffic (faint)
  for (const c of ctx.traffic || []) dot(c.x, c.z, '#c8d2e0', 1.6);
  // player arrow
  const [px, py] = toMap(S.player.x, S.player.z);
  g.save();
  g.translate(px, py);
  g.rotate(Math.PI - S.player.heading);
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#111111'; g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6); g.closePath();
  g.fill(); g.stroke();
  g.restore();
}

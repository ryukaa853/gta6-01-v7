// Day / night cycle: the game clock runs from golden hour through night and
// back to morning. Sun angle, sky colour, fog and lamp glow all follow the
// hour, so screenshots at different times look like different cities.
import { clamp, lerp } from './state.js';

// One game hour every 100 real seconds.
const MIN_PER_SEC = 0.6;

export function advanceClock(S, dt) {
  S.clockMin += MIN_PER_SEC * dt;
  if (S.clockMin >= 24 * 60) { S.clockMin -= 24 * 60; S.day += 1; }
}

export function hourOf(S) { return S.clockMin / 60; }

export function clockLabel(S) {
  const h = Math.floor(S.clockMin / 60);
  const m = Math.floor(S.clockMin % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// Returns 0 (deep night) .. 1 (full day) plus the sun elevation in radians.
export function daylight(S) {
  const h = hourOf(S);
  // sunrise ~06:30, sunset ~19:30
  const day = clamp((Math.sin(((h - 6.5) / 13) * Math.PI) + 0.25) / 1.25, 0, 1);
  const elev = Math.sin(((h - 6) / 12) * Math.PI) * 1.1;
  return { day, elev };
}

const SKY_DAY = [0.55, 0.78, 0.95];
const SKY_GOLD = [0.98, 0.62, 0.32];
const SKY_NIGHT = [0.05, 0.08, 0.18];

export function applySky(S, scene, sun, hemi, lampHeads) {
  const h = hourOf(S);
  const { day, elev } = daylight(S);
  // golden hour tint near sunrise / sunset
  const golden = clamp(1 - Math.abs(h - 18.2) / 1.6, 0, 1) + clamp(1 - Math.abs(h - 6.8) / 1.2, 0, 1);
  const g = clamp(golden, 0, 1);
  let r = lerp(SKY_NIGHT[0], SKY_DAY[0], day);
  let gg = lerp(SKY_NIGHT[1], SKY_DAY[1], day);
  let b = lerp(SKY_NIGHT[2], SKY_DAY[2], day);
  r = lerp(r, SKY_GOLD[0], g * 0.55);
  gg = lerp(gg, SKY_GOLD[1], g * 0.55);
  b = lerp(b, SKY_GOLD[2], g * 0.55);
  scene.background = new THREE.Color(r, gg, b);
  scene.fog = new THREE.Fog(new THREE.Color(r, gg, b), 120, 420);
  const sunAngle = ((h - 6) / 12) * Math.PI;
  sun.position.set(Math.cos(sunAngle) * 180, Math.max(12, Math.sin(sunAngle) * 180 + 20), 90);
  sun.intensity = 0.25 + day * 1.15;
  sun.color.setHSL(0.09 + day * 0.02, 0.7, 0.55 + day * 0.1);
  hemi.intensity = 0.25 + day * 0.55;
  const lampsOn = day < 0.35;
  for (const bulb of lampHeads) {
    bulb.material.color.setHex(lampsOn ? 0xffe9a8 : 0x8a8a7a);
  }
  return { day, lampsOn, elev };
}

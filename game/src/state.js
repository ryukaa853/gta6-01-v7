// Shared helpers and the single game-state object every system reads and writes.
// Keeping the state in one place means the HUD, missions, police and driving all
// agree about where the player is and what they are doing.
import { makeRng } from './rng.js';

export const WORLD = {
  pitch: 70,            // street-to-street distance
  streets: [-175, -105, -35, 35, 105, 175],
  bound: 212,           // playable half-extent
  roadHalf: 8,          // half width of a road
};

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function fmtCash(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
export function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

export function createState(seed) {
  const rng = makeRng(seed);
  return {
    seed,
    rng,
    // clock: game minutes since midnight; starts at golden hour 17:30
    clockMin: 17 * 60 + 30,
    day: 1,
    elapsed: 0,          // seconds since this run started
    paused: false,
    started: false,      // true once the player leaves the menu
    over: false,         // busted / wasted overlay up
    player: {
      x: -168, z: 150, heading: Math.PI * 0.75, speed: 0,
      hp: 100, cash: 40, onFoot: true, vehicle: null,
      ammo: 12, magSize: 12, reloading: 0, lastShot: 0,
      runSpeed: 7, walkSpeed: 4,
    },
    wanted: 0,
    wantedHeat: 0,       // seconds of recent crime heat; decays wanted when cold
    missions: {
      unlocked: 1,       // missions 1..unlocked are playable
      done: {},          // id -> true
      active: null,      // mission runtime object or null
      stats: { jobsDone: 0, carsStolen: 0, faresDone: 0, arrests: 0, deaths: 0, cashEarned: 0 },
    },
    taxi: { shift: false, fare: null, faresDone: 0 },
    vault: { cracking: false, progress: 0 },
    stashes: [],         // {x, z, taken}
    input: {
      keys: new Set(), mouseDown: false, dragDX: 0, dragDY: 0,
      camYaw: Math.PI * 0.75, camPitch: 0.42, shootQueued: false,
    },
    camera: { yaw: Math.PI * 0.75, pitch: 0.42, dist: 10 },
    flags: { bustedTimer: 0, copTouchTime: 0 },
    shotMode: null,      // ?shot= value for staged screenshots
  };
}

export const MISSION_DEFS = [
  { id: 1, name: 'First Keys', pay: 350,
    desc: 'Steal a car and drive it to Luna Garage. Every legend starts with a hotwire.' },
  { id: 2, name: 'Three Corners', pay: 550,
    desc: 'Three deliveries, 180 seconds. The city does not wait — neither does the client.' },
  { id: 3, name: 'Hot Pursuit', pay: 700,
    desc: 'Survive a 45-second chase at two stars, then lose the heat at Casa Verde.' },
  { id: 4, name: 'Cab Fare', pay: 450,
    desc: 'Run a taxi shift: three fares in the yellow cab. Tips pay for speed.' },
  { id: 5, name: 'The Verde Vault', pay: 1500,
    desc: 'Steal the depot van, crack Banco Verde on foot, escape a three-star manhunt.' },
];

export const LANDMARKS = {
  lunaGarage: { x: -168, z: 168, label: 'Luna Garage' },
  casaVerde: { x: 168, z: 168, label: 'Casa Verde' },
  bancoVerde: { x: 0, z: -186, label: 'Banco Verde' },
  hospital: { x: -168, z: -168, label: 'Verde General' },
  depot: { x: 168, z: -168, label: 'Depot' },
  impound: { x: 0, z: 186, label: 'Impound Lot' },
};

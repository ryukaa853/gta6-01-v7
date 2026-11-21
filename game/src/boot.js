// Boot: wires every system together — renderer, input, the game loop, entering
// and stealing cars, busted / wasted, cash stashes, menus and the test hook.
// Nothing here is copied from an earlier version: the flow is written for this
// build's module split.
import { createState, LANDMARKS, WORLD, clamp, dist2, fmtCash } from './state.js';
import { buildCity, makeBeacon } from './city.js';
import { makeCar, spawnTraffic, updateTraffic, spawnParkedCars, driveCar, moveCar, nearestCar } from './vehicles.js';
import { buildWalkerMesh, walkPlayer, updateCamera } from './walker.js';
import { spawnPeds, updatePeds } from './peds.js';
import { createPolice, updatePolice, addWanted } from './cops.js';
import { createCombat, shoot, updateCombatFx, reload, tickReload } from './combat.js';
import { createTaxi, startShift, endShift, updateTaxi } from './taxi.js';
import { createMissions, startMission, updateMissions } from './missions.js';
import { buildMissionList, updateHud, showToast, showBanner } from './hud.js';
import { createAudio } from './audio.js';
import { advanceClock, applySky } from './daycycle.js';
import { loadSave, writeSave, applySave, clearSave } from './savegame.js';
import { stageShot } from './shots.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') || 20261122) >>> 0;
const SHOT = params.get('shot');

window.addEventListener('error', (e) => {
  const box = $('errBox');
  box.style.display = 'block';
  box.textContent += 'ERROR: ' + (e.message || e.error) + '\n';
});

const S = createState(SEED);
S.shotMode = SHOT;
S.toast = (m) => showToast(m);
S.banner = (t, s) => showBanner(t, s);
S.onCrime = (stars, why) => { addWanted(S, stars, why); showToast('The PD saw that: ' + why); };
S.onFareDone = () => writeSave(S);
S.onMissionComplete = () => writeSave(S);

applySave(S, loadSave());

// --- renderer / scene -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.domElement.className = 'webgl';
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8a6a8a);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
const sun = new THREE.DirectionalLight(0xffe0b0, 1.2);
sun.position.set(120, 160, 60);
scene.add(sun);
const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a7a5a, 0.7);
scene.add(hemi);

// --- world ------------------------------------------------------------------
const city = buildCity(scene, S);
const colliders = city.colliders;
const walkerMesh = buildWalkerMesh();
scene.add(walkerMesh);
walkerMesh.position.set(S.player.x, 0, S.player.z);

const traffic = spawnTraffic(scene, S, 8);
const { parked, taxi: taxiCar, van: vaultVan } = spawnParkedCars(scene, S);
const peds = spawnPeds(scene, S, 24);
const police = createPolice(scene);
const combat = createCombat(scene);
const taxi = createTaxi(scene);
const missions = createMissions(scene);
const audio = createAudio();
const allCars = [...parked, ...traffic];

const G = { parked, taxiCar, vaultVan, taxi, traffic, peds, police, colliders };

// cash stashes: 4 glowing pickups hidden around the city
const stashSpots = [
  { x: -105, z: 175 }, { x: 105, z: -105 }, { x: -35, z: -35 }, { x: 175, z: 35 },
];
for (const sp of stashSpots) {
  const mesh = makeBeacon(0x7dff9a);
  mesh.scale.set(0.45, 0.35, 0.45);
  mesh.position.set(sp.x, 0, sp.z);
  scene.add(mesh);
  S.stashes.push({ x: sp.x, z: sp.z, taken: false, takenAt: 0, mesh });
}

// --- input ------------------------------------------------------------------
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  S.input.keys.add(e.code);
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (!S.started || S.paused || S.over) return;
  if (e.code === 'KeyE') onInteract();
  if (e.code === 'KeyF') exitCar();
  if (e.code === 'KeyR') reload(S, audio);
  if (e.code === 'KeyT') onTaxiKey();
  if (e.code === 'KeyJ') S.input.shootQueued = true;
});
addEventListener('keyup', (e) => S.input.keys.delete(e.code));
addEventListener('blur', () => S.input.keys.clear());
let lastMX = 0, lastMY = 0;
renderer.domElement.addEventListener('mousedown', (e) => {
  S.input.mouseDown = true; lastMX = e.clientX; lastMY = e.clientY;
  audio.ensure();
});
addEventListener('mouseup', (e) => {
  if (S.input.mouseDown && Math.hypot(e.clientX - lastMX, e.clientY - lastMY) < 6) {
    if (S.started && !S.paused && !S.over) S.input.shootQueued = true;
  }
  S.input.mouseDown = false;
});
addEventListener('mousemove', (e) => {
  if (!S.input.mouseDown) return;
  S.input.dragDX += e.clientX - lastMX;
  S.input.dragDY += e.clientY - lastMY;
  lastMX = e.clientX; lastMY = e.clientY;
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- car enter / exit / interact --------------------------------------------
function enterCar(car) {
  const p = S.player;
  if (car.traffic) { // carjack: the driver bails
    car.traffic = null;
    car.speed = 0;
    showToast('You yanked the driver out. The car is yours now.');
  }
  if (car.parked) {
    car.parked = false;
    p.cash = Math.max(0, p.cash);
    S.missions.stats.carsStolen += 1;
    addWanted(S, 1, 'car theft');
    showToast('Car stolen! The Verde PD noticed (+1 ★)');
  }
  p.onFoot = false;
  p.vehicle = car;
  car.isPlayer = true;
  p.x = car.x; p.z = car.z; p.heading = car.heading;
  walkerMesh.visible = false;
  audio.ensure();
  audio.blip(300, 0.12, 'sawtooth', 0.15);
}

function exitCar() {
  const p = S.player;
  if (p.onFoot || !p.vehicle) return;
  const car = p.vehicle;
  car.isPlayer = false;
  car.speed = 0;
  p.vehicle = null;
  p.onFoot = true;
  p.x = car.x + Math.sin(car.heading + Math.PI / 2) * 2.5;
  p.z = car.z + Math.cos(car.heading + Math.PI / 2) * 2.5;
  p.heading = car.heading;
  walkerMesh.visible = true;
  if (S.taxi.shift) endShift(S, taxi, audio);
}

function onInteract() {
  const p = S.player;
  if (!p.onFoot) return;
  // At the vault door during M5, E cracks the vault — it must not re-enter the van.
  const run = S.missions.active;
  if (run?.id === 5 && run.stage === 2 &&
      dist2(p.x, p.z, LANDMARKS.bancoVerde.x, LANDMARKS.bancoVerde.z) < 12) {
    showToast('Hold E at the vault door to crack it…');
    return;
  }
  const car = nearestCar(allCars.filter((c) => !c.disabled && !c.isPolice && !c.isRoadblock), p.x, p.z, 4.5);
  if (car) { enterCar(car); return; }
  // vault handled by the mission system (hold E near the vault)
  if (run?.id === 5 && run.stage === 2) {
    showToast('Hold E at the vault door to crack it…');
  }
}

function onTaxiKey() {
  const p = S.player;
  if (p.onFoot) { showToast('Get in the yellow cab first (E), then press T.'); return; }
  if (p.vehicle?.cls !== 'taxi') { showToast('Taxi shifts run in the yellow cab only.'); return; }
  if (S.taxi.shift) endShift(S, taxi, audio);
  else startShift(S, taxi, audio);
}

// --- busted / wasted ---------------------------------------------------------
function respawn(hospitalise, title, text, fine) {
  S.over = true;
  S.player.cash = Math.max(0, S.player.cash - fine);
  S.missions.stats[hospitalise === 'busted' ? 'arrests' : 'deaths'] += 1;
  if (S.missions.active) { S.missions.active = null; missions.beacon.visible = false; }
  if (S.taxi.shift) endShift(S, taxi, audio);
  S.wanted = 0; S.wantedHeat = 0;
  S.vault.progress = 0; S.vault.cracking = false;
  $('goTitle').textContent = title;
  $('goText').textContent = text + ` You paid $${fine}.`;
  $('gameover').classList.remove('hidden');
  $('hud').classList.remove('on');
  audio.fail();
  writeSave(S);
}

function doRespawn() {
  const p = S.player;
  if (p.vehicle) { p.vehicle.isPlayer = false; p.vehicle.speed = 0; p.vehicle = null; }
  p.onFoot = true;
  p.hp = 100;
  p.x = LANDMARKS.hospital.x; p.z = LANDMARKS.hospital.z + 14;
  p.heading = 0;
  walkerMesh.visible = true;
  walkerMesh.position.set(p.x, 0, p.z);
  S.camera.yaw = 0;
  S.over = false;
  $('gameover').classList.add('hidden');
  $('hud').classList.add('on');
  writeSave(S);
}
$('btnRespawn').onclick = () => { audio.ensure(); doRespawn(); };

// --- menus -------------------------------------------------------------------
function openMenu() {
  S.paused = true;
  $('menu').classList.remove('hidden');
  $('pauseMenu').classList.add('hidden');
  $('hud').classList.remove('on');
  buildMissionList(S, $('missionList'), pickMission);
  buildMissionList(S, $('pauseMissionList'), pickMission);
}
function closeMenus() {
  $('menu').classList.add('hidden');
  $('pauseMenu').classList.add('hidden');
  $('hud').classList.add('on');
  S.paused = false;
  S.started = true;
  audio.ensure();
}
function pickMission(id) {
  closeMenus();
  startMission(S, missions, id, audio);
  showToast(`Mission ${id} started — good luck, Mara.`);
}
function togglePause() {
  if (!S.started || S.over) return;
  if (S.paused) { closeMenus(); return; }
  S.paused = true;
  $('pauseMenu').classList.remove('hidden');
  buildMissionList(S, $('pauseMissionList'), pickMission);
  writeSave(S);
}
$('btnContinue').onclick = () => closeMenus();
$('btnFreeroam').onclick = () => closeMenus();
$('btnResume').onclick = () => closeMenus();
$('btnQuitToMenu').onclick = () => { $('pauseMenu').classList.add('hidden'); openMenu(); };
$('btnReset').onclick = () => {
  clearSave();
  S.player.cash = 40;
  S.missions.unlocked = 1; S.missions.done = {}; S.missions.active = null;
  S.missions.stats = { jobsDone: 0, carsStolen: 0, faresDone: 0, arrests: 0, deaths: 0, cashEarned: 0 };
  S.player.hp = 100;
  closeMenus();
  showToast('New game — $40 and a borrowed jacket. Go get the city.');
};

// --- main loop ---------------------------------------------------------------
let lastT = performance.now();
let saveTimer = 0;
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();
  void now;
  if (S.paused || S.over || !S.started) {
    renderer.render(scene, camera);
    return;
  }
  S.elapsed += dt;
  advanceClock(S, dt);
  const p = S.player;

  // player movement
  if (p.onFoot) {
    walkPlayer(S, dt, colliders, walkerMesh);
  } else if (p.vehicle) {
    driveCar(p.vehicle, S.input, dt, colliders, allCars.filter((c) => c !== p.vehicle));
    p.x = p.vehicle.x; p.z = p.vehicle.z; p.heading = p.vehicle.heading;
    p.speed = p.vehicle.speed;
    // ramming a ped at speed is a crime (handled in peds)
  }

  // shooting
  if (S.input.shootQueued) {
    S.input.shootQueued = false;
    const targets = [...traffic, ...police.cruisers, ...peds];
    shoot(S, combat, camera, targets, audio);
  }
  tickReload(S, dt);
  updateCombatFx(combat, dt);

  // world systems
  updateTraffic(traffic, dt, S.rng);
  updatePeds(peds, S, dt, p.vehicle);
  updatePolice(scene, police, S, dt, colliders, allCars,
    () => respawn('busted', 'BUSTED', 'The Verde PD caught up with you. The impound keeps your car.', 100),
    () => respawn('wasted', 'WASTED', 'Porto Verde chewed you up. The hospital patched you up.', 150));
  updateTaxi(S, taxi, dt, audio);
  updateMissions(S, missions, dt, audio);

  // cash stashes
  for (const st of S.stashes) {
    if (st.taken) {
      if (S.elapsed - st.takenAt > 90) { st.taken = false; st.mesh.visible = true; }
      continue;
    }
    st.mesh.children[0].material.opacity = 0.22 + Math.sin(S.elapsed * 4) * 0.1;
    if (dist2(p.x, p.z, st.x, st.z) < 3.5) {
      st.taken = true; st.takenAt = S.elapsed; st.mesh.visible = false;
      p.cash += 50;
      S.missions.stats.cashEarned += 50;
      showToast('Cash stash found! +$50');
      audio.cash();
    }
  }

  // hp regen slowly when not wanted
  if (S.wanted === 0 && p.hp < 100) p.hp = Math.min(100, p.hp + dt * 1.5);

  // camera + sky + audio
  const camPos = updateCamera(S, dt);
  camera.position.set(camPos.x, camPos.y, camPos.z);
  camera.lookAt(camPos.lookX, camPos.lookY, camPos.lookZ);
  const sky = applySky(S, scene, sun, hemi, city.lampHeads);
  const speed01 = clamp(Math.abs(p.vehicle ? p.vehicle.speed : 0) / 36, 0, 1);
  audio.engine(speed01, !p.onFoot);
  audio.siren(S.wanted > 0, S.elapsed);

  updateHud(S, { cops: police.cruisers, heli: police.heli?.mesh.position, traffic, taxiState: taxi.state });

  saveTimer += dt;
  if (saveTimer > 15) { saveTimer = 0; writeSave(S); }

  renderer.render(scene, camera);
  lastT = performance.now();
}

// --- start -------------------------------------------------------------------
camera.position.set(-150, 70, 210);
camera.lookAt(0, 0, 0);
if (SHOT) {
  // staged screenshot: skip the menu, drop straight into the scene
  closeMenus();
  stageShot(S, G, SHOT);
  // warm the pursuit up so cruisers + heli are already in frame for chase shots
  if (SHOT === 'chase') {
    for (let i = 0; i < 3; i++) {
      police.spawnTimer = 0;
      updatePolice(scene, police, S, 0.01, colliders, allCars, () => {}, () => {});
    }
  }
} else {
  openMenu();
}

// Test / automation hook (read-only state + teleport; missions still complete
// through their real triggers, so playthroughs exercise the actual game).
window.__verde = {
  S,
  state: () => ({
    cash: S.player.cash, hp: S.player.hp, wanted: S.wanted,
    onFoot: S.player.onFoot, x: S.player.x, z: S.player.z,
    mission: S.missions.active ? { id: S.missions.active.id, stage: S.missions.active.stage, objective: S.missions.active.objective } : null,
    done: { ...S.missions.done }, unlocked: S.missions.unlocked,
    taxi: { shift: S.taxi.shift, faresDone: S.taxi.faresDone },
    vaultProgress: S.vault.progress,
  }),
  teleport(x, z) {
    const p = S.player;
    if (p.vehicle) { p.vehicle.x = x; p.vehicle.z = z; p.vehicle.speed = 0; }
    p.x = x; p.z = z;
    walkerMesh.position.set(x, 0, z);
  },
  startMission(id) { closeMenus(); return startMission(S, missions, id, audio); },
  enterNearestCar() { onInteract(); },
  exitCar() { exitCar(); },
  setWanted(n) { S.wanted = n; S.wantedHeat = 30; },
  pressKey(code, ms) {
    S.input.keys.add(code);
    setTimeout(() => S.input.keys.delete(code), ms || 300);
  },
};

frame();

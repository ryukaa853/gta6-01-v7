// Missions: five jobs with a story, each a small state machine — stages,
// timers, target beacons and payouts. Free roam fills the gaps between them.
import { LANDMARKS, MISSION_DEFS, dist2, fmtCash } from './state.js';
import { makeBeacon } from './city.js';

export function createMissions(scene) {
  const beacon = makeBeacon(0xffd94d);
  beacon.visible = false;
  scene.add(beacon);
  const destBeacon = makeBeacon(0x7dff9a);
  destBeacon.visible = false;
  scene.add(destBeacon);
  return { beacon, destBeacon };
}

function def(id) { return MISSION_DEFS.find((m) => m.id === id); }

export function startMission(S, M, id, audio) {
  if (S.missions.active) return false;
  if (id > S.missions.unlocked) return false;
  const p = S.player;
  const run = { id, stage: 0, t: 0, timeLeft: 0, target: null, deliveries: 0, vaultT: 0 };
  if (id === 1) {
    run.objective = 'Steal a car — any parked car or traffic car will do (E)';
    run.target = null;
  } else if (id === 2) {
    run.timeLeft = 180;
    run.objective = 'Delivery 1 of 3: reach Verde General hospital';
    run.target = { ...LANDMARKS.hospital };
  } else if (id === 3) {
    run.timeLeft = 45;
    run.forceWanted = 2;
    S.wanted = 2; S.wantedHeat = 60;
    run.objective = 'Survive the chase — 45 seconds at two stars!';
    run.target = null;
  } else if (id === 4) {
    run.objective = 'Get in the yellow cab and press T to start your shift';
    run.target = { ...LANDMARKS.depot };
  } else if (id === 5) {
    run.objective = 'Steal the depot van and drive it to Banco Verde';
    run.target = { ...LANDMARKS.depot };
  }
  S.missions.active = run;
  placeBeacons(S, M);
  audio?.blip(660, 0.2, 'triangle', 0.2);
  S.toast?.(`Mission ${id}: ${def(id).name} — ${fmtCash(def(id).pay)}`);
  return true;
}

function placeBeacons(S, M) {
  const run = S.missions.active;
  if (!run) { M.beacon.visible = false; M.destBeacon.visible = false; return; }
  if (run.target) {
    M.beacon.position.set(run.target.x, 0, run.target.z);
    M.beacon.visible = true;
  } else {
    M.beacon.visible = false;
  }
  M.destBeacon.visible = false;
}

function completeMission(S, M, audio) {
  const run = S.missions.active;
  const d = def(run.id);
  S.player.cash += d.pay;
  S.missions.stats.cashEarned += d.pay;
  S.missions.stats.jobsDone += 1;
  S.missions.done[run.id] = true;
  S.missions.unlocked = Math.max(S.missions.unlocked, Math.min(5, run.id + 1));
  S.missions.active = null;
  M.beacon.visible = false;
  M.destBeacon.visible = false;
  if (run.forceWanted) { S.wanted = 0; S.wantedHeat = 0; }
  S.banner?.(`MISSION COMPLETE`, `${d.name} — ${fmtCash(d.pay)} earned`);
  audio?.win();
  S.onMissionComplete?.(run.id);
}

function failMission(S, M, audio, why) {
  const run = S.missions.active;
  S.missions.active = null;
  M.beacon.visible = false;
  M.destBeacon.visible = false;
  if (run?.forceWanted) { S.wanted = 0; S.wantedHeat = 0; }
  S.banner?.('MISSION FAILED', why);
  audio?.fail();
}

export function updateMissions(S, M, dt, audio) {
  const run = S.missions.active;
  if (!run) return;
  const p = S.player;
  run.t += dt;
  if (run.timeLeft > 0 && run.id !== 3) {
    run.timeLeft -= dt;
    if (run.timeLeft <= 0) {
      failMission(S, M, audio, 'Out of time.');
      return;
    }
  }
  if (run.id === 3 && run.stage === 0) run.timeLeft = Math.max(0, 45 - run.t);
  if (run.id === 1) {
    if (run.stage === 0) {
      if (!p.onFoot && p.vehicle) {
        run.stage = 1;
        run.objective = 'Drive to Luna Garage';
        run.target = { ...LANDMARKS.lunaGarage };
        placeBeacons(S, M);
        S.toast?.('Nice wheels. Now get to Luna Garage.');
      }
    } else if (dist2(p.x, p.z, LANDMARKS.lunaGarage.x, LANDMARKS.lunaGarage.z) < 12) {
      completeMission(S, M, audio);
    }
  } else if (run.id === 2) {
    const stops = [LANDMARKS.hospital, LANDMARKS.depot, LANDMARKS.impound];
    if (run.deliveries < 3 && dist2(p.x, p.z, run.target.x, run.target.z) < 12) {
      run.deliveries += 1;
      p.cash += 50;
      S.toast?.(`Delivery ${run.deliveries} of 3 done (+$50)`);
      audio?.cash();
      if (run.deliveries >= 3) { completeMission(S, M, audio); return; }
      run.target = { ...stops[run.deliveries] };
      run.objective = `Delivery ${run.deliveries + 1} of 3: reach ${stops[run.deliveries].label}`;
      placeBeacons(S, M);
    }
  } else if (run.id === 3) {
    if (run.stage === 0) {
      run.objective = `Survive the chase — ${Math.ceil(run.timeLeft)}s left at ★★`;
      if (run.timeLeft <= 0) { /* handled above */ }
      if (run.t >= 45) {
        run.stage = 1;
        run.timeLeft = 0;
        run.objective = 'Lose the heat — reach Casa Verde';
        run.target = { ...LANDMARKS.casaVerde };
        placeBeacons(S, M);
        S.toast?.('Now shake them — Casa Verde!');
      }
    } else if (dist2(p.x, p.z, LANDMARKS.casaVerde.x, LANDMARKS.casaVerde.z) < 12) {
      S.wanted = 0; S.wantedHeat = 0;
      completeMission(S, M, audio);
    }
  } else if (run.id === 4) {
    if (run.stage === 0 && S.taxi.shift) {
      run.stage = 1;
      run.objective = 'Complete 3 fares — watch the meter, drive smooth';
      run.target = null;
      placeBeacons(S, M);
    }
    if (S.taxi.faresDone >= 3 && S.missions.active === run) {
      completeMission(S, M, audio);
    }
  } else if (run.id === 5) {
    if (run.stage === 0) {
      if (!p.onFoot && p.vehicle && p.vehicle.isVaultVan) {
        run.stage = 1;
        run.objective = 'Drive the van to Banco Verde';
        run.target = { ...LANDMARKS.bancoVerde };
        placeBeacons(S, M);
        S.toast?.('The van is yours. Banco Verde awaits.');
      }
    } else if (run.stage === 1) {
      if (dist2(p.x, p.z, LANDMARKS.bancoVerde.x, LANDMARKS.bancoVerde.z) < 14) {
        run.stage = 2;
        run.objective = 'On foot: get to the vault door and hold E to crack it';
        run.target = { ...LANDMARKS.bancoVerde };
        placeBeacons(S, M);
        S.toast?.('Park up and go in on foot (F to exit, then E at the vault).');
      }
    } else if (run.stage === 2) {
      if (!p.onFoot) { /* still in the van: wait */ }
      else if (dist2(p.x, p.z, LANDMARKS.bancoVerde.x, LANDMARKS.bancoVerde.z) < 12) {
        S.vault.cracking = true;
      } else {
        S.vault.cracking = false;
      }
      if (S.vault.cracking && S.input.keys.has('KeyE')) {
        S.vault.progress += dt / 6;
        if (S.vault.progress >= 1) {
          S.vault.cracking = false;
          S.vault.progress = 0;
          run.stage = 3;
          S.wanted = 3; S.wantedHeat = 60;
          p.cash += 200;
          run.objective = 'Vault cracked! Escape to Casa Verde — ★★★ manhunt!';
          run.target = { ...LANDMARKS.casaVerde };
          placeBeacons(S, M);
          S.banner?.('VAULT CRACKED', '+$200 in hand — run!');
          audio?.win();
        }
      } else if (!S.input.keys.has('KeyE')) {
        S.vault.progress = Math.max(0, S.vault.progress - dt * 0.1);
        S.vault.cracking = false;
      }
    } else if (run.stage === 3) {
      if (dist2(p.x, p.z, LANDMARKS.casaVerde.x, LANDMARKS.casaVerde.z) < 12) {
        S.wanted = 0; S.wantedHeat = 0;
        completeMission(S, M, audio);
      }
    }
  }
}

export function missionObjectiveText(S) {
  const run = S.missions.active;
  if (!run) return { title: 'FREE ROAM', text: 'Explore Porto Verde. Steal a car, earn cash, stay out of trouble.', timer: '' };
  const d = def(run.id);
  let timer = '';
  if (run.timeLeft > 0) timer = '⏱ ' + Math.ceil(run.timeLeft) + 's';
  return { title: `MISSION ${run.id} — ${d.name.toUpperCase()}  •  ${fmtCash(d.pay)}`, text: run.objective, timer };
}

// Taxi fares: the repeatable side job. Start a shift in the yellow cab, pick
// up a passenger at the green beacon, deliver them before the meter runs out.
// Fast, smooth driving earns a tip; three fares finish mission 4.
import { WORLD, LANDMARKS, dist2 } from './state.js';
import { makeBeacon } from './city.js';

const FARE_BASE = 120;
const FARE_TIP_MAX = 60;

function fareSpot(S, avoid) {
  // a random street corner, away from the given point
  for (let tries = 0; tries < 12; tries++) {
    const sx = WORLD.streets[Math.floor(S.rng() * WORLD.streets.length)];
    const sz = WORLD.streets[Math.floor(S.rng() * WORLD.streets.length)];
    if (dist2(sx, sz, avoid.x, avoid.z) > 60) return { x: sx, z: sz };
  }
  return { x: -WORLD.streets[0], z: WORLD.streets[0] };
}

export function createTaxi(scene) {
  const beacon = makeBeacon(0x7dff9a);
  beacon.visible = false;
  scene.add(beacon);
  return { beacon, state: 'off' }; // off | pickup | dropoff
}

export function startShift(S, taxi, audio) {
  if (S.taxi.shift) return false;
  const p = S.player;
  if (p.onFoot || !p.vehicle || p.vehicle.cls !== 'taxi') return false;
  S.taxi.shift = true;
  S.taxi.faresDone = 0;
  taxi.state = 'pickup';
  const spot = fareSpot(S, p);
  S.taxi.fare = { pickup: spot, dest: null, timeLeft: 90, paid: 0 };
  taxi.beacon.position.set(spot.x, 0, spot.z);
  taxi.beacon.visible = true;
  audio?.blip(880, 0.15, 'sine', 0.2);
  S.toast?.('Taxi shift started — pick up the passenger!');
  return true;
}

export function endShift(S, taxi, audio) {
  if (!S.taxi.shift) return;
  S.taxi.shift = false;
  S.taxi.fare = null;
  taxi.state = 'off';
  taxi.beacon.visible = false;
  audio?.blip(440, 0.15, 'sine', 0.15);
}

export function updateTaxi(S, taxi, dt, audio) {
  if (!S.taxi.shift || !S.taxi.fare) return;
  const fare = S.taxi.fare;
  const p = S.player;
  fare.timeLeft -= dt;
  if (fare.timeLeft <= 0) {
    S.toast?.('Fare expired — the passenger walked away.');
    audio?.fail();
    endShift(S, taxi, audio);
    return;
  }
  const target = taxi.state === 'pickup' ? fare.pickup : fare.dest;
  if (!target) return;
  if (dist2(p.x, p.z, target.x, target.z) < 6) {
    if (taxi.state === 'pickup') {
      taxi.state = 'dropoff';
      fare.dest = fareSpot(S, target);
      taxi.beacon.position.set(fare.dest.x, 0, fare.dest.z);
      S.toast?.('Passenger aboard — drive to the destination!');
      audio?.blip(1040, 0.12, 'sine', 0.2);
    } else {
      const tip = Math.round((fare.timeLeft / 90) * FARE_TIP_MAX);
      const paid = FARE_BASE + tip;
      p.cash += paid;
      S.missions.stats.cashEarned += paid;
      S.taxi.faresDone += 1;
      S.missions.stats.faresDone += 1;
      S.toast?.(`Fare complete! +$${paid} (tip $${tip})`);
      audio?.cash();
      S.onFareDone?.(S.taxi.faresDone);
      if (S.taxi.faresDone >= 3) { endShift(S, taxi, audio); return; }
      taxi.state = 'pickup';
      fare.pickup = fareSpot(S, p);
      fare.dest = null;
      fare.timeLeft = 90;
      taxi.beacon.position.set(fare.pickup.x, 0, fare.pickup.z);
    }
  }
  // beacon pulse
  taxi.beacon.children[0].material.opacity = 0.22 + Math.sin(S.elapsed * 4) * 0.1;
}

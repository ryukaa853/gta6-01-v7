// Pedestrians: 24 citizens strolling the sidewalks who scatter when shots are
// fired or a car bears down on them. Hitting one is a crime — the Verde PD
// notices, and so does the wanted meter.
import { WORLD, clamp, dist2 } from './state.js';
import { range, pick } from './rng.js';

const SHIRTS = [0xd96a6a, 0x6a8ad9, 0x6ad98a, 0xd9c26a, 0x9a6ad9, 0xd98a6a, 0x6ad9c2, 0xe8e8e8];

export function spawnPeds(scene, S, count) {
  const rng = S.rng;
  const peds = [];
  for (let i = 0; i < count; i++) {
    const g = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: pick(rng, SHIRTS) });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2e3340 });
    const skin = new THREE.MeshLambertMaterial({ color: pick(rng, [0xd9a986, 0x8a5a3a, 0xe8c9a8, 0x6a4a2e]) });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.35), shirt);
    body.position.y = 1.1;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
    head.position.y = 1.78;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), pants);
    legs.position.y = 0.35;
    g.add(body); g.add(head); g.add(legs);
    // stand on a sidewalk next to a street
    const street = pick(rng, WORLD.streets);
    const along = range(rng, -190, 190);
    const side = rng() < 0.5 ? 11.5 : -11.5;
    const horizontal = rng() < 0.5;
    const x = horizontal ? along : street + side;
    const z = horizontal ? street + side : along;
    g.position.set(x, 0, z);
    scene.add(g);
    peds.push({
      mesh: g, x, z, heading: range(rng, 0, Math.PI * 2),
      speed: range(rng, 0.8, 1.6), panic: 0, dead: false, isPed: true,
      walkPhase: range(rng, 0, 6), street, horizontal, side,
    });
  }
  return peds;
}

export function updatePeds(peds, S, dt, playerCar) {
  const p = S.player;
  for (const ped of peds) {
    if (ped.dead) continue;
    // panic triggers: gunfire nearby, a car closing in, or high wanted heat
    const dPlayer = dist2(ped.x, ped.z, p.x, p.z);
    let flee = ped.panic > 0;
    if (dPlayer < 6 && S.shotsFiredAt && S.elapsed - S.shotsFiredAt < 2) flee = true;
    if (playerCar && dist2(ped.x, ped.z, playerCar.x, playerCar.z) < 7 && Math.abs(playerCar.speed) > 4) flee = true;
    if (flee) {
      ped.panic = Math.max(ped.panic, 2.5);
      // run away from the player
      const away = Math.atan2(ped.x - p.x, ped.z - p.z);
      ped.heading = away;
      ped.x += Math.sin(away) * 4.5 * dt;
      ped.z += Math.cos(away) * 4.5 * dt;
    } else {
      // amble along the sidewalk; turn around at the city edge
      ped.x += Math.sin(ped.heading) * ped.speed * dt;
      ped.z += Math.cos(ped.heading) * ped.speed * dt;
      if (Math.abs(ped.x) > 200 || Math.abs(ped.z) > 200) ped.heading += Math.PI;
      if (S.rng() < dt * 0.02) ped.heading += (S.rng() - 0.5) * 1.2;
    }
    ped.panic = Math.max(0, ped.panic - dt);
    ped.x = clamp(ped.x, -WORLD.bound, WORLD.bound);
    ped.z = clamp(ped.z, -WORLD.bound, WORLD.bound);
    ped.walkPhase += dt * (flee ? 11 : 5);
    ped.mesh.position.set(ped.x, Math.abs(Math.sin(ped.walkPhase)) * 0.05, ped.z);
    ped.mesh.rotation.y = ped.heading;
    // hit by the player's car: knocked down, crime registered
    if (playerCar && Math.abs(playerCar.speed) > 3 && dist2(ped.x, ped.z, playerCar.x, playerCar.z) < 2.2) {
      ped.dead = true;
      ped.mesh.rotation.x = Math.PI / 2;
      ped.mesh.position.y = 0.4;
      S.onCrime?.(2, 'pedestrian down');
    }
  }
}

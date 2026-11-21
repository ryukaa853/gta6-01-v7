// The Verde PD: wanted stars 0–5, pursuing cruisers that ram, roadblocks at
// two stars and up, a searchlight helicopter at three stars and up, and the
// busted / wasted outcomes when they finally catch Mara.
import { WORLD, clamp, dist2, angleLerp } from './state.js';
import { makeCar } from './vehicles.js';

export function createPolice(scene) {
  return {
    cruisers: [],      // active pursuit cars
    roadblocks: [],    // parked cruisers forming a block
    heli: null,        // {mesh, rotor, angle, light}
    heliTarget: null,
    spawnTimer: 0,
    bustedAt: 0,
  };
}

function spawnCruiser(scene, police, S, x, z) {
  const car = makeCar(scene, 'cruiser', x, z, 0);
  car.isPolice = true;
  police.cruisers.push(car);
  return car;
}

function heliMesh(scene) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 5.2),
    new THREE.MeshLambertMaterial({ color: 0x2e4a6b }));
  body.position.y = 0;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 4.5),
    new THREE.MeshLambertMaterial({ color: 0x2e4a6b }));
  tail.position.set(0, 0.2, -4.2);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.6),
    new THREE.MeshLambertMaterial({ color: 0x14161a }));
  rotor.position.y = 1.0;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
  lamp.position.set(0, -0.9, 1.2);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(6, 34, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.set(0, -17.5, 1.2);
  beam.rotation.x = Math.PI;
  g.add(body); g.add(tail); g.add(rotor); g.add(lamp); g.add(beam);
  g.userData = { rotor, beam };
  scene.add(g);
  return g;
}

export function addWanted(S, stars, reason) {
  if (S.missions.active && S.missions.active.forceWanted) return; // mission owns the meter
  S.wanted = clamp(S.wanted + stars, 0, 5);
  S.wantedHeat = 25;
  if (reason) S.lastCrime = reason;
}

export function updatePolice(scene, police, S, dt, colliders, allCars, onBusted, onWasted) {
  const p = S.player;
  const wanted = S.wanted;
  // --- decay: lose heat when no cruiser can see the player
  if (wanted > 0 && !S.missions.active?.forceWanted) {
    S.wantedHeat -= dt;
    const nearest = police.cruisers.reduce((m, c) => Math.min(m, dist2(c.x, c.z, p.x, p.z)), 1e9);
    if (S.wantedHeat <= 0 && nearest > 70) {
      S.wanted -= 1;
      S.wantedHeat = 18;
    }
  }
  // --- spawn cruisers up to the wanted level (max 4)
  police.spawnTimer -= dt;
  const wantCruisers = Math.min(wanted, 4);
  if (police.cruisers.length < wantCruisers && police.spawnTimer <= 0) {
    police.spawnTimer = 2.5;
    const ang = S.rng() * Math.PI * 2;
    const d = 90;
    const x = clamp(p.x + Math.sin(ang) * d, -200, 200);
    const z = clamp(p.z + Math.cos(ang) * d, -200, 200);
    spawnCruiser(scene, police, S, x, z);
  }
  // --- remove surplus cruisers when wanted falls
  while (police.cruisers.length > wantCruisers) {
    const c = police.cruisers.pop();
    scene.remove(c.mesh);
  }
  // --- pursuit: steer at the player, ram on contact
  for (const c of police.cruisers) {
    if (c.disabled) continue;
    const dx = p.x - c.x, dz = p.z - c.z;
    const d = Math.hypot(dx, dz) || 0.001;
    const wantHeading = Math.atan2(dx, dz);
    c.heading = angleLerp(c.heading, wantHeading, Math.min(1, dt * 1.8));
    const targetSpeed = Math.min(30 + wanted * 1.5, p.onFoot ? 14 : 33);
    c.speed += (targetSpeed - c.speed) * Math.min(1, dt * 0.8);
    c.x += Math.sin(c.heading) * c.speed * dt;
    c.z += Math.cos(c.heading) * c.speed * dt;
    c.x = clamp(c.x, -WORLD.bound, WORLD.bound);
    c.z = clamp(c.z, -WORLD.bound, WORLD.bound);
    // keep cruisers out of buildings (circle vs AABB push-out)
    for (const col of colliders) {
      const cx = clamp(c.x, col.x - col.hx, col.x + col.hx);
      const cz = clamp(c.z, col.z - col.hz, col.z + col.hz);
      const ddx = c.x - cx, ddz = c.z - cz;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 < 2.6 && d2 > 0.0001) {
        const dd = Math.sqrt(d2);
        c.x = cx + (ddx / dd) * 1.62;
        c.z = cz + (ddz / dd) * 1.62;
      }
    }
    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.y = c.heading;
    // flashing light bar
    c.flash = (c.flash + dt * 6) % 2;
    const bar = c.mesh.userData.lightBar;
    if (bar) {
      bar.userData.red.material.color.setHex(c.flash < 1 ? 0xff2020 : 0x551010);
      bar.userData.blue.material.color.setHex(c.flash >= 1 ? 0x2050ff : 0x101055);
    }
    if (d < 3.2) {
      if (p.onFoot) {
        S.flags.copTouchTime += dt;
        if (S.flags.copTouchTime > 2.2) { onBusted(); return; }
      } else if (p.vehicle) {
        // ram: shove the player's car and dent it
        p.vehicle.speed *= 0.82;
        p.vehicle.x += (dx / d) * -1.2;
        p.vehicle.z += (dz / d) * -1.2;
        p.hp = Math.max(0, p.hp - 10 * dt);
        if (p.hp <= 0) { onWasted(); return; }
      }
    }
  }
  if (police.cruisers.every((c) => dist2(c.x, c.z, p.x, p.z) > 5)) S.flags.copTouchTime = 0;

  // --- roadblocks at wanted 2+: two parked cruisers across the road ahead
  const wantBlocks = wanted >= 2 ? 1 : 0;
  if (police.roadblocks.length < wantBlocks) {
    const ahead = p.onFoot ? p.heading : (p.vehicle ? p.vehicle.heading : p.heading);
    const bx = p.x + Math.sin(ahead) * 55;
    const bz = p.z + Math.cos(ahead) * 55;
    const perp = ahead + Math.PI / 2;
    const b1 = makeCar(scene, 'cruiser', bx + Math.sin(perp) * 4, bz + Math.cos(perp) * 4, ahead + Math.PI / 2);
    const b2 = makeCar(scene, 'cruiser', bx - Math.sin(perp) * 4, bz - Math.cos(perp) * 4, ahead + Math.PI / 2);
    b1.isRoadblock = true; b2.isRoadblock = true;
    police.roadblocks.push(b1, b2);
    allCars.push(b1, b2);
  }
  if (police.roadblocks.length > 0 && wanted < 2) {
    for (const b of police.roadblocks) {
      scene.remove(b.mesh);
      const i = allCars.indexOf(b);
      if (i >= 0) allCars.splice(i, 1);
    }
    police.roadblocks.length = 0;
  }

  // --- helicopter at wanted 3+
  if (wanted >= 3 && !police.heli) {
    police.heli = { mesh: heliMesh(scene), angle: 0 };
  }
  if (police.heli && wanted < 3) {
    scene.remove(police.heli.mesh);
    police.heli = null;
  }
  if (police.heli) {
    const h = police.heli;
    h.angle += dt * 0.55;
    const r = 26;
    h.mesh.position.set(p.x + Math.sin(h.angle) * r, 34, p.z + Math.cos(h.angle) * r);
    h.mesh.rotation.y = Math.atan2(p.x - h.mesh.position.x, p.z - h.mesh.position.z);
    h.mesh.userData.rotor.rotation.y += dt * 22;
    // the spotlight pins the player: standing in it raises heat
    S.wantedHeat = Math.max(S.wantedHeat, 8);
  }
}

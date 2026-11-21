// Vehicles: five classes with their own handling, the parked cars to steal,
// traffic that loops the street grid, and the arcade driving model. Every car
// is built from boxes and cylinders here — no imported models.
import { WORLD, clamp, dist2 } from './state.js';
import { range, intRange, pick } from './rng.js';

export const CLASSES = {
  sedan:  { top: 26, accel: 14, steer: 0.55, grip: 1.0, color: 0x7a8a9a, tough: 1.0 },
  sport:  { top: 36, accel: 20, steer: 0.72, grip: 1.15, color: 0xc23b2e, tough: 0.8 },
  van:    { top: 22, accel: 10, steer: 0.45, grip: 0.9, color: 0x4a6b8a, tough: 1.6 },
  taxi:   { top: 27, accel: 15, steer: 0.6, grip: 1.0, color: 0xf2c200, tough: 1.0 },
  cruiser:{ top: 31, accel: 17, steer: 0.62, grip: 1.05, color: 0xf2f2f2, tough: 1.3 },
};

const TRAFFIC_COLORS = [0x5a7a9a, 0x9a5a5a, 0x6a8a5a, 0x8a8a7a, 0x7a5a8a, 0x3a4a5a, 0xa89060];

export function buildCarMesh(cls, color) {
  const spec = CLASSES[cls];
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: color ?? spec.color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2430 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const isVan = cls === 'van';
  const bodyLen = isVan ? 5.6 : 4.4;
  const bodyH = isVan ? 1.5 : 0.85;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, bodyH, bodyLen), bodyMat);
  body.position.y = 0.75;
  g.add(body);
  const cabinH = isVan ? 1.1 : 0.7;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, cabinH, isVan ? 4.6 : 2.2), glassMat);
  cabin.position.set(0, bodyH + cabinH / 2 + 0.25, isVan ? 0 : -0.2);
  g.add(cabin);
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.position.set(wx, 0.42, wz * (bodyLen / 4.4));
    g.add(w);
  }
  // headlights + taillights
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const hx of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.1), headMat);
    h.position.set(hx, 0.85, bodyLen / 2 + 0.02);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.1), tailMat);
    t.position.set(hx, 0.85, -bodyLen / 2 - 0.02);
    g.add(t);
  }
  if (cls === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffe94d }));
    sign.position.set(0, bodyH + cabinH + 0.35, -0.2);
    g.add(sign);
  }
  if (cls === 'cruiser') {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.x = -0.35;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2050ff }));
    blue.position.x = 0.35;
    bar.add(red); bar.add(blue);
    bar.position.set(0, bodyH + cabinH + 0.3, -0.2);
    bar.userData = { red, blue };
    g.add(bar);
    g.userData.lightBar = bar;
  }
  g.userData.bodyLen = bodyLen;
  return g;
}

export function makeCar(scene, cls, x, z, heading, color) {
  const mesh = buildCarMesh(cls, color);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  const spec = CLASSES[cls];
  return {
    cls, spec, mesh, x, z, heading, speed: 0, steerAngle: 0,
    hp: 100 * spec.tough, disabled: false, isPlayer: false,
    traffic: null, // {axis, dir, target} when an AI driver
    flash: 0,
  };
}

// Arcade driving: accelerate, steer harder at low speed, handbrake slides.
export function driveCar(car, input, dt, colliders, others) {
  const p = car.spec;
  const k = input.keys;
  const forward = k.has('KeyW') || k.has('ArrowUp');
  const back = k.has('KeyS') || k.has('ArrowDown');
  const left = k.has('KeyA') || k.has('ArrowLeft');
  const right = k.has('KeyD') || k.has('ArrowRight');
  const nitro = k.has('ShiftLeft') || k.has('ShiftRight');
  const brake = k.has('Space');
  const top = p.top * (nitro ? 1.25 : 1);
  if (forward) car.speed += p.accel * dt * (nitro ? 1.35 : 1);
  if (back) car.speed -= p.accel * 0.8 * dt;
  if (!forward && !back) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  if (brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  car.speed = clamp(car.speed, -top * 0.45, top);
  const steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
  const speedFactor = clamp(Math.abs(car.speed) / 12, 0.25, 1);
  car.steerAngle = car.steerAngle + (steerTarget * p.steer * (brake ? 1.5 : 1) - car.steerAngle) * Math.min(1, dt * 8);
  car.heading += car.steerAngle * speedFactor * dt * Math.sign(car.speed || 1) * (car.speed < 0 ? -1 : 1) * 1.9;
  moveCar(car, dt, colliders, others);
}

export function moveCar(car, dt, colliders, others) {
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  // circle vs building AABB: push out and scrub speed
  const r = 1.6;
  let px = nx, pz = nz, hit = false;
  for (const c of colliders) {
    const cx = clamp(px, c.x - c.hx, c.x + c.hx);
    const cz = clamp(pz, c.z - c.hz, c.z + c.hz);
    const dx = px - cx, dz = pz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      const d = Math.sqrt(d2) || 0.001;
      px = cx + (dx / d) * r;
      pz = cz + (dz / d) * r;
    }
  }
  // soft city bounds
  px = clamp(px, -WORLD.bound, WORLD.bound);
  pz = clamp(pz, -WORLD.bound, WORLD.bound);
  // car vs car: gentle push apart
  if (others) {
    for (const o of others) {
      if (o === car || o.disabled) continue;
      const d = dist2(px, pz, o.x, o.z);
      if (d < 3.4 && d > 0.01) {
        const push = (3.4 - d) / 2;
        const ux = (px - o.x) / d, uz = (pz - o.z) / d;
        px += ux * push; pz += uz * push;
        car.speed *= 0.92;
      }
    }
  }
  if (hit) car.speed *= 0.55;
  car.x = px; car.z = pz;
  car.mesh.position.set(px, 0, pz);
  car.mesh.rotation.y = car.heading;
  // wheel spin is faked by body lean: tilt into steering
  car.mesh.rotation.z = -car.steerAngle * 0.12 * Math.sign(car.speed || 1);
}

// Traffic: cars cruise the grid, turning at intersections, stopping for nothing.
export function spawnTraffic(scene, S, count) {
  const rng = S.rng;
  const cars = [];
  for (let i = 0; i < count; i++) {
    const horizontal = rng() < 0.5;
    const street = pick(rng, WORLD.streets);
    const along = range(rng, -180, 180);
    const cls = pick(rng, ['sedan', 'sedan', 'sport', 'van']);
    const car = makeCar(scene, cls, horizontal ? along : street, horizontal ? street : along,
      horizontal ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI),
      pick(rng, TRAFFIC_COLORS));
    car.speed = range(rng, 7, 11);
    car.traffic = { horizontal, dir: rng() < 0.5 ? 1 : -1, nextTurn: range(rng, 20, 90) };
    cars.push(car);
  }
  return cars;
}

export function updateTraffic(cars, dt, rng) {
  for (const car of cars) {
    if (car.disabled || !car.traffic) continue; // carjacked cars have no driver
    const t = car.traffic;
    car.speed += (9 - car.speed) * Math.min(1, dt);
    const step = car.speed * dt * t.dir;
    if (t.horizontal) car.x += step; else car.z += step;
    t.nextTurn -= Math.abs(step);
    if (t.nextTurn <= 0) {
      // at an intersection: maybe turn onto the crossing street
      const near = WORLD.streets.reduce((best, s) => {
        const d = Math.abs((t.horizontal ? car.x : car.z) - s);
        return d < best.d ? { s, d } : best;
      }, { s: 0, d: 1e9 });
      if (near.d < 10) {
        if (rng() < 0.45) {
          t.horizontal = !t.horizontal;
          car.heading = t.horizontal ? (t.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (t.dir > 0 ? 0 : Math.PI);
          if (t.horizontal) car.z = near.s; else car.x = near.s;
        } else {
          t.dir = rng() < 0.5 ? 1 : -1;
          car.heading = t.horizontal ? (t.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (t.dir > 0 ? 0 : Math.PI);
        }
      }
      t.nextTurn = range(rng, 30, 110);
    }
    // wrap around the city edge instead of driving into the sea
    if (car.x > WORLD.bound) car.x = -WORLD.bound;
    if (car.x < -WORLD.bound) car.x = WORLD.bound;
    if (car.z > WORLD.bound) car.z = -WORLD.bound;
    if (car.z < -WORLD.bound) car.z = WORLD.bound;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  }
}

// Six parked cars the player can steal, plus the taxi and the depot van.
export function spawnParkedCars(scene, S) {
  const rng = S.rng;
  const parked = [];
  const spots = [
    { cls: 'sedan', x: -105, z: -27, h: 0 },
    { cls: 'sport', x: 35, z: 113, h: Math.PI / 2 },
    { cls: 'sedan', x: -35, z: -113, h: Math.PI },
    { cls: 'van', x: 105, z: 27, h: -Math.PI / 2 },
    { cls: 'sport', x: -27, z: 105, h: 0 },
    { cls: 'sedan', x: 113, z: -35, h: Math.PI / 2 },
  ];
  for (const s of spots) {
    const car = makeCar(scene, s.cls, s.x, s.z, s.h, pick(rng, TRAFFIC_COLORS));
    car.parked = true;
    parked.push(car);
  }
  // The yellow cab waits by the depot; the van inside it is the M5 target.
  const taxi = makeCar(scene, 'taxi', 150, -150, Math.PI * 0.75);
  taxi.parked = true;
  parked.push(taxi);
  const van = makeCar(scene, 'van', 168, -186, Math.PI);
  van.parked = true; van.isVaultVan = true;
  parked.push(van);
  return { parked, taxi, van };
}

export function nearestCar(cars, x, z, maxD) {
  let best = null, bd = maxD;
  for (const c of cars) {
    const d = dist2(x, z, c.x, c.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export { intRange };

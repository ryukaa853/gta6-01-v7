// Pistol combat: a 12-round magazine, raycast shots from the camera, tracers,
// muzzle flash and hit feedback. Cruisers take 3 hits to disable; traffic and
// pedestrians react; shooting is a crime.
import { dist2 } from './state.js';

export function createCombat(scene) {
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
  scene.add(tracer);
  const flash = new THREE.PointLight(0xffe9a8, 0, 18);
  scene.add(flash);
  const hitMarker = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd94d }));
  hitMarker.visible = false;
  scene.add(hitMarker);
  return { tracer, flash, hitMarker, flashT: 0, hitT: 0, raycaster: new THREE.Raycaster() };
}

export function shoot(S, combat, camera, targets, audio) {
  const p = S.player;
  if (p.onFoot === false) return false; // no drive-bys: shoot on foot only
  if (p.reloading > 0) return false;
  if (p.ammo <= 0) { audio?.blip(220, 0.08, 'square', 0.12); return false; }
  if (S.elapsed - p.lastShot < 0.22) return false;
  p.lastShot = S.elapsed;
  p.ammo -= 1;
  S.shotsFiredAt = S.elapsed;
  audio?.shot();
  combat.flashT = 0.07;
  combat.flash.position.copy(camera.position);
  combat.flash.position.y -= 0.4;
  combat.flash.intensity = 6;
  // raycast from screen centre into the world
  combat.raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const meshes = [];
  for (const t of targets) {
    if (t.disabled || t.dead) continue;
    t.mesh.traverse((m) => { if (m.isMesh) { m.userData.__target = t; meshes.push(m); } });
  }
  const hits = combat.raycaster.intersectObjects(meshes, false);
  const from = camera.position.clone();
  let end;
  if (hits.length > 0 && hits[0].distance < 70) {
    const hit = hits[0];
    end = hit.point.clone();
    const t = hit.object.userData.__target;
    combat.hitT = 0.25;
    combat.hitMarker.position.copy(end);
    combat.hitMarker.visible = true;
    damageTarget(S, t, audio);
  } else {
    end = from.clone().add(combat.raycaster.ray.direction.clone().multiplyScalar(70));
  }
  const pos = combat.tracer.geometry.attributes.position;
  pos.setXYZ(0, from.x, from.y, from.z);
  pos.setXYZ(1, end.x, end.y, end.z);
  pos.needsUpdate = true;
  combat.tracer.material.opacity = 0.9;
  return true;
}

function damageTarget(S, t, audio) {
  if (t.isPolice) {
    t.hits = (t.hits || 0) + 1;
    if (t.hits >= 3) {
      t.disabled = true;
      t.speed = 0;
      t.mesh.rotation.z = 0.06;
      S.toast?.('Cruiser disabled! +$25');
      S.player.cash += 25;
    }
  } else if (t.isPed) {
    t.dead = true;
    t.mesh.rotation.x = Math.PI / 2;
    t.mesh.position.y = 0.4;
    S.onCrime?.(2, 'shot a pedestrian');
  } else {
    // traffic car: driver bails, car stalls
    t.disabled = true;
    t.speed = 0;
    S.onCrime?.(1, 'shot at traffic');
  }
  audio?.blip(1400, 0.06, 'square', 0.15);
}

export function updateCombatFx(combat, dt) {
  if (combat.flashT > 0) {
    combat.flashT -= dt;
    if (combat.flashT <= 0) combat.flash.intensity = 0;
  }
  if (combat.tracer.material.opacity > 0) {
    combat.tracer.material.opacity = Math.max(0, combat.tracer.material.opacity - dt * 6);
  }
  if (combat.hitT > 0) {
    combat.hitT -= dt;
    if (combat.hitT <= 0) combat.hitMarker.visible = false;
  }
}

export function reload(S, audio) {
  const p = S.player;
  if (p.reloading > 0 || p.ammo === p.magSize) return;
  p.reloading = 1.1;
  audio?.blip(500, 0.1, 'square', 0.12);
}

export function tickReload(S, dt) {
  const p = S.player;
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) { p.ammo = p.magSize; p.reloading = 0; }
  }
}

export { dist2 };

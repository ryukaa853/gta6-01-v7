// On foot: Mara Solis herself — a simple capsule figure with a jacket, a walk
// cycle faked by a bob, and camera-relative WASD movement. The camera orbits
// with the mouse and chases from behind when driving.
import { WORLD, clamp } from './state.js';

export function buildWalkerMesh() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2e6b4a });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2e3d5a });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1a1210 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.35), jeans);
  legs.position.y = 0.43;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.75, 0.42), jacket);
  torso.position.y = 1.22;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), skin);
  head.position.y = 1.88;
  g.add(head);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairM.position.y = 1.92;
  g.add(hairM);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), jacket);
  armL.position.set(-0.46, 1.25, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.46;
  g.add(armR);
  g.userData = { legs, torso, armL, armR };
  return g;
}

// Move on foot. Returns metres walked this frame (for the bob + footstep tick).
export function walkPlayer(S, dt, colliders, mesh) {
  const p = S.player, k = S.input.keys;
  const run = k.has('ShiftLeft') || k.has('ShiftRight');
  const speed = run ? p.runSpeed : p.walkSpeed;
  let fx = 0, fz = 0;
  if (k.has('KeyW') || k.has('ArrowUp')) { fx += Math.sin(S.camera.yaw); fz += Math.cos(S.camera.yaw); }
  if (k.has('KeyS') || k.has('ArrowDown')) { fx -= Math.sin(S.camera.yaw); fz -= Math.cos(S.camera.yaw); }
  if (k.has('KeyA') || k.has('ArrowLeft')) { fx -= Math.cos(S.camera.yaw); fz += Math.sin(S.camera.yaw); }
  if (k.has('KeyD') || k.has('ArrowRight')) { fx += Math.cos(S.camera.yaw); fz -= Math.sin(S.camera.yaw); }
  const len = Math.hypot(fx, fz);
  if (len > 0.01) {
    fx /= len; fz /= len;
    const nx = p.x + fx * speed * dt;
    const nz = p.z + fz * speed * dt;
    // circle vs building AABB
    let px = clamp(nx, -WORLD.bound, WORLD.bound);
    let pz = clamp(nz, -WORLD.bound, WORLD.bound);
    const r = 0.6;
    for (const c of colliders) {
      const cx = clamp(px, c.x - c.hx, c.x + c.hx);
      const cz = clamp(pz, c.z - c.hz, c.z + c.hz);
      const dx = px - cx, dz = pz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 0.001;
        px = cx + (dx / d) * r;
        pz = cz + (dz / d) * r;
      }
    }
    p.x = px; p.z = pz;
    p.heading = Math.atan2(fx, fz);
    p.speed = speed;
    mesh.position.set(p.x, Math.abs(Math.sin(S.elapsed * (run ? 11 : 7))) * 0.08, p.z);
    mesh.rotation.y = p.heading;
    mesh.userData.armL.rotation.x = Math.sin(S.elapsed * (run ? 11 : 7)) * 0.7;
    mesh.userData.armR.rotation.x = -Math.sin(S.elapsed * (run ? 11 : 7)) * 0.7;
    return speed * dt;
  }
  p.speed = 0;
  mesh.position.set(p.x, 0, p.z);
  mesh.rotation.y = p.heading;
  mesh.userData.armL.rotation.x = 0;
  mesh.userData.armR.rotation.x = 0;
  return 0;
}

// Third-person camera: orbit yaw/pitch from mouse drag, smoothed follow.
export function updateCamera(S, dt) {
  const cam = S.camera;
  cam.yaw += S.input.dragDX * 0.005;
  cam.pitch = clamp(cam.pitch + S.input.dragDY * 0.004, 0.08, 1.1);
  S.input.dragDX = 0; S.input.dragDY = 0;
  const p = S.player;
  const wantDist = p.onFoot ? 9 : 13;
  cam.dist += (wantDist - cam.dist) * Math.min(1, dt * 4);
  // When driving, the camera swings behind the car; on foot it stays free-orbit.
  const targetYaw = p.onFoot ? cam.yaw : p.heading + Math.PI;
  if (!p.onFoot) cam.yaw = cam.yaw + (angDiff(cam.yaw, targetYaw)) * Math.min(1, dt * 1.6);
  const cx = p.x - Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
  const cz = p.z - Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
  const cy = 2.2 + Math.sin(cam.pitch) * cam.dist;
  return { x: cx, y: cy, z: cz, lookX: p.x, lookY: 1.6, lookZ: p.z };
}

function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

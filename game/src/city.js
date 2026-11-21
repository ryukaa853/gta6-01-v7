// Porto Verde itself: the street grid, procedural buildings with lit windows,
// landmarks, lamps, palms and the glowing mission beacons. All art is generated
// here at boot from the seeded RNG — no image files, no network.
import { WORLD, LANDMARKS } from './state.js';
import { range, intRange, pick } from './rng.js';

const PALETTE = [0xd8c9a3, 0xc9b18a, 0xe8dcc0, 0xbfae8e, 0xd9b8a6, 0xc7d3d8, 0xe0cfa8, 0xcfc4b0];

function windowTexture(rng, base, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const hex = '#' + base.toString(16).padStart(6, '0');
  g.fillStyle = hex; g.fillRect(0, 0, 128, 256);
  // subtle vertical shading so facades read as tall slabs
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 6; col++) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? (rng() < 0.7 ? '#ffd98a' : '#9fd8ff') : '#20242e';
      g.fillRect(8 + col * 20, 10 + row * 20, 12, 13);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The whole street plan painted once onto a canvas: sand base, pale sidewalk
// bands, dark asphalt and yellow centre dashes for every street line.
function streetTexture() {
  const SIZE = 2048;
  const HALF = WORLD.bound + 40; // world half-extent covered by the texture
  const px = (v) => ((v + HALF) / (HALF * 2)) * SIZE;
  const c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  const g = c.getContext('2d');
  g.fillStyle = '#9a8f6a';
  g.fillRect(0, 0, SIZE, SIZE);
  for (const s of WORLD.streets) {
    for (const horizontal of [true, false]) {
      // sidewalk band
      g.fillStyle = '#b9ac8f';
      if (horizontal) g.fillRect(0, px(s - 14), SIZE, px(s + 14) - px(s - 14));
      else g.fillRect(px(s - 14), 0, px(s + 14) - px(s - 14), SIZE);
      // asphalt
      g.fillStyle = '#2c2f36';
      if (horizontal) g.fillRect(0, px(s - 8), SIZE, px(s + 8) - px(s - 8));
      else g.fillRect(px(s - 8), 0, px(s + 8) - px(s - 8), SIZE);
      // centre dashes
      g.fillStyle = '#d8c95a';
      for (let t = -WORLD.bound; t < WORLD.bound; t += 14) {
        if (horizontal) g.fillRect(px(t - 2.5), px(s - 0.25), px(t + 2.5) - px(t - 2.5), px(s + 0.25) - px(s - 0.25));
        else g.fillRect(px(s - 0.25), px(t - 2.5), px(s + 0.25) - px(s - 0.25), px(t + 2.5) - px(t - 2.5));
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildCity(scene, S) {
  const rng = S.rng;
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);
  const colliders = [];
  const addCollider = (x, z, hx, hz) => colliders.push({ x, z, hx, hz });

  // Ground: one big canvas texture carries the whole street plan — sand, pale
  // sidewalks, dark asphalt and yellow centre dashes — so the city floor is a
  // single draw call instead of hundreds of road meshes.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.bound * 2 + 80, WORLD.bound * 2 + 80),
    new THREE.MeshLambertMaterial({ map: streetTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  group.add(ground);

  // Buildings: fill every block between streets with 1–4 towers.
  const textures = PALETTE.map((base) => windowTexture(rng, base, 0.42));
  const blocks = [];
  for (let i = 0; i < WORLD.streets.length - 1; i++) {
    for (let j = 0; j < WORLD.streets.length - 1; j++) {
      blocks.push({ x0: WORLD.streets[i] + 11, x1: WORLD.streets[i + 1] - 11,
                    z0: WORLD.streets[j] + 11, z1: WORLD.streets[j + 1] - 11 });
    }
  }
  for (const b of blocks) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const count = intRange(rng, 2, 4);
    const bw = (b.x1 - b.x0) / count;
    for (let k = 0; k < count; k++) {
      const w = range(rng, 14, Math.max(15, bw - 4));
      const d = range(rng, 14, 34);
      const h = range(rng, 9, 44);
      const x = b.x0 + bw * k + bw / 2 + range(rng, -2, 2);
      const z = cz + range(rng, -6, 6);
      const mat = new THREE.MeshLambertMaterial({ map: pick(rng, textures) });
      const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      tower.position.set(x, h / 2, z);
      group.add(tower);
      // rooftop box for silhouette variety
      if (rng() < 0.5) {
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 2.5, d * 0.4),
          new THREE.MeshLambertMaterial({ color: 0x6b6252 }));
        roof.position.set(x, h + 1.25, z);
        group.add(roof);
      }
      addCollider(x, z, w / 2 + 0.4, d / 2 + 0.4);
    }
  }

  // Landmark buildings: distinct shapes and colours so each reads at a glance.
  const landmarkDefs = [
    { key: 'bancoVerde', color: 0xe8e2d2, w: 34, h: 20, d: 18, roof: 0x8a7a3a },
    { key: 'lunaGarage', color: 0x3d6b8a, w: 30, h: 10, d: 20, roof: 0xffd94d },
    { key: 'casaVerde', color: 0xd97b6c, w: 22, h: 12, d: 16, roof: 0x7a3d2e },
    { key: 'hospital', color: 0xf2f2ee, w: 30, h: 24, d: 18, roof: 0x2e7a5a },
    { key: 'depot', color: 0x8a7a5a, w: 32, h: 11, d: 22, roof: 0x4a4030 },
    { key: 'impound', color: 0x6a6f7a, w: 26, h: 9, d: 20, roof: 0x2e3340 },
  ];
  for (const def of landmarkDefs) {
    const lm = LANDMARKS[def.key];
    const mat = new THREE.MeshLambertMaterial({ color: def.color });
    const b = new THREE.Mesh(new THREE.BoxGeometry(def.w, def.h, def.d), mat);
    // Landmarks sit just outside the playable grid edge, facing the street.
    const px = def.key === 'bancoVerde' ? 0 : (lm.x > 0 ? lm.x + 16 : lm.x - 16);
    const pz = def.key === 'bancoVerde' ? lm.z - 14 : lm.z;
    b.position.set(px, def.h / 2, pz);
    group.add(b);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(def.w * 0.55, 2, def.d * 0.55),
      new THREE.MeshLambertMaterial({ color: def.roof }));
    roof.position.set(px, def.h + 1, pz);
    group.add(roof);
    addCollider(px, pz, def.w / 2 + 0.5, def.d / 2 + 0.5);
    // plaza pad + sign pillar at the landmark's street position
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.3, 24),
      new THREE.MeshLambertMaterial({ color: 0x8f8570 }));
    pad.position.set(lm.x, 0.15, lm.z);
    group.add(pad);
    const sign = makeTextSprite(lm.label);
    sign.position.set(lm.x, 16, lm.z);
    group.add(sign);
  }

  // Street lamps as two instanced meshes (poles + bulbs): one draw call each.
  const lampPositions = [];
  for (const s of WORLD.streets) {
    for (let t = -175; t <= 175; t += 70) {
      lampPositions.push([s + 11, t], [t, s + 11]);
    }
  }
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2e3340 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const poleMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.24, 6, 6), lampMat, lampPositions.length);
  const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 8, 6), bulbMat, lampPositions.length);
  {
    const m4 = new THREE.Matrix4();
    lampPositions.forEach(([x, z], i) => {
      m4.makeTranslation(x, 3, z);
      poleMesh.setMatrixAt(i, m4);
      m4.makeTranslation(x, 6.2, z);
      bulbMesh.setMatrixAt(i, m4);
    });
  }
  group.add(poleMesh);
  group.add(bulbMesh);
  const lampHeads = [bulbMesh];

  // Palms near the blocks, also instanced (trunks + crowns).
  const palmSpots = [];
  for (let i = 0; i < 40; i++) {
    const x = range(rng, -200, 200), z = range(rng, -200, 200);
    if (WORLD.streets.some((s) => Math.abs(x - s) < 12 || Math.abs(z - s) < 12)) continue;
    palmSpots.push([x, z]);
  }
  const palmMat = new THREE.MeshLambertMaterial({ color: 0x3d7a4a });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.4, 5, 6), trunkMat, palmSpots.length);
  const crownMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 2.2, 7), palmMat, palmSpots.length);
  {
    const m4 = new THREE.Matrix4();
    palmSpots.forEach(([x, z], i) => {
      m4.makeTranslation(x, 2.5, z);
      trunkMesh.setMatrixAt(i, m4);
      m4.makeTranslation(x, 6, z);
      crownMesh.setMatrixAt(i, m4);
    });
  }
  group.add(trunkMesh);
  group.add(crownMesh);

  // Ocean plane beyond the south edge — Porto Verde is a port city.
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 160),
    new THREE.MeshLambertMaterial({ color: 0x2e7a9a }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.4, WORLD.bound + 90);
  group.add(sea);

  return { group, colliders, lampHeads };
}

function makeTextSprite(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,14,30,0.85)';
  g.fillRect(0, 0, 512, 96);
  g.strokeStyle = '#ffd94d'; g.lineWidth = 4; g.strokeRect(4, 4, 504, 88);
  g.fillStyle = '#ffd94d'; g.font = 'bold 44px Verdana, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text.toUpperCase(), 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  spr.scale.set(26, 4.9, 1);
  return spr;
}

// A vertical light pillar marking a mission / fare / stash target.
export function makeBeacon(color) {
  const geo = new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 30;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.35, 8, 32),
    new THREE.MeshBasicMaterial({ color }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  const g = new THREE.Group();
  g.add(mesh); g.add(ring);
  return g;
}

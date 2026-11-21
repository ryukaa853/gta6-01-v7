// Screenshot staging: ?shot=<name> puts the game into a photogenic, fully
// played state — a real frame of the real game, not a mockup — so the four
// dossier screenshots each show a different system at its best.
import { LANDMARKS } from './state.js';

// Called after the world is built and the menu is hidden. Returns a label.
export function stageShot(S, G, name) {
  const p = S.player;
  const putInCar = (car) => {
    p.onFoot = false;
    p.vehicle = car;
    car.isPlayer = true;
    car.parked = false;
    p.x = car.x; p.z = car.z; p.heading = car.heading;
    S.camera.yaw = car.heading + Math.PI;
  };
  if (name === 'chase') {
    // golden-hour pursuit: two stars, cruisers closing in, heli overhead
    S.clockMin = 18 * 60 + 5;
    const car = G.parked.find((c) => c.cls === 'sport') || G.parked[0];
    putInCar(car);
    car.speed = 20;
    S.wanted = 3; S.wantedHeat = 60;
    S.missions.active = { id: 3, stage: 0, t: 10, timeLeft: 35, target: { ...LANDMARKS.casaVerde }, objective: 'Survive the chase — lose the heat at Casa Verde', forceWanted: true };
    return 'chase';
  }
  if (name === 'taxi') {
    // night shift in the yellow cab, fare meter running — staged ON a street
    // (x=105) heading along it, so the W-hold in the shots script drives
    // down the road instead of into a building.
    S.clockMin = 21 * 60 + 20;
    G.taxiCar.x = 105; G.taxiCar.z = -140; G.taxiCar.heading = 0;
    G.taxiCar.mesh.position.set(105, 0, -140);
    G.taxiCar.mesh.rotation.y = 0;
    putInCar(G.taxiCar);
    G.taxiCar.speed = 14;
    S.taxi.shift = true;
    S.taxi.fare = { pickup: { x: -35, z: 105 }, dest: { x: 105, z: -35 }, timeLeft: 62, paid: 0 };
    G.taxi.state = 'dropoff';
    G.taxi.beacon.position.set(105, 0, -35);
    G.taxi.beacon.visible = true;
    S.missions.active = { id: 4, stage: 1, t: 30, timeLeft: 0, target: null, objective: 'Complete 3 fares — watch the meter, drive smooth' };
    return 'taxi';
  }
  if (name === 'vault') {
    // on foot outside Banco Verde at dusk, vault bar mid-crack
    S.clockMin = 19 * 60 + 40;
    p.x = LANDMARKS.bancoVerde.x; p.z = LANDMARKS.bancoVerde.z + 16;
    p.heading = Math.PI;
    S.camera.yaw = 0;
    S.vault.cracking = true;
    S.vault.progress = 0.62;
    S.missions.active = { id: 5, stage: 2, t: 90, timeLeft: 0, target: { ...LANDMARKS.bancoVerde }, objective: 'On foot: get to the vault door and hold E to crack it' };
    S.wanted = 2; S.wantedHeat = 40;
    return 'vault';
  }
  // default: 'start' — driving a sport car down the boulevard at golden hour
  S.clockMin = 17 * 60 + 30;
  const car = G.parked.find((c) => c.cls === 'sport') || G.parked[0];
  putInCar(car);
  car.speed = 16;
  p.x = -35; p.z = 140; p.heading = Math.PI;
  car.x = -35; car.z = 140; car.heading = Math.PI;
  S.camera.yaw = 0;
  S.missions.active = { id: 1, stage: 1, t: 5, timeLeft: 0, target: { ...LANDMARKS.lunaGarage }, objective: 'Drive to Luna Garage' };
  return 'start';
}

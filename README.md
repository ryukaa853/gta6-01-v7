# gta6-01-v7

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ryukaa853/gta6-01-v7/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ryukaa853/gta6-01-v7/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original sun-soaked open-world crime game built with three.js, fully offline: explore the city of Porto Verde on foot and by car, steal rides, outrun the Verde PD, run taxi fares, shoot it out, and crack the Verde Vault.

## Run it

```sh
node serve.ts --port 8902
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=8tc4hwe6&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

---

# Porto Verde v7 — an open-world crime game (make.fun gta6-01)

An original sun-soaked open-world crime game built with three.js, fully
offline: explore the city of Porto Verde on foot and by car, steal rides,
outrun the Verde PD, run taxi fares, shoot it out, and crack the Verde Vault.

You are **Mara Solis**, fresh out of the Verde County lockup with $40 and a
borrowed jacket. Five jobs stand between you and the top of Porto Verde.

## Play

`node serve.ts --port 8902` then open http://localhost:8902

- WASD walk/drive, mouse drag orbits the camera, Shift run / nitro, Space handbrake
- E enter / steal a nearby car (traffic can be carjacked), F exit the car
- Click / J shoot the pistol, R reload, T taxi shift, P pause & missions
- Cash stashes glow green around the city (+$50 each)

## Missions (mission select on the menu — finish one to unlock the next)

1. **First Keys** — steal a car, drive it to Luna Garage (+$350)
2. **Three Corners** — 3 deliveries in 180s (+$550, +$50 per drop)
3. **Hot Pursuit** — survive a 45s chase at wanted ★★, lose the heat at Casa Verde (+$700)
4. **Cab Fare** — 3 taxi fares in the yellow cab (+$450 bonus; fares pay $120 + speed tip)
5. **The Verde Vault** — steal the depot van, crack Banco Verde on foot (hold E),
   escape a wanted-★★★ manhunt to Casa Verde (+$1,500)

## Systems

- **Police**: wanted 0–5 stars; pursuing cruisers that ram, roadblocks at ★★+,
  searchlight helicopter at ★★★+; busted on foot, wasted at 0 HP (fines, respawn
  at Verde General hospital); heat decays when the PD loses sight of you
- **Combat**: pistol, 12-round magazine, cruisers take 3 hits to disable
- **Taxi fares**: repeatable side job, 90s meter, tip for fast smooth driving
- **Vehicles**: 5 classes (sedan / sport / van / taxi / cruiser) with distinct
  speed, acceleration, steering and toughness; 6 parked cars to steal, 8 traffic cars
- **City**: 6×6 street grid, procedural towers with lit windows, 6 named landmarks
  (Banco Verde, Luna Garage, Casa Verde, Verde General, Depot, Impound Lot),
  palms, street lamps, and the sea to the south
- **Life**: 24 pedestrians who scatter from gunfire and speeding cars; 4 cash stashes
- **Day/night cycle** with golden hour, sunset and lamp-lit nights; in-game clock
- **Save**: cash, unlocked missions, career stats (localStorage, auto-saved)
- **HUD**: cash, HP, 5 wanted stars, objective + timer, taxi panel, vault bar,
  speed, ammo, circular minimap (player, mission, fares, traffic, police, heli)

## Layout

- `game/` — the playable static game (index.html + src modules + vendor/three.min.js)
- `game/src/` — one file per system: `state` (shared state), `rng` (seeded RNG),
  `city`, `vehicles`, `walker`, `peds`, `cops`, `combat`, `taxi`, `missions`,
  `hud`, `savegame`, `audio` (synth sound), `daycycle`, `shots`, `boot` (wiring)
- `main.ts` — entrypoint: copies game/ + screenshots/ to /output, writes dossier.json
- `serve.ts` — local static dev server
- `tests/playwright-missions.mjs` — Playwright suite: full M1–M5 playthrough
- `tests/shots.mjs` — takes the 4 screenshots from the real running game
- `shots.json` — screenshot plan

## Determinism

All randomness comes from a seeded RNG (`seed` URL param, default 20261122):
traffic routes, pedestrian walks, building windows and cop spawns are
reproducible. No network requests at runtime; all art and sound are generated
in code. Original city, characters, vehicles, names, story, art and sound —
nothing from Rockstar Games.

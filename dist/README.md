# Sandbox Lab

An original, playable 2D physics sandbox inspired by People Playground. Runs on macOS in a modern browser. No account or backend required.

## Play

Open `index.html` directly in a browser. The physics engine is bundled locally, so the game works offline (the optional web font falls back to system fonts).

For local development:

```sh
npm install
npm run dev
```

## Features

- 17-part human and android ragdolls with neck, segmented spine, hands and feet
- 16 anatomical joints with elbow/knee/shoulder/ankle limits and 120 Hz physics substeps
- Swords pierce: thrust or thrown point-first at speed, the blade runs a body through, wounds every part it passes, lodges there and bleeds; a light pull slides it back out (Blade grip setting)
- Hands: select a ragdoll's hand (click it or press S over it) and it takes the nearest loose object within 30 px. A pistol is raised and held level, F fires it, and it never hits its own holder; grab the object with the cursor to take it back; it is dropped on death. Held blades slash but do not pierce
- Carrying: off the ground a ragdoll's muscles go slack, so it dangles from wherever it is held, swings, lands in a heap and then gets up
- Local damage: a first bullet stops in the limb it hits and hurts nothing else; a limb that is already perforated lets the next one through (entry and exit wound) into whatever is behind, at 65% power. Glass never stops a bullet, weakened wood stops fewer. Arm and hand hits do not knock the body down, leg hits partly do. Shocks hurt without wounds and weaken with each hop; blast damage falls off with the square of distance
- Damage model: one profile table gives each damage type its own injury — blunt breaks bone and bruises, cuts are long and bleed, stabs and bullets are deep and bleed most, blasts do everything, burns cauterise, shocks leave no wound
- Fractures (bone ≤ 50): the limb hangs, its joints over-bend, and it carries no weight — one broken leg is stood on around, two and the ragdoll stays down; heal mends them
- Organs by hit location: brain (blackout, or instant death), heart (death, or massive internal bleeding), lungs (oxygen runs down to unconsciousness and suffocation), gut (slow internal bleeding, seen as a spreading bruise). Blunt force only reaches the brain
- Pain rises with injury (more for head, groin, hands and feet) and ebbs, slower while wounds are open; it slows getting up. Consciousness runs awake → dazed → unconscious → dead from blood, oxygen, brain and pain; the detail view shows vitals, damaged organs and the cause of death
- Localized bullet wounds, bruising, cuts, bleeding, blood loss, charred skin, exposed ribs and bone at severed endpoints
- Auto-balance: living ragdolls are stunned by hard hits, fall, and push themselves back up with their legs; dead ones settle and stay put
- Revive, Regrow (grows missing limbs back one part at a time, outward from the part you click, each swelling out of its stump), Reattach (returns a severed limb to its own body), Graft (any loose limb onto any body — android arm on a human, left limb mirrored onto a right stump — with a power surge) and Dismember tools
- Damage-driven collapse and breakable joints
- 16 spawnable objects with material properties
- Dragging and throwing, rotation, fixed objects, and ropes
- Hitscan shooting, fire and heat transfer, conductive shocks, explosions and chain reactions
- Physical debris, blood particles, glass shattering and synthesized sound
- Activate pistols, timed bombs, fuel barrels, batteries, wheels and thrusters
- Settings page (⚙): 45 options in eight sections, generated from one table in `engine.js`, saved on the device, with presets, search, per-setting and per-section reset, and JSON import/export. Imported and stored values are validated against the table before use
  - World: gravity −40…40 m/s², ambient temperature (hot rooms ignite, frozen flesh is brittle), lightning chance, rain (puts fires out), snow (slippery floor), fog, floodlights (off = dark chamber lit by fire, arcs and lightning)
  - Ragdolls: auto-balance, leg strength, get-up time, knockdown length, brain damage, slow injury healing
  - Gore: fragility multiplier, joint strength, bleeding rate, limb crushing + sensitivity, procedural fragments, extra gunshot particles, no gore
  - Weapons, Physics, Visuals, Interface, Audio: bullet damage and knockback, explosion power, piercing speed, blade grip, solver iterations, air resistance, grab strength, object limit, slow-motion speed, decals, tracers, particles, screen shake, grid, shadows, vignette, temperature unit, FPS, hints, zoom and pan speed, sound and volume
- Fire: hundreds of soft additive blobs per fire that rise, stretch, wander and cool from yellow-white to red, merging into one flame body around a burning ragdoll; embers, smoke above the tips, a glow on the surroundings, and charring that stays
- Rendering never builds gradients or blurs per frame: flames, glows and smoke are pre-painted sprites and lightning channels are cached paths (measured: no frame over 20 ms with a burning scene, a storm and the lights off, also at 4× CPU throttle)
- Lightning: forked, glowing channels with restrikes, sky flash, thunder, scorch marks; strikes hit the highest thing under them, shock through conductors, burn and ignite
- Four starter scenes, pause, frame stepping, slow motion, and adjustable gravity
- Pan and zoom, object inspection, search and categories
- Save/load a complete scene locally, including body poses, health, constraints and active devices

## Controls

Keys follow People Playground's defaults. Click an object in the library, point at the chamber and press Q / E to spawn it; clicking the chamber never spawns, it always belongs to the active tool. Drag objects to move or throw them; right-drag, middle-drag or the arrow keys pan. Scroll to zoom.

| Key | Action |
| --- | --- |
| Q / E | Spawn the chosen object at the cursor, facing left / right. While you are holding something, they rotate it instead |
| A / D | Rotate the held or selected body (or the spawn preview). Speeds up while held, faster with Shift. A held body keeps the angle after you let go of the key |
| F | Activate the object under the cursor (or the held / selected one) |
| S | Detail view of the object under the cursor |
| G | Toggle slow motion |
| Space | Pause/play |
| Z | Undo the last spawn |
| Backspace / Delete | Delete selected object |
| Esc | Back to the grab cursor: drops the active tool, the chosen spawn object and the selection |
| Tab | Hide / show the interface |
| Arrow keys | Pan the camera (Shift = faster) |
| 1–9, -, =, [, ], 0 | Grab, rope, freeze, shoot, fire, shock, explosion, heal, revive, regrow, reattach, graft, dismember, delete |

Double-click a device with the grab tool to activate it. Rope: click two objects or an object and an empty point. Heal restores tissue and extinguishes fire, but does not bring anyone back or recreate severed joints. Revive brings a dead or collapsed ragdoll back to life; it stands up again if it still has a spine and at least one whole leg. Saves use one device-local browser slot; loading pauses simulation.

## Validation

`npm test` runs physics behavior and save/restore tests. `npm run build` packages the standalone application in `dist`.

## Scope and references

This is an original browser sandbox, not a copy of People Playground's code or assets and not feature-equivalent to its full commercial release. It has simplified damage, fire and electricity; it does not implement the original's complete anatomy/fluid systems, mod ecosystem, wiring logic or item catalogue.

- Gameplay reference: https://store.steampowered.com/app/1118200/PeoplePlayground/
- Physics: Matter.js 0.20.0 (MIT), https://brm.io/matter-js/
- Included Matter.js license: `vendor/MATTER-LICENSE.txt`
- Original canvas artwork and interface, with Barlow fonts via Google Fonts.

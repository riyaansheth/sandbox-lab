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
- Localized bullet wounds, bruising, cuts, bleeding, blood loss, charred skin, exposed ribs and bone at severed endpoints
- Active standing balance, damage-driven collapse, and breakable joints
- 16 spawnable objects with material properties
- Dragging and throwing, rotation, fixed objects, and ropes
- Hitscan shooting, fire and heat transfer, conductive shocks, explosions and chain reactions
- Physical debris, blood particles, glass shattering and synthesized sound
- Activate pistols, timed bombs, fuel barrels, batteries, wheels and thrusters
- Four starter scenes, pause, frame stepping, slow motion, and adjustable gravity
- Pan and zoom, object inspection, search and categories
- Save/load a complete scene locally, including body poses, health, constraints and active devices

## Controls

Click an object in the library, then click the chamber to spawn it. Press Escape to return to grab mode. Drag objects to move or throw them; right-drag or Shift-drag to pan. Scroll to zoom.

| Key | Action |
| --- | --- |
| 1–9 | Grab, rope, freeze, shoot, fire, shock, explosion, heal, delete |
| Space | Pause/play |
| Q / E | Rotate selected body or spawn preview |
| F | Activate selected device |
| Delete / Backspace | Delete selected object |
| ? | Help |

Double-click a device with the grab tool to activate it. Rope: click two objects or an object and an empty point. Heal restores integrity and extinguishes fire, but does not recreate severed joints. Saves use one device-local browser slot; loading pauses simulation.

## Validation

`npm test` runs physics behavior and save/restore tests. `npm run build` packages the standalone application in `dist`.

## Scope and references

This is an original browser sandbox, not a copy of People Playground's code or assets and not feature-equivalent to its full commercial release. It has simplified damage, fire and electricity; it does not implement the original's complete anatomy/fluid systems, mod ecosystem, wiring logic or item catalogue.

- Gameplay reference: https://store.steampowered.com/app/1118200/PeoplePlayground/
- Physics: Matter.js 0.20.0 (MIT), https://brm.io/matter-js/
- Included Matter.js license: `vendor/MATTER-LICENSE.txt`
- Original canvas artwork and interface, with Barlow fonts via Google Fonts.

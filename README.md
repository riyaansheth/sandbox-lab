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
- Swords pierce: thrust or thrown point-first at speed, the blade runs a body through, wounds every part it passes, lodges there and bleeds; pull hard to draw it out
- Localized bullet wounds, bruising, cuts, bleeding, blood loss, charred skin, exposed ribs and bone at severed endpoints
- Auto-balance: living ragdolls are stunned by hard hits, fall, and push themselves back up with their legs; dead ones settle and stay put
- Revive tool, damage-driven collapse, and breakable joints
- 16 spawnable objects with material properties
- Dragging and throwing, rotation, fixed objects, and ropes
- Hitscan shooting, fire and heat transfer, conductive shocks, explosions and chain reactions
- Physical debris, blood particles, glass shattering and synthesized sound
- Activate pistols, timed bombs, fuel barrels, batteries, wheels and thrusters
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
| 1–9, 0 | Grab, rope, freeze, shoot, fire, shock, explosion, heal, revive, delete |

Double-click a device with the grab tool to activate it. Rope: click two objects or an object and an empty point. Heal restores tissue and extinguishes fire, but does not bring anyone back or recreate severed joints. Revive brings a dead or collapsed ragdoll back to life; it stands up again if it still has a spine and at least one whole leg. Saves use one device-local browser slot; loading pauses simulation.

## Validation

`npm test` runs physics behavior and save/restore tests. `npm run build` packages the standalone application in `dist`.

## Scope and references

This is an original browser sandbox, not a copy of People Playground's code or assets and not feature-equivalent to its full commercial release. It has simplified damage, fire and electricity; it does not implement the original's complete anatomy/fluid systems, mod ecosystem, wiring logic or item catalogue.

- Gameplay reference: https://store.steampowered.com/app/1118200/PeoplePlayground/
- Physics: Matter.js 0.20.0 (MIT), https://brm.io/matter-js/
- Included Matter.js license: `vendor/MATTER-LICENSE.txt`
- Original canvas artwork and interface, with Barlow fonts via Google Fonts.

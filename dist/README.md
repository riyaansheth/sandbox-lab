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
- Blood: every wound bleeds at its own rate and clots (fast on a still limb, slowly on a moving one; a new blow nearby reopens it). Deep wounds to the neck, upper arms and thighs hit an artery and spurt in time with a heart rate that races with pain and early blood loss, then fails. Skin pales below 75% blood
- Blood lands where it lands: on any body (in that body's own frame, so it turns with it), on the walls (it runs as it dries) and on the floor, where drops merge into pools that grow to a limit. Bodies dragged through a wet pool smear it and get bloody; feet track prints away. Blood dries from red to brown in about 30 s and then no longer smears. Androids leak teal coolant and sparks instead
- Particles are pooled and recycled; stains are capped per body and globally, fade after a settable lifetime, and none are created with decals off
- Layered bodies (`body.js`, after `reference/ragdoll.png`): every human part is three drawings — skeleton, muscle, skin. Wounds cut holes through the upper layers instead of painting over them: a bullet is a small hole with a dark bore, an exit wound a ragged crater down to bone, a cut a long slit along the blade's path, a stab a short one, a blast a crater; bruises fade from purple to yellow, burns char, fractures split the bone under a tear, stumps are a ragged cap of muscle round a bone nub with strands that swing for a moment. Badly damaged parts lose skin, then muscle, in patches
- Five faces driven by the simulation: neutral, tense (on a hit or in pain), dazed, closed (unconscious), crosses (dead)
- Each part is painted once into a cached sprite and repainted only when its damage changes, so ten wounded ragdolls cost ten ragdolls' worth of drawImage
- Gibs: crushed and blasted limbs throw flesh chunks and bone fragments that trail blood, capped at 36 and gone after ~14 s. Blood sprays along the blow: forward from an exit wound, mostly back from an entry wound
- Localized bullet wounds, bruising, cuts, bleeding, blood loss, charred skin, exposed ribs and bone at severed endpoints
- Muscles: every joint has a PD muscle pulling its two parts toward a pose's relative angle, equal and opposite, so muscles alone can never move or turn the body as a whole (tested in zero gravity). Poses are data tables, blended over a quarter of a second and layered. Only the chest (upright) and planted feet (flat) answer to the world; planted ankles give. Strength scales with each part's health and bone, and with blood, pain and consciousness
- Hit reactions: every blow makes a living body flinch for a fifth of a second (the struck limb pulls in, the torso twists and the head snaps away from the blow; tiny hits only twitch). A medium hit to a standing body staggers it: the balance point shifts the way the blow was going and the legs take one to three recovery steps. Blows of 32 damage or more knock it down, but through the stagger rather than instantly. A conscious body that is tipping or dropping fast throws its arms out toward the ground on that side, turns its head away, and lands on its hands
- Mobility ladder: a living, conscious body uses the best it has left. Legs that bear weight stand (one leg is enough if the other is gone; a broken one that is still attached is not); knees without feet kneel upright; two good arms crawl, belly down, reaching past the head and dragging the body up to a planted hand; one arm drags; nothing, or agony, curls up. It crawls away from whatever last hurt it for a few seconds, then lies slack and sleeps. All of it is internal force: pulls are reacted on the planted hand, lift on whatever is planted
- Getting up is staged — gather the limbs, push up on the arms, knees under, stand — slower with pain and blood loss; an attempt that fails sags, rests and tries again
- The simulation's randomness is seedable (`sim.seed(n)`), so probability-based behaviour is reproducible in tests
- Living with pain: the nearest working hand goes to the wound that hurts most and holds it (a two-joint reach on shoulder and elbow; both hands for the head and trunk); a damaged arm is held in against the body; a hurt leg takes less of the load so the body leans over the good one, and a badly hurt one is drawn up and not stood on; the torso hunches and the head sinks as blood goes; limbs tremble (slow filtered noise, never per-frame); the chest and shoulders breathe, faster and deeper in pain, shallow near death; a body on the ground in agony writhes and spasms; one on fire beats at the flames and stumbles about, and the pain keeps climbing; a lodged blade hurts steadily and sharply when it is moved
- Electric shock locks every muscle rigid where it was, shaking, for as long as the current flows — conscious or not — and then the body goes slack for a moment. Androids get the same lock and "reboot", staggering, bracing and a limp from damaged legs, and glitch and spark when badly damaged; they have no pain, clutching or breathing
- Safety: only parts that are actually braced may take the body's weight, joint stiffness is capped, and ragdoll parts have a speed limit far above anything real. 120 seeded shock-and-recover runs all end standing
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

`npm test` runs 59 behaviour tests: physics, damage, blood, organs, settings, save/restore. `npm run build` packages the standalone application in `dist`.

## Scope and references

This is an original browser sandbox, not a copy of People Playground's code or assets and not feature-equivalent to its full commercial release. It has simplified damage, fire and electricity; it does not implement the original's complete anatomy/fluid systems, mod ecosystem, wiring logic or item catalogue.

- Gameplay reference: https://store.steampowered.com/app/1118200/PeoplePlayground/
- Physics: Matter.js 0.20.0 (MIT), https://brm.io/matter-js/
- Included Matter.js license: `vendor/MATTER-LICENSE.txt`
- Original canvas artwork and interface, with Barlow fonts via Google Fonts.

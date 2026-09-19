/* Sandbox Lab — the item table. Data only: no simulation and no drawing live here.
 *
 * Everything that can be spawned is one row in ITEMS, and everything it is made of is one row in MATERIALS. The engine reads behaviour
 * from these rows (what burns, what conducts, what stops a bullet, what explodes, what fires, what cuts); art.js draws them by id.
 * Adding an item is adding a row here and a drawing there. The catalogue follows People Playground's: Entities, Melee, Firearms,
 * Explosives, Vehicles, Machinery, Chemistry, Misc.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Items = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Physical properties of a material.
  //   density      Matter density (mass per px²)            flammable   0..1, how readily it keeps burning
  //   burnAt       °C at which it catches (Infinity: never)  thermal     0..1, how fast heat moves through it and into its neighbours
  //   conductive   0..1, how well it carries current         magnetic    attracted by magnets
  //   absorb       share of a bullet's power it soaks up; 1 stops every bullet, and only materials below 1 can be shot through
  //   soft         0..1, 1 can be pierced by a blade         brittle     shatters instead of denting: impulse threshold in damage points, 0 = never
  //   buoyancy     >1 floats, <1 sinks                       friction, restitution   surface feel
  const MATERIALS = {
    flesh:   { density: .0018, flammable: 1,  burnAt: 170,      thermal: .35, conductive: .6, magnetic: false, absorb: .35, soft: 1,  brittle: 0,  buoyancy: 1.05, friction: .8,  restitution: 0 },
    wood:    { density: .0012, flammable: 1,  burnAt: 170,      thermal: .2,  conductive: 0,  magnetic: false, absorb: .5,  soft: .3, brittle: 0,  buoyancy: 1.6,  friction: .65, restitution: .1 },
    metal:   { density: .006,  flammable: 0,  burnAt: Infinity, thermal: .9,  conductive: 1,  magnetic: true,  absorb: 1,   soft: 0,  brittle: 0,  buoyancy: .2,   friction: .65, restitution: .1 },
    stone:   { density: .005,  flammable: 0,  burnAt: Infinity, thermal: .4,  conductive: 0,  magnetic: false, absorb: 1,   soft: 0,  brittle: 0,  buoyancy: .3,   friction: .7,  restitution: .05 },
    glass:   { density: .001,  flammable: 0,  burnAt: Infinity, thermal: .5,  conductive: 0,  magnetic: false, absorb: .1,  soft: 0,  brittle: 1,  buoyancy: .5,   friction: .4,  restitution: .1 },
    rubber:  { density: .001,  flammable: .6, burnAt: 170,      thermal: .1,  conductive: 0,  magnetic: false, absorb: .7,  soft: .4, brittle: 0,  buoyancy: 1.3,  friction: .9,  restitution: .87 },
    plastic: { density: .0009, flammable: .8, burnAt: 200,      thermal: .15, conductive: 0,  magnetic: false, absorb: .45, soft: .3, brittle: 0,  buoyancy: 1.4,  friction: .5,  restitution: .3 },
    bone:    { density: .002,  flammable: 0,  burnAt: Infinity, thermal: .3,  conductive: 0,  magnetic: false, absorb: .6,  soft: 0,  brittle: 0,  buoyancy: .9,   friction: .6,  restitution: .1 }
  };

  // An item row. Shape is w x h (a rectangle) or r (a circle); art may draw outside it, physics does not.
  //   explosive  { radius, power, fuse: seconds when armed, arm: what arms it ('activate'), onBreak: detonates when destroyed, onHeat: °C that lights the fuse }
  //   firearm    { damage: x the bullet-damage setting, speed: muzzle velocity in m/s, rate: rounds a second, auto: keeps firing while held, pellets, spread: radians, launch: item it throws instead of a round, recoil, muzzle: distance from centre along the barrel }
  //   sharp      { tip: pierces point-first (the -y end), edge: slashes on contact, power: most damage one slash can do, length: share of the item that is blade, hot: cauterises }
  //   blunt      multiplier on the damage it does by hitting things (a hammer hits harder than its speed alone)
  //   grip       where a hand holds it, in the item's own frame
  //   device     what Activate toggles: 'thruster' | 'wheel' | 'battery'
  //   static     spawns frozen           indestructible   never shatters
  const ITEMS = [
    { id: 'human',    name: 'Human',          category: 'Entities',   description: 'An articulated, very breakable volunteer.', color: '#e2bb98' },
    // Dressed humans. ragdoll names the body they are - the same one, with the same physics, anatomy and wounds - and outfit the clothes painted on it (body.js).
    { id: 'human1',   name: 'Human 1',        category: 'Entities',   description: 'Black hoodie, grey cargo trousers, white trainers. Underneath, the same volunteer.', ragdoll: 'human', outfit: 'hoodie', color: '#2d2d32' },
    { id: 'civilian', name: 'Civilian',       category: 'Entities',   description: 'Blue shirt, black trousers, white shoes.', ragdoll: 'human', outfit: 'civilian', color: '#3f74bd' },
    { id: 'cop',      name: 'Cop',            category: 'Entities',   description: 'Uniform, peaked cap, shoulder patch, duty belt. No tougher than anyone else.', ragdoll: 'human', outfit: 'cop', color: '#2b3052' },
    { id: 'criminal', name: 'Criminal',       category: 'Entities',   description: 'Striped jumper, beanie, mask and gloves.', ragdoll: 'human', outfit: 'criminal', color: '#d4d1ca' },
    { id: 'detective',name: 'Detective',      category: 'Entities',   description: 'Trench coat, fedora, shirt and tie.', ragdoll: 'human', outfit: 'detective', color: '#b39162' },
    { id: 'android',  name: 'Android',        category: 'Entities',   description: 'Stronger joints. Conducts electricity. Feels nothing.', color: '#91aaa7' },
    { id: 'sword',    name: 'Sword',          category: 'Melee',      description: 'Slashes on impact. Thrown or thrust point-first, it runs a body through and stays in.', w: 12, h: 100, material: 'metal', hp: 200, density: .0025, sharp: { tip: true, edge: true }, color: '#c7d2d2' },
    { id: 'knife',    name: 'Knife',          category: 'Melee',      description: 'Short, sharp and easy to throw. Sticks in whatever soft thing it meets point-first.', w: 8, h: 38, material: 'metal', hp: 120, density: .0025, sharp: { tip: true, edge: true, power: 38, length: .6 }, grip: { x: 0, y: 12 }, color: '#c9d2d4' },
    { id: 'axe',      name: 'Axe',            category: 'Melee',      description: 'A heavy head on a long handle. One good swing takes a limb off.', w: 30, h: 80, material: 'wood', hp: 160, density: .002, sharp: { edge: true, power: 110 }, blunt: 1.6, grip: { x: 0, y: 26 }, color: '#a9814f' },
    { id: 'bat',      name: 'Baseball bat',   category: 'Melee',      description: 'Turned ash. Breaks bones rather than skin.', w: 10, h: 88, material: 'wood', hp: 140, density: .0016, blunt: 1.9, grip: { x: 0, y: 32 }, color: '#c9a36b' },
    { id: 'chainsaw', name: 'Chainsaw',       category: 'Melee',      description: 'Activate to run the chain. While it runs, whatever the bar touches is cut, continuously.', w: 24, h: 96, material: 'metal', hp: 200, density: .0028, sharp: { edge: true, power: 30 }, device: 'chainsaw', grip: { x: 0, y: 30 }, color: '#d9832e' },
    { id: 'bolt',     name: 'Crossbow bolt',  category: 'Melee',      description: 'Light and pointed. Thrown hard enough, it goes in and stays.', w: 4, h: 46, material: 'wood', hp: 40, density: .0012, sharp: { tip: true, length: .9 }, color: '#8b6b45' },
    { id: 'crystal',  name: 'Crystal',        category: 'Melee',      description: 'A long natural shard. Wickedly sharp, and it shatters.', w: 16, h: 50, material: 'glass', hp: 30, density: .002, sharp: { tip: true, edge: true, power: 45, length: .8 }, color: '#9fd8e6' },
    { id: 'esword',   name: 'Energy sword',   category: 'Melee',      description: 'Activate to ignite the blade. It cuts through anything soft and sears the wound shut behind it.', w: 9, h: 100, material: 'metal', hp: 180, density: .0012, sharp: { tip: true, edge: true, power: 96, hot: true }, device: 'blade', grip: { x: 0, y: 40 }, color: '#7fe3ff' },
    { id: 'hammer',   name: 'Hammer',         category: 'Melee',      description: 'A sledgehammer. Everything it hits at speed takes double.', w: 30, h: 76, material: 'metal', hp: 300, density: .003, blunt: 2.4, grip: { x: 0, y: 26 }, color: '#7f8a90' },
    { id: 'lance',    name: 'Lance',          category: 'Melee',      description: 'Very long, very pointed. Made for running things through at speed.', w: 9, h: 160, material: 'wood', hp: 150, density: .0012, sharp: { tip: true, length: .3 }, grip: { x: 0, y: 50 }, color: '#b9915a' },
    { id: 'phammer',  name: 'Power hammer',   category: 'Melee',      description: 'Activate to fire the ram: whatever is in front of the head is hit with enormous force.', w: 36, h: 90, material: 'metal', hp: 320, density: .0035, blunt: 2.2, device: 'ram', grip: { x: 0, y: 30 }, color: '#c8a23a' },
    { id: 'rod',      name: 'Rod',            category: 'Melee',      description: 'A length of steel bar. Conducts, clubs, and holds things apart.', w: 6, h: 112, material: 'metal', hp: 260, density: .005, blunt: 1.5, color: '#8e999f' },
    { id: 'spear',    name: 'Spear',          category: 'Melee',      description: 'A leaf blade on a long shaft. Thrown, it flies point-first into what it hits.', w: 9, h: 134, material: 'wood', hp: 120, density: .0012, sharp: { tip: true, length: .2 }, grip: { x: 0, y: 30 }, color: '#a5804d' },
    { id: 'spike',    name: 'Spike',          category: 'Melee',      description: 'A steel spike. Freeze it point-up and drop something on it.', w: 12, h: 54, material: 'metal', hp: 300, density: .004, sharp: { tip: true, length: .85 }, color: '#77838a' },
    { id: 'stick',    name: 'Stick',          category: 'Melee',      description: 'It is a stick. It burns, it breaks, it pokes.', w: 7, h: 92, material: 'wood', hp: 45, density: .001, blunt: 1.1, color: '#8a6a44' },
    { id: 'wrench',   name: 'Wrench',         category: 'Melee',      description: 'Drop-forged steel. A short, heavy club.', w: 16, h: 60, material: 'metal', hp: 280, density: .0045, blunt: 1.8, grip: { x: 0, y: 18 }, color: '#9aa5aa' },
    // Firearms. damage is a multiple of the bullet-damage setting with the 9 mm pistol as 1, set from each round's real muzzle energy and what it does to tissue; speed is its real muzzle velocity in m/s (the engine flies rounds at a fixed fraction of it); rate is rounds a second.
    { id: 'gun',      name: 'Pistol',         category: 'Firearms',   description: '9 mm, 370 m/s. Activate (F) to fire. A / D to aim, or put it in a hand.', w: 24, h: 9, material: 'metal', hp: 170, density: .006, firearm: { damage: 1, speed: 370, rate: 5, recoil: .008, muzzle: 14 }, grip: { x: -7, y: 4.5 }, color: '#8f989b' },
    { id: 'revolver', name: 'Revolver',       category: 'Firearms',   description: '.357 Magnum, 440 m/s. Six heavy rounds: hits a third harder than the pistol, kicks twice as hard.', w: 28, h: 11, material: 'metal', hp: 190, density: .0049, firearm: { damage: 1.35, speed: 440, rate: 2.5, recoil: .016, muzzle: 16 }, grip: { x: -10, y: 6 }, color: '#8f989b' },
    { id: 'smg',      name: 'Submachine gun', category: 'Firearms',   description: '9 mm, 400 m/s, 13 rounds a second. Hold F. Pistol rounds, a lot of them.', w: 50, h: 16, material: 'metal', hp: 200, density: .002, firearm: { damage: .9, speed: 400, rate: 13, auto: true, spread: .035, recoil: .005, muzzle: 27 }, grip: { x: -8, y: 9 }, color: '#2b3135' },
    { id: 'rifle',    name: 'Assault rifle',  category: 'Firearms',   description: '5.56 mm, 940 m/s, 11 rounds a second. Hold F. Fast, flat, goes straight through a limb.', w: 92, h: 17, material: 'metal', hp: 240, density: .0014, firearm: { damage: 1.6, speed: 940, rate: 11, auto: true, spread: .018, recoil: .006, muzzle: 48 }, grip: { x: -20, y: 10 }, color: '#2b3135' },
    { id: 'ak',       name: 'AK rifle',       category: 'Firearms',   description: '7.62 x 39 mm, 715 m/s, 10 rounds a second. Hold F. Slower and heavier than the 5.56: hits harder, climbs more.', w: 94, h: 18, material: 'metal', hp: 260, density: .0014, firearm: { damage: 1.8, speed: 715, rate: 10, auto: true, spread: .028, recoil: .009, muzzle: 49 }, grip: { x: -19, y: 10 }, color: '#7a4a22' },
    { id: 'lmg',      name: 'Machine gun',    category: 'Firearms',   description: 'Belt-fed 7.62 x 51 mm, 850 m/s, 11 rounds a second. Hold F. A full-power rifle round, all day.', w: 124, h: 21, material: 'metal', hp: 320, density: .00135, firearm: { damage: 2.2, speed: 850, rate: 11, auto: true, spread: .03, recoil: .008, muzzle: 64 }, grip: { x: -29, y: 11.5 }, color: '#2b3135' },
    { id: 'minigun',  name: 'Minigun',        category: 'Firearms',   description: 'Six barrels, 7.62 x 51 mm, 850 m/s, 40 rounds a second. Hold F and hold on.', w: 112, h: 28, material: 'metal', hp: 400, density: .0011, firearm: { damage: 2.2, speed: 850, rate: 40, auto: true, spread: .045, recoil: .0018, muzzle: 58 }, grip: { x: -52, y: 0 }, color: '#454e54' },
    { id: 'shotgun',  name: 'Shotgun',        category: 'Firearms',   description: '12-gauge buckshot: nine pellets at 400 m/s. Devastating close in, a scatter of light wounds far off.', w: 104, h: 13, material: 'metal', hp: 240, density: .0016, firearm: { damage: .5, speed: 400, rate: 1.2, pellets: 9, spread: .085, recoil: .03, muzzle: 54 }, grip: { x: -24, y: 4 }, color: '#7a4a22' },
    { id: 'hunting',  name: 'Hunting rifle',  category: 'Firearms',   description: '.308 bolt action, 800 m/s. One round at a time, each worth two from a pistol and then some.', w: 116, h: 13, material: 'metal', hp: 240, density: .0016, firearm: { damage: 2.3, speed: 800, rate: 1, recoil: .022, muzzle: 60 }, grip: { x: -28, y: 4 }, color: '#7a4a22' },
    { id: 'sniper',   name: 'Anti-materiel rifle', category: 'Firearms', description: '.50 BMG, 900 m/s, thirty times a pistol round\'s energy. Goes through the target and whatever is behind it.', w: 150, h: 18, material: 'metal', hp: 320, density: .0013, firearm: { damage: 5, speed: 900, rate: .6, recoil: .05, muzzle: 77 }, grip: { x: -36, y: 10 }, color: '#2b3135' },
    { id: 'crossbow', name: 'Crossbow',       category: 'Firearms',   description: 'Looses a real bolt at 120 m/s: slow enough to watch, it drops as it flies, goes in point-first and stays.', w: 80, h: 30, material: 'wood', hp: 140, density: .00085, firearm: { launch: 'bolt', speed: 120, rate: .5, recoil: .006, muzzle: 40 }, grip: { x: -18, y: 4 }, color: '#7a4a22' },
    { id: 'bomb',     name: 'Timed bomb',     category: 'Explosives', description: 'Activate to start a three-second fuse.', r: 17, material: 'metal', hp: 40, density: .002, explosive: { radius: 170, power: 1, fuse: 3, arm: 'activate', onBreak: true, onHeat: 180 }, color: '#c0ae7f' },
    { id: 'barrel',   name: 'Fuel barrel',    category: 'Explosives', description: 'Explodes when activated, heated, or damaged.', w: 35, h: 58, material: 'metal', hp: 65, density: .002, explosive: { radius: 220, power: 1.2, fuse: 0, arm: 'activate', onBreak: true, onHeat: 180 }, color: '#b36c5b' },
    { id: 'wheel',    name: 'Motor wheel',    category: 'Machinery',  description: 'Activate to spin. Rope it to a contraption.', r: 30, material: 'metal', hp: 220, density: .003, restitution: .2, device: 'wheel', color: '#7d9991' },
    { id: 'thruster', name: 'Thruster',       category: 'Machinery',  description: 'Activate for lift. Rotate to steer.', w: 29, h: 51, material: 'metal', hp: 160, density: .003, device: 'thruster', color: '#9caaa9' },
    { id: 'battery',  name: 'Battery',        category: 'Machinery',  description: 'Activate to electrify nearby conductors.', w: 32, h: 47, material: 'metal', hp: 120, density: .003, device: 'battery', color: '#a5ac73' },
    { id: 'crate',    name: 'Wooden crate',   category: 'Misc',       description: 'Stack it, smash it, set it on fire.', w: 52, h: 52, material: 'wood', hp: 80, density: .0015, color: '#b08b59' },
    { id: 'metal',    name: 'Steel beam',     category: 'Misc',       description: 'Heavy, conductive building material.', w: 150, h: 19, material: 'metal', hp: 500, color: '#899398' },
    { id: 'plank',    name: 'Wooden plank',   category: 'Misc',       description: 'Build a bridge. Flammable and breakable.', w: 145, h: 13, material: 'wood', hp: 70, density: .001, color: '#a68b63' },
    { id: 'ball',     name: 'Bouncy ball',    category: 'Misc',       description: 'Rubber with an unreasonable amount of bounce.', r: 22, material: 'rubber', hp: 150, color: '#a4b6a0' },
    { id: 'brick',    name: 'Concrete block', category: 'Misc',       description: 'A hefty block for your next contraption.', w: 60, h: 30, material: 'stone', hp: 220, color: '#a0a49d' },
    { id: 'glass',    name: 'Glass pane',     category: 'Misc',       description: 'Fragile. Shatters into physical fragments.', w: 13, h: 100, material: 'glass', hp: 22, color: '#93c3c8' },
    { id: 'platform', name: 'Fixed platform', category: 'Misc',       description: 'A frozen platform. Unfreeze with the freeze tool.', w: 180, h: 17, material: 'metal', hp: 1000, density: .005, static: true, indestructible: true, color: '#788a94' }
  ];
  const CATEGORIES = ['Entities', 'Melee', 'Firearms', 'Explosives', 'Vehicles', 'Machinery', 'Chemistry', 'Misc'];
  return { MATERIALS, ITEMS, CATEGORIES };
});

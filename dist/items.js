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
  //   firearm    { damage?: overrides the bullet-damage setting, recoil, muzzle: distance from centre along the barrel }
  //   sharp      { tip: pierces point-first (the -y end), edge: slashes on contact }
  //   device     what Activate toggles: 'thruster' | 'wheel' | 'battery'
  //   static     spawns frozen           indestructible   never shatters
  const ITEMS = [
    { id: 'human',    name: 'Human',          category: 'Entities',   description: 'An articulated, very breakable volunteer.', color: '#e2bb98' },
    { id: 'android',  name: 'Android',        category: 'Entities',   description: 'Stronger joints. Conducts electricity. Feels nothing.', color: '#91aaa7' },
    { id: 'sword',    name: 'Sword',          category: 'Melee',      description: 'Slashes on impact. Thrown or thrust point-first, it runs a body through and stays in.', w: 12, h: 100, material: 'metal', hp: 200, density: .0025, sharp: { tip: true, edge: true }, color: '#c7d2d2' },
    { id: 'gun',      name: 'Pistol',         category: 'Firearms',   description: 'Activate to fire. A / D to aim, or put it in a hand.', w: 48, h: 18, material: 'metal', hp: 170, density: .003, firearm: { recoil: .015, muzzle: 28 }, color: '#8f989b' },
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

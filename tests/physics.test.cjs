const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Simulation, CATALOG } = require('../engine.js');
const { Body, Constraint } = require('matter-js');
const advance=(sim,n=120)=>{for(let i=0;i<n;i++)sim.step();};

test('all catalogue objects spawn and remain finite under gravity',()=>{
  const s=new Simulation();CATALOG.forEach((c,i)=>s.spawn(c.id,100+i*140,300));advance(s,240);
  assert.ok(s.bodies.length>20);
  for(const b of s.bodies){assert.ok(Number.isFinite(b.position.x));assert.ok(Number.isFinite(b.position.y));assert.ok(b.position.y<710);}
});
test('ragdoll settles with its articulated joints intact',()=>{
  const s=new Simulation();const e=s.spawn('human',1000,555);advance(s,600);
  assert.equal(s.joints.length,16);assert.equal(e.bodies.length,17);
  for(const b of e.bodies)assert.ok(b.plugin.hp>80,`${b.plugin.part} unexpectedly damaged: ${b.plugin.hp}`);
  for(const c of s.joints)assert.ok(Constraint.currentLength(c)<10);
});
test('bullet hits nearest object instead of passing through to target',()=>{
  const s=new Simulation();const a=s.spawn('metal',600,300).bodies[0],b=s.spawn('crate',800,300).bodies[0];
  const hit=s.shoot({x:100,y:300},{x:1000,y:300});assert.equal(hit,a);assert.equal(a.plugin.hp,445);assert.equal(b.plugin.hp,80);
});
test('fire damages flammable materials and healing extinguishes',()=>{
  const s=new Simulation();const b=s.spawn('crate',1000,620).bodies[0];s.ignite(b);advance(s,120);assert.ok(b.plugin.hp<80);assert.ok(b.plugin.burning);s.heal(b);assert.equal(b.plugin.hp,80);assert.equal(b.plugin.burning,false);assert.equal(b.plugin.heat,20);
});
test('explosion causes physical impulse and barrel chain reaction',()=>{
  const s=new Simulation();const barrel=s.spawn('barrel',1000,450).bodies[0];const b=s.spawn('brick',1100,450).bodies[0];s.explode(980,450);advance(s,2);assert.ok(!s.bodies.includes(barrel));assert.ok(b.velocity.x>0);assert.ok(s.flashes.length>=2);
});
test('electricity travels through nearby metal to a human',()=>{
  const s=new Simulation();const metal=s.spawn('battery',1000,400).bodies[0];const e=s.spawn('human',1040,440);s.shock(metal);assert.ok(e.bodies.some(b=>b.plugin.charge>0));assert.ok(e.bodies.some(b=>b.plugin.hp<100));
});
test('lethal damage severs joints and glass breaks into fragments',()=>{
  const s=new Simulation();const e=s.spawn('human',1000,500);s.damage(e.bodies[0],150);assert.equal(s.joints.length,15);
  const pane=s.spawn('glass',1300,400).bodies[0];s.damage(pane,50);s.step();assert.ok(!s.bodies.includes(pane));assert.equal(s.bodies.filter(b=>b.plugin.debris).length,5);
});
test('frozen objects stay fixed and zero gravity leaves objects floating',()=>{
  const s=new Simulation();const b=s.spawn('crate',1000,300).bodies[0];s.freeze(b);advance(s);assert.equal(b.position.y,300);s.freeze(b);s.gravity=0;advance(s);assert.ok(Math.abs(b.position.y-300)<.1);s.gravity=1;advance(s);assert.ok(b.position.y>500);
});
test('save and restore preserves rotated ropes, static bodies, damage and active devices',()=>{
  const s=new Simulation();const a=s.spawn('platform',1000,250).bodies[0],b=s.spawn('crate',1050,400).bodies[0];s.rope(a,b,{x:1050,y:250},{x:1050,y:390});Body.rotate(b,.8);s.damage(b,10);const t=s.spawn('thruster',1500,600).bodies[0];s.activate(t);s.gravity=.17;advance(s,5);
  const data=JSON.parse(JSON.stringify(s.serialize()));const restored=new Simulation();restored.restore(data);const roundtrip=restored.serialize();assert.equal(roundtrip.bodies.length,data.bodies.length);assert.equal(roundtrip.joints.length,1);assert.equal(restored.gravity,.17);assert.equal(restored.bodies[0].isStatic,true);assert.equal(restored.bodies[1].plugin.hp,b.plugin.hp);assert.equal(restored.bodies[2].plugin.active,true);
  const length=Constraint.currentLength(restored.joints[0]);advance(restored,10);assert.ok(Math.abs(Constraint.currentLength(restored.joints[0])-length)<20);
});
test('invalid save is rejected before current scene is cleared',()=>{
  const s=new Simulation();s.spawn('ball',100,100);assert.throws(()=>s.restore({version:1,bodies:[{x:null}],joints:[],entities:[]}));assert.equal(s.entities.length,1);
});
test('timed bomb detonates and deleting an entity cleans its ropes',()=>{
  const s=new Simulation();const bomb=s.spawn('bomb',1000,500).bodies[0];s.activate(bomb);advance(s,190);assert.ok(!s.bodies.includes(bomb));const e=s.spawn('human',1200,568);s.rope(null,e.bodies[0],{x:1200,y:200},{...e.bodies[0].position});s.removeEntity(e.bodies[0]);assert.equal(s.joints.length,0);assert.equal(s.entities.length,0);
});
test('presets run stably for 10 seconds',()=>{
  for(const name of ['workshop','tower','swing','empty']){const s=new Simulation();s.loadPreset(name);advance(s,600);for(const b of s.bodies)assert.ok(Number.isFinite(b.position.x)&&Number.isFinite(b.position.y),name);}
});
test('anatomical joints stay connected and a healthy standing human does not creep',()=>{
  const s=new Simulation();const e=s.spawn('human',1000,555);advance(s,1200);
  assert.equal(e.bodies.length,17);assert.ok(e.upright);assert.ok(Math.abs(e.bodies[0].position.x-1000)<5);
  assert.ok(e.bodies[0].position.y<480);assert.equal(e.blood,100);
  for(const c of s.joints)assert.ok(Constraint.currentLength(c)<2,`${c.plugin.name} separated`);
});
test('elbows recover from overextension without turning into free hinges',()=>{
  const s=new Simulation();s.gravity=0;const e=s.spawn('human',1000,400);e.upright=false;
  const elbow=s.joints.find(c=>c.plugin.name==='elbow');Body.setAngle(elbow.bodyB,elbow.bodyA.angle+.8);
  advance(s,120);const angle=Math.atan2(Math.sin(elbow.bodyB.angle-elbow.bodyA.angle),Math.cos(elbow.bodyB.angle-elbow.bodyA.angle));
  assert.ok(angle<=elbow.plugin.max+.12&&angle>=elbow.plugin.min-.12);assert.ok(s.joints.includes(elbow));
});
test('bullet damage is localized, bleeds over time, and persists through save/load',()=>{
  const s=new Simulation();const e=s.spawn('human',1000,555);const arm=e.bodies.find(b=>b.plugin.part==='upper arm');s.damage(arm,55,{x:arm.position.x-4,y:arm.position.y},'bullet');
  assert.equal(arm.plugin.wounds.length,1);assert.ok(arm.plugin.bleed>0);assert.equal(s.joints.length,16);advance(s,60);assert.ok(e.blood<100);
  const restored=new Simulation();restored.restore(JSON.parse(JSON.stringify(s.serialize())));const savedArm=restored.bodies.find(b=>b.plugin.part==='upper arm');assert.equal(savedArm.plugin.wounds[0].type,'bullet');assert.equal(restored.entities[0].blood,e.blood);
});
test('severed endpoints store local bone and tissue wounds on both sides',()=>{
  const s=new Simulation();s.spawn('human',1000,500);const wrist=s.joints.find(c=>c.plugin.name==='wrist');s.sever(wrist);
  assert.equal(wrist.bodyA.plugin.severed.length,1);assert.equal(wrist.bodyB.plugin.severed.length,1);assert.ok(wrist.bodyB.plugin.bleed>1);assert.equal(s.joints.length,15);
});
test('moving a ragdoll while paused preserves the connected anatomy',()=>{
  const s=new Simulation();const e=s.spawn('human',1000,555);const before=e.bodies.map(b=>({...b.position}));s.translateConnected(e.bodies[2],{x:120,y:-100});
  for(let i=0;i<e.bodies.length;i++){assert.equal(e.bodies[i].position.x,before[i].x+120);assert.equal(e.bodies[i].position.y,before[i].y-100);}
  for(const c of s.joints)assert.ok(Constraint.currentLength(c)<1.01);
});

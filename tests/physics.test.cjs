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
  const restored=new Simulation();restored.restore(JSON.parse(JSON.stringify(s.serialize())));assert.equal(restored.joints.filter(c=>c.plugin.joint&&c.plugin.min!==undefined).length,16,'loaded joints lost their limits');assert.equal(restored.entities[0].joints.length,16);const savedArm=restored.bodies.find(b=>b.plugin.part==='upper arm');assert.equal(savedArm.plugin.wounds[0].type,'bullet');assert.equal(restored.entities[0].blood,e.blood);
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
const settle=(setup)=>{const s=new Simulation();const e=s.spawn('human',1000,555);advance(s,60);e.alive=false;setup(s,e);advance(s,1200);return {s,e};};
test('dead ragdolls come to rest instead of sliding, whichever way they fell',()=>{
  for(const vx of [0,9,-9]){const {s,e}=settle((s,e)=>e.bodies.forEach(b=>Body.setVelocity(b,{x:vx,y:-3})));const x=e.bodies[2].position.x;advance(s,1200);
    assert.ok(Math.abs(e.bodies[2].position.x-x)<.5,`slid ${e.bodies[2].position.x-x}px after a ${vx} shove`);
    for(const c of s.joints){const r=Math.atan2(Math.sin(c.bodyB.angle-c.bodyA.angle),Math.cos(c.bodyB.angle-c.bodyA.angle));assert.ok(r>c.plugin.min-.5&&r<c.plugin.max+.5,`${c.plugin.name} folded through its limit`);}}
});
test('a settled body still falls when its support goes and still yields to a slow push',()=>{
  const s=new Simulation();const slabs=[760,940,1120,1300].map(x=>s.spawn('platform',x,450).bodies[0]);const e=s.spawn('human',1030,350);e.alive=false;advance(s,900);
  const chest=e.bodies[2],y=chest.position.y;assert.ok(y<450&&e.pin,'corpse never settled on the platforms');slabs.forEach(b=>s.removeEntity(b));advance(s,240);assert.ok(chest.position.y>y+80,'corpse hung in the air');
  advance(s,600);const x=chest.position.x,crate=s.spawn('crate',x-160,622).bodies[0];for(let i=0;i<900;i++){Body.setVelocity(crate,{x:.5,y:crate.velocity.y});s.step();}
  assert.ok(chest.position.x>x+40,`a slow crate could not move it: ${chest.position.x-x}`);
});
test('a living ragdoll gets back up after a knockdown; a dead one stays down until revived',()=>{
  const s=new Simulation();const e=s.spawn('human',1000,555);advance(s,60);const chest=e.bodies[2];
  s.damage(chest,30,chest.position);Body.setVelocity(chest,{x:7,y:0});advance(s,40);assert.ok(e.stun>0,'a hard hit should stun');advance(s,45);assert.ok(chest.position.y>540,'was not knocked down');
  advance(s,500);assert.ok(chest.position.y<505&&Math.abs(chest.angle)<.3,'did not get back up');
  e.alive=false;advance(s,600);assert.ok(chest.position.y>560);s.heal(chest);advance(s,300);assert.ok(chest.position.y>560,'heal must not resurrect');
  assert.equal(s.revive(chest),true);advance(s,400);assert.ok(e.alive&&chest.position.y<505&&Math.abs(chest.angle)<.3,'revive did not stand it up');
  assert.equal(s.revive(s.spawn('crate',300,300).bodies[0]),false);
});
test('standing needs a spine and a leg, not arms',()=>{
  const s=new Simulation();const e=s.spawn('human',1000,555);const cut=name=>s.joints.filter(c=>c.plugin.name===name).forEach(c=>s.sever(c));
  cut('shoulder');assert.ok(s.canStand(e));const [hipA]=s.joints.filter(c=>c.plugin.name==='hip');s.sever(hipA);assert.ok(s.canStand(e));
  cut('hip');assert.ok(!s.canStand(e));const t=s.spawn('human',1400,555);cut('waist');assert.ok(!s.canStand(t));
});
test('a held body keeps the angle it was rotated to',()=>{
  const s=new Simulation();s.gravity=0;const b=s.spawn('plank',1000,300).bodies[0];s.beginDrag(b,{...b.position});s.rotate(b,.9);advance(s,90);
  assert.ok(Math.abs(b.angle-.9)<.05,`angle ${b.angle}`);advance(s,120);assert.ok(Math.abs(b.angle-.9)<.05,'drifted after release of the key');
  s.endDrag();const frozen=s.spawn('crate',1300,300).bodies[0];s.freeze(frozen);s.rotate(frozen,.4);assert.ok(Math.abs(frozen.angle-.4)<1e-9);
});
test('spawning facing left mirrors joint limits and the pistol',()=>{
  const s=new Simulation();const r=s.spawn('human',600,555),l=s.spawn('human',1400,555,true);const knee=e=>s.joints.find(c=>c.plugin.name==='knee'&&c.bodyA.plugin.entityId===e.id).plugin;
  assert.equal(knee(l).min,-knee(r).max);assert.equal(knee(l).max,-knee(r).min);advance(s,600);assert.ok(l.bodies[2].position.y<505&&Math.abs(l.bodies[2].position.x-1400)<5,'mirrored human should stand too');
  const t=new Simulation();t.gravity=0;const target=t.spawn('crate',500,300).bodies[0],gun=t.spawn('gun',1000,300,true).bodies[0];t.activate(gun);assert.ok(target.plugin.hp<80,'left-facing pistol should fire left');
});
test('a rotated body leaves the grab without spin',()=>{
  const s=new Simulation();s.gravity=0;const b=s.spawn('plank',1000,300).bodies[0];s.beginDrag(b,{...b.position});s.rotate(b,1.2);advance(s,10);assert.ok(Math.abs(b.angularVelocity)>.01);
  s.endDrag();assert.equal(b.angularVelocity,0);const angle=b.angle;advance(s,60);assert.ok(Math.abs(b.angle-angle)<.01);
});
const thrust=(s,sword,vx)=>{Body.setAngle(sword,Math.PI/2);Body.setVelocity(sword,{x:vx,y:0});}; // tip is the -y end, so a quarter turn points it along +x
test('a sword thrust point-first runs a human through, sticks, and can be pulled out',()=>{
  const s=new Simulation();s.gravity=0;const e=s.spawn('human',1000,400);e.alive=false;const chest=e.bodies[2],sword=s.spawn('sword',880,chest.position.y).bodies[0];thrust(s,sword,14);advance(s,40);
  const pins=()=>s.joints.filter(c=>c.plugin.pierce);assert.equal(pins().length,2,'blade did not lodge');assert.equal(pins()[0].bodyA.plugin.entityId,e.id);
  const hurt=e.bodies.filter(b=>b.plugin.wounds.some(w=>w.type==='stab'));assert.ok(hurt.length>=1&&hurt[0].plugin.bleed>.4,'no stab wound');assert.equal(s.joints.filter(c=>c.plugin.joint).length,16,'a stab is not a dismemberment');
  const tip=s.blade(sword).tip;assert.ok(tip.x>chest.position.x-5,`tip stopped at the skin: ${tip.x}`);
  advance(s,120);const gap=Math.hypot(sword.position.x-chest.position.x,sword.position.y-chest.position.y);advance(s,120);assert.ok(Math.abs(Math.hypot(sword.position.x-chest.position.x,sword.position.y-chest.position.y)-gap)<3,'lodged blade should move with the body');
  const saved=new Simulation();saved.restore(JSON.parse(JSON.stringify(s.serialize())));assert.equal(saved.joints.filter(c=>c.plugin.pierce).length,2);advance(saved,60);assert.equal(saved.joints.filter(c=>c.plugin.pierce).length,2,'a saved impalement fell apart');
  s.freeze(chest);s.beginDrag(sword,{...sword.position});for(let i=0;i<240&&sword.plugin.stuck!==undefined;i++){s.moveDrag({x:sword.position.x-60,y:sword.position.y});s.step();}
  assert.equal(pins().length,0);assert.equal(sword.plugin.stuck,undefined,'blade never came free');assert.equal(sword.collisionFilter.group,0);
});
test('slow, flat or armoured contact does not pierce',()=>{
  const s=new Simulation();s.gravity=0;const e=s.spawn('human',1000,400);e.alive=false;const y=e.bodies[2].position.y;
  const slow=s.spawn('sword',900,y).bodies[0];thrust(s,slow,2);advance(s,90);assert.equal(slow.plugin.stuck,undefined,'a nudge should not pierce');
  const flat=s.spawn('sword',1000,250).bodies[0];Body.setAngle(flat,Math.PI/2);Body.setVelocity(flat,{x:0,y:14});advance(s,60);assert.equal(flat.plugin.stuck,undefined,'the flat of the blade should not pierce');
  const t=new Simulation();t.gravity=0;const bot=t.spawn('android',1000,400);const blade=t.spawn('sword',880,bot.bodies[2].position.y).bodies[0];thrust(t,blade,14);advance(t,40);assert.equal(blade.plugin.stuck,undefined,'steel should not pierce an android');
});
test('even a very fast throw lodges in the body instead of flying through or tearing it apart',()=>{
  for(const vx of [25,55]){const s=new Simulation();s.gravity=0;const e=s.spawn('human',1000,400);e.alive=false;const chest=e.bodies[2],sword=s.spawn('sword',820,chest.position.y).bodies[0];thrust(s,sword,vx);advance(s,90);
    const pins=s.joints.filter(c=>c.plugin.pierce);assert.equal(pins.length,2,`no lodge at ${vx}`);assert.equal(s.joints.filter(c=>c.plugin.joint).length,16,`torn apart at ${vx}`);
    const host=pins[0].bodyA,tip=s.blade(sword).tip;assert.ok(Math.hypot(tip.x-host.position.x,tip.y-host.position.y)<70,`blade ended ${Math.hypot(tip.x-host.position.x,tip.y-host.position.y)}px from the part it is pinned to`);
    for(const c of pins)assert.ok(Constraint.currentLength(c)<6);}
});
const {SETTINGS,defaults,sanitize}=require('../engine.js');
test('settings table is well formed and hostile saved values are rejected',()=>{
  assert.equal(new Set(SETTINGS.map(s=>s.id)).size,SETTINGS.length);
  for(const s of SETTINGS){assert.ok(s.label&&s.help&&s.section,s.id);if(s.type==='range')assert.ok(s.def>=s.min&&s.def<=s.max&&s.step>0,s.id);if(s.type==='select')assert.ok(s.options.includes(s.def),s.id);}
  assert.deepEqual(sanitize({gravity:9999,fragility:'5',noGore:'yes',particles:'Ultra',bogus:1,iterations:NaN,rain:true}),{gravity:40,rain:true});
  const s=new Simulation();s.configure({gravity:'x',fragility:3});assert.equal(s.settings.gravity,9.81);assert.equal(s.settings.fragility,3);
});
test('defaults leave behaviour unchanged, and each gameplay setting does what it says',()=>{
  const hit=(set,amount=30)=>{const s=new Simulation();s.configure(set);const arm=s.spawn('human',1000,555).bodies[5];s.damage(arm,amount,arm.position);return {s,arm};};
  assert.equal(hit({}).arm.plugin.hp,70);assert.equal(hit({fragility:2}).arm.plugin.hp,40);assert.equal(hit({fragility:.5}).arm.plugin.hp,85);
  assert.ok(hit({fragility:2}).s.spawn('crate',300,300).bodies[0].plugin.hp===80,'fragility is for ragdolls only');
  const stunned=set=>{const {s,arm}=hit(set);return s.getEntity(arm).stun||0;};assert.ok(stunned({})>0);assert.equal(stunned({stunScale:0}),0);assert.ok(stunned({stunScale:3})>stunned({})*2.5);
  const bullet=set=>{const s=new Simulation();s.configure(set);const b=s.spawn('metal',600,300).bodies[0];s.shoot({x:100,y:300},{x:1000,y:300});return 500-b.plugin.hp;};assert.equal(bullet({}),55);assert.equal(bullet({bulletDamage:200}),200);
  const g=new Simulation();g.configure({gravity:-9.81});const up=g.spawn('crate',1000,300).bodies[0];advance(g,60);assert.ok(up.position.y<290,'negative gravity should fall upward');
  const v=new Simulation();v.configure({airDrag:0});assert.equal(v.spawn('crate',1,1).bodies[0].frictionAir,0);v.configure({airDrag:2});assert.ok(Math.abs(v.bodies[0].frictionAir-.012)<1e-9);
  const cap=new Simulation();cap.configure({maxObjects:100});for(let i=0;i<150;i++)cap.spawn('ball',100+i*10,100);assert.equal(cap.bodies.length,100);
  const limp=new Simulation();limp.configure({autoBalance:false});const e=limp.spawn('human',1000,555);advance(limp,300);assert.ok(e.bodies[2].position.y>560,'without auto-balance a ragdoll should collapse');
  const it=new Simulation();it.configure({iterations:24});assert.equal(it.engine.positionIterations,24);
});
test('ambient temperature, rain and frozen flesh',()=>{
  const hot=new Simulation();hot.configure({ambient:400});const crate=hot.spawn('crate',1000,620).bodies[0];assert.equal(crate.plugin.heat,400);advance(hot,30);assert.ok(crate.plugin.burning,'a 400 degree room ignites wood');
  const wet=new Simulation();wet.configure({rain:true});const b=wet.spawn('crate',1000,620).bodies[0];wet.ignite(b);advance(wet,360);assert.ok(!b.plugin.burning,'rain should put the fire out');
  const cold=new Simulation();cold.configure({ambient:-100});const arm=cold.spawn('human',1000,555).bodies[5];cold.damage(arm,20,arm.position);assert.ok(arm.plugin.hp<70,'frozen flesh should take extra damage');
  const mild=new Simulation();mild.configure({ambient:-60});const c=mild.spawn('crate',1000,620).bodies[0];c.plugin.heat=100;advance(mild,300);assert.ok(c.plugin.heat<70&&c.plugin.heat>=-60);
});
test('lightning strikes the highest thing under it, shocks and heats it',()=>{
  const s=new Simulation();const low=s.spawn('crate',1000,620).bodies[0],beam=s.spawn('metal',1000,300).bodies[0];s.freeze(beam);const e=s.spawn('human',1040,345);
  assert.equal(s.lightning(1000),beam);assert.ok(beam.plugin.heat>400&&beam.plugin.charge>0);assert.equal(low.plugin.charge,0);assert.ok(e.bodies.some(b=>b.plugin.charge>0),'current should jump to the human touching the beam');
  assert.ok(s.traces.some(t=>t.bolt));assert.equal(s.lightning(2000),null,'open floor');
  const storm=new Simulation();storm.configure({lightning:100});let bolts=0;storm.onEffect=t=>{if(t==='thunder')bolts++;};advance(storm,1200);assert.ok(bolts>=3,`only ${bolts} strikes in 20s at 100%`);
  const calm=new Simulation();let none=0;calm.onEffect=t=>{if(t==='thunder')none++;};advance(calm,600);assert.equal(none,0);
});
test('limb crushing removes a destroyed limb and leaves fragments; healing and brain damage work over time',()=>{
  const s=new Simulation();s.configure({limbCrush:true});const e=s.spawn('human',1000,555),hand=e.bodies[7];s.damage(hand,100,hand.position);s.step();assert.ok(s.bodies.includes(hand),'first blow only destroys it');
  s.damage(hand,60,hand.position);s.step();assert.ok(!s.bodies.includes(hand));assert.equal(s.bodies.filter(b=>b.plugin.debris).length,3);assert.equal(e.bodies.length,16);
  const off=new Simulation();const h=off.spawn('human',1000,555).bodies[7];off.damage(h,100,h.position);off.damage(h,60,h.position);off.step();assert.ok(off.bodies.includes(h));
  const heal=new Simulation();heal.configure({slowHealing:true,stunScale:0});const p=heal.spawn('human',1000,555),arm=p.bodies[5];heal.damage(arm,40,arm.position,'bullet');const hp=arm.plugin.hp;advance(heal,600);assert.ok(arm.plugin.hp>hp+10);
  const brain=new Simulation();brain.configure({brainDamage:true,stunScale:0});const v=brain.spawn('human',1000,555);v.bodies[0].plugin.hp=20;let out=0;for(let i=0;i<1800;i++){brain.step();if(v.stun>0)out++;}assert.ok(out>60,'a badly hurt head should black out');
});
test('regenerate regrows severed limbs on the clicked body and leaves the old pieces as remains',()=>{
  const s=new Simulation();const e=s.spawn('human',1000,555);advance(s,30);const cut=name=>s.sever(s.joints.find(c=>c.plugin.name===name));cut('elbow');cut('knee');
  assert.equal(s.joints.filter(c=>c.plugin.joint).length,14);
  assert.equal(s.regenerate(e.bodies[2]),4,'forearm + hand, shin + foot');s.step();assert.equal(e.bodies.length,14,'growth is staged: one part on the first beat');assert.ok(e.bodies.some(b=>b.plugin.grow!==undefined));
  assert.equal(s.regenerate(e.bodies[2]),3,'a second click does not start a second job');assert.equal(s.regrowing.length,1);advance(s,150);assert.equal(s.regrowing.length,0);assert.ok(s.bodies.every(b=>b.plugin.grow===undefined),'swelling finishes');
  assert.equal(s.joints.filter(c=>c.plugin.joint&&c.bodyA.plugin.entityId===e.id).length,16);assert.equal(e.joints.length,16);assert.equal(e.bodies.length,17);assert.equal(new Set(e.bodies.map(b=>b.plugin.slot)).size,17);
  const remains=s.entities.find(x=>x!==e&&x.kind==='human');assert.equal(remains.bodies.length,4);assert.equal(remains.alive,false);
  assert.ok(e.bodies.every(b=>b.plugin.severed.length===0));advance(s,600);for(const b of s.bodies)assert.ok(Number.isFinite(b.position.x));assert.ok(s.canStand(e)&&e.bodies[2].position.y<505,'regrown body should stand');
  for(const c of s.joints.filter(c=>c.plugin.joint))assert.ok(Constraint.currentLength(c)<3,`${c.plugin.name} not seated`);
  assert.equal(s.regenerate(e.bodies[2]),0,'nothing missing');assert.equal(s.regenerate(s.spawn('crate',300,300).bodies[0]),0);
});
test('reattach puts a severed limb back on its own ragdoll, from either end',()=>{
  for(const from of ['limb','body']){const s=new Simulation();const e=s.spawn('human',1000,555),other=s.spawn('human',1400,555);advance(s,30);
    s.sever(s.joints.find(c=>c.plugin.name==='elbow'&&c.bodyA.plugin.entityId===e.id));const forearm=e.bodies[6],hand=e.bodies[7];Body.setVelocity(forearm,{x:-8,y:-4});advance(s,180);
    assert.ok(Math.hypot(forearm.position.x-e.bodies[5].position.x,forearm.position.y-e.bodies[5].position.y)>40,'limb should have fallen away');
    assert.equal(s.reattach(from==='limb'?hand:e.bodies[2]),1);assert.equal(s.joints.filter(c=>c.plugin.joint&&c.bodyA.plugin.entityId===e.id).length,16);
    const elbow=s.joints.find(c=>c.bodyB===forearm&&c.plugin.name==='elbow');assert.ok(elbow&&Constraint.currentLength(elbow)<1,'elbow anchors should meet');assert.equal(forearm.plugin.severed.length,0);
    advance(s,300);assert.ok(Constraint.currentLength(elbow)<3);assert.equal(s.joints.filter(c=>c.plugin.joint&&c.bodyA.plugin.entityId===other.id).length,16,'the bystander is untouched');
    assert.equal(s.reattach(hand),0,'already whole');}
  const s=new Simulation();const e=s.spawn('human',1000,555);s.sever(s.joints.find(c=>c.plugin.name==='wrist'));const oldHand=e.bodies[7];s.regenerate(e.bodies[2]);advance(s,60);assert.equal(s.reattach(oldHand),0,'the place is taken by the regrown hand');
});
test('a lodged blade slides out with a light pull, and grip is adjustable',()=>{
  const pull=grip=>{const s=new Simulation();s.gravity=0;s.configure({bladeGrip:grip,gravity:0});const e=s.spawn('human',1000,400);e.alive=false;const chest=e.bodies[2],sword=s.spawn('sword',880,chest.position.y).bodies[0];thrust(s,sword,14);advance(s,40);
    assert.notEqual(sword.plugin.stuck,undefined);s.freeze(chest);s.beginDrag(sword,{...sword.position});let steps=0;const hold={x:sword.position.x-60,y:sword.position.y};for(;steps<400&&s.joints.some(c=>c.plugin.pierce);steps++){s.moveDrag(hold);s.step();}return steps;};
  const easy=pull(5),firm=pull(30);assert.ok(easy<60&&firm===400,`a 60px pull should free the blade within a second, took ${easy} steps`);assert.ok(firm>easy,'a higher grip should hold longer');
});
test('a lone head regrows a whole body outward from itself: neck, then chest, then the rest',()=>{
  const s=new Simulation();const e=s.spawn('human',1000,555);const head=e.bodies[0];s.sever(s.joints.find(c=>c.plugin.name==='atlas'));
  assert.equal(s.regenerate(head),16);const order=[];for(let i=0;i<1200&&s.regrowing.length;i++){const before=s.connected(head).size;s.step();if(s.connected(head).size>before)order.push([...s.connected(head)].pop().plugin.part);}
  assert.deepEqual(order.slice(0,3),['neck','chest','abdomen']);assert.equal(order.length,16);const grown=s.getEntity(head);assert.ok(grown.alive&&grown!==e&&grown.bodies.length===17);assert.equal(e.alive,false);assert.equal(e.bodies.length,16);
});
test('fire chars what it burns and throws embers and smoke',()=>{
  const s=new Simulation();const b=s.spawn('crate',1000,620).bodies[0];s.ignite(b);advance(s,180);assert.ok(b.plugin.char>.1);assert.ok(s.particles.some(p=>p.type==='ember')&&s.particles.some(p=>p.type==='smoke'));s.heal(b);assert.equal(b.plugin.char,0);
});
test('graft puts an android arm on a human stump, mirrors a limb from the other side, and refuses what does not fit',()=>{
  const s=new Simulation();const human=s.spawn('human',1000,555),bot=s.spawn('android',1400,555);advance(s,30);
  const elbow=(e,side)=>s.joints.filter(c=>c.plugin.name==='elbow'&&c.bodyA.plugin.entityId===e.id)[side];s.sever(elbow(human,1));s.sever(elbow(bot,0)); // human loses the right forearm, the android its LEFT one
  const lost=human.bodies.filter(b=>[9,10].includes(b.plugin.slot));lost.forEach(b=>s.removeBody(b));const stump=human.bodies.find(b=>b.plugin.slot===8),metal=bot.bodies.find(b=>b.plugin.slot===6);
  assert.equal(s.graft(stump,metal),'');assert.equal(metal.plugin.slot,9,'left forearm mirrored to the right side');assert.equal(metal.plugin.entityId,human.id);assert.equal(metal.collisionFilter.group,stump.collisionFilter.group);
  assert.equal(human.bodies.length,17);assert.equal(bot.bodies.length,15);assert.equal(metal.plugin.kind,'android','it stays a metal arm');assert.ok(metal.plugin.surge>0&&human.surge>0);
  const seam=s.joints.find(c=>c.bodyB===metal&&c.plugin.name==='elbow');assert.ok(seam&&Constraint.currentLength(seam)<1);advance(s,300);assert.ok(Constraint.currentLength(seam)<3);for(const b of s.bodies)assert.ok(Number.isFinite(b.position.x));
  assert.notEqual(s.graft(stump,metal),'','already attached');assert.notEqual(s.graft(human.bodies[2],bot.bodies.find(b=>b.plugin.slot===2)),'','a whole android is not a limb');assert.notEqual(s.graft(stump,s.spawn('crate',300,300).bodies[0]),'');
});

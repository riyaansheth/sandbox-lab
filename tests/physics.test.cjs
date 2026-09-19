const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Simulation, CATALOG } = require('../engine.js');
const { Body, Constraint } = require('matter-js');
const advance=(sim,n=120)=>{for(let i=0;i<n;i++)sim.step();};

test('all catalogue objects spawn and remain finite under gravity',()=>{
  const s=new Simulation();s.configure({maxObjects:1000});CATALOG.forEach((c,i)=>assert.ok(s.spawn(c.id,180+(i%14)*170,420-Math.floor(i/14)*190),`${c.id} did not spawn`));advance(s,240); // rows: the catalogue is longer than the floor
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
  const hit=s.shoot({x:100,y:300},{x:1000,y:300});assert.equal(hit,a);assert.ok(a.plugin.hp<460&&a.plugin.hp>430,`steel beam at ${a.plugin.hp}`);assert.equal(b.plugin.hp,80);
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
  assert.equal(e.bodies.length,17);assert.ok(e.upright);assert.ok(Math.abs(e.bodies[2].position.x-1000)<5);
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
    for(const c of s.joints){const r=Math.atan2(Math.sin(c.bodyB.angle-c.bodyA.angle),Math.cos(c.bodyB.angle-c.bodyA.angle));assert.ok(c.plugin.broken||s.fractured(c.bodyB)||(r>c.plugin.min-.85&&r<c.plugin.max+.85),`${c.plugin.name} is folded ${r.toFixed(2)} outside ${c.plugin.min}..${c.plugin.max} and not broken`);}}
});
test('a settled body still falls when its support goes and still yields to a slow push',()=>{
  const s=new Simulation();const slabs=[760,940,1120,1300].map(x=>s.spawn('platform',x,450).bodies[0]);const e=s.spawn('human',1030,350);e.alive=false;advance(s,900);
  const chest=e.bodies[2],y=chest.position.y;assert.ok(y<450&&e.pin,'corpse never settled on the platforms');slabs.forEach(b=>s.removeEntity(b));advance(s,240);assert.ok(chest.position.y>y+80,'corpse hung in the air');
  advance(s,600);const x=chest.position.x,crate=s.spawn('crate',x-160,622).bodies[0];for(let i=0;i<900;i++){Body.setVelocity(crate,{x:.5,y:crate.velocity.y});s.step();}
  assert.ok(chest.position.x>x+40,`a slow crate could not move it: ${chest.position.x-x}`);
});
test('a living ragdoll gets back up after a knockdown; a dead one stays down until revived',()=>{
  const s=new Simulation();const e=s.spawn('human',1000,555);advance(s,60);const chest=e.bodies[2];
  s.damage(chest,45,chest.position);Body.setVelocity(chest,{x:7,y:0});advance(s,40);assert.ok(e.stun>0,'a hard hit should stun');advance(s,45);assert.ok(chest.position.y>540,'was not knocked down');
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
  const t=new Simulation();t.gravity=0;const target=t.spawn('crate',500,300).bodies[0],gun=t.spawn('gun',1000,300,true).bodies[0];t.activate(gun);advance(t,12);assert.ok(target.plugin.hp<80,'left-facing pistol should fire left');
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
  const stunned=set=>{const s=new Simulation();s.configure(set);const chest=s.spawn('human',1000,555).bodies[2];s.damage(chest,45,chest.position);const e=s.getEntity(chest);return Math.max(e.stun||0,e.stunNext||0);}; // a standing body is knocked down a moment later, through a staggerassert.ok(stunned({})>0);assert.equal(stunned({stunScale:0}),0);assert.ok(stunned({stunScale:3})>stunned({})*2.5);
  const bullet=set=>{const s=new Simulation();s.configure(set);const b=s.spawn('metal',600,300).bodies[0];s.shoot({x:500,y:300},{x:1000,y:300});return Math.round(500-b.plugin.hp);};assert.equal(bullet({}),77,'55 x 1.4 at point-blank range');assert.equal(bullet({bulletDamage:200}),280);
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
  s.damage(hand,60,hand.position);s.step();assert.ok(!s.bodies.includes(hand));assert.equal(s.bodies.filter(b=>b.plugin.gib&&b.plugin.material==='flesh').length,3);assert.equal(s.bodies.filter(b=>b.plugin.gib&&b.plugin.material==='bone').length,2);assert.equal(e.bodies.length,16);
  const off=new Simulation();const h=off.spawn('human',1000,555).bodies[7];off.damage(h,100,h.position);off.damage(h,60,h.position);off.step();assert.ok(off.bodies.includes(h));
  const heal=new Simulation();heal.configure({slowHealing:true,stunScale:0});const p=heal.spawn('human',1000,555),arm=p.bodies[5];heal.damage(arm,40,arm.position,'bullet');const hp=arm.plugin.hp;advance(heal,600);assert.ok(arm.plugin.hp>hp+10);
  const brain=new Simulation().seed(7);brain.configure({brainDamage:true,stunScale:0});const v=brain.spawn('human',1000,555);v.bodies[0].plugin.hp=20;let out=0;for(let i=0;i<1800;i++){brain.step();if(v.stun>0)out++;}assert.ok(out>60,'a badly hurt head should black out');
});
test('regenerate regrows severed limbs on the clicked body and leaves the old pieces as remains',()=>{
  const s=new Simulation();const e=s.spawn('human',1000,555);advance(s,30);const cut=name=>s.sever(s.joints.find(c=>c.plugin.name===name));cut('elbow');cut('knee');
  assert.equal(s.joints.filter(c=>c.plugin.joint).length,14);
  assert.equal(s.regenerate(e.bodies[2]),4,'forearm + hand, shin + foot');s.step();assert.equal(e.bodies.length,14,'growth is staged: one part on the first beat');assert.ok(e.bodies.some(b=>b.plugin.grow!==undefined));
  assert.equal(s.regenerate(e.bodies[2]),3,'a second click does not start a second job');assert.equal(s.regrowing.length,1);advance(s,60);assert.ok(e.bodies.some(b=>b.plugin.grow>0&&b.plugin.grow<.5),'each part grows through its layers: bone, flesh, skin');advance(s,240);assert.equal(s.regrowing.length,0);assert.ok(s.bodies.every(b=>b.plugin.grow===undefined),'swelling finishes');
  assert.equal(s.joints.filter(c=>c.plugin.joint&&c.bodyA.plugin.entityId===e.id).length,16);assert.equal(e.joints.length,16);assert.equal(e.bodies.length,17);assert.equal(new Set(e.bodies.map(b=>b.plugin.slot)).size,17);
  const remains=s.entities.filter(x=>x!==e&&x.kind==='human');assert.equal(remains.length,2,'each severed piece is remains of its own');assert.equal(remains.reduce((n,x)=>n+x.bodies.length,0),4);assert.ok(remains.every(x=>!x.alive));
  assert.ok(e.bodies.every(b=>b.plugin.severed.length===0));advance(s,600);for(const b of s.bodies)assert.ok(Number.isFinite(b.position.x));assert.ok(s.canStand(e)&&e.bodies[2].position.y<505,'regrown body should stand');
  for(const c of s.joints.filter(c=>c.plugin.joint))assert.ok(Constraint.currentLength(c)<3,`${c.plugin.name} not seated`);
  assert.equal(s.regenerate(e.bodies[2]),0,'nothing missing');assert.equal(s.regenerate(s.spawn('crate',300,300).bodies[0]),0);
});
test('reattach puts a severed limb back on its own ragdoll, from either end',()=>{
  for(const from of ['limb','body']){const s=new Simulation();const e=s.spawn('human',1000,555),other=s.spawn('human',1400,555);advance(s,30);
    const forearm=e.bodies[6],hand=e.bodies[7];s.sever(s.joints.find(c=>c.plugin.name==='elbow'&&c.bodyA.plugin.entityId===e.id));assert.ok(!e.bodies.includes(forearm)&&s.getEntity(forearm).alive===false,'a severed limb is no longer part of the body');Body.setVelocity(forearm,{x:-8,y:-4});advance(s,180);
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
  const easy=pull(2),firm=pull(30);assert.ok(easy<30&&firm>easy*5,`a 60px pull should free the blade within a second, took ${easy} steps`);assert.ok(firm>easy,'a higher grip should hold longer');
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
  const group=e=>e.bodies[0].collisionFilter.group,loose=(e,slots)=>s.bodies.filter(b=>b.collisionFilter.group===group(e)&&slots.includes(b.plugin.slot));loose(human,[9,10]).forEach(b=>s.removeBody(b));const stump=human.bodies.find(b=>b.plugin.slot===8),metal=loose(bot,[6])[0];
  assert.equal(s.graft(stump,metal),'');assert.equal(metal.plugin.slot,9,'left forearm mirrored to the right side');assert.equal(metal.plugin.entityId,human.id);assert.equal(metal.collisionFilter.group,stump.collisionFilter.group);
  assert.equal(human.bodies.length,17);assert.equal(bot.bodies.length,15);assert.equal(metal.plugin.kind,'android','it stays a metal arm');assert.ok(metal.plugin.surge>0&&human.surge>0);
  const seam=s.joints.find(c=>c.bodyB===metal&&c.plugin.name==='elbow');assert.ok(seam&&Constraint.currentLength(seam)<1);advance(s,300);assert.ok(Constraint.currentLength(seam)<3);for(const b of s.bodies)assert.ok(Number.isFinite(b.position.x));
  assert.notEqual(s.graft(stump,metal),'','already attached');assert.notEqual(s.graft(human.bodies[2],bot.bodies.find(b=>b.plugin.slot===2)),'','a whole android is not a limb');assert.notEqual(s.graft(stump,s.spawn('crate',300,300).bodies[0]),'');
});
test('a selected hand equips the nearest object in reach, levels and fires it, and lets go when it is taken or the holder dies',()=>{
  const s=new Simulation();const e=s.spawn('human',1000,555);advance(s,30);const hand=e.bodies[10],far=s.spawn('gun',hand.position.x+120,hand.position.y).bodies[0];assert.equal(s.equip(hand),'','out of reach');
  const gun=s.spawn('gun',hand.position.x+40,hand.position.y).bodies[0];assert.match(s.equip(hand),/pistol/);assert.equal(s.held(hand),gun);assert.equal(gun.collisionFilter.group,hand.collisionFilter.group);assert.equal(s.equip(hand),'','one thing per hand');
  advance(s,240);assert.ok(Math.hypot(gun.position.x-hand.position.x,gun.position.y-hand.position.y)<30,'gun should stay in the hand');assert.ok(e.bodies[2].position.y<505,'holding a pistol should not topple anyone');assert.ok(Math.abs(gun.angle)<.25,`pistol should be held level, angle ${gun.angle}`);
  const target=s.spawn('crate',hand.position.x+300,gun.position.y).bodies[0];s.freeze(target);Body.setPosition(target,{x:hand.position.x+300,y:gun.position.y});assert.equal(s.activate(hand),'Pistol fired');advance(s,12);/* the round takes a moment to get there */assert.ok(target.plugin.hp<80||far.plugin.hp<170,'the shot should hit something ahead');
  const saved=new Simulation();saved.restore(JSON.parse(JSON.stringify(s.serialize())));assert.equal(saved.joints.filter(c=>c.plugin.hold).length,2);advance(saved,30);assert.equal(saved.joints.filter(c=>c.plugin.hold).length,2);
  s.beginDrag(gun,{...gun.position});assert.equal(s.held(hand),null,'grabbing it takes it out of the hand');assert.equal(gun.collisionFilter.group,0);assert.equal(gun.plugin.heldBy,undefined);s.endDrag();
  Body.setPosition(gun,{x:hand.position.x+10,y:hand.position.y});s.equip(hand);assert.equal(s.held(hand),gun);e.alive=false;s.step();assert.equal(s.held(hand),null,'dropped on death');
});
test('a lifted ragdoll dangles from where it is held, then lands, crumples and gets up',()=>{
  const s=new Simulation();const e=s.spawn('human',1000,555);advance(s,60);const foot=e.bodies[13],chest=e.bodies[2];s.beginDrag(foot,{...foot.position});
  for(let i=0;i<360;i++){s.moveDrag({x:1000,y:Math.max(250,foot.position.y-6)});s.step();}
  assert.ok(chest.position.y>foot.position.y+50,'held by a foot, the body should hang below it');assert.ok(Math.abs(Math.atan2(Math.sin(chest.angle),Math.cos(chest.angle)))>2,`the chest should hang upside down, angle ${chest.angle}`);
  assert.equal(s.joints.filter(c=>c.plugin.joint).length,16,'carrying must not tear anyone apart');s.endDrag();advance(s,45);assert.ok(chest.position.y>540,'it should land in a heap, not on its feet');advance(s,600);assert.ok(chest.position.y<505&&Math.abs(Math.sin(chest.angle))<.3&&Math.cos(chest.angle)>0,'and then get back up');
});
test('bullets lose power with distance; a distant one stops in what it hits, a close one goes clean through with an entry and an exit wound',()=>{
  const shot=(from)=>{const s=new Simulation();s.gravity=0;s.configure({gravity:0,autoBalance:false,organDamage:false});const e=s.spawn('human',1000,400),behind=s.spawn('human',1150,400),head=e.bodies[0],y=head.position.y;
    assert.equal(s.shoot({x:head.bounds.min.x-from,y},{x:1600,y}),head);return {head:head.plugin,e,behind,others:e.bodies.filter(b=>b!==head&&b.plugin.hp<100)};};
  const far=shot(650),near=shot(12);assert.ok(100-near.head.hp>0&&far.head.hp>near.head.hp+5,`a close shot should hurt more: far leaves ${far.head.hp}, near ${near.head.hp}`);
  assert.equal(far.head.wounds.filter(w=>w.type==='exit').length,0,'a spent bullet stays in');assert.ok(far.behind.bodies.every(b=>b.plugin.hp===100));assert.equal(far.others.length,0,'and hurts nothing but what it hit');
  const entry=near.head.wounds.find(w=>w.type==='bullet'),exit=near.head.wounds.find(w=>w.type==='exit');assert.ok(entry&&exit,'a close shot goes through and through');assert.ok(exit.x>entry.x&&exit.radius>entry.radius,'in one side, out the other, and bigger on the way out');
  assert.ok(near.behind.bodies.some(b=>b.plugin.hp<100),'and carries on into whoever is behind');
  const again=new Simulation();again.configure({organDamage:false});const e=again.spawn('human',1000,555),head=e.bodies[0],y=head.position.y;for(let i=0;i<2;i++)again.shoot({x:head.bounds.min.x-650,y},{x:1600,y});assert.equal(head.plugin.wounds.filter(w=>w.type==='exit').length,1,'a second distant bullet finds the first one\'s hole');
  const arm=new Simulation();arm.configure({organDamage:false});const a=arm.spawn('human',1000,555),hand=a.bodies[10];arm.damage(hand,40,hand.position,'bullet',{x:1,y:0});assert.ok(!(a.stun>0)&&!(a.stunNext>0),'a hand wound does not knock anyone down');
  const hs=new Simulation();const h=hs.spawn('human',1000,555).bodies[0];hs.shoot({x:h.bounds.min.x-12,y:h.position.y},{x:1600,y:h.position.y});const he=hs.getEntity(h);assert.ok(he.stun>0||he.stunNext>0||!he.alive,'a head shot does');
});
test('electric shocks burn a mark where the current is strongest, never bleed, and weaken with each hop',()=>{
  const s=new Simulation();const e=s.spawn('human',1000,555);s.shock(e.bodies[2]);assert.ok(e.bodies.every(b=>b.plugin.wounds.every(w=>w.type==='shock')&&!b.plugin.bleed));const marked=e.bodies.filter(b=>b.plugin.wounds.length).length;assert.ok(marked>=1&&marked<=6,`${marked} parts marked`);s.shock(e.bodies[2]);assert.equal(e.bodies[2].plugin.wounds.length,1,'a second shock deepens the same mark');const hurt=e.bodies.map(b=>100-b.plugin.hp).filter(Boolean);assert.ok(Math.max(...hurt)>Math.min(...hurt)*3,'far parts take much less');
});
// ---- gore spec, section 1: damage model
const dry=body=>{for(const w of body.plugin.wounds)w.bleed=0;body.plugin.bleed=0;}; // stop the visible bleeding so a test can watch something else
const fresh=(set={})=>{const s=new Simulation();s.configure({stunScale:0,...set});const e=s.spawn('human',1000,555);return {s,e,part:n=>e.bodies.find(b=>b.plugin.part===n)};};
test('each damage type is its own kind of injury',()=>{
  const hurt=type=>{const {s,part}=fresh();const thigh=part('thigh');s.damage(thigh,30,thigh.position,type);return thigh.plugin;};
  const blunt=hurt('impact'),cut=hurt('cut'),stab=hurt('stab'),burn=hurt('burn');for(const p of [blunt,cut,stab,burn])assert.equal(p.hp,70,'hp loss is the same for every type');
  assert.ok(blunt.bone<cut.bone&&blunt.bleed<cut.bleed&&cut.bleed<stab.bleed,'blunt breaks bone, cuts bleed, stabs bleed most');assert.equal(burn.bleed,0);assert.equal(blunt.wounds[0].type,'impact');assert.equal(stab.wounds[0].type,'stab');
  const {s,part}=fresh();const arm=part('upper arm');s.damage(arm,40,arm.position,'stab');const bleeding=arm.plugin.bleed;s.damage(arm,20,arm.position,'burn');assert.ok(arm.plugin.bleed<bleeding,'a burn cauterises');
  s.ignite(arm);const before=arm.plugin.bleed;advance(s,30);assert.ok(arm.plugin.bleed<before,'so does being on fire');
});
test('a powerful round goes straight through a fresh body part: entry, exit, and the body behind is hit',()=>{
  const s=new Simulation();s.gravity=0;s.configure({gravity:0,autoBalance:false,bulletDamage:120,organDamage:false});const front=s.spawn('human',1000,400),back=s.spawn('human',1150,400),y=front.bodies[0].position.y; // head height: nothing hangs in front of it
  s.shoot({x:700,y},{x:1500,y});const belly=front.bodies[0].plugin;assert.ok(belly.wounds.some(w=>w.type==='bullet')&&belly.wounds.some(w=>w.type==='exit'));assert.ok(back.bodies.some(b=>b.plugin.hp<100),'the body behind should be hit');
  const entry=belly.wounds.find(w=>w.type==='bullet'),exit=belly.wounds.find(w=>w.type==='exit');assert.ok(exit.x>entry.x&&exit.radius>entry.radius,'exit wound is on the far side and larger');
});
test('a heart shot kills without severing anything, and says why',()=>{
  const {s,e,part}=fresh();const chest=part('chest');s.damage(chest,55,{x:chest.position.x,y:chest.position.y-10},'bullet'); // the heart sits top centre in the chest
  assert.equal(e.alive,false);assert.equal(e.causeOfDeath,'heart destroyed');assert.equal(s.joints.filter(c=>c.plugin.joint).length,16);assert.ok(chest.plugin.hp>30,'the chest itself is far from destroyed');
  const off=fresh({organDamage:false});const c=off.part('chest');off.s.damage(c,55,{x:c.position.x,y:c.position.y-10},'bullet');assert.equal(off.e.alive,true,'with organ damage off it is just a chest wound');
  const bot=new Simulation();const a=bot.spawn('android',1000,555),ac=a.bodies[2];bot.damage(ac,55,{x:ac.position.x,y:ac.position.y-10},'bullet');assert.equal(a.alive,true);assert.equal(a.organs,undefined);assert.ok(!a.pain,'androids feel nothing');
});
test('brain, lungs and gut each fail in their own way',()=>{
  const b=fresh({stunScale:1});const head=b.part('head');b.s.damage(head,55,{x:head.position.x,y:head.position.y-8},'bullet');assert.ok(b.e.alive&&b.e.stun>5,'one head shot: a long blackout');b.s.step();assert.equal(b.e.consciousness,'unconscious');
  b.s.damage(head,55,{x:head.position.x,y:head.position.y-8},'bullet');assert.equal(b.e.causeOfDeath,'brain destroyed');
  const l=fresh();const chest=l.part('chest');for(let i=0;i<4;i++){l.s.damage(chest,25,{x:chest.position.x+12,y:chest.position.y-14},'stab');chest.plugin.hp=100;} /* keep the chest itself whole: this is about the lungs */ assert.equal(l.e.organs.lungs,0);assert.equal(l.e.organs.heart,100);l.e.blood=100;l.e.pain=0;dry(chest); // isolate suffocation from blood loss and pain
  const seen=new Set();for(let i=0;i<1800&&l.e.alive;i++){l.s.step();seen.add(l.e.consciousness);}assert.equal(l.e.causeOfDeath,'suffocation');assert.deepEqual([...seen],['awake','dazed','unconscious','dead']);
  const g=fresh();const belly=g.part('abdomen');g.s.damage(belly,50,belly.position,'stab');dry(belly);const blood=g.e.blood,drops=g.s.particles.length;g.s.particles.length=0;advance(g.s,300);
  assert.ok(g.e.blood<blood-1,'internal bleeding drains blood');assert.equal(g.s.particles.filter(p=>p.type==='blood').length,0,'with nothing to see');assert.ok(belly.plugin.bruise>0,'except a spreading bruise');
});
test('fractures: a broken leg carries no weight, two broken legs cannot stand, and healing mends them',()=>{
  const {s,e,part}=fresh();advance(s,30);const shin=e.bodies[12],foot=e.bodies[13],other=e.bodies[16];s.damage(shin,60,shin.position,'impact');assert.ok(s.fractured(shin));assert.ok(!s.bears(foot)&&s.bears(other));assert.ok(!s.canStand(e),'a broken leg cannot be stood around');assert.equal(s.capability(e),'crawl');
  assert.equal(s.joints.filter(c=>c.plugin.joint).length,16,'fractured is not severed');advance(s,600);assert.ok(part('chest').position.y>540,'it should be down and stay down');
  const amputee=fresh();amputee.s.sever(amputee.s.joints.find(c=>c.plugin.name==='hip'));amputee.e.bodies.forEach(b=>{for(const w of b.plugin.severed)w.bleed=0;});assert.ok(amputee.s.canStand(amputee.e),'a missing leg is different: one good leg is enough to stand on');
  s.heal(shin);assert.ok(!s.fractured(shin)&&s.canStand(e));
});
test('pain rises with injury and ebbs; blood loss passes through dazed and unconscious before death',()=>{
  const {s,e,part}=fresh();const hand=part('hand'),head=part('head');s.damage(hand,20,hand.position,'impact');const small=e.pain;assert.ok(small>0);advance(s,300);assert.ok(e.pain<small,'pain ebbs');
  const a=fresh(),b=fresh();a.s.damage(a.part('thigh'),20,a.part('thigh').position,'impact');b.s.damage(b.part('head'),20,b.part('head').position,'impact');assert.ok(b.e.pain>a.e.pain,'the head hurts more');
  const d=fresh({organDamage:false});d.s.sever(d.s.joints.find(c=>c.plugin.name==='hip'));const seen=[];for(let i=0;i<20000&&d.e.alive;i++){d.s.step();if(seen[seen.length-1]!==d.e.consciousness)seen.push(d.e.consciousness);}
  assert.deepEqual(seen,['awake','dazed','unconscious','dead']);assert.equal(d.e.causeOfDeath,'blood loss');
});
test('injuries survive save and load, heal clears them, and old saves still load',()=>{
  const {s,e,part}=fresh();const belly=part('abdomen');s.damage(belly,40,belly.position,'stab');s.step();const data=JSON.parse(JSON.stringify(s.serialize()));
  const r=new Simulation();r.restore(data);const re=r.entities[0];assert.deepEqual(re.organs,e.organs);assert.ok(Math.abs(re.pain-e.pain)<1e-9);assert.equal(r.bodies.find(b=>b.plugin.part==='abdomen').plugin.internal,belly.plugin.internal);
  r.heal(r.bodies[0]);assert.equal(re.organs,undefined);assert.equal(re.pain,0);assert.ok(r.bodies.every(b=>!b.plugin.internal&&!b.plugin.bruise&&!(b.plugin.wounds||[]).length));
  for(const x of data.entities){delete x.pain;delete x.organs;delete x.oxygen;delete x.consciousness;delete x.causeOfDeath;}const old=new Simulation();old.restore(data);advance(old,60);assert.ok(old.entities[0].alive&&Number.isFinite(old.entities[0].oxygen));
  const dead=fresh();dead.s.kill(dead.e,'testing');dead.s.revive(dead.e.bodies[0]);assert.equal(dead.e.causeOfDeath,undefined);assert.equal(dead.e.consciousness,'awake');
});
// ---- gore spec, section 2: blood
test('an arterial wound drains blood far faster than a bruise from an equal blow',()=>{
  const drain=(type)=>{const {s,e,part}=fresh({organDamage:false});const thigh=part('thigh');s.damage(thigh,40,thigh.position,type);advance(s,600);return 100-e.blood;};
  const bruise=drain('impact'),artery=drain('stab');assert.ok(artery>bruise*6,`artery ${artery} vs bruise ${bruise}`);
  const off=fresh({organDamage:false,arterialSpurts:false});const t=off.part('thigh');off.s.damage(t,40,t.position,'stab');assert.equal(t.plugin.wounds[0].artery,undefined);advance(off.s,600);assert.ok(100-off.e.blood<artery*.6,'with spurts off a thigh stab is an ordinary wound');
  const shin=fresh();const sh=shin.part('shin');shin.s.damage(sh,40,sh.position,'stab');assert.equal(sh.plugin.wounds[0].artery,undefined,'no artery in the shin');
});
test('a still wound clots: its bleeding strictly decreases, and slower on a limb that keeps moving',()=>{
  const {s,e,part}=fresh({autoBalance:false,gravity:0});s.gravity=0;const arm=part('forearm');s.damage(arm,40,arm.position,'cut');let last=arm.plugin.bleed;assert.ok(last>.3);
  for(let i=0;i<20;i++){advance(s,30);assert.ok(arm.plugin.bleed<last,`bleed rose or stalled at ${i}`);last=arm.plugin.bleed;}
  const moving=fresh({autoBalance:false,gravity:0});moving.s.gravity=0;const m=moving.part('forearm');moving.s.damage(m,40,m.position,'cut');for(let i=0;i<600;i++){Body.setVelocity(m,{x:Math.sin(i/5)*3,y:0});moving.s.step();}assert.ok(m.plugin.bleed>last,'movement keeps a wound open');
  const again=arm.plugin.wounds[0].bleed;s.damage(arm,10,arm.position,'impact');assert.ok(arm.plugin.wounds[0].bleed>again,'a new blow on an old wound opens it again');
});
test('the heart races with pain and early blood loss, then fails; spurts follow the pulse',()=>{
  const {s,e,part}=fresh();advance(s,10);const calm=e.heartRate;assert.ok(calm>=65&&calm<=80);s.damage(part('pelvis'),40,part('pelvis').position,'impact');s.step();assert.ok(e.heartRate>calm+20);
  e.pain=0;e.blood=70;s.step();const racing=e.heartRate;e.blood=30;s.step();assert.ok(e.heartRate<racing,'a failing heart slows');assert.ok(e.pulse>=0&&e.pulse<=1);
});
test('blood lands on objects and walls where it hits, in their own frame, and stays capped',()=>{
  const s=new Simulation();s.gravity=0;s.configure({gravity:0});const crate=s.spawn('crate',1000,300).bodies[0];for(let i=0;i<40;i++)s.emit(1000+((i%7)-3)*6,240,0,3,3,3,'#922c33',2,'blood');advance(s,60);
  assert.ok(crate.plugin.stains.length>0&&crate.plugin.stains.length<=10);for(const st of crate.plugin.stains)assert.ok(Math.abs(st.x)<=27&&Math.abs(st.y)<=27,'stains are in the crate\'s own frame');
  const before={...crate.plugin.stains[0]};Body.setAngle(crate,1);Body.setPosition(crate,{x:1500,y:500});assert.deepEqual({x:crate.plugin.stains[0].x,y:crate.plugin.stains[0].y},{x:before.x,y:before.y},'so they turn and travel with it');
  for(let i=0;i<8;i++)s.emit(8,300+i*10,-4,0,3,3,'#922c33',2,'blood');advance(s,30);assert.ok(s.stains.some(st=>st.wall&&st.x<3),'walls take blood too');
  const none=new Simulation();none.configure({decals:false});const c=none.spawn('crate',1000,620).bodies[0];for(let i=0;i<30;i++)none.emit(1000,560,0,3,3,3,'#922c33',2,'blood');advance(none,60);assert.ok(!c.plugin.stains?.length&&none.stains.length===0,'decals off: no stains at all');
});
test('drops on the floor merge into one pool that grows to a limit, dries in about 30 s, and the count stays capped',()=>{
  const s=new Simulation();for(let i=0;i<400;i++){s.emit(1000+((i*7)%11)-5,640,0,2,3,3,'#922c33',2,'blood');if(i%4===0)s.step();}advance(s,30);
  const pools=s.stains.filter(st=>Math.abs(st.x-1000)<60);assert.equal(pools.length,1,'one pool, not a pile of dots');assert.ok(pools[0].r>12&&pools[0].r<=46);assert.ok(pools[0].wet>.8);advance(s,60*31);assert.equal(pools[0].wet,0,'dry after half a minute');
  const b=new Simulation();b.configure({maxStains:60,stainLifetime:0,organDamage:false,autoBalance:false});const e=b.spawn('human',1000,555);for(const name of ['hip','shoulder','knee'])b.sever(b.joints.find(c=>c.plugin.name===name));
  let peak=0;for(let i=0;i<3600;i++){if(i%300===0)for(const p of e.bodies)Body.setVelocity(p,{x:(i%600?-6:6),y:-3});b.step();peak=Math.max(peak,b.stains.length);}assert.ok(peak<=60,`stain count reached ${peak}`);assert.ok(b.stains.length>5);
  const fade=new Simulation();fade.configure({stainLifetime:10});fade.pool(1000,5);advance(fade,60*11);assert.equal(fade.stains.length,0,'stains fade after their lifetime');
});
test('blood only stains: a body dragged through a wet pool leaves no smear and no footprints',()=>{
  const s=new Simulation();const pool=s.pool(1000,5);pool.r=30;const crate=s.spawn('crate',960,622).bodies[0];advance(s,20);for(let i=0;i<90;i++){Body.setVelocity(crate,{x:3,y:crate.velocity.y});s.step();}assert.equal(s.stains.length,1);assert.ok(!s.stains.some(st=>st.smear||st.print));
});
test('androids leak coolant and sparks instead of blood',()=>{
  const s=new Simulation();const bot=s.spawn('android',1000,555),chest=bot.bodies[2];s.shoot({x:chest.bounds.min.x-8,y:chest.position.y},{x:chest.bounds.min.x+90,y:chest.position.y});const holed=bot.bodies.find(b=>b.plugin.leak>0);assert.ok(holed);
  let oil=0;for(let i=0;i<480;i++){s.step();oil+=s.particles.filter(p=>p.type==='oil').length;}const marks=[...s.stains,...s.bodies.flatMap(b=>b.plugin.stains||[])];
  assert.ok(oil>0,'coolant should come out');assert.ok(marks.length>0&&marks.every(st=>st.oil),'and whatever it lands on is stained with coolant, never blood');assert.ok(!s.particles.some(p=>p.type==='blood'));assert.equal(bot.blood,100);
});
test('blood state survives save and load',()=>{
  const {s,e,part}=fresh({organDamage:false});const thigh=part('thigh');s.damage(thigh,40,thigh.position,'stab');advance(s,240);s.stain(thigh,thigh.position,3);const data=JSON.parse(JSON.stringify(s.serialize()));
  const r=new Simulation();r.restore(data);const t=r.bodies.find(b=>b.plugin.slot===thigh.plugin.slot);assert.deepEqual(t.plugin.wounds,thigh.plugin.wounds);assert.deepEqual(t.plugin.stains,JSON.parse(JSON.stringify(thigh.plugin.stains)));assert.equal(r.stains.length,s.stains.length);
  const blood=r.entities[0].blood;advance(r,300);assert.ok(r.entities[0].blood<blood,'and the wound keeps bleeding after loading');
  for(const b of data.bodies)for(const w of b.plugin.wounds||[])delete w.bleed;const old=new Simulation();old.restore(data);advance(old,60);assert.ok(old.bodies.every(b=>Number.isFinite(b.plugin.bleed??0)),'wounds from an old save have no rate of their own and simply do not bleed');
});
// ---- gore spec, section 3: gibs and spray
test('gibs come from crushed and blasted limbs, trail blood, respect the settings, stay capped and expire',()=>{
  const s=new Simulation();s.configure({gibCount:4});const e=s.spawn('human',1000,555);s.explode(1000,540,220,1.4);advance(s,4);const gibs=()=>s.bodies.filter(b=>b.plugin.gib);assert.ok(gibs().length>=3,'a blast that destroys limbs throws gibs');
  assert.ok(gibs().some(b=>b.plugin.material==='bone')&&gibs().some(b=>b.plugin.material==='flesh'));s.particles.length=0;advance(s,20);assert.ok(s.particles.some(p=>p.type==='blood'),'flying gibs trail blood');
  for(let i=0;i<30;i++)s.gibs(600+i*10,300,'flesh',{x:0,y:0});assert.ok(gibs().length<=36,`gib count ${gibs().length}`);advance(s,60*18);assert.equal(gibs().length,0,'gibs do not last');
  for(const set of [{fragments:false},{gibCount:0}]){const off=new Simulation();off.configure(set);off.gibs(1000,300,'flesh',{x:0,y:0});assert.equal(off.bodies.length,0);}
});
test('blood sprays along the blow: an exit wound throws it forward, an entry wound mostly back',()=>{
  const flow=(forward)=>{const s=new Simulation();s.spray({x:1000,y:300},{x:1,y:0},200,6,forward);return s.particles.reduce((n,p)=>n+p.vx,0)/s.particles.length;};
  assert.ok(flow(1)>2,'exit: forward');assert.ok(flow(-.35)<flow(.6),'an entry wound sends more back than a cut does');const s=new Simulation();s.spray({x:0,y:0},null,20,5,1);assert.equal(s.particles.length,20,'no direction: a plain burst');
});
// ---- reaction spec, section 1: pose-target muscles
test('an undamaged ragdoll stands still for ten seconds',()=>{
  const s=new Simulation();const e=s.spawn('human',1000,555);advance(s,120);const chest=e.bodies[2],x=chest.position.x;let low=1e9,high=-1e9;for(let i=0;i<600;i++){s.step();low=Math.min(low,chest.position.y);high=Math.max(high,chest.position.y);}
  assert.ok(high-low<1.5,`chest height wandered ${high-low}px`);assert.ok(Math.abs(chest.position.x-x)<2,`drifted ${chest.position.x-x}px`);assert.ok(chest.speed<.3&&Math.abs(chest.angle)<.05);assert.equal(s.joints.length,16);
});
test('muscles pull a bent joint back to the pose, but not through a fracture',()=>{
  const bend=(fracture)=>{const s=new Simulation();const e=s.spawn('human',1000,555);advance(s,60);const upper=e.bodies[8],fore=e.bodies[9];if(fracture)fore.plugin.bone=20;
    const rest=fore.angle-upper.angle,elbow=s.joints.find(c=>c.bodyB===fore),pivot=Constraint.pointAWorld(elbow);for(const b of [fore,e.bodies[10]])Body.rotate(b,-1.2,pivot);const bent=Math.abs(fore.angle-upper.angle-rest);advance(s,20);return {bent,after:Math.abs(fore.angle-upper.angle-rest)};};
  const healthy=bend(false),broken=bend(true);assert.ok(healthy.bent>.5,'the test should really bend the elbow');assert.ok(healthy.after<.2,`a healthy elbow snaps straight within a third of a second, still at ${healthy.after}`);assert.ok(broken.after>.35,`a fractured forearm has no muscle: it only swings down under its own weight, at ${broken.after}`);
});
test('muscles are internal: in zero gravity a living ragdoll gains no momentum from them',()=>{
  const s=new Simulation();s.configure({gravity:0});const e=s.spawn('human',1000,300);for(const b of e.bodies)Body.setAngularVelocity(b,(b.plugin.slot%3-1)*.05); // limbs flung about, so the muscles have work to do
  const momentum=()=>e.bodies.reduce((m,b)=>({x:m.x+b.velocity.x*b.mass,y:m.y+b.velocity.y*b.mass}),{x:0,y:0});const before=momentum();advance(s,300);const after=momentum(),mass=e.bodies.reduce((n,b)=>n+b.mass,0);
  assert.ok(Math.hypot(after.x-before.x,after.y-before.y)/mass<.05,`centre of mass sped up by ${Math.hypot(after.x-before.x,after.y-before.y)/mass} px/step`);for(const b of e.bodies)assert.ok(b.speed<20&&Number.isFinite(b.position.x));
});
test('the pose blend is part of a save',()=>{
  const s=new Simulation();const e=s.spawn('human',1000,555);advance(s,30);assert.equal(e.poseNow.angle.length,17);const r=new Simulation();r.restore(JSON.parse(JSON.stringify(s.serialize())));assert.deepEqual(r.entities[0].poseNow,JSON.parse(JSON.stringify(e.poseNow)));advance(r,120);assert.ok(r.bodies[2].position.y<505);
});
// ---- reaction spec, section 2: immediate hit reactions
const standing=(kind='human',set={})=>{const s=new Simulation().seed(9);s.configure({organDamage:false,...set});const e=s.spawn(kind,1000,555);advance(s,120);return {s,e,chest:e.bodies[2]};};
const rel=(e,slot,parent)=>{const a=e.bodies[slot].angle-e.bodies[parent].angle;return Math.atan2(Math.sin(a),Math.cos(a));};
test('a small hit is a flinch: the struck arm pulls in, the head snaps away, and it passes',()=>{
  const {s,e}=standing('human',{awareness:false});const fore=e.bodies[9],restElbow=rel(e,9,8),restHead=rel(e,0,1);s.damage(fore,10,fore.position,'impact',{x:1,y:0});let elbow=0,head=0; // awareness off: this is about the reflex alone, not where it looks afterwards
for(let i=0;i<24;i++){s.step(1000/120);elbow=Math.max(elbow,Math.abs(rel(e,9,8)-restElbow));head=Math.max(head,rel(e,0,1)-restHead);}
  assert.ok(elbow>.12,`elbow only reached ${elbow}`);assert.ok(head>.04,`the head is knocked the way the blow was going, got ${head}`);assert.ok(!(e.stun>0)&&!(e.stagN>0),'a tap on the arm neither staggers nor drops anyone');
  advance(s,90);assert.ok(Math.abs(rel(e,9,8)-restElbow)<.1&&Math.abs(rel(e,0,1)-restHead)<.1,'and it is over within a second or so');
  const tiny=standing();tiny.s.damage(tiny.e.bodies[9],3,tiny.e.bodies[9].position,'impact',{x:1,y:0});let twitch=0;for(let i=0;i<24;i++){tiny.s.step(1000/120);twitch=Math.max(twitch,Math.abs(rel(tiny.e,9,8)-restElbow));}assert.ok(twitch<elbow*.6,'a tiny hit is only a twitch');
});
test('a medium hit staggers with recovery steps and stays up; a big one goes down through the stagger and gets up again',()=>{
  const mid=standing();mid.s.damage(mid.chest,24,mid.chest.position,'impact',{x:1,y:0});assert.ok(mid.e.stagN>=1&&mid.e.stagDir===1);assert.ok(!(mid.e.stunNext>0));let low=0,hipSwing=0;
  for(let i=0;i<360;i++){mid.s.step();low=Math.max(low,mid.chest.position.y);hipSwing=Math.max(hipSwing,Math.abs(rel(mid.e,11,4)),Math.abs(rel(mid.e,14,4)));}assert.ok(low<520,`a stagger should not put it on the floor, chest sank to ${low}`);assert.ok(hipSwing>.15,'a leg should swing out to catch it');assert.ok(mid.chest.position.y<505&&Math.abs(mid.chest.angle)<.2);
  const big=standing();big.s.damage(big.chest,60,big.chest.position,'impact',{x:1,y:0});assert.ok(!(big.e.stun>0)&&big.e.stunNext>0,'the knockdown waits for the stagger');advance(big.s,30);assert.ok(big.e.stun>0);let floor=0;for(let i=0;i<150;i++){big.s.step();floor=Math.max(floor,big.chest.position.y);}assert.ok(floor>545,'it should go down');
  advance(big.s,480);assert.ok(big.chest.position.y<505&&Math.abs(big.chest.angle)<.25,'and get back up, torso and all, even with cracked ribs');
  const lying=standing();lying.e.stun=3;advance(lying.s,90);lying.s.damage(lying.chest,60,lying.chest.position,'impact',{x:1,y:0});assert.ok(lying.e.stun>=3&&!(lying.e.stagN>0),'a body already down is just stunned, it does not try to step');
});
test('a falling, conscious ragdoll gets its arms out on the side it is falling to, and lands on them',()=>{
  for(const dir of [1,-1]){const s=new Simulation();const e=s.spawn('human',1000,330);for(const b of e.bodies)Body.rotate(b,dir*1.35,{x:1000,y:330});let hands=null,body=null,shoulders=null,side=0;
    for(let i=0;i<150;i++){s.step();if(i===20){shoulders=[rel(e,5,2),rel(e,8,2)];side=e.braceDir;}if(hands===null&&[6,7,9,10].some(k=>s.touching.has(e.bodies[k])))hands=i;if(body===null&&[0,2].some(k=>s.touching.has(e.bodies[k])))body=i;}
    assert.equal(side,dir);for(const a of shoulders)assert.ok(a*dir<-.6,`arms should reach toward the fall (${dir}), shoulder at ${a}`);assert.ok(hands!==null&&(body===null||hands<body),'hands should reach the ground before the chest or head');}
  const out=new Simulation();const e=out.spawn('human',1000,330);e.stun=5;for(const b of e.bodies)Body.rotate(b,1.35,{x:1000,y:330});advance(out,40);assert.ok(!(e.bracing>0),'a stunned body does not brace');
});
test('androids stagger and brace too, but feel nothing',()=>{
  const {s,e,chest}=standing('android');s.damage(chest,24,chest.position,'impact',{x:-1,y:0});assert.ok(e.stagN>=1&&e.stagDir===-1);advance(s,240);assert.ok(chest.position.y<505);assert.ok(!e.pain);
});
// ---- reaction spec, section 4: the mobility ladder
const sever=(s,e,names)=>{for(const n of names)for(const c of s.joints.filter(c=>c.plugin.name===n&&c.bodyA.plugin.entityId===e.id))s.sever(c);for(const b of e.bodies)for(const w of b.plugin.severed||[])w.bleed=0;};
test('the mobility ladder picks the highest rung the remaining body allows',()=>{
  const rung=(prepare)=>{const s=new Simulation();const e=s.spawn('human',1000,555);prepare(s,e);return s.capability(e);};
  assert.equal(rung(()=>{}),'stand');assert.equal(rung((s,e)=>sever(s,e,['ankle'])),'kneel');assert.equal(rung((s,e)=>sever(s,e,['hip'])),'crawl');
  assert.equal(rung((s,e)=>{sever(s,e,['hip']);s.sever(s.joints.find(c=>c.plugin.name==='shoulder'));}),'drag');assert.equal(rung((s,e)=>sever(s,e,['hip','shoulder'])),'curl');
  assert.equal(rung((s,e)=>{e.pain=95;}),'curl','agony overrides everything');assert.equal(rung((s,e)=>{e.bodies[12].plugin.bone=20;e.bodies[6].plugin.bone=20;}),'drag','a broken leg and a broken arm leave one arm to drag with');
  const bot=new Simulation();const a=bot.spawn('android',1000,555);a.pain=95;assert.equal(bot.capability(a),'stand','androids have no pain to curl up from');
});
test('without feet it kneels upright; without legs it crawls the way it faces, then lies still',()=>{
  const k=new Simulation();k.configure({bleedRate:0,stunScale:0});const ke=k.spawn('human',1000,555);advance(k,60);sever(k,ke,['ankle']);advance(k,360);const kc=ke.bodies[2];assert.equal(ke.rung,'kneel');assert.ok(kc.position.y>520&&kc.position.y<575&&Math.abs(kc.angle)<.35,`kneeling chest at ${kc.position.y}, tilt ${kc.angle}`);
  // A body seen from the side cannot turn round: it crawls the way it faces, face down, whichever way the blow came from.
  for(const flip of [false,true]){const m=flip?-1:1,s=new Simulation().seed(6);s.configure({bleedRate:0,stunScale:0,organDamage:false,painReactions:false});const e=s.spawn('human',1000,555,flip);advance(s,60);sever(s,e,['hip']);const chest=e.bodies.find(b=>b.plugin.slot===2);
    for(const b of s.connected(chest))Body.rotate(b,m*1.4,chest.position);advance(s,90);s.damage(chest,8,chest.position,'impact',{x:-m,y:0});advance(s,60);const x=chest.position.x;advance(s,240);assert.equal(e.rung,'crawl'); // the first second is it rolling onto its front
    assert.ok((chest.position.x-x)*m>18,`crawled ${((chest.position.x-x)*m).toFixed(0)}px the way it faces (${m})`);assert.ok(chest.speed<6&&e.bodies.every(b=>Number.isFinite(b.position.x)));advance(s,420);assert.ok(e.idle,'after a few seconds it stops fleeing');const rest=chest.position.x;advance(s,300);assert.ok(Math.abs(chest.position.x-rest)<6,'and lies still');}
});
test('getting up is staged, and slower in pain',()=>{
  const rise=(pain)=>{const s=new Simulation();s.configure({organDamage:false});const e=s.spawn('human',1000,555);advance(s,60);for(const b of e.bodies)Body.rotate(b,Math.PI/2,{x:1000,y:640});const chest=e.bodies[2],stages=[];let up=null;
    for(let i=0;i<900&&up===null;i++){if(pain)e.pain=pain;s.step();const st=e.rise?e.rise.stage:-1;if(st>=0&&stages[stages.length-1]!==st)stages.push(st);if(chest.position.y<505&&Math.abs(chest.angle)<.3&&!e.rise)up=i/60;}return {stages,up};};
  const fit=rise(0),hurt=rise(60);assert.deepEqual(fit.stages,[0,1,2,3],'gather, push up, knees under, stand');assert.ok(fit.up!==null&&fit.up>1.2,`a staged get-up takes more than a second, took ${fit.up}`);assert.ok(hurt.up===null||hurt.up>fit.up*1.4,`pain should slow it: ${hurt.up} vs ${fit.up}`);
});
// ---- reaction spec, section 3: sustained pain behaviour
const handTo=(s,e,slot)=>{const hand=e.bodies.find(b=>b.plugin.slot===slot),part=e.bodies.find(b=>b.plugin.slot===e.hurtSlot),c=Math.cos(part.angle),n=Math.sin(part.angle);return Math.hypot(hand.position.x-(part.position.x+e.hurtX*c-e.hurtY*n),hand.position.y-(part.position.y+e.hurtX*n+e.hurtY*c));};
test('a hand goes to the wound: hit on the left arm, the right hand is on it within two seconds',()=>{
  const {s,e}=standing('human',{bleedRate:0});const arm=e.bodies[5];s.damage(arm,30,{x:arm.position.x,y:arm.position.y+4},'cut',{x:1,y:0});assert.equal(e.hurtSlot,5);const before=handTo(s,e,10);advance(s,120);
  assert.ok(e.clutching>=1);assert.ok(handTo(s,e,10)<16,`right hand is ${handTo(s,e,10).toFixed(1)}px from the wound (was ${before.toFixed(1)})`);assert.ok(e.bodies[2].position.y<505,'and it stays on its feet');
  const belly=standing('human',{bleedRate:0});belly.s.damage(belly.e.bodies[3],30,belly.e.bodies[3].position,'stab',{x:1,y:0});advance(belly.s,150);assert.equal(belly.e.clutching,2,'both hands for a wound in the trunk');assert.ok(handTo(belly.s,belly.e,7)<18&&handTo(belly.s,belly.e,10)<18);
  belly.e.pain=0;belly.e.hurtScore=0;advance(belly.s,120);assert.ok(Math.abs(rel(belly.e,9,8))<.35,'when it stops hurting the hands come away');
  const off=standing('human',{painReactions:false});off.s.damage(off.e.bodies[5],30,off.e.bodies[5].position,'cut');advance(off.s,120);assert.ok(!off.e.clutching,'pain reactions off: no clutching');
});
test('a hurt leg takes less of the load and the body leans over the good one; a very bad one is kept off the floor',()=>{
  const {s,e,chest}=standing('human',{bleedRate:0,stunScale:0});advance(s,30);assert.ok(Math.abs(e.loadLeft-.5)<.05,'sound legs share the load');
  const right=e.bodies[14];right.plugin.hp=55;advance(s,180);assert.ok(e.loadLeft>.7,`the sound leg should carry most of it, carries ${e.loadLeft}`);assert.ok(chest.position.y<505);
  right.plugin.hp=30;advance(s,240);assert.ok(rel(e,15,14)>.5,'a badly hurt leg is drawn up');assert.ok(chest.position.y<512&&Math.abs(chest.angle)<.25,'and it still stands');
});
test('electric shock locks every muscle rigid, then the body goes slack; androids lock too but feel nothing',()=>{
  for(const kind of ['human','android']){const {s,e,chest}=standing(kind,{organDamage:false});s.shock(chest);assert.ok(e.shockT>0&&!(e.stun>0),'no stun while the current flows');let spread=0;const pose=()=>[6,9,12,15].map(slot=>rel(e,slot,slot-1));const first=pose();
    for(let i=0;i<30;i++){s.step(1000/120);pose().forEach((a,k)=>spread=Math.max(spread,Math.abs(a-first[k])));}assert.ok(spread<.6,`locked joints moved ${spread}`);advance(s,30);assert.ok(e.stun>0,'then it goes limp');if(kind==='android'){assert.ok(!e.pain);assert.ok(!e.clutching);}}
});
test('being on fire hurts more and more, and sets a standing ragdoll staggering about',()=>{
  const {s,e,chest}=standing('human',{organDamage:false,bleedRate:0});s.ignite(e.bodies[8]);advance(s,60);const early=e.pain;assert.ok(early>3);assert.ok(e.stagN>0||e.stagDir,'it should be stumbling');advance(s,120);assert.ok(e.pain>early+10);
});
test('a living ragdoll breathes: the shoulders rise and fall, faster in pain, and the phase is saved',()=>{
  const swing=(pain)=>{const {s,e}=standing('human',{stunScale:0});let low=9,high=-9,beats=0,last=0;for(let i=0;i<600;i++){if(pain)e.pain=pain;s.step();const a=e.poseNow.angle[5];low=Math.min(low,a);high=Math.max(high,a);if(e.breath<last)beats++;last=e.breath;}return {range:high-low,beats};};
  const calm=swing(0),hurt=swing(50);assert.ok(calm.range>.03,'visible at rest');assert.ok(calm.beats>=1&&calm.beats<=3,`about 12 breaths a minute at rest, got ${calm.beats} in 10 s`);assert.ok(hurt.beats>calm.beats&&hurt.range>calm.range,'faster and deeper in pain');
  const {s,e}=standing();advance(s,77);const r=new Simulation();r.restore(JSON.parse(JSON.stringify(s.serialize())));assert.equal(r.entities[0].breath,e.breath);
  const off=standing('human',{breathing:false});let moved=0;const a0=off.e.poseNow.angle[5];for(let i=0;i<300;i++){off.s.step();moved=Math.max(moved,Math.abs(off.e.poseNow.angle[5]-a0));}assert.ok(moved<.01);
});
test('ten ragdolls in pain for thirty seconds: nothing blows up',()=>{
  const s=new Simulation().seed(11);s.configure({organDamage:false,bleedRate:.2});const all=[];for(let i=0;i<10;i++)all.push(s.spawn(i%4===3?'android':'human',400+i*180,555,i%2===1));advance(s,60);
  all.forEach((e,i)=>{const hit=e.bodies[[2,5,11,3,14,8,0,12,6,15][i]];s.damage(hit,28+i*3,hit.position,['impact','cut','stab','bullet','blast'][i%5],{x:i%2?1:-1,y:0});if(i===4)s.ignite(e.bodies[2]);if(i===7)s.shock(e.bodies[2]);});
  let top=0;for(let i=0;i<1800;i++){s.step();if(i%10===0)for(const b of s.bodies){assert.ok(Number.isFinite(b.position.x)&&Number.isFinite(b.angle),`NaN at step ${i}`);top=Math.max(top,b.speed);}}assert.ok(top<60,`a body reached ${top} px/step`);
});
// ---- reaction spec, section 6: consciousness and death
test('bleeding out is a descent: it sinks to its knees, slumps, passes out, dies, twitches once or twice, and then lies still and sleeps',()=>{
  const s=new Simulation().seed(5);s.configure({organDamage:false,stunScale:0});const e=s.spawn('human',1000,555);advance(s,60);const chest=e.bodies[2];s.sever(s.joints.find(c=>c.plugin.name==='shoulder'));
  const rungs=[],states=[];let kneltAt=null;for(let i=0;i<24000&&e.alive;i++){s.step();if(rungs[rungs.length-1]!==e.rung)rungs.push(e.rung);if(states[states.length-1]!==e.consciousness)states.push(e.consciousness);if(e.rung==='kneel'&&kneltAt===null)kneltAt=chest.position.y;}
  assert.deepEqual(states,['awake','dazed','unconscious','dead']);const order=rungs.filter((r,i)=>['stand','kneel','curl','limp'].includes(r)&&rungs.indexOf(r)===i);assert.deepEqual(order,['stand','kneel','curl','limp'],`went ${rungs.join('>')}`);assert.equal(e.causeOfDeath,'blood loss');
  assert.ok(e.twitchAt.length>=1,'a death by blood loss leaves a nerve or two to fire');let twitches=0,last=e.lastTwitch;for(let i=0;i<300;i++){s.step();if(e.lastTwitch!==last){twitches++;last=e.lastTwitch;}}assert.ok(twitches>=1&&twitches<=2,`${twitches} twitches`);assert.equal(e.twitchAt.length,0);
  advance(s,480);assert.ok(e.pin,'a dead ragdoll comes to rest and sleeps');const x=chest.position.x;advance(s,600);assert.equal(chest.position.x,x);
  const head=new Simulation();const h=head.spawn('human',1000,555);head.kill(h,'brain destroyed');assert.equal(h.twitchAt.length,0,'no last twitches without a brain to send them');
});
test('an unconscious ragdoll is limp, but wakes when what put it out recovers',()=>{
  const {s,e,chest}=standing('human',{stunScale:0,bleedRate:0});for(let i=0;i<270;i++){e.pain=99;s.step();}assert.equal(e.consciousness,'unconscious');assert.equal(e.rung,'limp');assert.ok(chest.position.y>560,'it should be on the floor');
  const breath=e.breath;advance(s,30);assert.notEqual(e.breath,breath,'still breathing');e.pain=0;advance(s,600);assert.equal(e.consciousness,'awake');assert.ok(chest.position.y<505,'and it gets back up');
});
test('a dazed ragdoll sways on its feet',()=>{
  const sway=(blood)=>{const {s,e,chest}=standing('human',{bleedRate:0});e.blood=blood;let low=1e9,high=-1e9;for(let i=0;i<600;i++){e.blood=blood;s.step();const over=chest.position.x-(e.bodies[13].position.x+e.bodies[16].position.x)/2;low=Math.min(low,over);high=Math.max(high,over);}return {range:high-low,state:e.consciousness,up:chest.position.y<512};};
  const clear=sway(100),dazed=sway(53);assert.equal(dazed.state,'dazed');assert.ok(dazed.up);assert.ok(dazed.range>clear.range+3,`dazed sway ${dazed.range} vs ${clear.range}`);
});
// ---- reaction spec, sections 5 and 7: awareness and its settings
test('a conscious ragdoll looks at what hurt it, at fire, and at something fast; an unconscious one and an android do not',()=>{
  const {s,e}=standing();const arm=e.bodies[5];s.damage(arm,10,arm.position,'impact',{x:1,y:0});advance(s,20);assert.equal(e.gaze,-1,'the blow came from the left');advance(s,200);assert.equal(e.gaze,0,'and a few seconds later it has stopped looking');
  const fire=standing();const crate=fire.s.spawn('crate',1180,622).bodies[0];fire.s.ignite(crate);advance(fire.s,20);assert.equal(fire.e.gaze,1);
  const ball=standing();ball.s.gravity=0;ball.s.configure({gravity:0});const b=ball.s.spawn('ball',780,300).bodies[0];Body.setVelocity(b,{x:0,y:-8});advance(ball.s,8);assert.equal(ball.e.gaze,-1,'something fast off to the left');
  const out=standing('human',{stunScale:0});out.e.stun=3;const c2=out.s.spawn('crate',1180,622).bodies[0];out.s.ignite(c2);advance(out.s,30);assert.ok(!out.e.gaze);
  const bot=standing('android');bot.s.ignite(bot.s.spawn('crate',1180,622).bodies[0]);advance(bot.s,30);assert.ok(!bot.e.gaze,'androids have no awareness');
  const off=standing('human',{awareness:false});off.s.ignite(off.s.spawn('crate',1180,622).bodies[0]);advance(off.s,30);assert.ok(!off.e.gaze);
});
test('something flying at its head: the arms go up before it lands',()=>{
  const {s,e}=standing();s.gravity=0;s.configure({gravity:0});const head=e.bodies[0],brick=s.spawn('brick',head.position.x-260,head.position.y).bodies[0];Body.setVelocity(brick,{x:9,y:0});let guarded=null,hit=null,reach=1e9;
  for(let i=0;i<60;i++){s.step();if(guarded===null&&e.guardT>0)guarded=i;if(hit===null&&e.hitTime>1.9)hit=i;reach=Math.min(reach,...[7,10].map(k=>Math.hypot(e.bodies[k].position.x-head.position.x,e.bodies[k].position.y-head.position.y)));}assert.ok(guarded!==null,'it should see it coming');assert.ok(hit===null||guarded<hit,'and guard before the impact');
  assert.ok(reach<48,`a hand should get up by the head, nearest it came was ${reach.toFixed(0)}px`);
  const miss=standing();miss.s.configure({gravity:0});const far=miss.s.spawn('brick',740,200).bodies[0];Body.setVelocity(far,{x:9,y:0});advance(miss.s,40);assert.ok(!(miss.e.guardT>0),'something that is going to miss is only watched');
});
test('heat close by makes it shrink away; a neighbour being hurt makes it start and look',()=>{
  const {s,e,chest}=standing();const over=()=>chest.position.x-(e.bodies[13].position.x+e.bodies[16].position.x)/2;const before=over(),crate=s.spawn('crate',1062,622).bodies[0];s.freeze(crate);crate.plugin.heat=600;advance(s,90);assert.equal(e.heatDir,-1);assert.ok(over()<before-2,`it should lean away from the heat: ${over()} vs ${before}`);
  const two=new Simulation();const a=two.spawn('human',1000,555),b=two.spawn('human',1200,555);advance(two,120);two.damage(a.bodies[2],30,a.bodies[2].position,'impact',{x:1,y:0});assert.ok(b.flinch>0&&b.flinchMag<.3,'a small start');advance(two,15);assert.equal(b.gaze,-1,'and a look');
  const far=new Simulation();const c=far.spawn('human',1000,555),d=far.spawn('human',1700,555);advance(far,120);far.damage(c.bodies[2],30,c.bodies[2].position,'impact',{x:1,y:0});assert.ok(!(d.flinch>0),'too far away to notice');
});
test('grunts are off by default and only come from conscious humans when on',()=>{
  const count=(kind,set)=>{const {s,e,chest}=standing(kind,set);let n=0;s.onEffect=t=>{if(t==='grunt')n++;};s.damage(chest,25,chest.position,'impact',{x:1,y:0});return n;};
  assert.equal(count('human',{}),0);assert.equal(count('human',{grunts:true}),1);assert.equal(count('android',{grunts:true}),0);
});
// ---- catalogue: melee
const {defs}=require('../engine.js');
const arena=(set={})=>{const s=new Simulation().seed(4);s.gravity=0;s.configure({gravity:0,organDamage:false,autoBalance:false,...set});const e=s.spawn('human',1000,400);e.alive=false;return {s,e,chest:e.bodies[2]};};
const hurl=(s,kind,target,speed,angle=Math.PI/2,from=-130)=>{const w=s.spawn(kind,target.position.x+from,target.position.y).bodies[0];Body.setAngle(w,angle);Body.setVelocity(w,{x:speed*Math.sign(-from),y:0});return w;};
test('every pointed melee weapon pierces when thrown point-first; blunt ones never do',()=>{
  for(const kind of ['knife','spear','lance','bolt','spike','crystal']){const {s,chest}=arena();const w=hurl(s,kind,chest,14,Math.PI/2,-(defs[kind].h/2+60));advance(s,60);assert.ok(w.plugin.stuck!==undefined,`${kind} did not lodge`);assert.equal(s.joints.filter(c=>c.plugin.pierce).length,2);}
  for(const kind of ['bat','hammer','rod','wrench','stick','axe']){const {s,chest}=arena();const w=hurl(s,kind,chest,14,Math.PI/2,-(defs[kind].h/2+60));advance(s,60);assert.equal(w.plugin.stuck,undefined,`${kind} should not pierce`);}
});
test('blunt weapons hit harder than their speed, and break bone rather than skin',()=>{
  const blow=(kind)=>{const {s,e}=arena();const w=hurl(s,kind,e.bodies[5],24,0,-70);advance(s,40);const hit=e.bodies.filter(b=>b.plugin.hp<100);return {hp:hit.reduce((n,b)=>n+100-b.plugin.hp,0),bone:Math.min(...e.bodies.map(b=>b.plugin.bone)),wounds:hit.flatMap(b=>b.plugin.wounds)};};
  const crate=blow('crate'),bat=blow('bat'),hammer=blow('hammer');assert.ok(crate.hp>0);assert.ok(bat.hp>crate.hp*1.4,`bat ${bat.hp} vs crate ${crate.hp}`);assert.ok(hammer.hp>crate.hp*1.4);assert.ok(bat.bone<crate.bone);assert.ok(bat.wounds.length&&bat.wounds.every(w=>w.type==='impact'));
});
test('an axe takes a limb off in one swing; a knife only cuts',()=>{
  const swing=(kind)=>{const {s,e}=arena();const w=hurl(s,kind,e.bodies[6],60,0,-70);advance(s,40);return {joints:s.joints.filter(c=>c.plugin.joint).length,wounds:e.bodies.flatMap(b=>b.plugin.wounds.map(x=>x.type))};};
  const axe=swing('axe'),knife=swing('knife');assert.ok(axe.joints<16,'the axe should sever');assert.equal(knife.joints,16);assert.ok(knife.wounds.includes('cut'));
});
test('powered blades only cut while they are on: the energy sword sears, the chainsaw keeps cutting',()=>{
  const {s,e}=arena();hurl(s,'esword',e.bodies[5],20,0,-60);advance(s,40);assert.ok(!e.bodies.some(b=>b.plugin.wounds.some(w=>w.type==='cut')),'switched off, it is a metal stick');
  const hot=arena();const lit=hurl(hot.s,'esword',hot.e.bodies[5],20,0,-60);hot.s.activate(lit);assert.equal(lit.plugin.active,true);advance(hot.s,40);const limb=hot.e.bodies.find(b=>b.plugin.wounds.some(w=>w.type==='cut'));assert.ok(limb,'a lit blade cuts what it meets');assert.equal(limb.plugin.bleed,0,'seared shut');assert.ok(limb.plugin.heat>60);
  const saw=arena();const thigh=saw.e.bodies[11],c=saw.s.spawn('chainsaw',thigh.position.x-18,thigh.position.y).bodies[0];saw.s.freeze(c);const lost=()=>saw.e.bodies.reduce((n,b)=>n+100-b.plugin.hp,0);advance(saw.s,60);assert.equal(lost(),0,'a stopped chainsaw is harmless to lean on');
  saw.s.activate(c);for(let i=0;i<90;i++){Body.setPosition(c,{x:thigh.position.x-18,y:thigh.position.y});saw.s.step();}assert.ok(lost()>80,`running, it should chew through whatever the bar touches: ${lost()}`);assert.ok(c.plugin.bloody);
});
test('the power hammer fires its ram at what is in front of the head',()=>{
  const s=new Simulation();s.gravity=0;s.configure({gravity:0});const h=s.spawn('phammer',1000,400).bodies[0],front=s.spawn('crate',1000,400-45-40).bodies[0],behind=s.spawn('crate',1000,400+45+60).bodies[0];
  assert.match(s.activate(h),/1 hit/);assert.ok(front.velocity.y<-10);assert.ok(front.plugin.hp<80);assert.equal(behind.plugin.hp,80);assert.ok(h.velocity.y>2,'and the hammer kicks back');
});
test('prolonged burning leaves a dead, bare skeleton that has stopped burning',()=>{
  const s=new Simulation().seed(2);s.configure({organDamage:false});const e=s.spawn('human',1000,555);for(const b of e.bodies)s.ignite(b);let skinGone=null;for(let i=0;i<60*16;i++){s.step();if(skinGone===null&&e.bodies.every(b=>b.plugin.char>.5))skinGone=i/60;}
  assert.ok(skinGone>3&&skinGone<9,`skin should be gone in a few seconds, took ${skinGone}`);assert.ok(e.bodies.every(b=>b.plugin.char>.9),'burnt to the bone');assert.ok(e.bodies.every(b=>!b.plugin.burning),'nothing left to burn');assert.equal(e.alive,false);
  assert.ok(e.bodies.every(b=>!b.plugin.bleed&&b.plugin.wounds.length===0));assert.equal(s.joints.filter(c=>c.plugin.joint&&c.bodyA.plugin.entityId===e.id).length>0,true,'the skeleton holds together');
});
test('guns wound but never dismember, and only a contact shot destroys the part it hits',()=>{
  const volley=(gap,shots)=>{const s=new Simulation();s.gravity=0;s.configure({gravity:0,autoBalance:false,organDamage:false,bleedRate:0});const e=s.spawn('human',1000,400),shin=e.bodies[15],y=shin.position.y;
    for(let i=0;i<shots;i++)s.shoot({x:shin.bounds.min.x-gap,y},{x:1600,y});return {s,e,shin};};
  const far=volley(300,12);assert.ok(far.shin.plugin.hp>0,`twelve distant bullets left the shin at ${far.shin.plugin.hp}`);assert.equal(far.s.joints.filter(c=>c.plugin.joint).length,16,'and took nothing off');
  const close=volley(10,12);assert.ok(close.shin.plugin.hp>0,'ten pixels is still not a contact shot');assert.equal(close.s.joints.filter(c=>c.plugin.joint).length,16);
  const contact=volley(1.5,4);assert.equal(contact.shin.plugin.hp,0,'a muzzle against the limb destroys it');assert.equal(contact.s.joints.filter(c=>c.plugin.joint).length,16,'but even that does not dismember');
  const inside=volley(-3,4);assert.equal(inside.shin.plugin.hp,0,'a muzzle pushed into the limb counts as contact');
  const head=new Simulation();const h=head.spawn('human',1000,555),skull=h.bodies[0];for(let i=0;i<3;i++)head.shoot({x:skull.bounds.min.x-300,y:skull.position.y},{x:1600,y:skull.position.y});assert.equal(h.alive,false,'bullets still kill');assert.ok(skull.plugin.hp>0);
});
test('R turns a ragdoll to face the other way, with what it holds, and twice is the identity',()=>{
  const s=new Simulation().seed(3);const e=s.spawn('human',1000,555);advance(s,60);const hand=e.bodies[10],gun=s.spawn('gun',hand.position.x+20,hand.position.y).bodies[0];s.equip(hand);advance(s,200);
  const chest=e.bodies[2],before=e.bodies.map(b=>({x:b.position.x-chest.position.x,y:b.position.y,a:b.angle})),knee=s.joints.find(c=>c.plugin.name==='knee'),limits=[knee.plugin.min,knee.plugin.max],ahead=gun.position.x-chest.position.x;
  assert.ok(ahead>20,'the pistol is held out in front');assert.equal(s.flip(e.bodies[5]),true);assert.ok(e.bodies.every(b=>b.plugin.flip));assert.equal(gun.plugin.flip,true);assert.ok(Math.abs(gun.position.x-chest.position.x+ahead)<.01,'now it is out in front on the other side');
  e.bodies.forEach((b,i)=>{assert.ok(Math.abs(b.position.x-chest.position.x+before[i].x)<1e-6&&Math.abs(b.position.y-before[i].y)<1e-6&&Math.abs(b.angle+before[i].a)<1e-6);});assert.deepEqual([knee.plugin.min,knee.plugin.max],[-limits[1],-limits[0]]);
  for(const c of s.joints)assert.ok(Constraint.currentLength(c)<1,`${c.plugin.name||'pin'} came apart in the mirror`);advance(s,240);assert.ok(chest.position.y<505&&Math.abs(chest.angle)<.2,'it goes on standing');assert.ok(gun.position.x<chest.position.x-20);
  const crate=new Simulation();const far=crate.spawn('crate',300,300).bodies[0];far.plugin.hp=80;s.activate(e.bodies[2]);s.flip(chest);e.bodies.forEach((b,i)=>assert.ok(Math.abs(Math.abs(b.position.x-chest.position.x)-Math.abs(before[i].x))<40));assert.ok(e.bodies.every(b=>!b.plugin.flip),'and back again');
});
test('burnt skin grows back over five minutes once the fire is out',()=>{
  const s=new Simulation().seed(2);s.configure({organDamage:false});const e=s.spawn('human',1000,555),arm=e.bodies[8];arm.plugin.char=1;arm.plugin.burning=false;advance(s,60*60);assert.ok(arm.plugin.char>.75&&arm.plugin.char<.85,`after a minute: ${arm.plugin.char}`);
  advance(s,60*245);assert.equal(arm.plugin.char,0,'whole again after five minutes');const crate=s.spawn('crate',1300,620).bodies[0];crate.plugin.char=.6;advance(s,600);assert.equal(crate.plugin.char,.6,'objects stay charred');
  s.ignite(arm);advance(s,120);assert.ok(arm.plugin.char>0,'and it can burn again');const n=s.bodies.length;s.clearFire();assert.equal(s.bodies.length,n,'clearing the fire removes nothing');
});
test('partial revive brings the dead back as they are: wounds, fractures and missing limbs stay',()=>{
  const s=new Simulation().seed(4);const e=s.spawn('human',1000,555);advance(s,30);const chest=e.bodies[2],shin=e.bodies[12];s.sever(s.joints.find(c=>c.plugin.name==='shoulder'));s.damage(shin,60,shin.position,'impact');
  s.damage(chest,55,{x:chest.position.x,y:chest.position.y-10},'bullet');assert.equal(e.alive,false);assert.equal(e.causeOfDeath,'heart destroyed');assert.equal(e.heartRate,0);const wounds=chest.plugin.wounds.length,hp=shin.plugin.hp,joints=s.joints.filter(c=>c.plugin.joint).length;
  assert.equal(s.partialRevive(chest),true);assert.equal(e.alive,true);assert.equal(e.causeOfDeath,undefined);assert.equal(chest.plugin.wounds.length,wounds);assert.equal(shin.plugin.hp,hp);assert.ok(s.fractured(shin));assert.equal(s.joints.filter(c=>c.plugin.joint).length,joints,'the arm is still off');
  assert.ok(e.organs.heart>=60&&e.blood>=65);advance(s,600);assert.equal(e.alive,true,'and it stays alive');assert.ok(e.heartRate>40);assert.equal(s.partialRevive(s.spawn('crate',300,300).bodies[0]),false);
});

test('a shoved ragdoll throws an arm out to catch its balance, and brings it back',()=>{
  const {s,e}=standing(),rest=rel(e,8,2);for(const b of e.bodies)Body.setVelocity(b,{x:7,y:-1});
  let out=0;for(let i=0;i<50;i++){s.step();out=Math.max(out,Math.abs(rel(e,8,2)-rest),Math.abs(rel(e,5,2)-rest));}
  assert.ok(out>.5,`arm swung ${out.toFixed(2)} rad`);advance(s,240);assert.ok(Math.abs(rel(e,8,2)-rest)<.25&&s.balancing(e),'settles back, still standing');
});

test('legs that go limp under a standing body give way at the knee',()=>{
  const {s,e}=standing();s.kill(e,'test');let bend=0;for(let i=0;i<40;i++){s.step();bend=Math.max(bend,rel(e,12,11),rel(e,15,14));}
  assert.ok(bend>.8,`knee bent ${bend.toFixed(2)} rad`);
});

test('legs that break under a conscious body put it down on its front, legs trailing, ready to crawl',()=>{
  for(const flip of [false,true]){const s=new Simulation().seed(9);s.configure({organDamage:false});const e=s.spawn('human',1000,555,flip);advance(s,120);const at=k=>e.bodies.find(b=>b.plugin.slot===k),d=flip?-1:1;
    for(const k of [12,15])at(k).plugin.bone=20;e.fleeT=9;advance(s,200);assert.equal(e.rung,'crawl');
    assert.ok(Math.abs(at(2).angle*d-Math.PI/2)<.6,`chest face down (${at(2).angle.toFixed(2)})`);assert.ok((at(2).position.x-at(4).position.x)*d>20&&(at(4).position.x-at(16).position.x)*d>40,'head first, feet behind');}
});

test('a body with no blood left stops bleeding; a corpse and a loose limb drain until they are empty',()=>{
  const {s,e}=standing(),arm=e.bodies[9],thigh=e.bodies[14];s.sever(s.joints.find(c=>c.bodyB===arm));const limb=s.getEntity(arm);assert.ok(limb!==e&&limb.blood>0&&limb.blood<20);
  s.damage(thigh,30,thigh.position,'bullet',{x:1,y:0});s.kill(e,'test');const before=e.blood;advance(s,120);assert.ok(e.blood<before,'a corpse keeps draining');
  e.blood=0;limb.blood=0;for(const b of s.bodies)for(const w of [...(b.plugin.wounds||[]),...(b.plugin.severed||[])])w.bleed=3;advance(s,5);s.particles.length=0;s.stains.length=0;for(const b of s.bodies)b.plugin.stains=[];/* blood already spilt may still drip; this is about what comes out of the body */advance(s,120);
  assert.equal(s.particles.filter(p=>p.type==='blood').length,0,'nothing left to come out');
});

test('grafting a new limb on leaves the old one out of it',()=>{
  const s=new Simulation().seed(4);const a=s.spawn('human',1000,555),b=s.spawn('human',1400,555);advance(s,30);const oldArm=a.bodies[9],newArm=b.bodies[9];
  for(const e of [a,b])s.sever(s.joints.find(c=>c.plugin.name==='elbow'&&c.bodyB===(e===a?oldArm:newArm)));assert.equal(s.graft(a.bodies.find(x=>x.plugin.slot===8),newArm),'');
  assert.ok(a.bodies.includes(newArm)&&!a.bodies.includes(oldArm));assert.equal(new Set(a.bodies.map(x=>x.plugin.slot)).size,a.bodies.length,'one part per slot');assert.equal(a.bodies.length,17);
  const x=oldArm.position.x;Body.setVelocity(a.bodies[2],{x:6,y:0});advance(s,60);assert.ok(Math.abs(oldArm.position.x-x)<25,'the old arm stays where it fell');
});

test('stop bleeding closes every wound on the ragdoll; a bandage seals one part and holds against a knock, not a hard blow',()=>{
  const {s,e}=standing(),arm=e.bodies[8],thigh=e.bodies[14];s.damage(arm,30,arm.position,'bullet',{x:1,y:0});s.damage(thigh,30,thigh.position,'cut',{x:1,y:0});assert.ok(arm.plugin.bleed>0&&thigh.plugin.bleed>0);
  assert.ok(s.bandage(arm)>=1);assert.equal(arm.plugin.bleed,0);assert.ok(thigh.plugin.bleed>0,'only the part that was dressed');assert.ok(arm.plugin.wounds.some(w=>w.sealed));assert.equal(s.bandage(arm),0,'nothing left to dress');
  const at=arm.plugin.wounds.find(w=>w.sealed),hit=(n)=>s.damage(arm,n,{x:arm.position.x+at.x*Math.cos(arm.angle)-at.y*Math.sin(arm.angle),y:arm.position.y+at.x*Math.sin(arm.angle)+at.y*Math.cos(arm.angle)},'impact',{x:1,y:0});
  hit(8);assert.ok(at.sealed&&!(at.bleed>0),'a knock does not reopen it');hit(40);assert.ok(!at.sealed,'a hard blow tears the dressing off');
  const wounds=thigh.plugin.wounds.length,blood=e.blood;assert.ok(s.stopBleeding(e.bodies[2])>=1);assert.ok(e.bodies.every(b=>!(b.plugin.bleed>0)));assert.equal(thigh.plugin.wounds.length,wounds,'the wounds stay');assert.equal(e.blood,blood,'lost blood stays lost');
});

test('a blast takes limbs off by chance, likelier close in; a shock has a good chance of restarting a dead human, wounds and all',()=>{
  const lost=d=>{let n=0;for(let seed=1;seed<=12;seed++){const s=new Simulation().seed(seed);s.configure({organDamage:false});const e=s.spawn('human',1000,555);advance(s,30);s.explode(1000+d,560,175,1);advance(s,5);n+=17-e.bodies.length;}return n;};
  const near=lost(25),far=lost(150);assert.ok(near>far,`near ${near} far ${far}`);assert.ok(near>0&&near<12*16,'some, never all');
  let back=0;for(let seed=1;seed<=20;seed++){const s=new Simulation().seed(seed);const e=s.spawn('human',1000,555);advance(s,30);const thigh=e.bodies[14];s.damage(thigh,30,thigh.position,'cut',{x:1,y:0});s.kill(e,'test');advance(s,30);s.shock(e.bodies[2]);if(e.alive){back++;assert.ok(thigh.plugin.wounds.length>0,'wounds stay');}}
  assert.ok(back>=6&&back<=18,`revived ${back}/20`);
});

test('every firearm has its own round: faster rounds arrive sooner, heavier ones hurt more, buckshot scatters, automatics keep firing, a crossbow throws a real bolt',()=>{
  const guns=require('../items.js').ITEMS.filter(i=>i.firearm);assert.ok(guns.length>=10);for(const g of guns){assert.ok(g.firearm.speed>=100&&g.firearm.speed<=1000,`${g.id} speed`);assert.ok(g.firearm.rate>0&&g.firearm.muzzle>=g.w/2);assert.ok(g.firearm.launch||g.firearm.damage>0);}
  const shot=(kind,steps)=>{const s=new Simulation().seed(2);s.gravity=0;const gun=s.spawn(kind,400,300).bodies[0],wall=s.spawn('metal',1400,300).bodies[0];s.freeze(wall);const hp=wall.plugin.hp;s.activate(gun);let t=0;while(wall.plugin.hp===hp&&t<steps){s.step(1000/120);t++;}return {t,hurt:hp-wall.plugin.hp,s,gun,wall};};
  const pistol=shot('gun',200),sniper=shot('sniper',200),hunting=shot('hunting',200);assert.ok(pistol.t>5,'a pistol round takes time to cross a room');assert.ok(sniper.t<pistol.t*.6,`.50 (${sniper.t}) outruns 9 mm (${pistol.t})`);assert.ok(sniper.hurt>hunting.hurt&&hunting.hurt>pistol.hurt,'heavier rounds hurt more');
  const pellets=new Simulation().seed(2);pellets.gravity=0;pellets.activate(pellets.spawn('shotgun',400,300).bodies[0]);assert.equal(pellets.shots.length,9);assert.ok(new Set(pellets.shots.map(x=>x.dy.toFixed(4))).size>5,'pellets spread');
  const auto=new Simulation().seed(2);auto.gravity=0;const smg=auto.spawn('smg',400,300).bodies[0],semi=auto.spawn('gun',400,600).bodies[0],rounds=new Map(),shoot=auto.shoot.bind(auto);auto.shoot=(from,to,gun,spec)=>{rounds.set(gun,(rounds.get(gun)||0)+1);return shoot(from,to,gun,spec);};
  for(let i=0;i<60;i++){auto.activate(smg,i>0);auto.activate(semi,i>0);auto.step();} /* one pull, then the trigger held for a second */
  assert.ok(rounds.get(smg)>=10&&rounds.get(smg)<=14,`smg fired ${rounds.get(smg)} in a second`);assert.equal(rounds.get(semi),1,'a pistol needs a fresh pull for each round');
  const bow=new Simulation().seed(2);const xb=bow.spawn('crossbow',400,300).bodies[0];bow.freeze(xb);const n=bow.bodies.length;assert.equal(bow.activate(xb),'Crossbow loosed');assert.equal(bow.bodies.length,n+1);const bolt=bow.bodies.find(x=>x.plugin.kind==='bolt');assert.ok(bolt.velocity.x>8,'the bolt leaves fast');
  assert.equal(bow.activate(xb),'','it has to be drawn again');const y=bolt.position.y;advance(bow,20);assert.ok(bolt.position.x>600&&bolt.position.y>y,'it flies, and drops');
});

test('a ragdoll can take up the longest, heaviest guns without the hold wrenching its hand off',()=>{
  for(const kind of ['minigun','sniper','lmg']){const s=new Simulation().seed(5);s.configure({organDamage:false});const e=s.spawn('human',1000,555),hand=e.bodies.find(b=>b.plugin.slot===10);advance(s,120);
    const w=require('../items.js').ITEMS.find(i=>i.id===kind).w,gun=s.spawn(kind,hand.position.x+w/2+22,hand.position.y-200).bodies[0];Body.setPosition(gun,{x:hand.position.x+w/2+22,y:hand.position.y});
    assert.match(s.equip(hand),/Picked up/);advance(s,240);assert.equal(gun.plugin.heldBy,e.id,`${kind} still in hand`);assert.equal(e.bodies.length,17,'and the hand still on the arm');assert.ok(s.balancing(e),'still on its feet');}
});

test('a burnt ragdoll writhing in pain stays in the world after the fire is put out (no part ever goes non-finite)',()=>{
  for(const seed of [1,2,3,9,11]){const s=new Simulation().seed(seed);const e=s.spawn('human',1000,555);advance(s,60);for(const b of e.bodies)if((seed+b.plugin.slot)%3)s.ignite(b);advance(s,30+seed*137%1100);s.clearFire();advance(s,600);
    assert.equal(s.bodies.filter(b=>b.plugin.part).length,17,`seed ${seed}: every part still there`);assert.ok(s.bodies.every(b=>Number.isFinite(b.position.x)&&Number.isFinite(b.angle)));}
});

test('one bullet cannot kill outside the fatal spots (head, neck, upper torso), whatever fired it; several can, and one in a fatal spot can',()=>{
  const once=(slot,mult,n=1)=>{const s=new Simulation().seed(3);const e=s.spawn('human',1000,555);advance(s,60);const part=e.bodies[slot];for(let i=0;i<n;i++){const y=part.position.y+(i-(n-1)/2)*5;s.shoot({x:part.position.x-200,y},{x:part.position.x,y},null,{damage:mult});}
    let low=100;for(let i=0;i<7200&&e.alive;i++){s.step();low=Math.min(low,e.blood);if(i>60&&!e.bodies.some(b=>b.plugin.bleed>.01||b.plugin.internal>.01))break;} /* until it is dead or has stopped bleeding */return {alive:e.alive,low,cause:e.causeOfDeath};};
  for(const slot of [3,4,9,14,15,16])for(const mult of [1,5]){ /* not the upper arm: in profile it lies over the chest, and a round that carries on into the upper torso has found a fatal spot */const r=once(slot,mult);assert.ok(r.alive,`slot ${slot} x${mult}: died of ${r.cause}`);assert.ok(r.low>30,`slot ${slot} x${mult}: blood fell to ${r.low.toFixed(0)}`);}
  assert.ok(!once(14,2,6).alive,'six rounds through a thigh do kill');assert.ok(!once(0,5).alive,'a .50 to the head kills');assert.ok(!once(2,5).alive||once(2,5).low<60,'the upper torso is a fatal spot');
});

test('wounds go deeper with force, dig deeper when hit again in the same place, and merge instead of piling up',()=>{
  const hit=(type,amounts,spread=0)=>{const {s,e}=standing(),part=e.bodies[14];amounts.forEach((a,i)=>s.damage(part,a,{x:part.position.x+1,y:part.position.y-10+i*spread},type,{x:1,y:0}));return part.plugin.wounds.filter(w=>w.type===type);};
  assert.deepEqual(hit('cut',[9]).map(w=>w.depth),[1],'a light cut only marks the skin');assert.deepEqual(hit('cut',[24]).map(w=>w.depth),[2],'a medium one opens it to the muscle');assert.deepEqual(hit('cut',[60]).map(w=>w.depth),[3],'a heavy one reaches bone');
  assert.deepEqual(hit('impact',[20]).map(w=>w.depth),[0],'a blunt blow bruises');assert.deepEqual(hit('impact',[60]).map(w=>w.depth),[2],'only a very hard one splits the skin');
  const dug=hit('cut',[18,18,18]);assert.equal(dug.length,1,'three cuts in one place are one wound');assert.equal(dug[0].depth,3,'dug to the bone');assert.equal(dug[0].hits,3);
  assert.equal(hit('bullet',[40,40,40,40],9).length,4,'wounds apart stay apart');const many=hit('bullet',Array(40).fill(20),1.1);assert.ok(many.length<=10,`${many.length} wounds drawn for 40 rounds`);
});

test('a clot tears open when the limb is thrown about, a scab does not; a corpse soon stops bleeding; faded bruises are forgotten',()=>{
  const make=()=>{const {s,e}=standing(),thigh=e.bodies[14];s.damage(thigh,30,thigh.position,'cut',{x:1,y:0});const w=thigh.plugin.wounds.find(x=>x.type==='cut');w.bleed=0;return {s,e,thigh,w};};
  const shake=(s,thigh,n)=>{for(let i=0;i<n;i++){Body.setVelocity(thigh,{x:i%2?6:-6,y:0});s.step();}};
  const clot=make();clot.s.time+=60;shake(clot.s,clot.thigh,240);assert.ok(clot.w.bleed>0||clot.w.wet>clot.w.t,'the clot reopened');
  const scab=make();scab.s.time+=400;shake(scab.s,scab.thigh,240);assert.ok(!(scab.w.bleed>0),'the scab held');
  const dead=make();dead.w.bleed=3;dead.s.kill(dead.e,'test');advance(dead.s,60*25);assert.ok(dead.w.bleed<.2,`a corpse stops bleeding (${dead.w.bleed.toFixed(2)})`);
  const bruise=make();bruise.s.damage(bruise.thigh,15,bruise.thigh.position,'impact');assert.ok(bruise.thigh.plugin.wounds.some(x=>x.type==='impact'));bruise.s.time+=400;advance(bruise.s,900);assert.ok(!bruise.thigh.plugin.wounds.some(x=>x.type==='impact'));
});

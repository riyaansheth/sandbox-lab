(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('matter-js'));
  else root.Sandbox = factory(root.Matter);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  const { Engine, Bodies, Body, Composite, Constraint, Events, Query, Vector } = M;
  const CATALOG = [
    { id:'human', name:'Human', category:'living', description:'An articulated, very breakable volunteer.', color:'#d5ccc0' },
    { id:'android', name:'Android', category:'living', description:'Stronger joints. Conducts electricity.', color:'#91aaa7' },
    { id:'crate', name:'Wooden crate', category:'props', description:'Stack it, smash it, set it on fire.', color:'#b08b59' },
    { id:'barrel', name:'Fuel barrel', category:'devices', description:'Explodes when activated, heated, or damaged.', color:'#b36c5b' },
    { id:'metal', name:'Steel beam', category:'props', description:'Heavy, conductive building material.', color:'#899398' },
    { id:'plank', name:'Wooden plank', category:'props', description:'Build a bridge. Flammable and breakable.', color:'#a68b63' },
    { id:'ball', name:'Bouncy ball', category:'props', description:'Rubber with an unreasonable amount of bounce.', color:'#a4b6a0' },
    { id:'brick', name:'Concrete block', category:'props', description:'A hefty block for your next contraption.', color:'#a0a49d' },
    { id:'glass', name:'Glass pane', category:'props', description:'Fragile. Shatters into physical fragments.', color:'#93c3c8' },
    { id:'bomb', name:'Timed bomb', category:'devices', description:'Activate to start a three-second fuse.', color:'#c0ae7f' },
    { id:'gun', name:'Pistol', category:'devices', description:'Activate to fire. A / D to aim.', color:'#8f989b' },
    { id:'sword', name:'Sword', category:'props', description:'Slashes on impact. Thrown or thrust point-first, it runs a body through and stays in.', color:'#c7d2d2' },
    { id:'wheel', name:'Motor wheel', category:'devices', description:'Activate to spin. Rope it to a contraption.', color:'#7d9991' },
    { id:'thruster', name:'Thruster', category:'devices', description:'Activate for lift. Rotate to steer.', color:'#9caaa9' },
    { id:'battery', name:'Battery', category:'devices', description:'Activate to electrify nearby conductors.', color:'#a5ac73' },
    { id:'platform', name:'Fixed platform', category:'props', description:'A frozen platform. Unfreeze with the freeze tool.', color:'#788a94' }
  ];
  const defs = {
    crate:{w:52,h:52,material:'wood',hp:80,density:.0015}, barrel:{w:35,h:58,material:'metal',hp:65,density:.002},
    metal:{w:150,h:19,material:'metal',hp:500,density:.006}, plank:{w:145,h:13,material:'wood',hp:70,density:.001},
    ball:{r:22,material:'rubber',hp:150,density:.001,restitution:.87}, brick:{w:60,h:30,material:'stone',hp:220,density:.005},
    glass:{w:13,h:100,material:'glass',hp:22,density:.001}, bomb:{r:17,material:'metal',hp:40,density:.002},
    gun:{w:48,h:18,material:'metal',hp:170,density:.003}, sword:{w:12,h:100,material:'metal',hp:200,density:.0025,sharp:true},
    wheel:{r:30,material:'metal',hp:220,density:.003,restitution:.2}, thruster:{w:29,h:51,material:'metal',hp:160,density:.003},
    battery:{w:32,h:47,material:'metal',hp:120,density:.003}, platform:{w:180,h:17,material:'metal',hp:1000,density:.005,static:true}
  };
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const rnd=(a,b)=>a+Math.random()*(b-a);
  // Dimensions are shared by the physics bodies and the renderer, in world pixels.
  const ANATOMY=[
    ['head',0,-105,23,30],['neck',0,-84,11,14],['chest',0,-60,35,36],['abdomen',0,-32,26,23],['pelvis',0,-11,30,23],
    ['upper arm',-24,-56,12,35],['forearm',-25,-23,10,31],['hand',-25,-1,10,15],
    ['upper arm',24,-56,12,35],['forearm',25,-23,10,31],['hand',25,-1,10,15],
    ['thigh',-10,22,16,45],['shin',-10,64,12,41],['foot',-10,88,22,12],
    ['thigh',10,22,16,45],['shin',10,64,12,41],['foot',10,88,22,12]
  ];
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  // Every tunable lives in this one table: the engine reads the values, the settings page is generated from it, and saved values are validated against it.
  // Names and ranges follow People Playground's Environment, Gore and General menus where it has the option; the rest are this sandbox's own.
  const SETTINGS=[
    {id:'gravity',section:'World',label:'Gravity',help:'Strength of gravity. Negative values make everything fall upward.',type:'range',min:-40,max:40,step:.01,def:9.81,unit:' m/s²'},
    {id:'ambient',section:'World',label:'Ambient temperature',help:'Everything drifts toward this temperature. Above 170° wood and flesh catch fire; below zero flesh turns brittle.',type:'range',min:-100,max:1000,step:1,def:20,unit:'°'},
    {id:'lightning',section:'World',label:'Lightning chance',help:'How often the sky strikes. A bolt shocks, burns and ignites what it hits, and jumps through conductors.',type:'range',min:0,max:100,step:1,def:0,unit:'%'},
    {id:'rain',section:'World',label:'Rain',help:'Rain puts out fires and cools hot objects.',type:'toggle',def:false},
    {id:'snow',section:'World',label:'Snow',help:'Snow makes the floor slippery.',type:'toggle',def:false},
    {id:'fog',section:'World',label:'Fog',help:'A low mist over the chamber.',type:'toggle',def:false},
    {id:'floodlights',section:'World',label:'Floodlights',help:'Ceiling lights. Switched off, the chamber goes dark and fire, explosions and lightning become the light.',type:'toggle',def:true},
    {id:'autoBalance',section:'Ragdolls',label:'Auto-balance',help:'Living ragdolls stand, keep their balance and get back up. Off, they are limp.',type:'toggle',def:true},
    {id:'legStrength',section:'Ragdolls',label:'Leg strength',help:'How hard the legs can push, in multiples of body weight.',type:'range',min:.5,max:4,step:.1,def:2,unit:'×'},
    {id:'getUpTime',section:'Ragdolls',label:'Get-up time',help:'Seconds for strength to return after a knockdown. Lower is snappier.',type:'range',min:.3,max:5,step:.1,def:1.2,unit:' s'},
    {id:'stunScale',section:'Ragdolls',label:'Knockdown length',help:'Multiplier on how long a hard hit leaves a ragdoll stunned. Zero means hits never knock anyone down.',type:'range',min:0,max:4,step:.1,def:1,unit:'×'},
    {id:'brainDamage',section:'Ragdolls',label:'Brain damage',help:'A damaged head causes blackouts: the ragdoll collapses now and then.',type:'toggle',def:false},
    {id:'slowHealing',section:'Ragdolls',label:'Slow injury healing',help:'Wounds of the living slowly close, bones knit and blood is replaced.',type:'toggle',def:false},
    {id:'fragility',section:'Gore',label:'Fragility multiplier',help:'Multiplies all damage to ragdolls. Higher is more fragile.',type:'range',min:.1,max:10,step:.1,def:1,unit:'×'},
    {id:'jointStrength',section:'Gore',label:'Joint strength',help:'How much force or damage it takes to tear a limb off.',type:'range',min:.25,max:5,step:.05,def:1,unit:'×'},
    {id:'bleedRate',section:'Gore',label:'Bleeding rate',help:'How fast wounds drain blood. Zero means nobody bleeds out.',type:'range',min:0,max:5,step:.1,def:1,unit:'×'},
    {id:'limbCrush',section:'Gore',label:'Limb crushing',help:'A destroyed limb that takes another heavy blow is crushed out of existence.',type:'toggle',def:false},
    {id:'crushSensitivity',section:'Gore',label:'Limb crush sensitivity',help:'How little force it takes to crush a destroyed limb.',type:'range',min:25,max:400,step:5,def:100,unit:'%'},
    {id:'fragments',section:'Gore',label:'Procedural fragments',help:'Crushed limbs leave physical fragments behind.',type:'toggle',def:true},
    {id:'extraGunshot',section:'Gore',label:'Extra gunshot particles',help:'Bullet hits throw out more debris.',type:'toggle',def:false},
    {id:'noGore',section:'Gore',label:'No gore',help:'Hides blood, stains and wounds. Injuries still happen, they are just not drawn.',type:'toggle',def:false},
    {id:'bulletDamage',section:'Weapons',label:'Bullet damage',help:'Damage of one bullet, from the shoot tool or a pistol.',type:'range',min:5,max:300,step:5,def:55,unit:''},
    {id:'bulletForce',section:'Weapons',label:'Bullet knockback',help:'How hard a bullet shoves what it hits.',type:'range',min:0,max:6,step:.1,def:1,unit:'×'},
    {id:'explosionPower',section:'Weapons',label:'Explosion power',help:'Multiplies the blast force and damage of every explosion.',type:'range',min:.25,max:4,step:.05,def:1,unit:'×'},
    {id:'pierceSpeed',section:'Weapons',label:'Piercing speed',help:'How fast a blade must travel point-first to run a body through. Lower pierces more easily.',type:'range',min:1,max:20,step:.5,def:5,unit:''},
    {id:'bladeGrip',section:'Weapons',label:'Blade grip',help:'How firmly flesh holds a lodged blade. Low values let it slide out with a light pull, or under the body\'s own weight.',type:'range',min:1,max:30,step:1,def:5,unit:''},
    {id:'iterations',section:'Physics',label:'Physics iterations',help:'Solver passes per step. Higher is more accurate and slower.',type:'range',min:4,max:64,step:1,def:10,unit:''},
    {id:'airDrag',section:'Physics',label:'Air resistance',help:'Multiplier on air drag. Zero is a vacuum.',type:'range',min:0,max:5,step:.1,def:1,unit:'×'},
    {id:'grabStrength',section:'Physics',label:'Grab strength',help:'How firmly the cursor holds what it drags. Higher also throws harder.',type:'range',min:.04,max:.6,step:.01,def:.16,unit:''},
    {id:'maxObjects',section:'Physics',label:'Object limit',help:'Spawning stops at this many bodies. A ragdoll is 17.',type:'range',min:100,max:1000,step:50,def:500,unit:''},
    {id:'slowMotion',section:'Physics',label:'Slow-motion speed',help:'How fast time runs while slow motion (G) is on.',type:'range',min:5,max:90,step:5,def:20,unit:'%'},
    {id:'decals',section:'Visuals',label:'Decals',help:'Blood stains and scorch marks on the floor.',type:'toggle',def:true},
    {id:'tracers',section:'Visuals',label:'Bullet tracers',help:'Draws the path of each shot.',type:'toggle',def:true},
    {id:'particles',section:'Visuals',label:'Particle effects',help:'Sparks, smoke, fire and spray.',type:'select',options:['Off','Low','High'],def:'High'},
    {id:'shake',section:'Visuals',label:'Screen shake intensity',help:'Camera shake from explosions and thunder.',type:'range',min:0,max:3,step:.1,def:1,unit:'×'},
    {id:'grid',section:'Visuals',label:'Background grid',help:'The measurement grid on the chamber wall.',type:'toggle',def:true},
    {id:'shadows',section:'Visuals',label:'Contact shadows',help:'Soft shadows where objects are near the floor.',type:'toggle',def:true},
    {id:'vignette',section:'Visuals',label:'Vignette',help:'Darkened screen edges.',type:'toggle',def:true},
    {id:'tempUnit',section:'Interface',label:'Temperature unit',help:'Unit used in the detail view.',type:'select',options:['Celsius','Fahrenheit','Kelvin'],def:'Celsius'},
    {id:'showFps',section:'Interface',label:'Show framerate',help:'Frames per second, top right of the chamber.',type:'toggle',def:true},
    {id:'hints',section:'Interface',label:'Tool hints',help:'The caption describing the active tool.',type:'toggle',def:true},
    {id:'zoomSensitivity',section:'Interface',label:'Zoom scroll sensitivity',help:'How fast the scroll wheel zooms.',type:'range',min:.25,max:3,step:.05,def:1,unit:'×'},
    {id:'panSpeed',section:'Interface',label:'Camera pan speed',help:'How fast the arrow keys move the camera.',type:'range',min:.25,max:3,step:.05,def:1,unit:'×'},
    {id:'sound',section:'Audio',label:'Sound',help:'Synthesized impacts, shots, explosions and thunder.',type:'toggle',def:false},
    {id:'volume',section:'Audio',label:'Volume',help:'Master volume.',type:'range',min:0,max:100,step:5,def:60,unit:'%'}
  ];
  const STUN_PART={'upper arm':0,forearm:0,hand:0,foot:.3,shin:.6,thigh:.7}; // how much a hit there knocks the whole body down; unlisted parts count fully
  const MIRROR={5:8,6:9,7:10,8:5,9:6,10:7,11:14,12:15,13:16,14:11,15:12,16:13}; // left limb slots to right and back
  const defaults=()=>Object.fromEntries(SETTINGS.map(s=>[s.id,s.def]));
  // Saved settings come from localStorage or an imported file, so every value is checked against the table before it is used.
  const sanitize=(input={})=>{const out={};for(const s of SETTINGS){const v=input?.[s.id];
    if(s.type==='toggle'&&typeof v==='boolean')out[s.id]=v;else if(s.type==='select'&&s.options.includes(v))out[s.id]=v;else if(s.type==='range'&&typeof v==='number'&&Number.isFinite(v))out[s.id]=clamp(v,s.min,s.max);}return out;};
  // Joint template: [parent slot, child slot, anchor on parent, anchor on child, min, max, name]. Slots index ANATOMY. Regeneration regrows from the same table.
  const JOINTS=[
    [1,0,{x:0,y:-7},{x:0,y:14},-.6,.6,'atlas'],[2,1,{x:0,y:-18},{x:0,y:6},-.35,.35,'neck'],[2,3,{x:0,y:17},{x:0,y:-11},-.4,.4,'spine'],[3,4,{x:0,y:10},{x:0,y:-11},-.4,.4,'waist'],
    [2,5,{x:-21,y:-12},{x:3,y:-16},-2.6,1.4,'shoulder'],[5,6,{x:-1,y:17},{x:0,y:-16},-2.5,.08,'elbow'],[6,7,{x:0,y:15},{x:0,y:-7},-.65,.65,'wrist'],
    [2,8,{x:21,y:-12},{x:-3,y:-16},-1.4,2.6,'shoulder'],[8,9,{x:1,y:17},{x:0,y:-16},-.08,2.5,'elbow'],[9,10,{x:0,y:15},{x:0,y:-7},-.65,.65,'wrist'],
    [4,11,{x:-10,y:11},{x:0,y:-22},-1.3,1.3,'hip'],[11,12,{x:0,y:22},{x:0,y:-20},-.06,2.4,'knee'],[12,13,{x:0,y:20},{x:0,y:-4},-.5,.7,'ankle'],
    [4,14,{x:10,y:11},{x:0,y:-22},-1.3,1.3,'hip'],[14,15,{x:0,y:22},{x:0,y:-20},-.06,2.4,'knee'],[15,16,{x:0,y:20},{x:0,y:-4},-.5,.7,'ankle']
  ];
  const LIMIT_GAIN=.4,LIMIT_SPEED=.3,REST_SPEED=.8,REST_DELAY=1,AIR_TONE=.1,AIR_LIMP=.35,HAND_REACH=30,AIM_STRENGTH=.0022,REGROW_BEAT=.42,REGROW_SWELL=.5,STAND_HEIGHT=148,GETUP_TORQUE=3,EARTH=9.81; // calibration knobs: limit stiffness, and rest thresholds just above the solver's idle jitter
  class Simulation {
    constructor() {
      this.engine=Engine.create({positionIterations:10,velocityIterations:10,constraintIterations:10,enableSleeping:false});
      this.world=this.engine.world;this.entities=[];this.particles=[];this.flashes=[];this.traces=[];this.stains=[];
      this.nextId=1;this.time=0;this.gravity=1;this.onEffect=()=>{};this.drag=null;this.damageQueue=[];this.touching=new Set();this.piercing=new Map();this.regrowing=[];this.settings=defaults();
      this.groundY=650;this.width=2600;this.height=1000;this.scene='workshop';
      this.boundaries=[Bodies.rectangle(1300,720,3000,140,{isStatic:true,label:'Ground'}),Bodies.rectangle(-50,100,100,1300,{isStatic:true}),Bodies.rectangle(2650,100,100,1300,{isStatic:true}),Bodies.rectangle(1300,-420,3000,100,{isStatic:true})];
      this.boundaries.forEach(b=>{b.plugin={boundary:true};b.friction=.85;b.frictionStatic=1;});Composite.add(this.world,this.boundaries);
      Events.on(this.engine,'collisionStart',e=>this.collisions(e.pairs));Events.on(this.engine,'collisionActive',e=>this.disturb(e.pairs));
    }
    // Change settings. Values are validated against the table; things that live on the engine or on bodies are pushed out here.
    configure(values){
      Object.assign(this.settings,sanitize(values));const s=this.settings;this.gravity=s.gravity/EARTH;
      this.engine.positionIterations=this.engine.velocityIterations=this.engine.constraintIterations=s.iterations;
      this.boundaries[0].friction=s.snow?.12:.85;this.boundaries[0].frictionStatic=s.snow?.2:1;
      for(const b of this.bodies)b.frictionAir=this.drag_(b);for(const e of this.entities)e.restTime=0;return s;
    }
    drag_(body){return (body.plugin.part?.015:.006)*this.settings.airDrag;}
    get bodies(){return Composite.allBodies(this.world).filter(b=>!b.plugin.boundary);}
    get joints(){return Composite.allConstraints(this.world).filter(c=>c!==this.drag);}
    meta(body,kind,extra={}) {
      const d=defs[kind]||{};body.plugin={kind,material:d.material||'flesh',hp:d.hp||100,maxHp:d.hp||100,heat:this.settings.ambient,burning:false,charge:0,active:false,w:d.w,h:d.h,r:d.r,...extra};
      return body;
    }
    entity(kind,bodies,joints=[]) {
      const entity={id:this.nextId++,kind,bodies,joints};
      for(const b of bodies)b.plugin.entityId=entity.id;
      this.entities.push(entity);Composite.add(this.world,[...bodies,...joints]);return entity;
    }
    spawn(kind,x,y,flip=false) {
      if(this.bodies.length>=this.settings.maxObjects)return null;
      if(kind==='human'||kind==='android')return this.ragdoll(kind,x,y,flip);
      const d=defs[kind];if(!d)return null;
      const opts={density:d.density,friction:.65,frictionStatic:.9,restitution:d.restitution||.1,frictionAir:.006*this.settings.airDrag,isStatic:!!d.static,label:kind};
      const b=d.r?Bodies.circle(x,y,d.r,opts):Bodies.rectangle(x,y,d.w,d.h,{...opts,chamfer:{radius:kind==='sword'?1:3}});
      this.meta(b,kind,flip?{flip:true}:{});return this.entity(kind,[b]);
    }
    makePart(kind,slot,x,y,angle,group,flip) {
      const robot=kind==='android',[name,,,w,h]=ANATOMY[slot],density=(robot?.0036:.0018)*(name==='head'?1.15:name==='chest'?1.3:1);
      const b=Bodies.rectangle(x,y,w,h,{collisionFilter:{group},density,friction:.8,frictionStatic:1,restitution:0,frictionAir:.015*this.settings.airDrag,chamfer:{radius:Math.min(w/2-1,name==='head'?8:4)}});
      this.meta(b,kind,{part:name,slot,w,h,r:0,material:robot?'metal':'flesh',hp:robot?230:100,maxHp:robot?230:100,wounds:[],severed:[],bleed:0,bone:100,...(flip?{flip:true}:{})});
      if(angle)Body.setAngle(b,angle);return b;
    }
    makeJoint(kind,flip,a,b,[,,pa,pb,min,max,name]) {
      // Anchors are stored unrotated; a regrown limb hangs off a body that may be at any angle.
      const c=Constraint.create({bodyA:a,bodyB:b,pointA:Vector.rotate(pa,a.angle),pointB:Vector.rotate(pb,b.angle),length:0,stiffness:.97,damping:.2});
      c.plugin={joint:true,breakForce:kind==='android'?45:29,min:flip?-max:min,max:flip?-min:max,name};return c;
    }
    ragdoll(kind,x,y,flip=false) {
      const group=Body.nextGroup(true),parts=ANATOMY.map(([,dx,dy],slot)=>this.makePart(kind,slot,x+dx,y+dy,0,group,flip));
      const joints=JOINTS.map(t=>this.makeJoint(kind,flip,parts[t[0]],parts[t[1]],t));
      const e=this.entity(kind,parts,joints);e.upright=true;e.blood=100;e.alive=true;return e;
    }
    getEntity(body){return body&&this.entities.find(e=>e.id===body.plugin.entityId);}
    // Every part still joined to this one, through living joints.
    connected(body,links=this.joints.filter(c=>c.plugin.joint)){
      const whole=new Set([body]),queue=[body];
      while(queue.length){const current=queue.shift();for(const c of links){const other=c.bodyA===current?c.bodyB:c.bodyB===current?c.bodyA:null;if(other&&!whole.has(other)){whole.add(other);queue.push(other);}}}
      return whole;
    }
    // Join a loose piece to a body wherever the anatomy allows: find a template joint with one end on each, swing the piece to the stump's angle, slide the anchors together, pin it.
    seat(main,owner,piece,links,prefer) {
      const slotOf=set=>new Map([...set].map(b=>[b.plugin.slot,b])),have=slotOf(main),bring=slotOf(piece);if([...bring.keys()].some(slot=>have.has(slot)))return false; // that place is already taken
      const fits=([pa,pb])=>(have.has(pa)&&bring.has(pb))||(have.has(pb)&&bring.has(pa)),t=JOINTS.find(j=>fits(j)&&(!prefer||j[0]===prefer.plugin.slot||j[1]===prefer.plugin.slot))||JOINTS.find(fits);if(!t)return false;
      const a=have.get(t[0])||bring.get(t[0]),b=have.get(t[1])||bring.get(t[1]),stump=main.has(a)?a:b,limb=stump===a?b:a,flip=!!stump.plugin.flip,anchor=x=>Vector.add(x.position,Vector.rotate(x===a?t[2]:t[3],x.angle));
      const turn=stump.angle-limb.angle,pivot=anchor(limb);for(const x of piece){if(x.isStatic)Body.setStatic(x,false);Body.rotate(x,turn,pivot);}
      const to=anchor(stump),move=Vector.sub(to,anchor(limb));for(const x of piece){Body.translate(x,move);Body.setVelocity(x,stump.velocity);Body.setAngularVelocity(x,0);}
      const joint=this.makeJoint(owner.kind,flip,a,b,t);if(a.plugin.kind==='android'||b.plugin.kind==='android')joint.plugin.breakForce=45;Composite.add(this.world,joint);links.push(joint);
      for(const x of [a,b]){x.plugin.severed=[];x.plugin.bleed=Math.min(x.plugin.bleed||0,.3);}
      for(const x of piece){const old=this.getEntity(x);if(old&&old!==owner){old.bodies=old.bodies.filter(o=>o!==x);old.joints=old.joints.filter(c=>c.bodyA!==x&&c.bodyB!==x);}if(!owner.bodies.includes(x))owner.bodies.push(x);
        x.plugin.entityId=owner.id;x.collisionFilter.group=stump.collisionFilter.group;if(flip)x.plugin.flip=true;else delete x.plugin.flip;main.add(x);}
      owner.bodies.sort((x,y)=>x.plugin.slot-y.plugin.slot);owner.joints=links.filter(c=>main.has(c.bodyA));this.entities=this.entities.filter(e=>e.bodies.length);owner.restTime=0;this.burst(to.x,to.y,8,'#9fcbb1',2);return to;
    }
    // Hands: an empty hand takes the nearest loose object within reach. The object is welded to the hand by two pins and joins the body's no-collide group, so it cannot fight the arm holding it.
    held(hand){return this.joints.find(c=>c.plugin.hold&&c.bodyA===hand)?.bodyB||null;}
    equip(hand) {
      if(hand?.plugin.part!=='hand')return '';const e=this.getEntity(hand);if(!e||this.held(hand))return '';
      const reach=b=>{const dx=Math.max(b.bounds.min.x-hand.position.x,0,hand.position.x-b.bounds.max.x),dy=Math.max(b.bounds.min.y-hand.position.y,0,hand.position.y-b.bounds.max.y);return Math.hypot(dx,dy);};
      const item=this.bodies.filter(b=>!b.plugin.part&&!b.isStatic&&!b.plugin.debris&&b.plugin.heldBy===undefined&&b.plugin.stuck===undefined&&reach(b)<=HAND_REACH).sort((a,b)=>reach(a)-reach(b))[0];if(!item)return '';
      // Where and how each thing is held, in the item's own frame: grip point, and its angle relative to the hand.
      const flip=!!hand.plugin.flip,side=flip?-1:1,grip=item.plugin.kind==='gun'?{x:-14,y:9}:item.plugin.kind==='sword'?{x:0,y:37}:{x:0,y:0},tilt=item.plugin.kind==='gun'?side*Math.PI/2:item.plugin.kind==='sword'?side*1.15:0; // a pistol lies along the forearm, so raising the arm levels it
      if(flip)item.plugin.flip=true;else delete item.plugin.flip;Body.setAngle(item,hand.angle+tilt);const local=Vector.rotate({x:grip.x*side,y:grip.y},item.angle);
      Body.setPosition(item,Vector.sub(hand.position,local));Body.setVelocity(item,hand.velocity);Body.setAngularVelocity(item,0);item.collisionFilter.group=hand.collisionFilter.group;item.plugin.heldBy=e.id;
      // The second pin sits at the item's centre of mass: a long lever, so the weight of a pistol cannot twist it in the hand.
      const toCentre=Vector.sub(item.position,hand.position),axis=Vector.magnitude(toCentre)>6?toCentre:Vector.rotate({x:0,y:-12},item.angle);for(const offset of [{x:0,y:0},axis]){const point=Vector.add(hand.position,offset);const c=Constraint.create({bodyA:hand,bodyB:item,pointA:offset,pointB:Vector.sub(point,item.position),length:0,stiffness:.9,damping:.2});c.plugin={hold:true};Composite.add(this.world,c);}
      e.restTime=0;this.onEffect('impact',.2);return `Picked up the ${(CATALOG.find(c=>c.id===item.plugin.kind)?.name||'object').toLowerCase()}`;
    }
    release(item){for(const c of this.joints.filter(c=>c.plugin.hold&&c.bodyB===item))Composite.remove(this.world,c);item.collisionFilter.group=0;delete item.plugin.heldBy;}
    // Things leave a hand when the cursor takes them (see beginDrag), when the holder dies, or when the hand is gone. A tug cannot be the test: pulling a held pistol just drags its owner along.
    hands(){for(const item of this.bodies){if(item.plugin.heldBy===undefined)continue;const pins=this.joints.filter(c=>c.plugin.hold&&c.bodyB===item),e=pins[0]&&this.getEntity(pins[0].bodyA);if(!pins.length||!e||!e.alive)this.release(item);}}
    // Dismember: cut the clicked part off at the joint that ties it to the rest of the body (the side nearer the chest). The chest has no such joint, so it loses everything attached to it.
    dismember(body) {
      if(body?.plugin.slot===undefined)return '';const joints=this.joints.filter(c=>c.plugin.joint&&(c.bodyA===body||c.bodyB===body)),inward=joints.filter(c=>c.bodyB===body),cut=inward.length?inward:joints;
      for(const c of cut)this.sever(c);const e=this.getEntity(body);if(e&&cut.length)e.stun=Math.max(e.stun||0,1.2*this.settings.stunScale);return cut.map(c=>c.plugin.name).join(', ');
    }
    // Graft: put any ragdoll's loose limb on any ragdoll's stump, human or android, left or right. A limb from the other side is mirrored to fit.
    graft(stump,limb) {
      if(stump?.plugin.slot===undefined||limb?.plugin.slot===undefined)return 'Pick a ragdoll part, then a loose limb.';
      const links=this.joints.filter(c=>c.plugin.joint),main=this.connected(stump,links),piece=this.connected(limb,links),owner=this.getEntity(stump);
      if(main.has(limb))return 'That limb is already part of this body.';if(!owner)return 'That body is gone.';if(piece.size>main.size)return 'Graft the smaller piece onto the larger one.';
      let at=this.seat(main,owner,piece,links,stump);
      if(!at){const original=[...piece].map(b=>b.plugin.slot);for(const b of piece)b.plugin.slot=MIRROR[b.plugin.slot]??b.plugin.slot;at=this.seat(main,owner,piece,links,stump);if(!at)[...piece].forEach((b,i)=>b.plugin.slot=original[i]);}
      if(!at)return 'It does not fit there: that place is taken, or the two do not join.';
      // The surge: a jolt of power through the whole body, which also gets it back on its feet.
      for(const b of owner.bodies)b.plugin.surge=piece.has(b)?1:.55;owner.surge=3;owner.stun=0;owner.effort=1;if(owner.alive===false&&owner.bodies.some(b=>b.plugin.slot===2)&&owner.bodies.some(b=>b.plugin.slot===0)){owner.alive=true;owner.upright=true;owner.blood=Math.max(owner.blood||0,60);}
      this.flashes.push({x:at.x,y:at.y,radius:150,life:.7,maxLife:.7,surge:true});this.burst(at.x,at.y,40,'#8fe9ff',9);this.burst(at.x,at.y,18,'#ffffff',5);
      for(let i=0;i<7;i++){const angle=i/7*Math.PI*2+rnd(-.3,.3),reach=rnd(60,130);this.traces.push({from:{...at},to:{x:at.x+Math.cos(angle)*reach,y:at.y+Math.sin(angle)*reach},life:rnd(.25,.5),maxLife:.5,electric:true});}
      this.onEffect('surge',1);return '';
    }
    // Put torn-off pieces back where they came from. Parts of one ragdoll share a collision group, which is how a loose limb finds its owner.
    // Click the loose piece to reattach just that; click the body to collect everything that still fits.
    reattach(body) {
      if(body?.plugin.slot===undefined)return 0;const group=body.collisionFilter.group,parts=this.bodies.filter(b=>b.collisionFilter.group===group&&b.plugin.slot!==undefined);
      const links=this.joints.filter(c=>c.plugin.joint),clicked=this.connected(body,links),chest=parts.find(b=>b.plugin.slot===2&&this.getEntity(b)?.blood!==undefined&&this.getEntity(b).blood>0)||parts.find(b=>b.plugin.slot===2);
      const main=chest&&!clicked.has(chest)?this.connected(chest,links):clicked,owner=this.getEntity([...main][0]);if(!owner)return 0;
      const loose=[];for(const b of parts)if(!main.has(b)&&!loose.some(set=>set.has(b)))loose.push(this.connected(b,links));
      let attached=0;for(let progress=true;progress;){progress=false;for(const piece of main===clicked?loose:loose.filter(set=>set.has(body))){
        if(piece.done||!this.seat(main,owner,piece,links))continue;piece.done=true;attached++;progress=true;}}
      this.entities=this.entities.filter(e=>e.bodies.length);owner.restTime=0;return attached;
    }
    // Regrow whatever is missing from the body the clicked part belongs to. Torn-off pieces stay where they fell, as remains.
    // Growth is staged: one part at a time, spreading outward from the clicked part, so a lone head grows a neck, then a chest, then the rest.
    regenerate(body) {
      const e=this.getEntity(body);if(!e||e.blood===undefined||body.plugin.slot===undefined)return 0;
      const links=this.joints.filter(c=>c.plugin.joint),whole=this.connected(body,links),missing=ANATOMY.length-whole.size;if(!missing)return 0;
      if(this.regrowing.some(job=>whole.has(job.root)))return missing;
      // The clicked body keeps the identity only if it still has its chest; a regrowing stray limb becomes a new person, and what is left behind is remains.
      const remains=e.bodies.filter(b=>!whole.has(b)),keeps=[...whole].some(b=>b.plugin.slot===2),owner=keeps?e:{id:this.nextId++,kind:e.kind,bodies:[],joints:[],upright:true,blood:100,alive:true};
      if(!keeps){this.entities.push(owner);e.bodies=remains;e.joints=e.joints.filter(c=>remains.includes(c.bodyA));e.alive=false;e.upright=false;}
      else if(remains.length){const left={id:this.nextId++,kind:e.kind,bodies:remains,joints:e.joints.filter(c=>remains.includes(c.bodyA)),upright:false,blood:0,alive:false};this.entities.push(left);for(const b of remains)b.plugin.entityId=left.id;}
      owner.bodies=[...whole].sort((a,b)=>a.plugin.slot-b.plugin.slot);owner.joints=links.filter(c=>whole.has(c.bodyA));for(const b of owner.bodies)b.plugin.entityId=owner.id;
      this.entities=this.entities.filter(x=>x.bodies.length);for(const b of whole){b.plugin.severed=[];b.plugin.bleed=Math.min(b.plugin.bleed||0,.2);}
      this.regrowing.push({root:body,wait:0});owner.restTime=0;return missing;
    }
    // One part per beat. The new part is full size to the physics at once; plugin.grow (0..1) lets the renderer swell it out of the stump.
    growNext(job) {
      const owner=this.getEntity(job.root);if(!owner||!this.bodies.includes(job.root))return false;
      const whole=this.connected(job.root),slots=new Map([...whole].map(b=>[b.plugin.slot,b]));
      for(const stump of whole)for(const t of JOINTS){const [pa,pb]=t,have=stump.plugin.slot;if((pa!==have&&pb!==have)||slots.has(pa)===slots.has(pb))continue;
        const need=have===pa?pb:pa,flip=!!stump.plugin.flip,offset=Vector.rotate({x:ANATOMY[need][1]-ANATOMY[have][1],y:ANATOMY[need][2]-ANATOMY[have][2]},stump.angle);
        const part=this.makePart(owner.kind,need,stump.position.x+offset.x,stump.position.y+offset.y,stump.angle,stump.collisionFilter.group,flip);Body.setVelocity(part,stump.velocity);
        part.plugin.grow=0;part.plugin.growFrom={...(need===pb?t[3]:t[2])};part.plugin.entityId=owner.id;slots.set(need,part);
        const joint=this.makeJoint(owner.kind,flip,slots.get(pa),slots.get(pb),t);Composite.add(this.world,[part,joint]);
        owner.bodies.push(part);owner.bodies.sort((a,b)=>a.plugin.slot-b.plugin.slot);owner.joints.push(joint);owner.restTime=0;owner.effort=Math.min(owner.effort??1,.4);
        const at=Vector.add(stump.position,Vector.rotate(need===pb?t[2]:t[3],stump.angle));this.burst(at.x,at.y,14,'#9fe0c0',3.5);this.burst(part.position.x,part.position.y,8,owner.kind==='human'?'#c9545a':'#9fd8e8',2.5);
        this.flashes.push({x:part.position.x,y:part.position.y,radius:34,life:.4,maxLife:.4,grow:true});this.onEffect('grow',.25+.5*(1-whole.size/ANATOMY.length));return true;}
      return false;
    }
    // upright = wants to stand. Whether it can is derived from what is left of the body, so losing an arm never drops it but losing the spine does.
    canStand(e){
      if(!e.alive||!e.upright)return false;const part=n=>e.bodies.filter(b=>b.plugin.part===n),chest=part('chest')[0],head=part('head')[0];
      if(!chest||!head||chest.plugin.hp<35||head.plugin.hp<35||(e.kind==='human'&&e.blood<40))return false;
      const live=this.joints.filter(c=>c.plugin.joint&&c.bodyA.plugin.entityId===e.id),has=n=>live.filter(c=>c.plugin.name===n).length;
      if(!has('atlas')||!has('neck')||!has('spine')||!has('waist'))return false;
      return part('foot').some(foot=>{const ankle=live.find(c=>c.bodyB===foot),knee=ankle&&live.find(c=>c.bodyB===ankle.bodyA),hip=knee&&live.find(c=>c.bodyB===knee.bodyA);return !!hip&&foot.plugin.hp>0;});
    }
    balancing(e){return this.settings.autoBalance&&!(e.stun>0)&&this.canStand(e);}
    revive(body){const e=this.getEntity(body);if(!e||e.blood===undefined)return false;this.heal(body);e.alive=true;e.upright=true;e.stun=0;e.effort=0;e.restTime=0;return true;}
    vitals(e,seconds) {
      const set=this.settings,head=e.bodies.find(b=>b.plugin.part==='head');
      // Brain damage: the worse the head, the more often it blacks out.
      if(set.brainDamage&&head&&head.plugin.hp<60&&!(e.stun>0)&&Math.random()<seconds*.25*(1-head.plugin.hp/60))e.stun=rnd(1,3.5);
      if(set.slowHealing){if(e.kind==='human')e.blood=Math.min(100,e.blood+seconds*.8);for(const b of e.bodies){const p=b.plugin;p.hp=Math.min(p.maxHp,p.hp+seconds*1.5);p.bone=Math.min(100,(p.bone??100)+seconds);p.bleed=Math.max(0,(p.bleed||0)-seconds*.05);if(p.wounds?.length&&Math.random()<seconds*.06)p.wounds.shift();}}
    }
    // Standing is posture torques plus a leg push: the lift on the torso is reacted on the planted feet, so it is an internal force.
    // Feet that are not on something produce no lift, so a ragdoll can never fly or hover its way upright.
    balance(e){
      const part=n=>e.bodies.filter(b=>b.plugin.part===n),chest=part('chest')[0],pelvis=part('pelvis')[0],feet=part('foot').filter(f=>this.touching.has(f));
      const free=b=>!b.isStatic&&this.drag?.bodyB!==b,down=Math.abs(wrap(chest.angle))>.6||feet.length===0;
      // Muscles need something to push against. Off the ground (carried, thrown, falling) the body only keeps a little tone, so it dangles from the hand that holds it;
      // after a moment in the air its strength is gone too, so it crumples on landing and then gets up.
      const supported=e.bodies.some(b=>this.touching.has(b)&&this.drag?.bodyB!==b);e.airTime=supported?0:(e.airTime||0)+1/120;if(e.airTime>AIR_LIMP)e.effort=0;const tone=supported?1:AIR_TONE;
      // The pistol is levelled directly as well: a hand is far too light to hold a pistol's weight level by its own torque.
      const aiming=new Set();for(const hand of part('hand')){const item=this.held(hand);if(item?.plugin.kind!=='gun')continue;for(const b of e.bodies)if(b.plugin.slot>=hand.plugin.slot-2&&b.plugin.slot<=hand.plugin.slot)aiming.add(b);
        if(!down&&free(item))item.torque+=(clamp(wrap(-item.angle),-.6,.6)*AIM_STRENGTH*1.5-item.angularVelocity*.004)*item.inertia*e.effort;}
      for(const b of e.bodies){if(!free(b))continue;const kind=b.plugin.part,foot=kind==='foot',arm=['upper arm','forearm','hand'].includes(kind),aim=aiming.has(b)&&!down;
        const strength=(foot?.0024:aim?AIM_STRENGTH:arm?.00015:.0009)*(down&&!arm?GETUP_TORQUE:1)*e.effort*tone,target=aim?(b.plugin.flip?1:-1)*1.45:0; // an armed hand points forward instead of hanging
        b.torque+=clamp(wrap(target-b.angle),-.5,.5)*b.inertia*strength-b.angularVelocity*b.inertia*(foot?.003:aim?.004:.002);}
      if(!feet.length||!pelvis||!free(chest))return;
      const mass=e.bodies.reduce((n,b)=>n+b.mass,0),weight=mass*.001*Math.max(this.gravity,.2),footX=feet.reduce((n,f)=>n+f.position.x,0)/feet.length,footY=Math.max(...feet.map(f=>f.position.y));
      const lift=clamp((STAND_HEIGHT-(footY-chest.position.y))*.035+chest.velocity.y*.25,0,this.settings.legStrength*(e.surge>0?1.5:1))*weight*e.effort;
      const lean=clamp((footX-chest.position.x)*.012-chest.velocity.x*.12,-.8,.8)*weight*e.effort;
      for(const [b,share] of [[chest,.6],[pelvis,.4]])if(free(b))b.force={x:b.force.x+lean*share,y:b.force.y-lift*share};
      for(const f of feet)if(free(f))f.force={x:f.force.x-lean/feet.length,y:f.force.y+lift/feet.length};
    }
    bodyAt(point){return Query.point(this.bodies,point).reverse()[0]||null;}
    removeBody(body) {
      if(!body||body.plugin.boundary)return;
      for(const c of this.joints)if(c.bodyA===body||c.bodyB===body)Composite.remove(this.world,c);
      if(this.drag?.bodyB===body)this.endDrag();
      Composite.remove(this.world,body);
      for(const e of this.entities){if(e.bodies.includes(body))e.restTime=0;e.bodies=e.bodies.filter(b=>b!==body);e.joints=e.joints.filter(c=>c.bodyA!==body&&c.bodyB!==body);}
      this.entities=this.entities.filter(e=>e.bodies.length);
    }
    removeEntity(body){const e=this.getEntity(body);if(e)for(const b of [...e.bodies])this.removeBody(b);}
    clear(){this.endDrag();for(const b of [...this.bodies])this.removeBody(b);for(const c of this.joints)Composite.remove(this.world,c);this.entities=[];this.particles=[];this.flashes=[];this.traces=[];this.stains=[];this.damageQueue=[];this.regrowing=[];Engine.clear(this.engine);}
    freeze(body){if(!body)return;Body.setStatic(body,!body.isStatic);return body.isStatic;}
    beginDrag(body,point) {
      this.endDrag();if(!body)return;if(body.plugin.heldBy!==undefined)this.release(body); // grabbing a held thing takes it out of the hand
      this.drag=Constraint.create({pointA:{...point},bodyB:body,pointB:Vector.sub(point,body.position),length:0,stiffness:this.settings.grabStrength,damping:.15});
      this.drag.plugin={drag:true};Composite.add(this.world,this.drag);
    }
    moveDrag(point){if(this.drag)this.drag.pointA={...point};}
    translateConnected(body,delta){
      const connected=new Set([body]),queue=[body],joints=this.joints.filter(c=>c.plugin.joint||c.plugin.pierce||c.plugin.hold);
      while(queue.length){const current=queue.shift();for(const c of joints){const other=c.bodyA===current?c.bodyB:c.bodyB===current?c.bodyA:null;if(other&&!connected.has(other)){connected.add(other);queue.push(other);}}}
      for(const b of connected)Body.translate(b,delta);
    }
    endDrag(){if(this.drag){if(this.dragAngle!=null&&!this.drag.bodyB.isStatic)Body.setAngularVelocity(this.drag.bodyB,0);Composite.remove(this.world,this.drag);}this.drag=null;this.dragAngle=null;} // let go without spin, so it leaves the hand at the chosen angle
    // Rotating a held body sets a target angle that the grab keeps steering to, so it stays put when the key is released.
    rotate(body,amount,immediate=false){
      if(!body)return;const held=this.drag?.bodyB===body;
      if(immediate||body.isStatic||!held){Body.rotate(body,amount);Body.setAngularVelocity(body,0);if(held)this.dragAngle=body.angle;}
      else this.dragAngle=(this.dragAngle??body.angle)+amount;
    }
    rope(a,b,pa,pb) {
      if(a===b&&a)return null;
      const c=Constraint.create({bodyA:a||undefined,bodyB:b||undefined,pointA:a?Vector.sub(pa,a.position):{...pa},pointB:b?Vector.sub(pb,b.position):{...pb},stiffness:.8,damping:.06});
      c.plugin={rope:true};Composite.add(this.world,c);return c;
    }
    burst(x,y,count,color,speed=5,type='spark') {
      for(let i=0;i<count;i++)this.particles.push({x,y,vx:rnd(-speed,speed),vy:rnd(-speed,speed),life:rnd(.25,1),maxLife:1,color,size:rnd(1,3.5),type});
      if(this.particles.length>900)this.particles.splice(0,this.particles.length-900);
    }
    sever(c) {
      if(!this.joints.includes(c))return;
      for(const [b,point] of [[c.bodyA,c.pointA],[c.bodyB,c.pointB]]){
        if(!b)continue;const p=b.plugin;const local=Vector.rotate(point,-b.angle);
        p.severed??=[];p.severed.push({x:p.flip?-local.x:local.x,y:local.y});p.bleed=(p.bleed||0)+1.8;p.bone=Math.min(p.bone??100,30);
        if(p.material==='flesh')this.burst(b.position.x+point.x,b.position.y+point.y,16,'#a32e31',4,'blood');
      }
      Composite.remove(this.world,c);const owner=this.getEntity(c.bodyA||c.bodyB);if(owner)owner.restTime=0;
    }
    damage(body,amount,point=body?.position,type='impact') {
      if(!body||body.plugin.boundary||!Number.isFinite(amount)||amount<=0)return;
      const p=body.plugin,set=this.settings,gone=p.hp<=0;if(p.part)amount*=set.fragility*(p.material==='flesh'&&p.heat<0?1+Math.min(2,-p.heat/50):1); // frozen flesh is brittle
      p.hp=Math.max(0,p.hp-amount);
      const e=this.getEntity(body);const hurts=STUN_PART[p.part]??1;if(e&&amount>12&&set.stunScale>0&&hurts)e.stun=Math.max(e.stun||0,clamp(amount/20,.6,5)*set.stunScale*hurts);if(e)e.restTime=0;
      if(p.material==='flesh'&&type!=='shock'){ // current cooks; it does not cut
        const local=Vector.rotate(Vector.sub(point,body.position),-body.angle);
        const wound={x:clamp(p.flip?-local.x:local.x,-p.w/2+1,p.w/2-1),y:clamp(local.y,-p.h/2+1,p.h/2-1),radius:clamp(amount/(type==='bullet'||type==='stab'?13:type==='exit'?4:10),1.5,11),type,seed:Math.random()*6.28};
        p.wounds??=[];p.wounds.push(wound);p.wounds=p.wounds.slice(-14);
        p.bone=Math.max(0,(p.bone??100)-amount*(type==='bullet'||type==='stab'?.55:1));
        p.bleed=Math.min(7,(p.bleed||0)+amount/(type==='bullet'||type==='stab'?45:150));
        this.burst(point.x,point.y,Math.min(24,Math.ceil(amount/3))*(type==='bullet'&&set.extraGunshot?3:1),'#a4373c',type==='bullet'?6:3,'blood');
        if(e&&(p.part==='head'||p.part==='chest')&&p.hp<12){e.alive=false;e.upright=false;}
      }
      else this.burst(point.x,point.y,Math.min(8,Math.ceil(amount/8)),p.material==='glass'?'#a7dbe2':'#e1bc7b',3);
      if(p.hp<=0) {
        if(p.kind==='bomb'||p.kind==='barrel'){if(!p.detonating){p.detonating=true;this.damageQueue.push(()=>this.detonate(body));}}
        else if(p.material==='flesh'||p.kind==='android'){
          // A bullet can incapacitate without automatically detaching the whole limb.
          if(type==='blast'||amount>85*set.jointStrength||p.bone<=0)for(const c of [...this.joints])if(c.plugin.joint&&(c.bodyA===body||c.bodyB===body))this.sever(c);
          // Limb crushing: a limb that was already destroyed and takes another heavy blow is pulped.
          if(set.limbCrush&&gone&&p.part&&!p.crushing&&amount*set.crushSensitivity/100>40){p.crushing=true;this.damageQueue.push(()=>this.crush(body));}
        }
        else if(!p.debris&&!p.destroying&&p.kind!=='platform'){p.destroying=true;this.damageQueue.push(()=>this.shatter(body));}
      }
    }
    crush(body) {
      if(!this.bodies.includes(body))return;const p=body.plugin,{x,y}=body.position,e=this.getEntity(body),flesh=p.material==='flesh';
      this.burst(x,y,flesh?45:20,flesh?'#8d2a31':'#e1bc7b',7,flesh?'blood':'spark');if(flesh)this.burst(x,y,14,'#7a2a30',3,'smoke');
      if(e&&(p.part==='head'||p.part==='chest')){e.alive=false;e.upright=false;}this.removeBody(body);
      if(this.settings.fragments&&this.bodies.length<this.settings.maxObjects-3){const bits=[];for(let i=0;i<3;i++){const w=rnd(4,9),h=rnd(4,8),b=Bodies.rectangle(x+rnd(-8,8),y+rnd(-8,8),w,h,{density:.0015,friction:.8,frictionAir:.01*this.settings.airDrag});
        this.meta(b,p.kind,{material:p.material,w,h,hp:10,maxHp:10,debris:true});Body.setVelocity(b,{x:rnd(-4,4),y:rnd(-5,0)});Body.setAngularVelocity(b,rnd(-.3,.3));bits.push(b);}this.entity('debris',bits);}
      this.onEffect('break',.4);
    }
    shatter(body) {
      if(!this.bodies.includes(body))return;
      const p=body.plugin,{x,y}=body.position,vel={...body.velocity};this.removeBody(body);
      if(this.bodies.length>this.settings.maxObjects-20)return;
      const fragments=[];for(let i=0;i<5;i++){
        const w=rnd(6,16),h=rnd(5,14),b=Bodies.rectangle(x+rnd(-15,15),y+rnd(-15,15),w,h,{density:.001,friction:.6});
        this.meta(b,p.kind,{material:p.material,w,h,hp:10,maxHp:10,debris:true,char:p.char});Body.setVelocity(b,{x:vel.x+rnd(-3,3),y:vel.y+rnd(-4,1)});Body.setAngularVelocity(b,rnd(-.15,.15));fragments.push(b);
      }this.entity('debris',fragments);this.onEffect('break',.3);
    }
    explode(x,y,radius=175,power=1) {
      power*=this.settings.explosionPower;
      this.flashes.push({x,y,radius,life:.6,maxLife:.6});this.burst(x,y,70,'#eabb69',13*power);this.burst(x,y,30,'#cd7050',9*power,'smoke');
      for(const b of this.bodies){const dx=b.position.x-x,dy=b.position.y-y,d=Math.hypot(dx,dy);if(d>radius)continue;const f=1-d/radius;
        if(!b.isStatic){Body.setVelocity(b,{x:b.velocity.x+(dx/(d||1))*f*20*power,y:b.velocity.y+(dy/(d||1))*f*20*power-3*f});Body.setAngularVelocity(b,rnd(-.2,.2)*f);}
        this.damage(b,f*f*170*power,b.position,'blast');b.plugin.heat+=f*180;
      }this.onEffect('explosion',power);
    }
    detonate(body){if(!this.bodies.includes(body))return;const {x,y}=body.position,barrel=body.plugin.kind==='barrel';this.removeBody(body);this.explode(x,y,barrel?220:170,barrel?1.2:1);}
    // Bullets are rays. Each body the ray crosses is hit in order; whether the bullet stops there depends on what it is made of and the state it is in.
    // Flesh stops a first bullet. A limb that is already perforated or destroyed no longer does: the next bullet goes in one side and out the other
    // (entry and exit wound) and carries on, weaker, into whatever is behind it.
    passes(body,damage){const p=body.plugin;if(p.boundary||body.isStatic)return false;if(p.material==='glass')return true;if(p.material==='wood')return p.hp-damage<=p.maxHp*.3;
      if(p.material==='flesh')return p.hp<=0||(p.wounds||[]).some(w=>w.type==='bullet'||w.type==='exit');return false;}
    shoot(from,to,ignore=null) {
      const direction=Vector.normalise(Vector.sub(to,from));if(!direction.x&&!direction.y)return;
      const end=Vector.add(from,Vector.mult(direction,2500)),rx=end.x-from.x,ry=end.y-from.y,hits=[];
      // Exact segment/polygon intersection avoids tunnelling and query-order artifacts. Entry and exit are the nearest and farthest crossing of each body.
      for(const body of [...this.bodies,...this.boundaries]){if(body===ignore||(ignore?.plugin.heldBy!==undefined&&body.collisionFilter.group===ignore.collisionFilter.group))continue; // a held pistol never shoots its own holder
        let near=Infinity,far=-Infinity;const v=body.vertices;for(let i=0;i<v.length;i++){const a=v[i],b=v[(i+1)%v.length],sx=b.x-a.x,sy=b.y-a.y,den=rx*sy-ry*sx;
          if(Math.abs(den)<1e-8)continue;const qx=a.x-from.x,qy=a.y-from.y,t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;if(t>=0&&t<=1&&u>=0&&u<=1){near=Math.min(near,t);far=Math.max(far,t);}}
        if(near<Infinity)hits.push({body,near,far});}
      hits.sort((a,b)=>a.near-b.near);const at=t=>({x:from.x+rx*t,y:from.y+ry*t});let first=null,stop=end,power=1;
      for(const {body,near,far} of hits){first??=body;stop=at(near);if(body.plugin.boundary)break;
        const damage=this.settings.bulletDamage*power,through=this.passes(body,damage)&&far>near;
        Body.applyForce(body,stop,Vector.mult(direction,.018*this.settings.bulletForce*power*(through?.4:1)));
        this.damage(body,damage*(through?.6:1),stop,'bullet');if(!through)break;
        // Out the far side: a bigger, ragged wound and a spray that follows the bullet.
        const exit=at(far);if(body.plugin.material==='flesh'&&this.bodies.includes(body)){this.damage(body,damage*.25,exit,'exit');for(let i=0;i<8;i++)this.particles.push({x:exit.x,y:exit.y,vx:direction.x*rnd(2,7)+rnd(-1,1),vy:direction.y*rnd(2,7)+rnd(-1.5,.5),life:rnd(.4,1),maxLife:1,color:'#a4373c',size:rnd(1,3),type:'blood'});}
        stop=exit;power*=.65;if(power<.2)break;}
      this.traces.push({from:{...from},to:stop,life:.14,maxLife:.14});this.burst(from.x,from.y,5,'#ffe1a2',3);
      this.onEffect('shot',.3);return first;
    }
    ignite(body){if(!body)return;body.plugin.heat=Math.max(body.plugin.heat,330);if(['flesh','wood','rubber'].includes(body.plugin.material))body.plugin.burning=true;if(body.plugin.kind==='barrel'||body.plugin.kind==='bomb')body.plugin.fuse=.35;this.onEffect('fire',.1);}
    // A strike takes the highest thing under it. It is a massive shock: current jumps through conductors, flesh burns, flammables catch.
    lightning(x) {
      const under=this.bodies.filter(b=>b.bounds.min.x<=x&&b.bounds.max.x>=x).sort((a,b)=>a.bounds.min.y-b.bounds.min.y)[0],y=under?under.bounds.min.y:this.groundY,top=-370;
      this.traces.push({from:{x:x+rnd(-140,140),y:top},to:{x,y},life:.55,maxLife:.55,electric:true,bolt:true});this.flashes.push({x,y,radius:90,life:.35,maxLife:.35,sky:true});
      this.burst(x,y,26,'#dff3ff',9);this.burst(x,y,10,'#8f9aa0',3,'smoke');if(this.settings.decals&&!under)this.stains.push({x,y:this.groundY-1,r:rnd(14,24),scorch:true});
      if(under){this.shock(under);this.damage(under,45,{x,y},'burn');under.plugin.heat+=520;if(!under.isStatic)Body.setVelocity(under,{x:under.velocity.x,y:under.velocity.y+3});}
      this.onEffect('thunder',1);return under||null;
    }
    shock(body) {
      if(!body)return;const touched=new Set(),queue=[body];
      while(queue.length&&touched.size<30){const b=queue.shift();if(touched.has(b))continue;touched.add(b);b.plugin.charge=1;this.damage(b,(b.plugin.material==='flesh'?24:5)*Math.pow(.8,touched.size-1),b.position,'shock');if(!b.isStatic)Body.setVelocity(b,{x:b.velocity.x+rnd(-2,2),y:b.velocity.y-2});
        for(const other of this.bodies)if(!touched.has(other)&&['flesh','metal'].includes(other.plugin.material)&&Vector.magnitude(Vector.sub(other.position,b.position))<65){queue.push(other);this.traces.push({from:{...b.position},to:{...other.position},life:.3,maxLife:.3,electric:true});}
      }this.onEffect('electric',.3);
    }
    heal(body){const e=this.getEntity(body);if(e&&e.blood!==undefined)e.blood=100;for(const b of e?e.bodies:[body]){if(!b)continue;b.plugin.hp=b.plugin.maxHp;b.plugin.heat=this.settings.ambient;b.plugin.burning=false;b.plugin.char=0;b.plugin.charge=0;b.plugin.bleed=0;b.plugin.bone=100;b.plugin.wounds=[];delete b.plugin.fuse;}this.burst(body.position.x,body.position.y,15,'#9fcbb1',2);}
    activate(body) {
      if(!body)return '';if(body.plugin.part==='hand'&&this.held(body))return this.activate(this.held(body));const p=body.plugin;
      if(p.kind==='barrel'){this.detonate(body);return 'Fuel barrel detonated';}
      if(p.kind==='bomb'){p.fuse=3;return 'Fuse lit — 3 seconds';}
      if(p.kind==='gun'){const aim=body.angle+(p.flip?Math.PI:0),d={x:Math.cos(aim),y:Math.sin(aim)};this.shoot(Vector.add(body.position,Vector.mult(d,28)),Vector.add(body.position,Vector.mult(d,800)),body);Body.applyForce(body,body.position,Vector.mult(d,-.015));return 'Pistol fired';}
      if(['thruster','wheel','battery'].includes(p.kind)){p.active=!p.active;return `${CATALOG.find(c=>c.id===p.kind).name} ${p.active?'on':'off'}`;}
      return 'This object has no activation';
    }
    // ponytail: a blade in a hand shares that body's collision group, which piercing also needs, so held blades slash and do not pierce. Per-pair filtering would lift this.
    // Blades: the tip is the -y end of a sharp body. A fast, point-first hit on flesh runs it through instead of bouncing off.
    blade(sword){const h=sword.plugin.h,axis=Vector.rotate({x:0,y:-1},sword.angle);return {axis,tip:Vector.add(sword.position,Vector.mult(axis,h/2)),length:h*.76};}
    pierce(pair,sword,part) {
      const p=sword.plugin;if(!defs[p.kind]?.sharp||p.stuck||p.heldBy!==undefined||part.plugin.material!=='flesh'||part.isStatic)return false;
      const {axis,tip}=this.blade(sword),contact=pair.collision.supports[0]||part.position;if(Vector.magnitude(Vector.sub(contact,tip))>26)return false;
      const arm=Vector.sub(tip,sword.position),tipVelocity={x:sword.velocity.x-sword.angularVelocity*arm.y,y:sword.velocity.y+sword.angularVelocity*arm.x};
      const speed=Vector.dot(Vector.sub(tipVelocity,part.velocity),axis);if(speed<this.settings.pierceSpeed)return false;
      // ponytail: the blade joins the victim's no-collide group, so one sword skewers one ragdoll at a time. Per-pair filtering if kebabs matter.
      pair.isSensor=true;p.stuck=part.plugin.entityId;p.bloody=true;sword.collisionFilter.group=part.collisionFilter.group;
      this.piercing.set(sword,{part,steps:40});
      this.damage(part,clamp(20+speed*3,25,70),contact,'stab');this.onEffect('impact',.4);return true;
    }
    // The blade slides for a few steps, then the flesh grips it: two pins along the blade act as a weld. Pulled hard enough, it comes out and the wound opens up.
    blades(){
      for(const [sword,slide] of this.piercing){if(!this.bodies.includes(sword)||!this.bodies.includes(slide.part)){this.piercing.delete(sword);continue;}
        // Flesh drags on the blade: each step the two trade momentum until they move together, or the guard reaches the body.
        const {axis,tip,length}=this.blade(sword),part=slide.part,ms=sword.mass,mp=part.mass,rel=Vector.sub(sword.velocity,part.velocity),ax=Vector.dot(rel,axis),depth=Vector.dot(Vector.sub(tip,part.position),axis);
        const lodged=ax<1.2||depth>length*.45||--slide.steps<=0,keep=lodged?{x:0,y:0}:Vector.add(Vector.mult(axis,ax*.78),Vector.mult(Vector.sub(rel,Vector.mult(axis,ax)),.5)),change=Vector.sub(keep,rel);
        Body.setVelocity(sword,Vector.add(sword.velocity,Vector.mult(change,mp/(ms+mp))));Body.setVelocity(part,Vector.sub(part.velocity,Vector.mult(change,ms/(ms+mp))));
        Body.setAngularVelocity(sword,lodged?part.angularVelocity:(sword.angularVelocity+part.angularVelocity)/2);
        if(!lodged)continue;this.piercing.delete(sword);
        const along=clamp(Vector.dot(Vector.sub(part.position,tip),Vector.neg(axis)),4,length-16);
        for(const offset of [0,14]){const point=Vector.add(tip,Vector.mult(axis,-(along+offset)));const c=Constraint.create({bodyA:part,bodyB:sword,pointA:Vector.sub(point,part.position),pointB:Vector.sub(point,sword.position),length:0,stiffness:.3,damping:.1});c.plugin={pierce:true};Composite.add(this.world,c);}
        // Anything else of the same body that the blade now passes through is wounded too, including the far side.
        const e=this.getEntity(part);for(let d=2;d<length;d+=10){const point=Vector.add(tip,Vector.mult(axis,-d)),other=e&&Query.point(e.bodies,point)[0];if(other&&other!==part&&!other.plugin.run){other.plugin.run=true;this.damage(other,22,point,'stab');}}
        if(e)for(const b of e.bodies)delete b.plugin.run;if(along>part.plugin.w)this.damage(part,12,tip,'stab');
      }
      for(const sword of this.bodies){const p=sword.plugin;if(p.stuck===undefined||this.piercing.has(sword))continue;
        const pins=this.joints.filter(c=>c.plugin.pierce&&c.bodyB===sword);
        // Matter's pins barely stretch, so a hand pull is measured on the grab itself: how far the cursor has drawn away from the hilt.
        const pulled=this.drag?.bodyB===sword&&Constraint.currentLength(this.drag)>this.settings.bladeGrip*4;
        if(pins.length&&!pulled&&pins.every(c=>Constraint.currentLength(c)<this.settings.bladeGrip))continue;
        for(const c of pins){Composite.remove(this.world,c);c.bodyA.plugin.bleed=Math.min(7,(c.bodyA.plugin.bleed||0)+.8);const owner=this.getEntity(c.bodyA);if(owner)owner.restTime=0;}
        // Collisions come back only once the blade is clear, otherwise the solver would fire it out of the body.
        const e=this.entities.find(e=>e.id===p.stuck);if(!e||!e.bodies.some(b=>M.Bounds.overlaps(b.bounds,sword.bounds))){sword.collisionFilter.group=0;delete p.stuck;}
      }
    }
    disturb(pairs){for(const {bodyA:a,bodyB:b} of pairs)for(const [target,other] of [[a,b],[b,a]]){this.touching.add(target);if(other.isStatic||other.speed<.15)continue;const e=this.getEntity(target);if(e?.restTime&&e!==this.getEntity(other))e.restTime=0;}}
    collisions(pairs){this.disturb(pairs);for(const pair of pairs){const {bodyA:a,bodyB:b}=pair;if(this.pierce(pair,a,b)||this.pierce(pair,b,a))continue;const speed=Vector.magnitude(Vector.sub(a.velocity,b.velocity));
      if(speed>7){for(const [target,other] of [[a,b],[b,a]]){if(target.plugin.boundary)continue;const multiplier=other.plugin.kind==='sword'?6:target.plugin.material==='glass'?3:1;const point=Vector.mult(Vector.add(target.position,other.position),.5);const blade=other.plugin.kind==='sword';this.damage(target,blade?Math.min(60,(speed-7)*4.5):(speed-7)*multiplier*1.5,point,blade?'cut':'impact');}}
      if(speed>3)this.onEffect('impact',Math.min(.5,speed/30));
      if(a.plugin.burning&&!b.plugin.boundary)b.plugin.heat+=30;if(b.plugin.burning&&!a.plugin.boundary)a.plugin.heat+=30;
    }}
    step(dt=1000/60) {
      if(dt>1000/120+.001){this.step(dt/2);this.step(dt/2);return;}
      const seconds=dt/1000;this.time+=seconds;this.engine.gravity.y=this.gravity;
      const bodies=this.bodies;if(Math.random()<seconds*this.settings.lightning/100*.45)this.lightning(rnd(80,this.width-80));
      for(const e of this.entities){if(!['human','android'].includes(e.kind))continue;
        if(e.kind==='human'){const bleeding=e.bodies.reduce((n,b)=>n+(b.plugin.bleed||0),0);e.blood=Math.max(0,(e.blood??100)-bleeding*seconds*.5*this.settings.bleedRate);if(e.blood<25){e.alive=false;e.upright=false;}}
        if(e.alive)this.vitals(e,seconds);
        e.stun=Math.max(0,(e.stun||0)-seconds);e.surge=Math.max(0,(e.surge||0)-seconds);if(!this.balancing(e)){e.effort=0;continue;}
        e.effort=Math.min(1,(e.effort??1)+seconds/this.settings.getUpTime); // strength returns gradually, so getting up is a push rather than a snap
        this.balance(e);
      }
      for(const b of bodies){const p=b.plugin;
        if(!Number.isFinite(b.position.x)||!Number.isFinite(b.position.y)||Math.abs(b.position.x)>10000||Math.abs(b.position.y)>10000){this.removeBody(b);continue;}
        if(p.fuse!==undefined){p.fuse-=seconds;if(p.fuse<=0&&!p.detonating){p.detonating=true;this.damageQueue.push(()=>this.detonate(b));}}
        p.charge=Math.max(0,p.charge-seconds*1.5);if(p.surge){p.surge-=seconds*.7;if(p.surge<=0)delete p.surge;}if(p.grow!==undefined){p.grow+=seconds/REGROW_SWELL;if(p.grow>=1){delete p.grow;delete p.growFrom;}}
        if(p.material==='flesh'&&p.bleed>.02){
          const e=this.getEntity(b);if((e?.blood??100)>0&&Math.random()<p.bleed*seconds*5*Math.min(2,this.settings.bleedRate)){
            const source=p.severed?.[0]||p.wounds?.[p.wounds.length-1]||{x:0,y:0};const pos=Vector.add(b.position,Vector.rotate({x:p.flip?-source.x:source.x,y:source.y},b.angle));
            this.particles.push({x:pos.x,y:pos.y,vx:b.velocity.x*.4+rnd(-1.2,1.2),vy:b.velocity.y*.4+rnd(-.7,.8),life:3,maxLife:3,color:'#922c33',size:rnd(.8,2.6),type:'blood'});
          }p.bleed=Math.max(0,p.bleed-seconds*.009);
        }
        if(p.heat>170&&['wood','flesh','rubber'].includes(p.material))p.burning=true;
        if(p.burning){p.heat=Math.min(700,p.heat+seconds*35);p.hp=Math.max(0,p.hp-seconds*7);p.char=Math.min(1,(p.char||0)+seconds*.06);
          // Embers and smoke come off the top of the body, more of both the hotter it burns.
          const hot=clamp((p.heat-150)/400,.3,1.2),wide=b.bounds.max.x-b.bounds.min.x,top=b.bounds.min.y+(b.position.y-b.bounds.min.y)*.4;
          if(Math.random()<seconds*9*hot)this.particles.push({x:b.position.x+rnd(-.5,.5)*wide,y:top,vx:rnd(-.6,.6),vy:rnd(-2.6,-1.2),life:rnd(.5,1.4),maxLife:1.4,color:'#ffcf7a',size:rnd(.7,1.8),type:'ember'});
          if(Math.random()<seconds*5*hot)this.particles.push({x:b.position.x+rnd(-.4,.4)*wide,y:top-rnd(14,30),vx:rnd(-.3,.3),vy:rnd(-1.3,-.6),life:rnd(1.2,2.4),maxLife:2.4,color:'#1c1d1f',size:rnd(5,10),type:'smoke'});
          if(Math.random()<.1){for(const other of bodies)if(other!==b&&Vector.magnitude(Vector.sub(other.position,b.position))<45)other.plugin.heat+=4;}
          if(p.hp<=0)this.damage(b,.1);
        }else p.heat+=clamp(this.settings.ambient-p.heat,-seconds*8,seconds*8);
        // ponytail: rain reaches everything, roofs do not shelter. Ray test upward if that matters.
        if(this.settings.rain&&p.heat>this.settings.ambient){p.heat-=seconds*(p.burning?140:25);if(p.burning&&p.heat<150)p.burning=false;}
        if(p.heat>180&&(p.kind==='barrel'||p.kind==='bomb')&&p.fuse===undefined)p.fuse=.5;
        if(p.active&&!b.isStatic){if(p.kind==='thruster'){const force=Vector.rotate({x:0,y:-.0025*b.mass},b.angle);Body.applyForce(b,b.position,force);const jet=Vector.add(b.position,Vector.rotate({x:0,y:30},b.angle));this.burst(jet.x,jet.y,2,'#f3c885',2,'fire');}
          if(p.kind==='wheel')Body.setAngularVelocity(b,.18);
        }
        if(p.active&&p.kind==='battery'&&Math.floor(this.time*3)!==p.lastPulse){p.lastPulse=Math.floor(this.time*3);this.shock(b);}
      }
      if(this.drag&&this.dragAngle!=null&&!this.drag.bodyB.isStatic)Body.setAngularVelocity(this.drag.bodyB,clamp(wrap(this.dragAngle-this.drag.bodyB.angle)*.35,-.3,.3));
      // Limits are equal-and-opposite angular impulses: momentum-neutral, so a body pinned against the floor cannot walk itself sideways.
      for(const c of this.joints){if(!c.plugin.joint||c.plugin.min===undefined)continue;const a=c.bodyA,b=c.bodyB,relative=wrap(b.angle-a.angle),error=relative-clamp(relative,c.plugin.min,c.plugin.max);if(Math.abs(error)<.005)continue;
        const ia=a.isStatic?0:a.inverseInertia,ib=b.isStatic?0:b.inverseInertia,total=ia+ib;if(!total)continue;
        const velocity=b.angularVelocity-a.angularVelocity,target=clamp(-error*LIMIT_GAIN,-LIMIT_SPEED,LIMIT_SPEED),impulse=target-velocity;
        if(Math.sign(impulse)===Math.sign(error))continue; // already returning faster than required
        if(ia)Body.setAngularVelocity(a,a.angularVelocity-impulse*ia/total);if(ib)Body.setAngularVelocity(b,b.angularVelocity+impulse*ib/total);
      }
      this.touching.clear();Engine.update(this.engine,dt);
      // Constraint solving leaves a limp pile jittering forever, and that residue crawls sideways; Matter's own sleeping never triggers on it.
      // So ragdolls sleep as a unit: fall at full speed, then once nearly still hold the whole pose. Holding every part adds no joint tension.
      for(const e of this.entities){if(e.blood===undefined)continue;
        const held=this.gravity<=0||this.balancing(e)||e.bodies.includes(this.drag?.bodyB);
        const peak=Math.max(...e.bodies.map(b=>Math.max(b.speed,b.angularSpeed*Math.max(b.plugin.w,b.plugin.h)/2)))/REST_SPEED; // spin counts as tip speed, so a small hand flicking is small
        // A single twitch only drains the timer; real motion (or anything 3x over) clears it at once.
        e.restTime=held||peak>3?0:peak<1?(e.restTime||0)+seconds:Math.max(0,(e.restTime||0)-seconds*10);
        if(e.restTime<REST_DELAY){e.pin=null;continue;}
        const contacts=e.bodies.filter(b=>this.touching.has(b)).length;
        e.pin??={contacts,gravity:this.gravity,pose:e.bodies.map(b=>({b,x:b.position.x,y:b.position.y,angle:b.angle}))};
        // Wakes: support taken away, or gravity changed. Hits, shoves and drags clear restTime where they happen.
        if(contacts<e.pin.contacts*.6||this.gravity!==e.pin.gravity){e.restTime=0;e.pin=null;continue;}
        for(const {b,x,y,angle} of e.pin.pose){if(b.isStatic)continue;Body.setPosition(b,{x,y});Body.setAngle(b,angle);Body.setVelocity(b,{x:0,y:0});Body.setAngularVelocity(b,0);}
      }
      for(const c of [...this.joints])if(c.plugin.joint&&Constraint.currentLength(c)>c.plugin.breakForce*this.settings.jointStrength)this.sever(c);
      this.blades();this.hands();
      this.regrowing=this.regrowing.filter(job=>{job.wait-=seconds;if(job.wait>0)return true;job.wait=REGROW_BEAT;return this.growNext(job);});
      const pending=this.damageQueue.splice(0);for(const fn of pending)fn();
      for(const p of this.particles){p.life-=seconds;p.x+=p.vx*seconds*60;p.y+=p.vy*seconds*60;
        if(p.type==='blood'||p.type==='spark')p.vy+=seconds*12;
        else if(p.type==='ember'){p.vx+=Math.sin(this.time*9+p.y*.05)*seconds*5;p.vy-=seconds*.6;}else if(p.type==='smoke'){p.vx+=seconds*.35;p.vy*=1-seconds*.5;}
        if(p.type==='blood'&&p.y>=this.groundY){this.stains.push({x:p.x,y:this.groundY-1,r:rnd(2,8),wet:1});p.life=0;}
      }
      this.particles=this.particles.filter(p=>p.life>0).slice(-900);this.stains=this.stains.slice(-300);
      for(const list of [this.flashes,this.traces]){for(const f of list)f.life-=seconds;while(list.length&&list[0].life<=0)list.shift();}
    }
    loadPreset(name) {
      this.clear();this.scene=name;
      if(name==='workshop'){
        this.spawn('human',900,555);this.spawn('android',1050,555);
        this.spawn('crate',1350,622);this.spawn('crate',1405,622);this.spawn('crate',1377,568);this.spawn('barrel',1530,619);
        this.spawn('ball',1050,627);this.spawn('metal',1180,433).bodies.forEach(b=>Body.setStatic(b,true));this.spawn('battery',1180,399);
        this.spawn('gun',790,637);this.spawn('bomb',1630,631);
      }else if(name==='tower'){
        for(let row=0;row<6;row++)for(let col=0;col<3;col++)this.spawn('crate',1195+col*54,622-row*54);
        this.spawn('barrel',1080,619);this.spawn('human',940,555);this.spawn('bomb',1390,631);
      }else if(name==='swing'){
        const beam=this.spawn('platform',1220,270).bodies[0];const ball=this.spawn('ball',1030,400).bodies[0];
        this.rope(beam,ball,{x:1220,y:270},{...ball.position});
        this.spawn('human',1340,555);this.spawn('glass',1410,598);this.spawn('crate',1470,623);
      }
    }
    serialize() {
      const bodies=this.bodies,index=new Map(bodies.map((b,i)=>[b,i]));
      return {version:1,scene:this.scene,gravity:this.gravity,entities:this.entities.map(e=>({id:e.id,kind:e.kind,upright:e.upright,blood:e.blood,alive:e.alive,stun:e.stun})),bodies:bodies.map(b=>({x:b.position.x,y:b.position.y,angle:b.angle,velocity:{...b.velocity},angularVelocity:b.angularVelocity,isStatic:b.isStatic,density:b._original?.density||b.density,friction:b.friction,restitution:b.restitution,group:b.collisionFilter.group,plugin:{...b.plugin}})),joints:this.joints.map(c=>({a:c.bodyA?index.get(c.bodyA):null,b:c.bodyB?index.get(c.bodyB):null,pointA:{...c.pointA},pointB:{...c.pointB},length:c.length,stiffness:c.stiffness,damping:c.damping,plugin:{...c.plugin}})),stains:this.stains.map(s=>({...s}))};
    }
    restore(data) {
      if(!data||data.version!==1||!Array.isArray(data.bodies)||!Array.isArray(data.joints)||!Array.isArray(data.entities)||data.bodies.length>600)throw new Error('Invalid scene file');
      for(const b of data.bodies){const p=b.plugin;if(!p||![b.x,b.y,b.angle].every(Number.isFinite)||(!p.r&&(!Number.isFinite(p.w)||!Number.isFinite(p.h))))throw new Error('Invalid body');}
      for(const c of data.joints)if((c.a!==null&&!data.bodies[c.a])||(c.b!==null&&!data.bodies[c.b]))throw new Error('Invalid joint');
      this.clear();this.scene=data.scene||'empty';this.gravity=Number.isFinite(data.gravity)?data.gravity:1;this.settings.gravity=clamp(this.gravity*EARTH,-40,40);
      const bodies=data.bodies.map(d=>{const p=d.plugin,opts={density:d.density||.002,friction:d.friction,restitution:d.restitution,collisionFilter:{group:d.group||0}};
        const b=p.r?Bodies.circle(d.x,d.y,p.r,opts):Bodies.rectangle(d.x,d.y,p.w,p.h,{...opts,chamfer:{radius:Math.min(3,p.w/3,p.h/3)}});
        b.plugin={...p};Body.setAngle(b,d.angle);Body.setVelocity(b,d.velocity||{x:0,y:0});Body.setAngularVelocity(b,d.angularVelocity||0);if(d.isStatic)Body.setStatic(b,true);return b;
      });Composite.add(this.world,bodies);
      // Constraint.create discards a plugin passed in its options, so it is assigned afterwards.
      const joints=data.joints.map(d=>{const a=d.a===null?null:bodies[d.a],b=d.b===null?null:bodies[d.b];const c=Constraint.create({bodyA:a,bodyB:b,angleA:a?.angle||0,angleB:b?.angle||0,pointA:{...d.pointA},pointB:{...d.pointB},length:d.length,stiffness:d.stiffness,damping:d.damping});c.plugin={...d.plugin};return c;});Composite.add(this.world,joints);
      this.entities=data.entities.map(e=>({...e,bodies:bodies.filter(b=>b.plugin.entityId===e.id),joints:joints.filter(c=>c.plugin.joint&&c.bodyA?.plugin.entityId===e.id)}));
      for(const b of bodies)b.frictionAir=this.drag_(b); // bodies are rebuilt without their drag, so give it back
      this.nextId=Math.max(0,...this.entities.map(e=>e.id))+1;this.stains=Array.isArray(data.stains)?data.stains.slice(-300):[];
      // Keep new ragdolls' collision groups distinct from restored groups.
      Body._nextNonCollidingGroup=Math.min(Body._nextNonCollidingGroup,...bodies.map(b=>b.collisionFilter.group-1));
    }
  }
  return {Simulation,CATALOG,SETTINGS,defaults,sanitize,defs,clamp,ANATOMY};
});

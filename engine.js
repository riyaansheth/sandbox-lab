(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('matter-js'), require('./items.js'));
  else root.Sandbox = factory(root.Matter, root.Items);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, Items) {
  'use strict';
  const { Engine, Bodies, Body, Composite, Constraint, Events, Query, Vector } = M;
  // Items and materials are data (items.js). defs is the item row by id, with its material's properties folded in as .mat; CATALOG is what the library shows.
  const {MATERIALS,ITEMS,CATEGORIES}=Items,defs=Object.fromEntries(ITEMS.map(item=>[item.id,{...item,mat:MATERIALS[item.material]||MATERIALS.flesh,...(item.firearm&&item.firearm.energy!==undefined?{firearm:{...item.firearm,damage:item.firearm.damage??item.firearm.energy}}:{})}])),CATALOG=ITEMS;
  const matOf=p=>MATERIALS[p.material]||MATERIALS.metal;
  // Every random choice in the simulation goes through here, so a test (or a replay) can seed it: sim.seed(n). Unseeded, it is Math.random.
  let random=Math.random;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const rnd=(a,b)=>a+random()*(b-a);
  // Dimensions are shared by the physics bodies and the renderer, in world pixels.
  // A true side profile, facing +x: one torso seen edge-on, both arms hanging from the one shoulder point and both legs from the one hip, exactly overlapped at rest.
  // Slots 5-7 and 11-13 are the far arm and leg (drawn behind the torso), 8-10 and 14-16 the near ones (drawn in front). [part, x, y, width, height] from the spawn point.
  const ANATOMY=[
    // The foot's physics box sits exactly centred under the ankle: loaded even one pixel off-centre it rocks onto its heel and skates (7 px/s); the drawing extends the toes forward of the box instead.
    // The neck shows half the length it has: the head sits 7 px down over its top half (parts of one body do not collide), and pivots about a point inside the jaw.
    // A neck body that was really 7 px long had too little inertia and too short a lever between its two joints to hold any pose.
    ['head',2,-98,24,30],['neck',0,-84,11,14],['chest',0,-60,26,36],['abdomen',0,-32,22,23],['pelvis',0,-11,24,23],
    ['upper arm',0,-54,12,35],['forearm',0,-21,10,31],['hand',0,1,10,15],
    ['upper arm',0,-54,12,35],['forearm',0,-21,10,31],['hand',0,1,10,15],
    ['thigh',0,22,16,45],['shin',0,64,12,41],['foot',0,88,22,12],
    ['thigh',0,22,16,45],['shin',0,64,12,41],['foot',0,88,22,12]
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
    {id:'painReactions',section:'Ragdolls',label:'Pain reactions',help:'Flinching, clutching wounds, guarding, limping, hunching, trembling, writhing, panic when burning. Off, a hurt ragdoll just stands or falls.',type:'toggle',def:true},
    {id:'reactionIntensity',section:'Ragdolls',label:'Reaction intensity',help:'How big the movements of a reaction are.',type:'range',min:.25,max:2,step:.05,def:1,unit:'×'},
    {id:'painSensitivity',section:'Ragdolls',label:'Pain sensitivity',help:'How much pain a given injury causes.',type:'range',min:0,max:3,step:.1,def:1,unit:'×'},
    {id:'breathing',section:'Ragdolls',label:'Breathing',help:'Living humans breathe: faster and deeper in pain, shallow near death.',type:'toggle',def:true},
    {id:'awareness',section:'Ragdolls',label:'Awareness',help:'Conscious humans look at what threatens them, throw their arms up at something coming at their head, pull away from heat, and start when someone nearby is hurt.',type:'toggle',def:true},
    {id:'faces',section:'Ragdolls',label:'Faces',help:'Eyes and mouth follow pain, consciousness and where the ragdoll is looking. Off, every face is neutral.',type:'toggle',def:true},
    {id:'grunts',section:'Ragdolls',label:'Grunts',help:'A soft synthesized grunt when a conscious human is hit. Needs sound on.',type:'toggle',def:false},
    {id:'brainDamage',section:'Ragdolls',label:'Brain damage',help:'A damaged head causes blackouts: the ragdoll collapses now and then.',type:'toggle',def:false},
    {id:'slowHealing',section:'Ragdolls',label:'Slow injury healing',help:'Wounds of the living slowly close, bones knit and blood is replaced.',type:'toggle',def:false},
    {id:'powerRadius',section:'Physics',label:'Power radius',help:'Size of the fire, cold, shock and heal fields at the cursor. The dashed ring is the real reach.',type:'range',min:.5,max:3,step:.1,def:1,unit:'×'},
    {id:'rigorMortis',section:'Gore',label:'Rigor mortis',help:'The dead stiffen over a minute, so a body left for a while holds its pose.',type:'toggle',def:true},
    {id:'fallDamage',section:'Gore',label:'Fall damage',help:'Multiplies the damage a ragdoll takes from hitting the floor, walls and anything else that does not move. 0 turns it off.',type:'range',min:0,max:3,step:.1,def:1,unit:'×'},
    {id:'fragility',section:'Gore',label:'Fragility multiplier',help:'Multiplies all damage to ragdolls. Higher is more fragile.',type:'range',min:.1,max:10,step:.1,def:1,unit:'×'},
    {id:'jointStrength',section:'Gore',label:'Joint strength',help:'How much force or damage it takes to tear a limb off.',type:'range',min:.25,max:5,step:.05,def:1,unit:'×'},
    {id:'bleedRate',section:'Gore',label:'Bleeding rate',help:'How fast wounds drain blood. Zero means nobody bleeds out.',type:'range',min:0,max:5,step:.1,def:1,unit:'×'},
    {id:'limbCrush',section:'Gore',label:'Limb crushing',help:'A destroyed limb that takes another heavy blow is crushed out of existence.',type:'toggle',def:false},
    {id:'crushSensitivity',section:'Gore',label:'Limb crush sensitivity',help:'How little force it takes to crush a destroyed limb.',type:'range',min:25,max:400,step:5,def:100,unit:'%'},
    {id:'fragments',section:'Gore',label:'Procedural fragments',help:'Crushed limbs leave physical fragments behind.',type:'toggle',def:true},
    {id:'gibCount',section:'Gore',label:'Gib count',help:'Flesh chunks thrown by a crushed or blasted limb, plus half as many bone fragments. Needs procedural fragments on.',type:'range',min:0,max:8,step:1,def:3,unit:''},
    {id:'extraGunshot',section:'Gore',label:'Extra gunshot particles',help:'Bullet hits throw out more debris.',type:'toggle',def:false},
    {id:'bloodAmount',section:'Gore',label:'Blood amount',help:'How much blood sprays and drips. Visual only; bleeding rate decides how fast anyone bleeds out.',type:'range',min:0,max:3,step:.1,def:1,unit:'×'},
    {id:'arterialSpurts',section:'Gore',label:'Arterial spurts',help:'Deep wounds to the neck, upper arms, thighs and heart pump blood out in time with the pulse, and drain far faster.',type:'toggle',def:true},
    {id:'maxStains',section:'Gore',label:'Maximum stains',help:'Oldest stains and pools are removed beyond this many.',type:'range',min:50,max:600,step:10,def:300,unit:''},
    {id:'stainLifetime',section:'Gore',label:'Stain lifetime',help:'Seconds before a dried stain fades away. Zero keeps them until the limit is reached.',type:'range',min:0,max:600,step:10,def:180,unit:' s'},
    {id:'organDamage',section:'Gore',label:'Organ damage',help:'Deep wounds can find the brain, heart, lungs or gut: instant death, blackouts, internal bleeding, suffocation.',type:'toggle',def:true},
    {id:'noGore',section:'Gore',label:'No gore',help:'Hides blood, stains and wounds. Injuries still happen, they are just not drawn.',type:'toggle',def:false},
    {id:'bulletDamage',section:'Weapons',label:'Bullet damage',help:'Damage of one bullet, from the shoot tool or a pistol.',type:'range',min:5,max:300,step:5,def:55,unit:''},
    {id:'bulletSpeed',section:'Weapons',label:'Bullet speed',help:'Rounds fly at a tenth of their real muzzle velocity so the difference between a pistol, a rifle and a crossbow can be seen. This scales all of them.',type:'range',min:.25,max:4,step:.25,def:1,unit:'×'},
    {id:'bulletForce',section:'Weapons',label:'Bullet knockback',help:'How hard a bullet shoves what it hits.',type:'range',min:0,max:6,step:.1,def:1,unit:'×'},
    {id:'explosionPower',section:'Weapons',label:'Explosion power',help:'Multiplies the blast force and damage of every explosion.',type:'range',min:.25,max:4,step:.05,def:1,unit:'×'},
    {id:'pierceSpeed',section:'Weapons',label:'Piercing speed',help:'How fast a blade must travel point-first to run a body through. Lower pierces more easily.',type:'range',min:.5,max:20,step:.5,def:2.5,unit:''},
    {id:'bladeGrip',section:'Weapons',label:'Blade grip',help:'How firmly flesh holds a lodged blade. Low values let it slide out with a light pull, or under the body\'s own weight.',type:'range',min:1,max:30,step:1,def:2,unit:''},
    {id:'iterations',section:'Physics',label:'Physics iterations',help:'Solver passes per step. Higher is more accurate and slower.',type:'range',min:4,max:64,step:1,def:10,unit:''},
    {id:'airDrag',section:'Physics',label:'Air resistance',help:'Multiplier on air drag. Zero is a vacuum.',type:'range',min:0,max:5,step:.1,def:1,unit:'×'},
    {id:'grabStrength',section:'Physics',label:'Grab strength',help:'How tightly what you drag follows the cursor. Low is loose and swingy, high is tight. Things leave the cursor with whatever speed they had.',type:'range',min:.04,max:.6,step:.01,def:.16,unit:''},
    {id:'maxObjects',section:'Physics',label:'Object limit',help:'Spawning stops at this many bodies. A ragdoll is 17.',type:'range',min:100,max:1000,step:50,def:500,unit:''},
    {id:'slowMotion',section:'Physics',label:'Slow-motion speed',help:'How fast time runs while slow motion (G) is on.',type:'range',min:5,max:90,step:5,def:20,unit:'%'},
    {id:'decals',section:'Visuals',label:'Decals',help:'Blood stains and scorch marks on the floor.',type:'toggle',def:true},
    {id:'tracers',section:'Visuals',label:'Bullet tracers',help:'Draws the path of each shot.',type:'toggle',def:true},
    {id:'particles',section:'Visuals',label:'Particle effects',help:'Sparks, smoke, fire and spray.',type:'select',options:['Off','Low','High'],def:'High'},
    {id:'shake',section:'Visuals',label:'Screen shake intensity',help:'Camera shake from explosions and thunder.',type:'range',min:0,max:3,step:.1,def:1,unit:'×'},
    {id:'grid',section:'Visuals',label:'Background grid',help:'The measurement grid on the chamber wall.',type:'toggle',def:true},
    {id:'shadows',section:'Visuals',label:'Contact shadows',help:'Soft shadows where objects are near the floor.',type:'toggle',def:false},
    {id:'vignette',section:'Visuals',label:'Vignette',help:'Darkened screen edges.',type:'toggle',def:true},
    {id:'tempUnit',section:'Interface',label:'Temperature unit',help:'Unit used in the detail view.',type:'select',options:['Celsius','Fahrenheit','Kelvin'],def:'Celsius'},
    {id:'showFps',section:'Interface',label:'Show framerate',help:'Frames per second, top right of the chamber.',type:'toggle',def:true},
    {id:'hints',section:'Interface',label:'Tool hints',help:'The caption describing the active tool.',type:'toggle',def:true},
    {id:'zoomSensitivity',section:'Interface',label:'Zoom scroll sensitivity',help:'How fast the scroll wheel zooms.',type:'range',min:.25,max:3,step:.05,def:1,unit:'×'},
    {id:'panSpeed',section:'Interface',label:'Camera pan speed',help:'How fast the arrow keys move the camera.',type:'range',min:.25,max:3,step:.05,def:1,unit:'×'},
    {id:'sound',section:'Audio',label:'Sound',help:'Synthesized impacts, shots, explosions and thunder.',type:'toggle',def:false},
    {id:'volume',section:'Audio',label:'Volume',help:'Master volume.',type:'range',min:0,max:100,step:5,def:60,unit:'%'}
  ];
  // Damage profiles: one row per damage type. hp is always the full amount; the rest say what kind of injury it is.
  //   bone: bone damage per point · bleed: bleeding added per point · pain per point · stun multiplier · deep: reaches organs · wound: what it leaves (null = nothing)
  // Knockback is not here on purpose: bullets, blades, falls and blasts already push through the physics.
  const PROFILES={
    impact:{bone:1,  bleed:1/150,pain:.55,stun:1,  deep:false,wound:'bruise'},  // blunt: breaks bones, barely bleeds
    cut:   {bone:.3, bleed:1/60, pain:.7, stun:.6, deep:false,wound:'cut'},     // long and shallow
    stab:  {bone:.55,bleed:1/45, pain:.9, stun:.8, deep:true, wound:'stab'},    // deep and narrow
    bullet:{bone:.55,bleed:1/45, pain:.8, stun:1,  deep:true, wound:'bullet'},
    exit:  {bone:.2, bleed:1/30, pain:.5, stun:0,  deep:false,wound:'exit'},    // the far side of a through-shot: bigger, wetter
    blast: {bone:1,  bleed:1/70, pain:1,  stun:1.3,deep:true, wound:'blast'},
    burn:  {bone:.1, bleed:0,    pain:1.2,stun:.5, deep:false,wound:'burn'},    // cauterises: see damage()
    shock: {bone:0,  bleed:0,    pain:.22,stun:0,  deep:false,wound:'shock'}    // current cooks; it does not cut: an entry burn, an exit burn and a fern between them
  };
  const PAIN_PART={head:1.4,pelvis:1.4,neck:1.2,hand:1.1,foot:1.1}; // where it hurts more than elsewhere
  // Organs by body part: [organ, region in the part's own frame as x0,y0,x1,y1 fractions of its half-size, damage multiplier].
  const ORGANS={head:[['brain',-1,-1,.7,.3,1.5]],chest:[['heart',-.5,-.95,.5,-.2,2],['lungs',-1,-1,1,.5,1]],abdomen:[['gut',-1,-1,1,1,.8]],pelvis:[['gut',-1,-1,1,.2,.6]]};
  // Where on a part a blow lands changes what it does. Zones are in the part's own frame, -1..1 each way (x: back to front, y: top to bottom): [what, x0, y0, x1, y1].
  // artery: the carotid, the brachial high in the arm, the femoral high in the thigh - a deep wound there spurts, is not capped, and kills in about twenty seconds unless it is stopped.
  // joint: the elbow and knee ends - the limb is crippled even by a light hit (bone damage x JOINT_HIT). spine: the back edge of the trunk - a deep hit leaves everything below it limp.
  const ZONES={neck:[['artery',-.2,-1,1,1],['spine',-1,-1,-.5,1]],'upper arm':[['artery',-1,-1,1,-.5],['joint',-1,.72,1,1]],forearm:[['joint',-1,-1,1,-.72]],thigh:[['artery',-1,-1,1,-.45],['joint',-1,.72,1,1]],shin:[['joint',-1,-1,1,-.72]],
    chest:[['spine',-1,-1,-.5,1]],abdomen:[['spine',-1,-1,-.5,1]],pelvis:[['spine',-1,-1,-.5,1]]};
  const ARTERY_RATE=2.5,ARTERY_DRAIN=.8,JOINT_HIT=3,SPINE_HIT=25,DROP_HIT=12; // arterial wounds bleed this much faster, in spurts, and drain this much more blood per unit of bleed; force that cuts the cord; force on an arm that makes its hand let go
  const CLOT=.012,DRY_TIME=30,POOL_MAX=46,BODY_STAINS=5,PART_STAINS=12,BLOOD='#922c33',OIL='#2f4a4f'; // clotting per second at rest; seconds for blood to dry; biggest pool; stains kept per body
  const GIB_LIFE=14,GIB_MAX=36; // seconds a gib lasts, and how many may exist at once
  const FRACTURE=50,FRACTURE_SLACK=.7; // bone at or below this is fractured; a fractured limb's joints bend this much further
  // ---- Muscles. A pose is a table of joint targets, keyed by the slot of the joint's outer part: [angle relative to the parent part, strength multiplier].
  // Angles are for a right-facing body and are mirrored for a left-facing one. Anything a pose does not mention is [0, 1]: straight, full strength.
  // Arms are mirror images of each other (the left elbow bends negative, the right positive), so arm entries come in pairs.
  const POSES={
    stand:{5:[.12,1],6:[-.16,1],8:[-.1,1],9:[-.3,1]},   // legs stay symmetric and straight: any standing asymmetry ratchets the feet along the floor with each breath
    kneel:{11:[.15,1.3],14:[.15,1.3],12:[1.9,1.3],15:[1.9,1.3],13:[.4,.6],16:[.4,.6]},                                  // on the knees, shins folded back
    crouch:{11:[-1.05,1.5],14:[-1.05,1.5],12:[2.0,1.5],15:[2.0,1.5],3:[-.15,1],5:[-.5,1.5],8:[-.5,1.5]},             // knees under the body, ready to rise
    gather:{11:[-.7,1.2],14:[-.7,1.2],12:[1.4,1.2],15:[1.4,1.2],5:[-.9,2],8:[-.9,2],6:[-1.3,2],9:[-1.3,2]},          // lying: limbs drawn in, hands under the shoulders
    pushup:{11:[-.5,1.2],14:[-.5,1.2],12:[1.2,1.2],15:[1.2,1.2],5:[-1.4,5],8:[-1.4,5],6:[-.15,5],9:[-.15,5]},        // arms straighten against the floor
    crawl:{11:[0,.12],14:[0,.12],12:[.15,.1],15:[.15,.1],13:[0,.1],16:[0,.1],3:[0,.6],4:[0,.4],0:[.25,1.5]},                                               // belly down; the arm cycle is added on top
    curl:{11:[-1.25,1],14:[-1.25,1],12:[2.2,1],15:[2.2,1],3:[-.35,1],4:[-.35,1],1:[.3,1],0:[.3,1],5:[-.7,1.5],8:[-.7,1.5],6:[-2.1,1.5],9:[-2.1,1.5]},
    limp:Object.fromEntries(Array.from({length:17},(_,slot)=>[slot,[0,0]]))        // every muscle off: unconscious or dead
  };
  // How strong each joint's muscles are next to each other, and how hard any of them can pull: the error a muscle "sees" is capped, which caps its torque.
  const MUSCLE={atlas:1.6,neck:1.8,spine:1.6,waist:1.6,shoulder:.32,elbow:.26,wrist:.16,hip:1.7,knee:1.7,ankle:1.3},MUSCLE_KP=.0034,MUSCLE_KD=.0042,MUSCLE_REACH=.45,MUSCLE_MAX=2,POSE_BLEND=.25; // MUSCLE_MAX: the chest carries five joints, so their stiffnesses add up on it; much above 2 each and a rigid pose rings, then explodes
  // Reactions. FLINCH: seconds a flinch lasts. STEP: seconds per recovery step, and how far a stagger shifts the balance point (px per point of damage, capped).
  const GETUP_STAGES=[['gather',.35],['pushup',.5],['crouch',.45]],KNEEL_HEIGHT=96,CRAWL_PULL=.34,CRAWL_PRESS=.45,CRAWL_LIFT=.05,CRAWL_SPEED=.9,CRAWL_PERIOD=.9,FLEE_TIME=5; // get-up stages [pose, seconds]; crawl forces are fractions of body weight
  const CLUTCH_PAIN=14,GUARD_HP=75,SPARE_LEG_HP=40,SHOCK_LOCK=.6,SHOCK_LIMP=.8,ARM_UPPER=34,ARM_FORE=38; // pain at which a hand goes to the wound; part hp below which an arm is guarded / a leg is kept off the floor; shock timings; arm lengths for the reach
  const BRACED=.6; // px per step: faster than this downward and a part is not planted, it is falling
  const THROW_MAX=38; // px per 1/60 s: nothing leaves the cursor faster than this
  const GRAB_RATE=100,GRAB_DAMP=1,GRAB_GEAR=30,GRAB_STABLE=90,GRAB_ACCEL=14000,GRAB_FORCE=260000,GRAB_CALM=.06,GRAB_CALM_PART=.2,GRAB_INERTIA=25; // spring rate (rad/s) per unit of the Grab strength setting; damping ratio; most a part may haul, in its own masses; the stiffest a spring the step can carry (rad/s); limits on the pull, px/s2 per unit mass and outright; share of its spin a held thing loses each substep
  const PIN_TEAR=14; // px a lodged blade's pins may stretch before it is torn out
  const LIMB_SPEED=110,LIMB_SPIN=.5; // px and radians per 1/60 s: faster than anything falls (a body's terminal velocity is 55 m/s, 100 px)
  const KNEEL_BLOOD=50,SLUMP_BLOOD=44,TWITCH_WINDOW=3.5; // blood levels at which a body can no longer stand, then no longer kneel; seconds after death in which a nerve may still fire
  const AWARE_EVERY=.1,SEE_FAST=5,SEE_RANGE=300,INCOMING=.45,HEAT_NEAR=70,WITNESS_RANGE=340; // awareness runs ten times a second; px/step that counts as fast; how far it notices; seconds ahead it anticipates a hit; how close heat has to be; how far away a neighbour's injury startles
  // Bullets: x1.4 at the muzzle, full damage out to RANGE_NEAR px, then falling by one for every RANGE_FALLOFF px down to RANGE_MIN. A round that still carries THROUGH damage goes clean through fresh flesh.
  const CONTACT_SHOT=2,BULLET_FLOOR=8;
  // Heavy rounds. Pistol-class rounds (under RIFLE_E) never take a part off except pressed against it. Rifle rounds (under HEAVY_E) can take a hand or a foot, or a limb whose bone is already broken. Heavier rounds can take any limb,
  // and the .50 class (FIFTY_E and up) anything: the head, the chest, and it cuts the body in two at the waist. What decides it is the energy spent in the part against RUIN_E for that part, x the Joint strength setting.
  const RIFLE_E=2,HEAVY_E=5,FIFTY_E=20,RUIN_E={hand:.6,foot:.6,forearm:1.3,shin:1.3,'upper arm':1.3,thigh:1.3,neck:1.2,head:2.5,abdomen:4,pelvis:5,chest:6},GIB_EXIT_E=3,CHIP_E=2;
  const G_SCALE=9.81*110/1e6,RAGDOLL_TERMINAL=55,SPIN_AIR={part:.015,other:.006}; // Matter's gravity scale for 9.81 m/s2 at 110 px to the metre (its acceleration is gravity.y x scale, in px per ms2); a body falling belly-down tops out at about 55 m/s; how much of its spin a body loses to the air each 1/60 s
  const PX_PER_M=110,SHOT_SCALE=.1,SHOT_REACH=2500; // a standing body is about 1.8 m; rounds fly at this fraction of their real speed; how far a round goes
  const RANGE_POINT_BLANK=1.4,RANGE_NEAR=60,RANGE_FALLOFF=900,RANGE_MIN=.3;
  // Does the segment a->b (in a part's frame, scaled to -1..1) cross the rectangle z? Liang-Barsky clipping, no allocation.
  const crosses=(ax,ay,bx,by,z)=>{let t0=0,t1=1;const dx=bx-ax,dy=by-ay;for(const [p,q] of [[-dx,ax-z[0]],[dx,z[2]-ax],[-dy,ay-z[1]],[dy,z[3]-ay]]){if(p===0){if(q<0)return false;continue;}const r=q/p;if(p<0){if(r>t1)return false;if(r>t0)t0=r;}else{if(r<t0)return false;if(r<t1)t1=r;}}return true;};
  // Energy. A round carries E (9 mm pistol = 1) and spends it on what it passes: in flesh FLESH_E per px, more for a faster, harder round (x (1 + FLESH_FAST x E): a rifle round yaws and dumps energy where a pistol round pushes through),
  // a fixed BONE_E where its line crosses a part's bone, and in anything else the material's resist per px (0.15 x absorb^4). It goes on while E is left. Damage is the energy spent, x the Bullet damage setting.
  const FLESH_E=.03,FLESH_FAST=.4,RESIST_K=.15,BONE_E={head:.5,neck:.25,chest:.3,abdomen:.25,pelvis:.4,'upper arm':.35,forearm:.25,hand:.15,thigh:.45,shin:.35,foot:.15};
  // Where each part's bone is, as a rectangle in the part's own frame (-1..1 each way, x back to front): the long bones down the middle of a limb, the skull and the ribs throughout, the spine at the back of the neck and the belly.
  const BONE_ZONE={head:[-1,-1,1,1],neck:[-.75,-1,.05,1],chest:[-1,-1,1,1],abdomen:[-1,-1,-.45,1],pelvis:[-1,-1,1,1],'upper arm':[-.35,-1,.35,1],forearm:[-.4,-1,.4,1],hand:[-.8,-1,.8,1],thigh:[-.35,-1,.35,1],shin:[-.35,-1,.35,1],foot:[-.9,-1,.9,1]};
  const FROST_STIFF=.92,NECK_INERTIA=14,NECK_DAMP={atlas:.3,neck:.3},HARD_STOP={atlas:.1,neck:.1,other:.3}; // share of the relative spin a neck joint loses each substep; rad past its limit at which a joint stops dead
  const WRENCH_PULL=70,WRENCH_BLOW=45,VITAL_JOINT={atlas:4,neck:4,spine:3,waist:3}; // px the cursor must be hauling from the body; damage a blow must do; how much longer the neck and spine hold out than a limb
  const BREAK_BEND=.8,BREAK_TIME=.1; // radians past its limit, and seconds held there, at which a joint breaks
  // Balance and landing. STEP_*: how far ahead of its feet (px, with velocity looked ahead) the chest may get before a recovery step, and the pause between steps.
  // LAND_*: a fall speed (px/frame) that counts as a full-depth landing, and how long the legs take to straighten again. STRUGGLE_*: tone and kick rate of a body held off the ground.
  const STEP_TRIGGER=15,STEP_LOOKAHEAD=10,STEP_COOL=.22,STEP_REACH=9,STEP_LIFT=.16,FOOT_AHEAD=0,LAND_FULL=13,LAND_RECOVER=.55,STRUGGLE_TONE=.5,STRUGGLE_RATE=6.5;
  const SKIN_REGROW=300; // seconds for a body burnt to the bone to be whole again
  const CHAR_RATE=.08; // per second of burning: skin is gone by about .5, muscle by .9, bare bone at 1
  // Falls and blunt impacts (see land()). Speeds are px per 1/60 s, as Matter reports them between steps: under real gravity and air a 1.2 m drop lands at 8.7 (4.8 m/s), 1.5 m at 9.8, 3 m at 13.9, 5 m at 17.8, 7 m at 21.1.
  // The damage is the energy above a harmless 1.5 m fall, so it grows with the height fallen from: twice as high, about twice the damage.
  const FALL_SAFE=9.8,FALL_SAFE_HEAD=9.2,FALL_K=1.15,FALL_FLOOR=8,FALL_HP=.6,FALL_MASS=3,FALL_REST=1.5,OBJECT_K=.5,OBJECT_SAFE=14,LAND_WINDOW=.25,LAND_ABSORB=.6,FALL_SPINE=30,NECK_FALL=95,TRAUMA_SAFE=45,TRAUMA_SPAN=70,TRAUMA_BLEED=2.5; // blunt damage to the trunk in one fall that is survivable for certain; how much more makes internal injuries certain; how fast those bleed (% of blood a second - about half a minute to live, unless the bleeding is stopped)
  const FALL_AREA={head:.45,neck:.5,chest:.25,abdomen:.27,pelvis:.3,thigh:.32,'upper arm':.34,shin:.55,forearm:.55,foot:.55,hand:.5},FALL_FLAT={shin:.3,forearm:.3,foot:.35,hand:.3},FALL_AXIAL=new Set(['foot','shin','hand','forearm']),FALL_SHARE=[1,.45,.24,.13,.08,.05]; // how much of the impact a part takes for its area; which parts pass load along the bone; what each part up the chain gets, as a share of what the landing part took
  const KNOCKDOWN=32; // damage in one blow that puts a body on the floor; anything less is a flinch or a stagger
  const TOPPLE_TIME=.9,TOPPLE_PUSH=.0012;
  const CRUSH_PULL=90,CRUSH_HOLD=.35,CRUSH_RATE=60,CRUSH_MORE=1.2; // px the cursor must push past the surface (scaled by joint strength) - most of a metre, never by accident; seconds it must be held; damage per second at that push, and more per px beyond it
  // Powers: fire, cold, shock and heal exist in the world at the cursor while the button is held (see powers()). Radii are px at Power radius 1x; rates are per second at the centre, before the material's share.
  const POWER_R={fire:40,cold:40,heal:40,shock:120},POWER_SCAN=1/30,FIRE_RATE=860,COLD_RATE=170,/* flesh is frozen solid after about a second: long enough to watch it stiffen */COLD_FLOOR=-80,COLD_QUENCH=1500,FROZEN=-30,FROZEN_BLOW=22,COLD_KO=2.5,POWER_MARKS=36,FROST_LIFE=10;
  const BATTERY_EVERY=1.2; // seconds between a battery's discharges: a short burst, then quiet. (The shock power is the continuous one.)
  const SHOCK_CHAIN_HELD=12,SHOCK_TICK=.08,SHOCK_DOSE=.44,SHOCK_ARCS=3,HEAL_HP=35,HEAL_WOUND=7,HEAL_BLOOD=14,HEAL_PAIN=45,HEAL_ORGAN=18,HEAL_TEMP=260; // a held shock is one tick every 80 ms at the dose that matches the old one-a-click rate; heal: hp and bone per second, px of wound closed per second, and the body's blood, pain and organs
  const GARMENT_TOUCH={vest:['chest','abdomen'],top:['chest','abdomen','upper arm','forearm'],pants:['pelvis','thigh','shin'],hat:['head'],mask:['head','neck'],shoes:['foot'],gloves:['hand']},GARMENT_NEEDS={vest:'chest',top:'chest',pants:'pelvis',hat:'head',mask:'head',shoes:'foot',gloves:'hand'},GARMENT_ORDER=['hat','vest','top','mask','pants','shoes','gloves'],REDRESS_WAIT=1.2; // the parts a garment must touch to be put on; the part a body must have to wear it; which comes off first where a part wears two; seconds before a garment just taken off can be put on again
  const POINT_BLANK=40,RICO_GLANCE=.42,RICO_MAX=2,RICO_KEEP=.8,RICO_JITTER=.08,SKULL_E=2,GLANCE_B=.7,SKULL_KILL=1.2,CONCUSSION=2.5,BONE_HIT=18,BONE_DEFLECT=.35,CAVITY_MS=700,CAVITY_BRUISE=.18,CAVITY_BLEED=.12,TUMBLE_RATE=1.5,TUMBLE_WOUND=1.8,LODGED_MAX=12,LODGED_NEAR=6,LODGED_CLOT=.25,LODGED_PAIN=.6;
  // buckshot within POINT_BLANK px is one wound; ricochet below a glancing angle (cos to the normal) up to RICO_MAX times, keeping RICO_KEEP of its energy; the skull turns rounds under SKULL_E at a glance and one that spends SKULL_KILL crossing it kills;
  // bone damage and deflection of a crossing round; rounds at or over CAVITY_MS m/s bruise and bleed inside round their path and tumble once through something; a lodged round slows the clotting of the wound it is in and aches
  const ARTERIAL_JOINT=new Set(['hip','shoulder','neck','atlas','waist','spine']),RUIN_JOINT=.55,SHOT_ENTRY=.7,CHANNEL_NEAR=4,CHANNEL_EASE=.3; // of the energy a round spends in a part it passes through, the share that goes into the entry wound; the rest makes the exit
  const ARMOURS=Object.fromEntries(ITEMS.filter(i=>i.armour).map(i=>[i.garment.outfit,{...i.armour,id:i.id,name:i.name}])),ARMOUR_ON={chest:'vest',abdomen:'vest',head:'hat'},BLUNT_K=.12,BLUNT_PAIN=18; // armour by the outfit id it is worn as; what covers which part; the share of a stopped round's energy that still reaches the body as a blow, and the pain of it
  const LIMB_CHAIN={'upper arm':1,forearm:1,hand:1,thigh:1,shin:1,foot:1},TOURNIQUET_NUMB=20,TOURNIQUET_DEAD=120,STITCH_REACH=10,STITCH_EASE=10; // the parts a tourniquet can go on; seconds for what is below it to go numb, and to die; how near the wound a lodged round must be to come out with it; the pain a stitch takes away
  // Feedback. Bullet holes kept per object and in all; the life, number and sizes of ejected casings; the seconds a destroyed heart still beats on; rigor mortis over RIGOR_TIME seconds after death.
  const PUMP_DELAY=.35,HOLES_PER_BODY=8,HOLE_MAX=160,CASING_MAX=30,CASING_LIFE=9,CASING={pistol:[4,1.8,'#c9a24a'],rifle:[6.5,1.8,'#c9a24a'],shell:[7,3.4,'#b8342c']},HEART_LAST=[3,5],RIGOR_TIME=60,RIGOR_STIFF=.9;
  const IMMORTAL_FLOOR=30,IMMORTAL_REGEN=1.5,STORM_SAVE=10; // the immortal never has less blood than this, and gets blood and organs back at this much a second
  const CONDUIT_GAIN=40,CONDUIT_BOLT=60,SURGE_AT=25,ZAP_COST=8,ZAP_EVERY=.12,ZAP_REACH=520,ZAP_DOSE=1.8,ZAP_BURN=30,ZAP_KICK=7,LASER_COST=.5,LASER_REACH=1400,LASER_BURN=2.2,LASER_CHAR=.6,CONDUIT_HEAL=.05; // Storm: charge from one ordinary shock and from a bolt; a jump that makes him surge; what a throw of lightning costs and does; what a moment of the eye beams costs and does
  const HOLD_LEVER=16,REPIERCE_WAIT=.5;
  const BANDAGE_HOLDS=30,BLAST_SEVER=.8,SHOCK_REVIVE=.6,HEART_RESTART=.9,SHOCK_SAFE=3,SHOCK_ARREST=.3,SHOCK_FADE=5,LIGHTNING_DOSE=3,WAKE_PAIN=60; // a blow this hard tears a dressing off; chance a blast at its very centre takes a given limb off; chance a shock restarts a dead human, and one whose heart is what failed; shocks taken in quick succession that are safe, the chance per shock beyond that of cardiac arrest, seconds for one shock's worth to fade, what a lightning strike counts as, and the pain a shock cuts through to wake someone
  // Blood loss. Only the head, the neck and the upper torso are fatal spots: a wound anywhere else closes once it has cost its share (on the 0-100 scale; death is below 25), so one bullet there - entry, exit and a nicked gut together - can never kill. Several can.
  // How deep a blow of each kind goes for its force: 0 marks nothing open (a bruise, a burn), 1 the skin only, 2 through the skin to muscle, 3 through the muscle to bone.
  const WOUND_DEPTH={impact:a=>a>45?2:0,cut:a=>a<12?1:a<30?2:3,stab:a=>a<6?1:a<22?2:3,bullet:a=>a<14?1:a<30?2:3,exit:a=>a<10?2:3,blast:a=>a<20?1:a<55?2:3,burn:()=>0,shock:()=>0},BRUISE_RISE=6,SHOCK_MARK=10; // current only marks the parts it goes through hard
  const FLOW={impact:.3,cut:.45,blast:.8,bullet:1,exit:1.3,stab:1.6},RUN_MAX=18,RUN_RATE=1.6,SMEAR_STEP=7,SMEAR_GAP=14,SMEAR_MAX=220; // drops per unit of bleed by kind of wound; longest run down a part, px, and px per second per unit of bleed; px between marks of a smear
  const HIT_SOUND={impact:'thud',cut:'slice',stab:'slice',bullet:'wet',exit:'wet',burn:'sizzle'},GRAZE_CHORD=5,GRAZE_TURN=.16; // what each kind of blow sounds like on flesh; a round that crosses less than this much of a body only grazes it, and is turned this much
  const CLOT_AT=30,SCAB_AT=150,REOPEN_SPEED=3,REOPEN_RATE=1.5,REOPEN_BLEED=.5,BRUISE_LIFE=300,DEAD_CLOT=12; // wound ages in seconds (body.js draws by the same two); px per substep that tears a clot; chance per second while it does
  const FATAL_SPOTS=new Set(['head','neck','chest']),BLEED_DRAIN=.3,WOUND_BLOOD=14,ARTERY_BLOOD=24,SHOT_BLOOD=40,GUT_BLEED=.7;
  const LIMB_BLOOD=4; // blood left in each severed part, on the 0-100 scale of a whole body
  const BUCKLE=.05; // knee kick, rad per substep, when standing legs go limp
  const FLINCH_TIME=.22,STEP_TIME=.3,STAGGER_PUSH=.9,STAGGER_MAX=26,BRACE_TILT=.6,BRACE_FALL=5;
  const STUN_PART={'upper arm':0,forearm:0,hand:0,foot:.3,shin:.6,thigh:.7}; // how much a hit there knocks the whole body down; unlisted parts count fully
  const MIRROR={5:8,6:9,7:10,8:5,9:6,10:7,11:14,12:15,13:16,14:11,15:12,16:13}; // left limb slots to right and back
  const defaults=()=>Object.fromEntries(SETTINGS.map(s=>[s.id,s.def]));
  // Saved settings come from localStorage or an imported file, so every value is checked against the table before it is used.
  const sanitize=(input={})=>{const out={};for(const s of SETTINGS){const v=input?.[s.id];
    if(s.type==='toggle'&&typeof v==='boolean')out[s.id]=v;else if(s.type==='select'&&s.options.includes(v))out[s.id]=v;else if(s.type==='range'&&typeof v==='number'&&Number.isFinite(v))out[s.id]=clamp(v,s.min,s.max);}return out;};
  // The body is drawn and jointed as seen from the side, facing +x (mirrored when spawned facing left). Both arms and both legs therefore bend the same way:
  // arms and thighs swing forward negative, elbows only flex forward, knees only fold back, the trunk bends forward further than it arches.
  // Joint template: [parent slot, child slot, anchor on parent, anchor on child, min, max, name]. Slots index ANATOMY. Regeneration regrows from the same table.
  const JOINTS=[
    [1,0,{x:0,y:-7},{x:-2,y:7},-.5,.6,'atlas'],[2,1,{x:0,y:-18},{x:0,y:6},-.3,.45,'neck'],[2,3,{x:0,y:17},{x:0,y:-11},-.55,.2,'spine'],[3,4,{x:0,y:10},{x:0,y:-11},-.55,.2,'waist'],
    [2,5,{x:0,y:-10},{x:0,y:-16},-2.9,.9,'shoulder'],[5,6,{x:0,y:17},{x:0,y:-16},-2.5,.05,'elbow'],[6,7,{x:0,y:15},{x:0,y:-7},-.6,.6,'wrist'],
    [2,8,{x:0,y:-10},{x:0,y:-16},-2.9,.9,'shoulder'],[8,9,{x:0,y:17},{x:0,y:-16},-2.5,.05,'elbow'],[9,10,{x:0,y:15},{x:0,y:-7},-.6,.6,'wrist'],
    [4,11,{x:0,y:11},{x:0,y:-22},-1.9,.6,'hip'],[11,12,{x:0,y:22},{x:0,y:-20},-.05,2.4,'knee'],[12,13,{x:0,y:20},{x:0,y:-4},-.5,.6,'ankle'],
    [4,14,{x:0,y:11},{x:0,y:-22},-1.9,.6,'hip'],[14,15,{x:0,y:22},{x:0,y:-20},-.05,2.4,'knee'],[15,16,{x:0,y:20},{x:0,y:-4},-.5,.6,'ankle']
  ];
  const LOCK_STIFFNESS=2,SLOT_MUSCLE=Array.from({length:17},(_,slot)=>{const t=JOINTS.find(j=>j[1]===slot);return t?MUSCLE[t[6]]:1;}); // each slot's usual muscle strength, so a pose can ask for one absolute stiffness everywhere
  const LIMIT_GAIN=.6,LIMIT_SPEED=.4,LIMIT_SHARE=.5,REST_SPEED=.8,REST_DELAY=1,AIR_TONE=.8,AIR_UPRIGHT=.15,HAND_REACH=30,AIM_STRENGTH=.0022,REGROW_BEAT=.42,REGROW_SWELL=.5,REGROW_LAYERS=1.8,STAND_HEIGHT=148,GETUP_TORQUE=3,EARTH=9.81; // calibration knobs: limit stiffness, and rest thresholds just above the solver's idle jitter
  class Simulation {
    constructor() {
      this.engine=Engine.create({gravity:{x:0,y:1,scale:G_SCALE},positionIterations:10,velocityIterations:10,constraintIterations:10,enableSleeping:false});
      this.world=this.engine.world;this.entities=[];this.particles=[];this.flashes=[];this.traces=[];this.stains=[];this.shots=[];this.smears=new WeakMap();
      this.nextId=1;this.time=0;this.gravity=1;this.onEffect=()=>{};this.drag=null;this.power=null;this.powerNear=[];this.powerK=[];this.powerAt=-9;this.powerPick=[-1,-1,-1];this.powerStamp=0;this.damageQueue=[];this.touching=new Set();this.piercing=new Map();this.regrowing=[];this.spare=[];this.tick=0;this.poseWant={angle:new Array(17).fill(0),power:new Array(17).fill(1)};this.support=[];this.shares=[];this.busy=new Array(17).fill(0);this.bites=new WeakMap();this.aimSet=new Set();this.random=Math.random;this.settings=defaults();
      this.groundY=650;this.width=2600;this.height=1000;this.scene='workshop';
      this.boundaries=[Bodies.rectangle(1300,720,3000,140,{isStatic:true,label:'Ground'}),Bodies.rectangle(-50,-3350,100,8200,{isStatic:true}),Bodies.rectangle(2650,-3350,100,8200,{isStatic:true})]; /* no ceiling: things can be stacked, thrown and dropped from as high as you like. The walls go up 7 km's worth of pixels; what gets past 10 000 px is removed */
      this.boundaries.forEach(b=>{b.plugin={boundary:true};b.friction=.85;b.frictionStatic=1;});Composite.add(this.world,this.boundaries);
      Events.on(this.engine,'collisionStart',e=>this.collisions(e.pairs));Events.on(this.engine,'collisionActive',e=>this.disturb(e.pairs));
    }
    seed(n){let a=n>>>0;this.random=random=()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};return this;} // mulberry32
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
      if(d.ragdoll){const e=this.ragdoll(d.ragdoll,x,y,flip);if(e){for(const b of e.bodies)b.plugin.wear=Items.dress(d.outfit,b.plugin.part);if(d.immortal)e.immortal=true;if(d.conduit){e.conduit=true;e.power=0;}}return e;} /* a dressed human is a human: only the paint differs, so nothing in the simulation can tell them apart */
      const opts={density:d.density??d.mat.density,friction:d.mat.friction,frictionStatic:.9,restitution:d.restitution??d.mat.restitution,frictionAir:.006*this.settings.airDrag,isStatic:!!d.static,label:kind};
      const b=d.r?Bodies.circle(x,y,d.r,opts):Bodies.rectangle(x,y,d.w,d.h,{...opts,chamfer:{radius:d.sharp?1:3}});
      this.meta(b,kind,flip?{flip:true}:{});return this.entity(kind,[b]);
    }
    makePart(kind,slot,x,y,angle,group,flip) {
      const robot=kind==='android',[name,,,w,h]=ANATOMY[slot],density=(robot?.0036:.0018)*(name==='head'?1.15:name==='chest'?1.3:1);
      const b=Bodies.rectangle(x,y,w,h,{collisionFilter:{group},density,friction:.8,frictionStatic:1,restitution:0,frictionAir:.015*this.settings.airDrag,chamfer:{radius:Math.min(w/2-1,name==='head'?8:4)}});
      this.meta(b,kind,{part:name,slot,w,h,r:0,material:robot?'metal':'flesh',hp:robot?230:100,maxHp:robot?230:100,wounds:[],severed:[],bleed:0,bone:100,...(flip?{flip:true}:{})});
      if(name==='neck')Body.setInertia(b,b.inertia*NECK_INERTIA); /* as a bare 11 x 14 box the neck has a twenty-seventh of the head's inertia: pinned between the head and the chest it is whipped right round by any sideways tug. It is given the inertia of the column of muscle it stands for */
      if(angle)Body.setAngle(b,angle);return b;
    }
    makeJoint(kind,flip,a,b,[,,pa,pb,min,max,name]) {
      // Anchors are stored unrotated; a regrown limb hangs off a body that may be at any angle.
      const c=Constraint.create({bodyA:a,bodyB:b,pointA:Vector.rotate(flip?{x:-pa.x,y:pa.y}:pa,a.angle),pointB:Vector.rotate(flip?{x:-pb.x,y:pb.y}:pb,b.angle),length:0,stiffness:.97,damping:.2}); // a left-facing body is the mirror image: feet and face point the other way
      c.plugin={joint:true,breakForce:kind==='android'?45:29,min:flip?-max:min,max:flip?-min:max,name};return c;
    }
    ragdoll(kind,x,y,flip=false) {
      const group=Body.nextGroup(true),parts=ANATOMY.map(([,dx,dy],slot)=>this.makePart(kind,slot,x+(flip?-dx:dx),y+dy,0,group,flip));
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
      const a=have.get(t[0])||bring.get(t[0]),b=have.get(t[1])||bring.get(t[1]),stump=main.has(a)?a:b,limb=stump===a?b:a,flip=!!stump.plugin.flip,anchor=x=>{const local=x===a?t[2]:t[3];return Vector.add(x.position,Vector.rotate(flip?{x:-local.x,y:local.y}:local,x.angle));},unused=x=>Vector.add(x.position,Vector.rotate(x===a?t[2]:t[3],x.angle));
      const turn=stump.angle-limb.angle,pivot=anchor(limb);for(const x of piece){if(x.isStatic)Body.setStatic(x,false);Body.rotate(x,turn,pivot);}
      // The piece's own joints (and anything pinned or held in it) carry anchors in world orientation; Matter only turns those on its next solve, and until then they would wrench the piece about. Turn them now.
      for(const c of this.joints){if(c.bodyA&&piece.has(c.bodyA)){Vector.rotate(c.pointA,turn,c.pointA);c.angleA=c.bodyA.angle;}if(c.bodyB&&piece.has(c.bodyB)){Vector.rotate(c.pointB,turn,c.pointB);c.angleB=c.bodyB.angle;}}
      const to=anchor(stump),move=Vector.sub(to,anchor(limb));for(const x of piece){Body.translate(x,move);Body.setVelocity(x,stump.velocity);Body.setAngularVelocity(x,0);}
      const joint=this.makeJoint(owner.kind,flip,a,b,t);if(a.plugin.kind==='android'||b.plugin.kind==='android')joint.plugin.breakForce=45;Composite.add(this.world,joint);links.push(joint);
      for(const x of [a,b]){x.plugin.severed=[];this.bleedOf(x.plugin);}
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
      const flip=!!hand.plugin.flip,side=flip?-1:1,def=defs[item.plugin.kind]||{},grip=def.grip||(def.sharp?{x:0,y:item.plugin.h*.37}:{x:0,y:0}),tilt=def.firearm?side*Math.PI/2:def.sharp?side*1.15:0; // a pistol lies along the forearm, so raising the arm levels it
      if(flip)item.plugin.flip=true;else delete item.plugin.flip;Body.setAngle(item,hand.angle+tilt);const local=Vector.rotate({x:grip.x*side,y:grip.y},item.angle);
      Body.setPosition(item,Vector.sub(hand.position,local));Body.setVelocity(item,hand.velocity);Body.setAngularVelocity(item,0);item.collisionFilter.group=hand.collisionFilter.group;item.plugin.heldBy=e.id;item.plugin.heldSlot=hand.plugin.slot;
      // The second pin sits at the item's centre of mass: a long lever, so the weight of a pistol cannot twist it in the hand.
      const toCentre=Vector.sub(item.position,hand.position),far=Vector.magnitude(toCentre),axis=far>6?Vector.mult(toCentre,Math.min(1,HOLD_LEVER/far)):Vector.rotate({x:0,y:-12},item.angle); /* towards the centre of mass, but no further out than a hand can brace: a pin 50 px from a body as light as a hand whips it off its wrist */for(const offset of [{x:0,y:0},axis]){const point=Vector.add(hand.position,offset);const c=Constraint.create({bodyA:hand,bodyB:item,pointA:offset,pointB:Vector.sub(point,item.position),length:0,stiffness:.9,damping:.2});c.plugin={hold:true};Composite.add(this.world,c);}
      e.restTime=0;this.onEffect('impact',.2);return `Picked up the ${(CATALOG.find(c=>c.id===item.plugin.kind)?.name||'object').toLowerCase()}`;
    }
    release(item){for(const c of this.joints.filter(c=>c.plugin.hold&&c.bodyB===item))Composite.remove(this.world,c);item.collisionFilter.group=0;delete item.plugin.heldBy;delete item.plugin.heldSlot;}
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
      this.entities=this.entities.filter(x=>x.bodies.length);for(const b of whole){b.plugin.severed=[];this.bleedOf(b.plugin);}
      this.regrowing.push({root:body,wait:0});owner.restTime=0;return missing;
    }
    // One part per beat. The new part is full size to the physics at once; plugin.grow (0..1) lets the renderer swell it out of the stump.
    growNext(job) {
      const owner=this.getEntity(job.root);if(!owner||!this.bodies.includes(job.root))return false;
      const whole=this.connected(job.root),slots=new Map([...whole].map(b=>[b.plugin.slot,b]));
      for(const stump of whole)for(const t of JOINTS){const [pa,pb]=t,have=stump.plugin.slot;if((pa!==have&&pb!==have)||slots.has(pa)===slots.has(pb))continue;
        const need=have===pa?pb:pa,flip=!!stump.plugin.flip,offset=Vector.rotate({x:(ANATOMY[need][1]-ANATOMY[have][1])*(flip?-1:1),y:ANATOMY[need][2]-ANATOMY[have][2]},stump.angle);
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
      if(!e.alive||!e.upright||e.paralysed)return false;const part=n=>e.bodies.filter(b=>b.plugin.part===n),chest=part('chest')[0],head=part('head')[0];
      if(!chest||!head||chest.plugin.hp<35||head.plugin.hp<35)return false;
      const live=this.joints.filter(c=>c.plugin.joint&&c.bodyA.plugin.entityId===e.id),has=n=>live.filter(c=>c.plugin.name===n).length;
      if(!has('atlas')||!has('neck')||!has('spine')||!has('waist'))return false;
      if(live.some(c=>c.bodyB.plugin.slot>=11&&this.fractured(c.bodyB)))return false; // a broken leg that is still attached cannot be stood around: it goes down and crawls. A missing one can: that is hopping.
      return part('foot').some(foot=>{const ankle=live.find(c=>c.bodyB===foot),knee=ankle&&live.find(c=>c.bodyB===ankle.bodyA),hip=knee&&live.find(c=>c.bodyB===knee.bodyA);return !!hip&&foot.plugin.hp>0&&this.bears(foot,live);});
    }
    // A leg carries weight only if none of its bones is fractured.
    fractured(b){return b.plugin.material==='flesh'&&b.plugin.slot>=5&&(b.plugin.bone??100)<=FRACTURE;} // limbs only: cracked ribs or a cracked skull hurt, but the trunk still holds itself up
    bears(foot,live=this.joints.filter(c=>c.plugin.joint)){for(let b=foot;b&&b.plugin.part!=='pelvis';b=live.find(c=>c.bodyB===b)?.bodyA)if(this.fractured(b))return false;return true;}
    balancing(e){return this.active(e)&&this.canStand(e);}
    active(e){return !!e.alive&&!!e.upright&&this.settings.autoBalance&&!(e.stun>0)&&e.consciousness!=='unconscious';}
    // stand -> kneel -> crawl -> drag -> curl. Legs that bear weight stand; knees without feet kneel; two good arms crawl, one drags; nothing left, or too much pain, curls up.
    capability(e) {
      if(e.kind==='human'&&((e.pain||0)>=88||e.blood<SLUMP_BLOOD))return 'curl';if(this.canStand(e))return e.kind==='human'&&e.blood<KNEEL_BLOOD?'kneel':'stand'; // bleeding out: first the legs go, then it slumps, then it is unconscious
      const live=this.joints.filter(c=>c.plugin.joint&&c.bodyA.plugin.entityId===e.id),joint=(slot)=>live.find(c=>c.bodyB.plugin.slot===slot),ok=slot=>{const c=joint(slot);return !!c&&!this.fractured(c.bodyB)&&c.bodyB.plugin.hp>0;};
      const chest=e.bodies.find(b=>b.plugin.slot===2),head=e.bodies.find(b=>b.plugin.slot===0);if(!chest||!head||chest.plugin.hp<35||head.plugin.hp<35||!joint(0)||!joint(1))return 'curl';
      const trunk=!!joint(3)&&!!joint(4)&&!e.paralysed,brokenLeg=live.some(c=>c.bodyB.plugin.slot>=11&&this.fractured(c.bodyB));if(trunk&&!brokenLeg&&((ok(11)&&ok(12))||(ok(14)&&ok(15))))return 'kneel'; // kneeling is for missing feet, not for broken legs
      const arms=(ok(5)&&ok(6)?1:0)+(ok(8)&&ok(9)?1:0);return arms===2?'crawl':arms===1?'drag':'curl';
    }
    // Enough is put back to live on: blood, air, a working heart and brain, clotted wounds. Nothing is mended.
    partialRevive(body) {
      const e=this.getEntity(body);if(!e||e.blood===undefined)return false;delete e.heartStops;e.alive=true;e.upright=true;e.paralysed=false;delete e.causeOfDeath;e.consciousness='awake';e.stun=1.5;e.stunNext=0;e.stunIn=0;e.stagN=0;e.flinch=0;e.effort=0;e.restTime=0;e.pin=null;e.shockT=0;e.twitchAt=[];
      e.blood=Math.max(e.blood,65);e.oxygen=100;e.pain=Math.min(e.pain||0,45);if(e.organs){e.organs.heart=Math.max(e.organs.heart,60);e.organs.brain=Math.max(e.organs.brain,75);e.organs.lungs=Math.max(e.organs.lungs,65);}
      for(const b of e.bodies){const p=b.plugin;p.burning=false;p.internal=0;for(const w of [...(p.wounds||[]),...(p.severed||[])])w.bleed=(w.bleed||0)*.2;this.bleedOf(p);if(p.part==='head'||p.part==='chest')p.hp=Math.max(p.hp,40);}
      this.burst(body.position.x,body.position.y,12,'#9fcbb1',2);return true;
    }
    revive(body){const e=this.getEntity(body);if(!e||e.blood===undefined)return false;delete e.heartStops;this.heal(body);e.alive=true;e.upright=true;e.paralysed=false;for(const c of e.joints)c.plugin.broken=false;delete e.causeOfDeath;e.consciousness='awake';e.stun=0;e.stunNext=0;e.stunIn=0;e.stagN=0;e.flinch=0;e.effort=0;e.restTime=0;return true;}
    // After death a nerve may still fire once or twice: a limb jerks at one joint, equal and opposite on its two parts, and that is the end of it. Then the body is left to come to rest.
    twitch(e,seconds) {
      e.deadFor+=seconds;if(e.deadFor<e.twitchAt[0])return;e.twitchAt.shift();if(e.twitchAt[0]>TWITCH_WINDOW)e.twitchAt.length=0;
      const joints=this.joints.filter(c=>c.plugin.joint&&c.bodyA.plugin.entityId===e.id&&c.bodyB.plugin.slot>=5);if(!joints.length)return;const c=joints[(random()*joints.length)|0],a=c.bodyA,b=c.bodyB,total=a.inverseInertia+b.inverseInertia;if(!total)return;
      const kick=(random()<.5?-1:1)*.16;Body.setAngularVelocity(a,a.angularVelocity-kick*a.inverseInertia/total);Body.setAngularVelocity(b,b.angularVelocity+kick*b.inverseInertia/total);e.restTime=0;e.pin=null;e.lastTwitch=this.time;
    }
    // Once per step for every living ragdoll: what the injuries are doing to it. Humans only for blood, organs, oxygen and pain; androids have none of those.
    vitals(e,seconds) {
      const set=this.settings,head=e.bodies.find(b=>b.plugin.part==='head'),human=e.kind==='human';
      if(human){
        let open=0,inside=0,artery=0;for(const b of e.bodies){const p=b.plugin;open+=p.bleed||0;if(p.bleed>0&&p.wounds)for(const w of p.wounds)if(w.artery)artery+=w.bleed||0;if(p.internal){inside+=p.internal;p.bruise=Math.min(1,(p.bruise||0)+p.internal*seconds*.12);p.internal=Math.max(0,p.internal-seconds*.012);}} // internal bleeding shows as a spreading bruise, and clots slowly
        e.blood=Math.max(0,(e.blood??100)-(open*BLEED_DRAIN+artery*ARTERY_DRAIN+inside)*seconds*set.bleedRate);e.bleedingInside=inside>open*BLEED_DRAIN+artery*ARTERY_DRAIN;
        const organs=e.organs,lungs=organs?organs.lungs:100;e.oxygen=clamp((e.oxygen??100)+seconds*(lungs<60?-(60-lungs)/60*5:8),0,100);
        let rounds=0;for(const b of e.bodies)rounds+=b.plugin.lodged?.length||0;e.pain=Math.min(100,Math.max(0,(e.pain||0)-seconds*(open>.3?1.5:4))+rounds*LODGED_PAIN*seconds); // pain ebbs, slower while wounds are open; a round left in the body keeps it aching
        if(e.trauma&&this.time-(e.landT??0)>LAND_WINDOW*2){const chest=this.chestOf(e); /* the fall is over: did the trunk take more than a body can? If so something inside is torn and bleeding fast; if not, it is bruising */
          if(chest)chest.plugin.internal=(chest.plugin.internal||0)+(random()<(e.trauma-TRAUMA_SAFE)/TRAUMA_SPAN?TRAUMA_BLEED:Math.min(.3,e.trauma/200));e.trauma=0;}
        {let sum=0,core=false;for(const b of e.bodies){sum+=this.chill(b);if((b.plugin.slot===0||b.plugin.slot===2)&&b.plugin.heat<=FROZEN)core=true;}e.chill=sum/e.bodies.length;e.frozenT=core?(e.frozenT||0)+seconds:Math.max(0,(e.frozenT||0)-seconds*2);} /* how cold the body is, and how long its head or chest has been frozen */
        if(e.shockDose>0)e.shockDose=Math.max(0,e.shockDose-seconds/SHOCK_FADE);e.hurtScore=Math.max(0,(e.hurtScore||0)-seconds*1.2);let burning=0;for(const b of e.bodies)if(b.plugin.burning)burning++;if(burning)e.pain=Math.min(100,e.pain+seconds*(12+burning*3)*set.painSensitivity); // being on fire keeps hurting
        e.burningParts=burning;e.breath=((e.breath||0)+seconds*(12+e.pain*.28+(e.rise||e.stagN>0?8:0))/60)%1;
        // The heart races with pain and with the first of the blood loss, then fails as the blood runs out. pulse is 0..1, the beat that arterial wounds spurt on.
        e.heartRate=clamp(70+(e.pain||0)*.7+Math.min(45,(100-e.blood)*1.1)-Math.max(0,50-e.blood)*2.6,20,190);e.beat=((e.beat||0)+seconds*e.heartRate/60)%1;e.pulse=Math.max(0,Math.sin(e.beat*Math.PI*2));
        const brain=organs?organs.brain:100;
        if(e.immortal||(e.conduit&&e.power>0)){e.blood=Math.min(100,Math.max(e.blood,IMMORTAL_FLOOR)+seconds*IMMORTAL_REGEN);e.oxygen=Math.min(100,(e.oxygen??100)+seconds*20);if(e.organs)for(const k in e.organs)e.organs[k]=Math.min(100,e.organs[k]+seconds*IMMORTAL_REGEN);delete e.heartStops;} /* it cannot die, so it cannot stay down for ever either: blood, air and organs come back, slowly. The wounds stay */
        if(e.heartStops!==undefined&&this.time>=e.heartStops){this.kill(e,'heart destroyed');return;}
        if(e.blood<25)this.kill(e,e.bleedingInside?'internal bleeding':'blood loss');else if(e.oxygen<=0)this.kill(e,'suffocation');
        else e.consciousness=(e.blood<40||e.oxygen<30||brain<35||e.pain>=97||e.frozenT>COLD_KO)&&!e.conduit?'unconscious':e.blood<55||e.oxygen<55||brain<70||e.pain>70||e.conduit&&(e.blood<40||e.oxygen<30||brain<35||e.pain>=97)?'dazed':'awake'; /* Storm never faints, charged or empty: at worst he is dazed */
        if(!e.alive)return;
      }else e.consciousness='awake';
      // Brain damage setting: the worse the head, the more often it blacks out.
      if(set.brainDamage&&head&&head.plugin.hp<60&&!(e.stun>0)&&random()<seconds*.25*(1-head.plugin.hp/60))e.stun=rnd(1,3.5);
      if(set.slowHealing){if(human){e.blood=Math.min(100,e.blood+seconds*.8);if(e.organs)for(const k in e.organs)e.organs[k]=Math.min(100,e.organs[k]+seconds*.4);}
        for(const b of e.bodies){const p=b.plugin;p.hp=Math.min(p.maxHp,p.hp+seconds*1.5);p.bone=Math.min(100,(p.bone??100)+seconds);for(const w of p.wounds||[])w.bleed=Math.max(0,(w.bleed||0)-seconds*.05);p.bruise=Math.max(0,(p.bruise||0)-seconds*.02);if(p.wounds?.length&&random()<seconds*.06)p.wounds.shift();}}
    }
    forced(part){const e=this.getEntity(part);if(!e)return false;const wrench=this.drag&&this.drag.bodyB.plugin.entityId===e.id&&Constraint.currentLength(this.drag)>WRENCH_PULL;return wrench||(this.time-(e.hitTime??-9)<.35&&(e.hitHard||0)>=WRENCH_BLOW);}
    // A joint bent the wrong way, hard and for long enough, breaks. A limb joint fractures the limb below it; the neck kills; the spine takes the legs away.
    snap(c) {
      const b=c.bodyB,e=this.getEntity(b),at=Vector.add(b.position,c.pointB);c.plugin.broken=true;c.plugin.strain=0;this.onEffect('break',.5);if(b.plugin.material!=='flesh'){this.burst(at.x,at.y,8,'#ffe7a0',5);b.plugin.hp=Math.max(0,b.plugin.hp-60);return;}
      this.burst(at.x,at.y,6,'#e8dcc0',3);b.plugin.bruise=Math.min(1,(b.plugin.bruise||0)+.6);if(b.plugin.slot>=5)b.plugin.bone=Math.min(b.plugin.bone??100,35);
      if(!e||!e.alive)return;e.pain=Math.min(100,(e.pain||0)+30*this.settings.painSensitivity);e.hitTime=this.time;e.shoutT=.5;
      if(c.plugin.name==='atlas'||c.plugin.name==='neck')this.kill(e,'broken neck');else if(c.plugin.name==='spine'||c.plugin.name==='waist')e.paralysed=true;
    }
    bearing(f){return f.plugin.part==='foot'?f.position.x-(f.plugin.flip?-1:1)*FOOT_AHEAD*Math.cos(f.angle):f.position.x;}
    chestOf(e){return e.bodies.find(b=>b.plugin.slot===2);}
    // A part's muscles work as well as the part does: nothing through a fracture, less as it is destroyed.
    chill(b){const h=b.plugin.heat;return h<0?Math.min(1,h/FROZEN):0;} /* 0 at freezing, 1 frozen solid */
    strengthOf(b){const p=b.plugin;return this.fractured(b)||p.necrotic?0:clamp((p.hp??100)/50,.2,1)*(1-.85*this.chill(b))*(1-(p.numb||0));} /* cold muscle is weak muscle, a numb one weaker, a dead one nothing */
    // What a blow does to a living body before anything else: a flinch always, a stagger if it was standing, and only then, for the big ones, the knockdown.
    react(e,body,amount,direction,stun) {
      const slot=body.plugin.slot??2,dir=direction&&Math.abs(direction.x)>1e-6?Math.sign(direction.x):(e.bodies[2]&&body.position.x>e.bodies[2].position.x?-1:1);
      e.shoutT=amount>38?.5:0;if(e.kind==='human'&&this.settings.grunts&&amount>12&&e.consciousness!=='unconscious')this.onEffect('grunt',clamp(amount/60,.2,1));
      // Someone being hurt startles the conscious people near them: a small flinch, and they look.
      if(this.settings.awareness&&amount>15)for(const other of this.entities){if(other===e||other.kind!=='human'||!this.active(other)||other.flinch>0)continue;const oc=other.bodies[0];if(!oc||Math.abs(oc.position.x-body.position.x)>WITNESS_RANGE)continue;other.flinch=FLINCH_TIME*.7;other.flinchMag=.22;other.flinchSlot=2;other.flinchDir=Math.sign(oc.position.x-body.position.x)||1;other.startleX=body.position.x;other.startleAt=this.time;}
      e.fleeT=FLEE_TIME;e.flinch=FLINCH_TIME*clamp(amount/25,.8,1.6);e.flinchMag=clamp(amount/28,.12,1)*(e.consciousness==='dazed'?.55:1);e.flinchSlot=slot;e.flinchDir=dir;
      const standing=this.balancing(e)&&!(e.stagN>0)&&Math.abs(wrap(e.bodies[2]?.angle||0))<.4,torso=slot<=4;
      if(standing&&amount>10&&(torso||amount>25)){e.stagN=clamp(Math.round(amount/16),1,3);e.stagDir=dir;e.stagT=0;e.stagLeg=dir>0?0:1;e.stagPush=Math.min(STAGGER_MAX,amount*STAGGER_PUSH);}
      // A knockdown arrives through the stagger: the legs get a moment to try before they go.
      if(stun>0){if(standing){e.stunNext=Math.max(e.stunNext||0,stun);e.stunIn=.28;}else e.stun=Math.max(e.stun||0,stun);}
    }
    // Pose overlays for the moment: flinch, recovery steps, bracing. They write into the wanted pose; nothing is allocated.
    reactions(e,want,chest,down,seconds) {
      const A=want.angle,P=want.power,awake=e.consciousness!=='unconscious',m=chest.plugin.flip?-1:1;
      if(e.flinch>0){e.flinch-=seconds;const mag=e.flinchMag*clamp(e.flinch/FLINCH_TIME,0,1),d=e.flinchDir||1,s=e.flinchSlot; /* never undefined: one NaN angle here becomes NaN torque on every part, and the body is deleted as non-finite */
        A[0]+=d*m*.5*mag;A[1]+=d*m*.2*mag;A[3]+=-d*m*.22*mag;A[4]+=-d*m*.15*mag;P[0]=P[1]=2;                       // head snaps back, torso twists away from the blow
        if(s>=5&&s<=10){const sh=s<8?5:8;A[sh]+=-.4*mag;A[sh+1]+=-1.4*mag;P[sh]=4;P[sh+1]=9;}                                       // the struck arm pulls in
        else if(s>=11){const hip=s<14?11:14;A[hip]+=-.45*mag;A[hip+1]+=.9*mag;P[hip+1]=2;}
        else{A[5]+=-.35*mag;A[6]+=-.7*mag;A[8]+=-.35*mag;A[9]+=-.7*mag;}}                                         // a blow to the trunk: both arms come in
      if(e.stagN>0){if(down||!awake){e.stagN=0;}else{e.stagT+=seconds;const swing=e.stagT<STEP_TIME*.5,hip=e.stagLeg?14:11,d=e.stagDir;
          A[hip]+=-d*m*(swing?.42:.2);A[hip+1]+=swing?.7:.1;P[hip]=1.5;P[hip+1]=1.5;                                             // pick a leg up and swing it the way the body is going, then set it down ahead
          const fwd=d*m>0,arms=clamp(e.stagPush/STAGGER_MAX,.6,1);                                                                   // going over backwards both arms are thrown forward; stumbling forward they split, one ahead and one behind, swapping with each step
          for(const sh of [5,8]){if(P[sh]>2)continue;/* a struck arm stays pulled in */const ahead=!fwd||(sh===5)===!e.stagLeg;A[sh]+=arms*(ahead?-1.25:.8);A[sh+1]+=-.7*arms;P[sh]=Math.max(P[sh],1.6);}
          if(e.stagT>=STEP_TIME){e.stagT=0;e.stagLeg^=1;e.stagN--;e.stagPush*=.45;if(!e.stagN)e.stepCool=STEP_COOL;}}}
      // Landing: knees and hips fold to take the fall, the trunk tips forward over them, the arms come forward for balance; then it straightens up.
      if(e.crouch>0){const cr=e.crouch;A[11]+=-.95*cr;A[14]+=-.95*cr;A[12]+=1.7*cr;A[15]+=1.7*cr;A[13]+=-.5*cr;A[16]+=-.5*cr;A[3]+=-.3*cr;A[5]+=-.7*cr;A[8]+=-.7*cr;P[11]=P[14]=P[12]=P[15]=1.6;}
      // Falling feet first: legs a little bent ready for the ground, arms out in front.
      const tiltNow=wrap(chest.angle);if(awake&&e.airTime>.1&&Math.abs(tiltNow)<BRACE_TILT&&!e.carried){A[11]+=-.35;A[14]+=-.2;A[12]+=.6;A[15]+=.45;if(!(e.guardT>0)){A[5]=-1.0;A[8]=-.8;A[6]=A[9]=-.4;P[5]=P[8]=3;want.armsFree=true;}} /* arms out in front, unless they are busy guarding the head */
      // Held off the ground and awake: it does not hang like a coat. The legs kick, and the arms go for whatever has hold of it.
      if(e.carried&&awake&&this.drag){const t=this.time*STRUGGLE_RATE,k=this.settings.reactionIntensity,grip=this.drag.pointA,heldSlot=this.drag.bodyB.plugin.slot;
        A[11]=-.45+Math.sin(t)*.6*k;A[14]=-.45-Math.sin(t)*.6*k;A[12]=.75+Math.cos(t)*.5*k;A[15]=.75-Math.cos(t)*.5*k;A[3]+=Math.sin(t*.5)*.12*k;P[11]=P[14]=P[12]=P[15]=1.5;
        for(const [sh,side] of [[5,-1],[8,1]]){if(heldSlot>=sh&&heldSlot<=sh+2)continue;const upper=e.bodies.find(b=>b.plugin.slot===sh),fore=upper&&e.bodies.find(b=>b.plugin.slot===sh+1);if(!upper||!fore||this.fractured(upper)||this.fractured(fore))continue;
          this.reach(want,chest,{sh,side,sx:upper.position.x+Math.sin(upper.angle)*upper.plugin.h/2,sy:upper.position.y-Math.cos(upper.angle)*upper.plugin.h/2},grip.x+Math.sin(t*1.3+sh)*10,grip.y+Math.cos(t*1.1+sh)*8,m,3.5);}}
      // Bracing: tipping over, or dropping fast, and awake. Arms go out toward the ground on the side it is falling to; the head turns away from it.
      const tilt=wrap(chest.angle),falling=chest.velocity.y>BRACE_FALL,moving=chest.speed>1.2&&!this.touching.has(chest);if(awake&&moving&&!e.carried&&Math.abs(tilt)>BRACE_TILT&&!(e.stun>0)){ /* only on the way down: a body already on the ground gets up instead */ const f=Math.abs(tilt)>.15?Math.sign(tilt):Math.sign(chest.velocity.x)||1;e.bracing=.4;e.braceDir=f;}
      if(e.bracing>0){e.bracing-=seconds;const f=e.braceDir;A[5]=A[8]=(-f*1.25-tilt*.5)*m;A[6]=A[9]=-.3;A[7]=A[10]=0;A[0]=-f*m*.4;P[5]=P[8]=6;P[6]=P[9]=4;P[0]=2;want.armsFree=true;}else want.armsFree=false;
    }
    // The weight the muscles are working against: only what is still attached to the chest. Severed limbs stay in the entity but are no longer carried. Refreshed ten times a second.
    carried(e,chest){if(!(this.time-(e.massAt??-1)<.1)){e.massAt=this.time;let m=0;for(const b of this.connected(chest))if(!b.isStatic)m+=b.mass;e.liveMass=m;} /* a frozen part weighs infinity: counted, it made every balance force infinite and the body was deleted as non-finite */return e.liveMass;}
    // Blend toward the wanted pose. Layers are applied in order, later ones overriding the joints they mention; an armed hand's arm is aimed last of all.
    pose(e,base,aiming,chest,down,seconds,rung) {
      const now=e.poseNow??={angle:new Array(17).fill(0),power:new Array(17).fill(1)},want=this.poseWant,k=1-Math.exp(-seconds/(e.flinch>0?.05:POSE_BLEND));want.angle.fill(0);want.power.fill(1); // a flinch is quick: the blend tightens while it lasts
      for(const slot in base){want.angle[slot]=base[slot][0];want.power[slot]=base[slot][1];}
      const crawlDir=(rung==='crawl'||rung==='drag')?this.crawl(e,want,chest,rung,seconds):0;
      this.sustain(e,want,chest,down,seconds,rung);this.reactions(e,want,chest,down,seconds);
      if(!down)for(const b of aiming){const slot=b.plugin.slot,shoulder=slot===5||slot===8;want.angle[slot]=shoulder?-1.45-chest.angle*(b.plugin.flip?-1:1):0;want.power[slot]=shoulder?7:4;} // point the armed arm forward, whatever the chest is doing
      for(let i=0;i<17;i++){now.angle[i]+=(want.angle[i]-now.angle[i])*k;now.power[i]+=(want.power[i]-now.power[i])*k;}return crawlDir;
    }
    // What a hurt body does for as long as it hurts. Everything here is a change to the wanted pose: the muscles do the rest.
    sustain(e,want,chest,down,seconds,rung) {
      const A=want.angle,P=want.power,set=this.settings,human=e.kind==='human',k=set.reactionIntensity,pain=human&&set.painReactions?(e.pain||0)/100:0,flip=chest.plugin.flip?-1:1;
      // Electric shock: every muscle locks where it was, at full strength, shaking. When the current stops the body goes slack for a moment (an android reboots).
      if(e.shockT>0){e.shockT-=seconds;const lock=e.lockPose??=[...e.poseNow.angle];for(let i=0;i<17;i++){A[i]=lock[i]+Math.sin(this.time*55+i*2.4)*.025*k;P[i]=LOCK_STIFFNESS/SLOT_MUSCLE[i];} // the same stiffness at every joint, whatever its usual strength: rigid, but not so rigid that the whole body rings
        if(e.shockT<=0){e.lockPose=null;e.poseNow.power.fill(1);e.stun=Math.max(e.stun||0,SHOCK_LIMP);}return;}
      e.lockPose=null;
      if(human&&set.breathing){const b=Math.sin(e.breath*Math.PI*2),weak=e.blood<45,depth=(.035+pain*.05)*(weak?.45:1)*(weak?1+.5*Math.sin(this.time*5.3):1);A[5]+=b*depth;A[8]-=b*depth;A[3]+=b*depth*.35;A[1]-=b*depth*.3;} // shoulders rise and fall, the spine with them
      if(!human){ // androids feel nothing, but damaged actuators glitch: jerky, more so the worse off it is
        let hp=0;for(const b of e.bodies)hp+=b.plugin.hp/b.plugin.maxHp;hp/=e.bodies.length||1;if(hp<.6){const g=(.6-hp)*1.2*k;for(let i=5;i<17;i++)A[i]+=(Math.floor(this.time*9+i*3.7)%5-2)*.06*g*((i*7+Math.floor(this.time*9))%3);if(random()<seconds*g*4){const b=e.bodies[(random()*e.bodies.length)|0];this.burst(b.position.x,b.position.y,3,'#ffe7a0',4);}}return;}
      if(set.awareness){const head=e.bodies.find(b=>b.plugin.slot===0);e.awareT=(e.awareT||0)+seconds;if(head&&e.awareT>=AWARE_EVERY){e.awareT=0;this.aware(e,chest,head,this.bodiesNow);}
        if(head&&e.lookX!=null){const d=Math.sign(e.lookX-head.position.x);e.gaze=d;A[0]+=d*.11*k*flip;A[1]+=d*.04*k*flip;}else e.gaze=0;                       // head and eyes to the threat
        if(e.heatDir){A[3]+=-e.heatDir*.2*flip;for(const [sh,side] of [[5,-1],[8,1]])if(side===-e.heatDir||true){A[sh]+=-e.heatDir*.55*flip;P[sh]=2.5;}e.leanAway=e.heatDir*14;}else e.leanAway=0; // shrink from heat: torso and arms bend away, and the balance point shifts
        if(e.guardT>0&&head){e.guardT-=seconds;const bodyAt=slot=>e.bodies.find(b=>b.plugin.slot===slot);for(const [sh,side] of [[5,-1],[8,1]]){const upper=bodyAt(sh),fore=bodyAt(sh+1);if(!upper||!fore||this.fractured(upper)||this.fractured(fore))continue;
            this.reach(want,chest,{sh,side,sx:upper.position.x+Math.sin(upper.angle)*upper.plugin.h/2,sy:upper.position.y-Math.cos(upper.angle)*upper.plugin.h/2},head.position.x-e.guardDir*6,head.position.y-4,flip,6);}
          A[3]+=e.guardDir*.18*flip;e.leanAway=e.guardDir*18;}}                                                                                                   // arms over the head, and duck away from it
      else{e.gaze=0;e.leanAway=0;}
      if(!set.painReactions)return; // from here on it is behaviour, not reflex. Most of it scales with pain; guarding a damaged limb does not need it to still hurt.
      // Trembling: slow noise on every limb joint (a random walk pulled back to zero, so it never jumps), worse with pain and with blood loss.
      const shake=e.tremor??=new Array(17).fill(0),amp=(pain*.9+Math.max(0,60-e.blood)/60+(e.alive?(e.chill||0)*1.6:0))*.09*k; /* pain, blood loss and cold all make it shake */for(let i=0;i<17;i++){shake[i]+=(random()-.5)*seconds*26-shake[i]*seconds*9;A[i]+=shake[i]*amp;}
      // Hunching over the pain; the head sinks as the blood goes.
      A[3]+=-.32*pain*k;A[4]+=-.22*pain*k;A[1]+=.18*pain*k;A[0]+=Math.max(0,70-e.blood)/70*.45;
      // Writhing: down and in a lot of pain, it draws its legs up and lets them go, rocks, and now and then spasms. Calms as the pain ebbs.
      if((down||rung==='curl')&&pain>.55){const w=(pain-.4)*k,t=this.time,draw=.5+.5*Math.sin(t*1.7),curl=POSES.curl;for(const slot of [11,12,14,15]){const leg=slot<14?0:1.3;A[slot]=curl[slot][0]*(.35+.65*(.5+.5*Math.sin(t*1.7+leg)));P[slot]=1.2;}
        A[3]+=Math.sin(t*1.1)*.3*w;A[4]+=Math.sin(t*.9+1)*.25*w;A[5]+=Math.sin(t*2.3)*.6*w;A[8]-=Math.sin(t*2.1+.7)*.6*w;if(random()<seconds*.7*w){e.flinch=FLINCH_TIME;e.flinchMag=.7;e.flinchSlot=2;e.flinchDir=random()<.5?-1:1;} /* a spasm, to one side or the other */void draw;}
      // On fire: arms beat at the flames, and if it is on its feet it staggers about, away from the heat.
      if(e.burningParts>0){const t=this.time;A[5]=-1.4+Math.sin(t*17)*.9;A[6]=-1.0-Math.sin(t*19)*.8;A[8]=-1.4+Math.sin(t*16+1)*.9;A[9]=-1.0-Math.sin(t*18+2)*.8;P[5]=P[6]=P[8]=P[9]=5;want.armsFree=true;
        if(rung==='stand'&&!down&&!(e.stagN>0)){e.stagN=2;e.stagDir=e.panicDir=(random()<.2?-(e.panicDir||1):(e.panicDir||(random()<.5?-1:1)));e.stagT=0;e.stagLeg=e.stagDir>0?0:1;e.stagPush=STAGGER_MAX*1.4;}return;}
      // Guarding: a hurt arm is held in against the body; a badly hurt leg is kept off the floor if the other one can take the weight.
      const bodyAt=slot=>e.bodies.find(b=>b.plugin.slot===slot),hurt=(from,to)=>{let worst=1;for(let sl=from;sl<=to;sl++){const b=bodyAt(sl);if(b)worst=Math.min(worst,b.plugin.hp/b.plugin.maxHp);}return worst;};
      for(const [sh,side] of [[5,-1],[8,1]])if(hurt(sh,sh+2)*100<GUARD_HP&&rung!=='crawl'&&rung!=='drag'){A[sh]=-.3*k;A[sh+1]=-1.5;P[sh]=P[sh+1]=2.5;}
      if(e.spareLeg&&!down){A[e.spareLeg]+=-.4;A[e.spareLeg+1]+=1.1;P[e.spareLeg]=P[e.spareLeg+1]=1.6;}
      // Clutching: the nearest hand that still works goes to the wound that hurts most and stays there; both hands for the head and trunk. Not while the arms are needed to crawl or to break a fall.
      if(e.pain>CLUTCH_PAIN&&e.hurtScore>0&&rung!=='crawl'&&rung!=='drag'&&!(e.bracing>0)){const part=bodyAt(e.hurtSlot);if(part){const local=Vector.rotate({x:e.hurtX,y:e.hurtY},part.angle),tx=part.position.x+local.x,ty=part.position.y+local.y,both=e.hurtSlot<=4;let done=0;
        const arms=[[5,-1],[8,1]].map(([sh,side])=>{const upper=bodyAt(sh),fore=bodyAt(sh+1);if(!upper||!fore||this.fractured(upper)||this.fractured(fore)||(e.hurtSlot>=sh&&e.hurtSlot<=sh+2)||upper.plugin.hp<=0)return null;const sx=upper.position.x+Math.sin(upper.angle)*upper.plugin.h/2,sy=upper.position.y-Math.cos(upper.angle)*upper.plugin.h/2;return {sh,side,sx,sy,far:Math.hypot(tx-sx,ty-sy)};}).filter(Boolean).sort((a,b)=>a.far-b.far);
        for(const arm of arms){if(done&&!both)break;this.reach(want,chest,arm,tx,ty,flip,4.5);done++;const hand=bodyAt(arm.sh+2);if(hand&&part.plugin.bleed>.15&&this.settings.decals&&Math.hypot(hand.position.x-tx,hand.position.y-ty)<14&&this.time-(hand.plugin.redAt||0)>.6){hand.plugin.redAt=this.time;this.stain(hand,{x:hand.position.x+rnd(-2,2),y:hand.position.y+rnd(-3,3)},rnd(1,1.8));}} /* the hand that holds a bleeding wound comes away red */
        e.clutching=done;}else e.clutching=0;}else e.clutching=0;
    }
    // Two-link reach: the upper arm points short of the target by alpha and the elbow makes up the rest. The elbow only bends its own way, which picks the solution.
    reach(want,chest,arm,tx,ty,flip,power) {
      const d=clamp(Math.hypot(tx-arm.sx,ty-arm.sy),Math.abs(ARM_UPPER-ARM_FORE)+2,ARM_UPPER+ARM_FORE-2),bend=-flip,beta=bend*(Math.PI-Math.acos(clamp((ARM_UPPER**2+ARM_FORE**2-d*d)/(2*ARM_UPPER*ARM_FORE),-1,1)));
      const alpha=Math.atan2(ARM_FORE*Math.sin(beta),ARM_UPPER+ARM_FORE*Math.cos(beta)),aim=Math.atan2(-(tx-arm.sx),ty-arm.sy)-alpha,A=want.angle,P=want.power;
      A[arm.sh]=wrap(aim-chest.angle)*flip;A[arm.sh+1]=beta*flip;A[arm.sh+2]=0;P[arm.sh]=P[arm.sh+1]=power;want.armsFree=true;
    }
    // Awareness, ten times a second: what is the most pressing thing near this ragdoll? Something about to hit its head, heat close to it, something fast, a fire or blast, the thing that last hurt it.
    // The result is three numbers the pose reads: where to look, whether to guard, which way to shrink from heat. No pathfinding, no memory beyond a second or two.
    aware(e,chest,head,bodies) {
      e.lookX=null;e.heatDir=0;let best=0;const hx=head.position.x,hy=head.position.y,note=(score,x)=>{if(score>best){best=score;e.lookX=x;}};
      if(this.time-(e.hitTime??-9)<2.5)note(3,hx-(e.flinchDir||1)*200);                                    // whatever hit it came from the other way
      for(let i=0;i<bodies.length;i++){const b=bodies[i],p=b.plugin;if(p.entityId===e.id)continue;const dx=b.position.x-hx,dy=b.position.y-hy,far=Math.hypot(dx,dy);if(far>SEE_RANGE)continue;
        if(p.burning||p.heat>250){note(2+(SEE_RANGE-far)/SEE_RANGE,b.position.x);if(Math.abs(b.position.x-chest.position.x)<HEAT_NEAR+Math.max(p.w||0,p.r||0)/2&&b.position.y>hy-30&&b.position.y<chest.position.y+170)e.heatDir=Math.sign(chest.position.x-b.position.x)||1;} // close beside any part of it, from head to feet
        if(b.speed>SEE_FAST&&!p.part){note(2.5+b.speed/10,b.position.x);
          // on a course for the head within INCOMING seconds?
          const vx=b.velocity.x,vy=b.velocity.y,t=-(dx*vx+dy*vy)/(vx*vx+vy*vy);if(t>0&&t<INCOMING*60){const miss=Math.hypot(dx+vx*t,dy+vy*t);if(miss<38+Math.max(p.w||0,p.h||0,p.r||0)/2){e.guardT=.6;e.guardDir=Math.sign(-dx)||1;note(9,b.position.x);}}}
        if(this.drag?.bodyB===b&&(defs[p.kind]?.firearm||defs[p.kind]?.sharp)&&far<220)note(4,b.position.x);}       // a weapon held near it by the cursor
      for(const f of this.flashes)if(!f.grow&&Math.hypot(f.x-hx,f.y-hy)<SEE_RANGE*1.4)note(6,f.x);
      if(e.startleX!==undefined&&this.time-e.startleAt<1.5)note(3.5,e.startleX);
    }
    // Crawling: belly down, head the way it is going. Each good arm reaches past the head, plants, and pulls; the pull on the body is reacted on the planted hand,
    // which is pressed into the floor for grip, so it is all internal. It crawls away from what last hurt it for a few seconds, then lies still.
    crawl(e,want,chest,rung,seconds) {
      // A body seen from the side cannot turn round, and elbows only bend one way, so it crawls the way it faces, propped on its forearms. With nothing to flee it lies slack and the rest logic lets it sleep.
      e.fleeT=Math.max(0,(e.fleeT||0)-seconds);const d=chest.plugin.flip?-1:1;if(!(e.fleeT>0)){e.idle=true;want.power.fill(.12);this.topple(e,want,chest,d,seconds);return 0;}e.idle=false;
      const A=want.angle,P=want.power,period=rung==='drag'?CRAWL_PERIOD*1.4:CRAWL_PERIOD,mass=this.carried(e,chest),weight=mass*G_SCALE*Math.max(this.gravity,.2)*e.effort;
      for(let k=0;k<2;k++){const sh=k?8:5,upper=e.bodies.find(b=>b.plugin.slot===sh),fore=upper&&e.bodies.find(b=>b.plugin.slot===sh+1);if(!upper||!fore||this.fractured(upper)||this.fractured(fore)||!this.joints.some(c=>c.plugin.joint&&c.bodyB===fore))continue;
        // Arm targets are world directions, turned into joint angles: the forearm lies along the floor pointing ahead, and the upper arm sweeps from "elbow out in front" to "elbow under the shoulder", which drags the chest forward over the planted forearm.
        const phase=((this.time/period)+(k?.5:0))%1,reach=phase<.4,sweep=reach?1-phase/.4:(phase-.4)/.6,upperWorld=-d*(1.15-.95*sweep),foreWorld=-d*(reach?1.85:1.55);
        A[sh]=wrap(upperWorld-chest.angle)*d;A[sh+1]=wrap(foreWorld-upperWorld)*d;P[sh]=reach?3:6;P[sh+1]=4;
        if(reach){if(!fore.isStatic&&!chest.isStatic){fore.force.y-=CRAWL_LIFT*weight;chest.force.y+=CRAWL_LIFT*weight;}continue;} // lifted clear on the way forward, so it does not scrape the body back
        const hand=e.bodies.find(b=>b.plugin.slot===sh+2),grip=this.touching.has(fore)?fore:hand&&this.touching.has(hand)?hand:null;
        if(grip&&!grip.isStatic&&!chest.isStatic&&chest.velocity.x*d<CRAWL_SPEED){ /* no faster than a crawl, however light the body has become */ grip.force.y+=CRAWL_PRESS*weight;chest.force.y-=CRAWL_PRESS*weight;grip.force.x-=d*CRAWL_PULL*weight;chest.force.x+=d*CRAWL_PULL*weight;}}
      this.topple(e,want,chest,d,seconds);return d;
    }
    // Legs that stop holding a standing body up while it is still awake: it goes down onto its front in one piece, hips and back held straight so the legs trail behind it, rather than sitting back onto them - from there it could never crawl.
    topple(e,want,chest,d,seconds){if(!(e.toppleT>0))return;e.toppleT-=seconds;for(const k of [3,4,11,14]){want.angle[k]=0;want.power[k]=2.5;}if(!chest.isStatic&&Math.abs(wrap(chest.angle))<1.1)chest.force.x+=d*TOPPLE_PUSH*chest.mass;} /* ponytail: an external nudge, not an internal force; it is a fraction of the body's weight and lasts under a second */
    // Legs that were holding a body up give way at the knee when it goes limp: straight legs are a stable column, and without this a limp body folds at the hips over locked knees.
    buckle(e){const m=this.chestOf(e)?.plugin.flip?-1:1;for(const hip of [11,14]){const thigh=e.bodies.find(b=>b.plugin.slot===hip),shin=e.bodies.find(b=>b.plugin.slot===hip+1);if(!thigh||!shin||thigh.isStatic||shin.isStatic)continue;const k=rnd(.7,1.3);Body.setAngularVelocity(thigh,thigh.angularVelocity-m*BUCKLE*k);Body.setAngularVelocity(shin,shin.angularVelocity+m*BUCKLE*1.4*k);}}
    // Standing is posture torques plus a leg push: the lift on the torso is reacted on the planted feet, so it is an internal force.
    // Feet that are not on something produce no lift, so a ragdoll can never fly or hover its way upright.
    balance(e,rung='stand'){
      const part=n=>e.bodies.filter(b=>b.plugin.part===n),chest=part('chest')[0],pelvis=part('pelvis')[0];if(!chest)return;
      const free=b=>!b.isStatic&&this.drag?.bodyB!==b,tilt=wrap(chest.angle),human=e.kind==='human',seconds=1/120;
      // Off the ground (carried, thrown, falling) the joints keep most of their tone, so a carried body holds itself together instead of folding like a rag;
      // what it loses is the pull toward upright, which needs the ground: it hangs and swings from wherever it is held.
      const supported=e.bodies.some(b=>this.touching.has(b)&&this.drag?.bodyB!==b);const grabbed=!!this.drag&&this.drag.bodyB.plugin.entityId===e.id;e.carried=grabbed&&!supported;const tone=supported?1:e.carried?STRUGGLE_TONE:AIR_TONE;
      // Falling and landing: remember how fast it was coming down, and on touching down turn that into a crouch that the legs then push out of.
      if(!supported&&!grabbed){e.airTime=(e.airTime||0)+seconds;e.fallV=Math.max(e.fallV||0,chest.velocity.y);}else{if(supported&&e.airTime>.12&&e.fallV>3)e.crouch=Math.max(e.crouch||0,clamp(e.fallV/LAND_FULL,.25,1));e.airTime=0;e.fallV=0;}
      e.crouch=Math.max(0,(e.crouch||0)-seconds/LAND_RECOVER);
      // What is holding the body up on this rung, how high it should hold the chest, and whether it is down and has to get up first.
      let support=this.support,height=0,uprightness=1,liftScale=1,base=POSES[rung]||POSES.stand;support.length=0;
      // A badly hurt leg is spared if the other can take the weight: it is drawn up, and its foot is not stood on.
      let legL=1,legR=1;for(const b of e.bodies){const sl=b.plugin.slot;if(sl>=11&&sl<=13)legL=Math.min(legL,b.plugin.hp/b.plugin.maxHp);else if(sl>=14)legR=Math.min(legR,b.plugin.hp/b.plugin.maxHp);}
      e.spareLeg=human&&this.settings.painReactions&&rung==='stand'&&!(e.stagN>0)?(legL*100<SPARE_LEG_HP&&legR>.7?11:legR*100<SPARE_LEG_HP&&legL>.7?14:0):0;
      if(rung==='stand'){for(const f of e.bodies)if(f.plugin.part==='foot'&&f.plugin.slot!==e.spareLeg+2&&this.touching.has(f)&&this.bears(f))support.push(f);height=STAND_HEIGHT*(1-.3*(e.crouch||0));}
      else if(rung==='kneel'){for(const b of e.bodies)if((b.plugin.part==='shin'||b.plugin.part==='thigh')&&this.touching.has(b)&&!this.fractured(b))support.push(b);height=KNEEL_HEIGHT;}
      else{uprightness=0;liftScale=0;}
      const down=rung==='stand'&&(Math.abs(tilt)>.6||!support.length);
      // Catching its balance: when the chest gets ahead of the feet (or is about to), it steps that way rather than tipping over like a plank.
      e.stepCool=Math.max(0,(e.stepCool||0)-seconds);if(rung==='stand'&&!down&&support.length&&!(e.stagN>0)&&!e.stepCool&&!grabbed&&!e.rise){let fx=0;for(const f of support)fx+=this.bearing(f)/support.length;
        const ahead=chest.position.x-fx+chest.velocity.x*STEP_LOOKAHEAD;if(Math.abs(ahead)>STEP_TRIGGER){e.stagN=Math.abs(ahead)>STEP_TRIGGER*2.2?2:1;e.stagDir=Math.sign(ahead);e.stagT=0;e.stagLeg=(e.stagLeg^1)||0;e.stagPush=Math.min(STAGGER_MAX,Math.abs(ahead)*.7);}}
      // Getting up is staged: gather the limbs, push up on the arms, get the knees under, and only then stand. Pain and blood loss slow every stage.
      // If it is still down a while after the last stage, the attempt has failed: it sags, rests, and tries again.
      if(rung==='stand'){const slow=human?1+(e.pain||0)/70+Math.max(0,75-e.blood)/60:1;
        if(down&&!e.rise&&supported&&!(e.stagN>0))e.rise={stage:0,t:0,tries:(e.rise?.tries||0)};
        if(e.rise){e.rise.t+=seconds;if(e.rise.stage<GETUP_STAGES.length){const [name,time]=GETUP_STAGES[e.rise.stage];base=POSES[name];uprightness=e.rise.stage===0?0:e.rise.stage===1?.5*GETUP_TORQUE:GETUP_TORQUE;liftScale=e.rise.stage===2?1:0;height=STAND_HEIGHT*.62;
            if(e.rise.stage===2)for(const f of e.bodies)if((f.plugin.part==='shin'||f.plugin.part==='foot')&&this.touching.has(f)&&!support.includes(f))support.push(f);
            if(e.rise.t>time*slow){e.rise.stage++;e.rise.t=0;}}
          else{uprightness=down?GETUP_TORQUE:1;if(!down&&e.rise.t>.4)e.rise=null;else if(e.rise.t>1.6*slow){e.effort=0;e.stun=Math.max(e.stun||0,.8+(e.pain||0)/50);e.rise=null;}}}}
      else e.rise=null;
      // The pistol is levelled directly as well: a hand is far too light to hold a pistol's weight level by its own torque.
      const aiming=this.aimSet;aiming.clear();if(rung==='stand'&&!down)for(const hand of e.bodies){if(hand.plugin.part!=='hand')continue;const item=this.held(hand);if(!item||!defs[item.plugin.kind]?.firearm)continue;for(const b of e.bodies)if(b.plugin.slot>=hand.plugin.slot-2&&b.plugin.slot<=hand.plugin.slot)aiming.add(b);
        if(free(item))item.torque+=(clamp(wrap(-item.angle),-.6,.6)*AIM_STRENGTH*1.5-item.angularVelocity*.004)*item.inertia*e.effort;}
      // Which pose, and how strong the body is as a whole. Pain, blood loss and a dazed head all take strength away; so does being off the ground.
      const vigour=e.effort*tone*(human?clamp((e.blood-20)/45,.4,1)*(1-Math.min(.5,(e.pain||0)/200))*(e.consciousness==='dazed'?.85:1):1);
      const crawlDir=this.pose(e,base,aiming,chest,down,seconds,rung);
      if(e.idle&&(rung==='crawl'||rung==='drag'))return; // nothing to flee and nowhere to go: it lies there with every muscle off, so it can come to rest and sleep like any other body on the floor
      // Joints: a PD muscle across each one, pulling the two parts toward the pose's relative angle. Equal and opposite, so muscles alone can never turn or move the body as a whole.
      // Several muscles meet at the pelvis and the chest. Each one's damping is explicit, and their sum on one body must stay well under one per step or it overshoots, flips sign every step and blows up;
      // so a joint's damping is divided by how many muscles share its busier end.
      const live=this.joints,busy=this.busy;busy.fill(0);for(let i=0;i<live.length;i++){const c=live[i];if(c.plugin.joint&&c.bodyA.plugin.entityId===e.id&&c.bodyB.plugin.slot!==undefined){busy[c.bodyA.plugin.slot]++;busy[c.bodyB.plugin.slot]++;}}
      for(let i=0;i<live.length;i++){const c=live[i];if(!c.plugin.joint||c.bodyA.plugin.entityId!==e.id)continue;const a=c.bodyA,b=c.bodyB,slot=b.plugin.slot;if(slot===undefined)continue;
        if(c.plugin.name==='ankle'&&this.touching.has(b)&&rung==='stand')continue; // a planted foot lies flat on the ground whatever the shin does; the ankle gives. Holding it to the shin makes the foot rock on its edge and walk.
        const arm=slot>=5&&slot<=10,limb=Math.min(this.strengthOf(a),this.strengthOf(b));let power=e.poseNow.power[slot]*limb*(arm&&this.poseWant.armsFree?vigour/tone:vigour)*(MUSCLE[c.plugin.name]||1);if(power<=0)continue;if(power>MUSCLE_MAX)power=MUSCLE_MAX; // arms need no ground to reach out; and no muscle, however it is driven, is stiffer than the step can integrate
        const target=e.poseNow.angle[slot]*(b.plugin.flip?-1:1),error=clamp(wrap(target-(b.angle-a.angle)),-MUSCLE_REACH,MUSCLE_REACH),ia=free(a)?a.inverseInertia:0,ib=free(b)?b.inverseInertia:0;if(!ia&&!ib)continue;
        // Damping grows with the root of the strength: scaled linearly, the strong leg joints end up over-damped for a 120 Hz explicit step and chatter.
        const torque=(MUSCLE_KP*error*power-MUSCLE_KD*(b.angularVelocity-a.angularVelocity)*Math.sqrt(power)/Math.max(1,busy[a.plugin.slot]-1,busy[slot]-1))/(ia+ib);if(ib)b.torque+=torque;if(ia)a.torque-=torque;}
      // Two parts answer to the world rather than to a parent: the chest holds itself upright (or, crawling, level with the ground), and planted feet hold themselves flat. Both push against the ground through the limbs.
      const lean=crawlDir?crawlDir*1.2:0;if(free(chest)&&(uprightness>0||crawlDir))chest.torque+=(clamp(wrap(lean-chest.angle),-.5,.5)*.0011*(crawlDir?1.5:uprightness)*(supported?1:AIR_UPRIGHT)-chest.angularVelocity*.0022)*chest.inertia*vigour;
      if(rung==='stand')for(const f of support)if(f.plugin.part==='foot'&&free(f))f.torque+=(clamp(wrap(-f.angle),-.5,.5)*.0024-f.angularVelocity*.003)*f.inertia*vigour;
      // A real step: the stepping foot is unloaded, picked up, and carried to where the body is going, by a force between foot and pelvis (internal, so it cannot push the body along by itself).
      // With the foot back under the chest the body recovers by moving over its feet instead of tipping back like a plank.
      if(e.stagN>0&&rung==='stand'&&!down&&pelvis&&e.stagT<STEP_TIME*.65){const foot=e.bodies.find(b=>b.plugin.slot===(e.stagLeg?16:13)),i=support.indexOf(foot);
        if(foot&&free(foot)&&free(pelvis)&&this.bears(foot)&&(i<0||support.length>1)){if(i>=0)support.splice(i,1);const w=this.carried(e,chest)*G_SCALE*Math.max(this.gravity,.2),goal=chest.position.x+chest.velocity.x*STEP_LOOKAHEAD*.6+e.stagDir*STEP_REACH+(foot.plugin.flip?-1:1)*FOOT_AHEAD;
          const fx=clamp((goal-foot.position.x)*.03-foot.velocity.x*.12,-.6,.6)*w,fy=-STEP_LIFT*w;foot.force.x+=fx;foot.force.y+=fy;pelvis.force.x-=fx;pelvis.force.y-=fy;}}
      // Only what is really braced against something may take the body's weight. A light shin that is merely brushing the floor would be shot downward by it; a part already moving down is not holding anything up.
      for(let i=support.length-1;i>=0;i--)if(support[i].velocity.y>BRACED||support[i].speed>BRACED*3)support.splice(i,1);
      if(!support.length||!pelvis||!free(chest)||!liftScale)return;
      // The leg push: lift on the torso, reacted on whatever is planted, so it is an internal force. Nothing planted, no lift: a ragdoll can never fly or hover its way upright.
      // A hurt leg takes less of the load, so the body shifts over the good one: that is a limp. Shares are by the health of each supporting leg, from its foot up to the hip.
      let mass=this.carried(e,chest),footX=0,footY=-1e9,total=0;const shares=this.shares;shares.length=support.length;
      for(let i=0;i<support.length;i++){const f=support[i],slot=f.plugin.slot,from=slot>=14?14:11;let health=1;for(const b of e.bodies)if(b.plugin.slot>=from&&b.plugin.slot<=from+2)health=Math.min(health,b.plugin.hp/b.plugin.maxHp);shares[i]=clamp(health*health,.12,1);total+=shares[i];}
      for(let i=0;i<support.length;i++){shares[i]/=total;footX+=this.bearing(support[i])*shares[i];footY=Math.max(footY,support[i].bounds.max.y-6);if(support[i].plugin.slot===13||support[i].plugin.slot===11||support[i].plugin.slot===12)e.loadLeft=shares[i];}if(support.length===1)e.loadLeft=support[0].plugin.slot<14?1:0;
      const weight=mass*G_SCALE*Math.max(this.gravity,.2),lift=clamp((height-(footY-chest.position.y))*.035+chest.velocity.y*.25,0,this.settings.legStrength*(e.surge>0?1.5:1))*weight*e.effort*liftScale;
      const daze=e.consciousness==='dazed'?Math.sin(this.time*1.3)*9+Math.sin(this.time*.7+1)*6:0; // dazed: the point it balances over wanders
      const sway=clamp((footX+daze+(e.leanAway||0)+(e.stagN>0?e.stagDir*e.stagPush:0)-chest.position.x)*.012-chest.velocity.x*.12,-.8,.8)*weight*e.effort; // a stagger moves the point the body balances over
      chest.force.x+=sway*.6;chest.force.y-=lift*.6;if(free(pelvis)){pelvis.force.x+=sway*.4;pelvis.force.y-=lift*.4;}
      for(let i=0;i<support.length;i++){const f=support[i];if(free(f)){f.force.x-=sway*this.shares[i];f.force.y+=lift*this.shares[i];}}
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
    clear(){this.endDrag();for(const b of [...this.bodies])this.removeBody(b);for(const c of this.joints)Composite.remove(this.world,c);this.entities=[];this.particles=[];this.flashes=[];this.traces=[];this.stains=[];this.shots=[];this.damageQueue=[];this.regrowing=[];Engine.clear(this.engine);}
    // Turn to face the other way: the whole connected set is mirrored about a vertical line through the clicked body's owner (its chest, if it has one).
    // Positions, angles and velocities mirror; every constraint anchor on a mirrored body mirrors with it; ragdoll joints swap and negate their limits; stains move to the other side.
    flip(body) {
      if(!body||body.plugin.boundary)return false;const links=this.joints.filter(c=>c.plugin.joint||c.plugin.hold||c.plugin.pierce),set=this.connected(body,links),e=this.getEntity(body),axis=(e&&this.chestOf(e)&&set.has(this.chestOf(e))?this.chestOf(e):body).position.x;
      for(const b of set){const wasStatic=b.isStatic;if(wasStatic)Body.setStatic(b,false);Body.setPosition(b,{x:2*axis-b.position.x,y:b.position.y});Body.setAngle(b,-b.angle);Body.setVelocity(b,{x:-b.velocity.x,y:b.velocity.y});Body.setAngularVelocity(b,-b.angularVelocity);if(wasStatic)Body.setStatic(b,true);
        const p=b.plugin;if(p.flip)delete p.flip;else p.flip=true;for(const st of p.stains||[])st.x=-st.x;}
      for(const c of this.joints){let touched=false;if(c.bodyA&&set.has(c.bodyA)){c.pointA.x=-c.pointA.x;c.angleA=c.bodyA.angle;touched=true;}if(c.bodyB&&set.has(c.bodyB)){c.pointB.x=-c.pointB.x;c.angleB=c.bodyB.angle;touched=true;}
        if(touched&&c.plugin.joint&&c.plugin.min!==undefined){const min=c.plugin.min;c.plugin.min=-c.plugin.max;c.plugin.max=-min;}}
      if(this.drag&&set.has(this.drag.bodyB)){this.drag.pointB.x=-this.drag.pointB.x;this.drag.angleB=this.drag.bodyB.angle;if(this.dragAngle!=null)this.dragAngle=-this.dragAngle;}
      for(const owner of new Set([...set].map(b=>this.getEntity(b)).filter(Boolean))){owner.pin=null;owner.restTime=0;if(owner.flinchDir)owner.flinchDir=-owner.flinchDir;if(owner.stagDir)owner.stagDir=-owner.stagDir;if(owner.braceDir)owner.braceDir=-owner.braceDir;}
      return true;
    }
    // Toolbar housekeeping.
    clearFire(){let n=0;for(const b of this.bodies){const p=b.plugin;if(p.burning||p.heat>this.settings.ambient+5){if(p.burning)n++;p.burning=false;p.heat=this.settings.ambient;delete p.fuse;}}for(const p of this.particles)if(p.type==='ember'||p.type==='smoke'||p.type==='fire')p.life=0;return n;}
    clearDead(){let n=0;for(const e of [...this.entities]){const dead=e.blood!==undefined?!e.alive:e.kind==='debris';if(!dead)continue;n++;for(const b of [...e.bodies])this.removeBody(b);}this.stains.length=0;return n;}
    clearObjects(){let n=0;for(const e of [...this.entities]){if(e.blood!==undefined||e.kind==='debris'&&e.bodies.some(b=>b.plugin.part))continue;n++;for(const b of [...e.bodies])this.removeBody(b);}for(const c of this.joints.filter(c=>c.plugin.rope&&!c.bodyA&&!c.bodyB))Composite.remove(this.world,c);return n;}
    freeze(body){if(!body)return;Body.setStatic(body,!body.isStatic);return body.isStatic;}
    beginDrag(body,point) {
      this.endDrag();if(!body)return;if(body.plugin.heldBy!==undefined)this.release(body); // grabbing a held thing takes it out of the hand
      // The grab is not a Matter constraint: a pin dragged about by the cursor either snaps the body to it or, softened, rings. It is the cursor pulling on the grabbed point with a damped spring (see grab()), the way
      // People Playground does it: the thing lags a little, swings about the point it is held by, hangs under its own weight, and when it is let go it simply keeps the velocity it has. It has the shape of a constraint so that everything that measures the pull still can.
      this.drag={pointA:{...point},bodyB:body,pointB:Vector.sub(point,body.position),angleB:body.angle,plugin:{drag:true},load:0,loadAt:-9};
      if(body.plugin.part&&!body.isStatic){this.drag.inertia=body.inertia;Body.setInertia(body,body.inertia*GRAB_INERTIA);} /* a hand or a foot with a whole body hanging from it is a very stiff pendulum on almost no inertia: held, it is given the steadiness of the grip that holds it, and gets its own back when let go */
    }
    moveDrag(point){if(this.drag)this.drag.pointA={...point};}
    translateConnected(body,delta){
      const connected=new Set([body]),queue=[body],joints=this.joints.filter(c=>c.plugin.joint||c.plugin.pierce||c.plugin.hold);
      while(queue.length){const current=queue.shift();for(const c of joints){const other=c.bodyA===current?c.bodyB:c.bodyB===current?c.bodyA:null;if(other&&!connected.has(other)){connected.add(other);queue.push(other);}}}
      for(const b of connected)Body.translate(b,delta);
    }
    // Air. A falling body keeps speeding up, 9.81 m/s every second, until drag - which grows with the square of its speed - matches its weight: then it falls at its terminal velocity. Below that drag is small, so a fall from
    // two metres lands at the speed a fall in a vacuum would, and from forty metres near the top speed of whatever it is (a person about 55 m/s, a steel beam 90, a ball 25, a shirt 5). Matter's own air friction slows everything
    // in proportion to its speed, which caps a person at 10 m/s and makes a long fall no worse than a short one; it is switched off, and this does both the drag and the spin damping it used to do. The Air resistance setting scales it.
    air(bodies,seconds){const set=this.settings.airDrag,g=9.81*PX_PER_M;for(const b of bodies){if(b.isStatic)continue;if(b.frictionAir)b.frictionAir=0;if(!set)continue;const p=b.plugin,sp=b.speed;
      if(sp>.05){const vt=(p.part?RAGDOLL_TERMINAL:defs[p.kind]?.terminal??matOf(p).terminal??50)*PX_PER_M,v=sp*60,loss=g*set*(v/vt)*(v/vt)*seconds;Body.setVelocity(b,{x:b.velocity.x*Math.max(0,1-loss/v),y:b.velocity.y*Math.max(0,1-loss/v)});}
      if(b.angularVelocity)Body.setAngularVelocity(b,b.angularVelocity*(1-(p.part?SPIN_AIR.part:SPIN_AIR.other)*set*seconds*60));}}
    powerRadius(kind){return (POWER_R[kind]||40)*this.settings.powerRadius;}
    // A power is a field at the cursor: this.power = {kind,x,y,px,py} while the button is held, null otherwise. The interface only puts it there and moves it; everything it does happens here, in the step, so nothing happens while paused.
    // What is in range is found thirty times a second, along the whole segment the cursor has crossed since the last look (a fast sweep cannot jump a body), and kept with its falloff - 1 at the centre, 0 at the edge -
    // in two arrays that are reused. Between looks the effect is applied every substep from those arrays. Nothing in here allocates.
    powers(seconds,bodies) {
      const w=this.power,R=this.powerRadius(w.kind),near=this.powerNear,ks=this.powerK,sparks=this.settings.particles==='Off'?0:this.settings.particles==='Low'?.5:1;
      if(this.time-this.powerAt>=POWER_SCAN-1e-6||this.powerFor!==w){ /* four substeps are a thirtieth of a second, give or take a rounding error */this.powerAt=this.time;this.powerFor=w;near.length=0;ks.length=0;w.px??=w.x;w.py??=w.y;const sx=w.x-w.px,sy=w.y-w.py,len2=sx*sx+sy*sy;
        for(const b of bodies){let t=len2?((b.position.x-w.px)*sx+(b.position.y-w.py)*sy)/len2:0;t=t<0?0:t>1?1:t;const qx=w.px+sx*t,qy=w.py+sy*t,q=b.bounds,dx=Math.max(q.min.x-qx,0,qx-q.max.x),dy=Math.max(q.min.y-qy,0,qy-q.max.y),d=Math.hypot(dx,dy);if(d<R){near.push(b);ks.push(1-d/R);}}
        w.px=w.x;w.py=w.y;if(w.kind==='fire'||w.kind==='cold')this.powerMark(w,R);}
      if(w.kind==='shock'){w.tick=(w.tick||0)+seconds;if(w.tick>=SHOCK_TICK){w.tick=0;this.powerShock(w,R);}return;}
      const set=this.settings,rain=set.rain?.45:1;this.powerStamp++;
      for(let i=0;i<near.length;i++){const b=near[i],p=b.plugin,k=ks[i],mat=matOf(p);
        if(w.kind==='fire'){p.heat=Math.min(700,p.heat+FIRE_RATE*k*mat.thermal*rain*seconds);if(p.part&&p.material==='flesh'&&p.heat>45)p.char=Math.max(p.char||0,Math.min(.1,(p.char||0)+k*seconds*.25));} /* a pass singes; holding it takes the body past burnAt and the ordinary rule lights it */
        else if(w.kind==='cold'){p.heat=Math.max(COLD_FLOOR,p.heat-COLD_RATE*k*mat.thermal*seconds);if(p.burning){p.heat-=COLD_QUENCH*k*seconds;if(p.heat<150){p.burning=false;delete p.fuse;}}}
        else this.powerHeal(b,p,k,seconds);}
      // what the power throws off: sparks and smoke, mist and ice, rising plus signs
      if(sparks){if(w.kind==='fire'){if(random()<seconds*16*sparks)this.emit(w.x+rnd(-8,8),w.y+rnd(-6,6),rnd(-1,1),rnd(-3,-1.2),rnd(.4,1),1,'#ffcf7a',rnd(.8,1.8),'ember');if(random()<seconds*6*sparks)this.emit(w.x+rnd(-6,6),w.y-rnd(18,34),rnd(-.3,.3),rnd(-1.4,-.7),rnd(1,1.8),1.8,'#1c1d1f',rnd(5,9),'smoke');}
        else if(w.kind==='cold'){if(random()<seconds*22*sparks)this.emit(w.x+rnd(-R,R)*.5,w.y+rnd(-R,R)*.3,rnd(-.4,.4),rnd(.2,.9),rnd(.8,1.6),1.6,'#cfe9ff',rnd(6,12),'mist');if(random()<seconds*12*sparks)this.emit(w.x+rnd(-R,R)*.5,w.y+rnd(-R,R)*.4,rnd(-.5,.5),rnd(.3,1.2),rnd(.6,1.3),1.3,'#eaf6ff',rnd(1,2.2),'ice');}
        else if(random()<seconds*12*sparks)this.emit(w.x+rnd(-R,R)*.6,w.y+rnd(-R,R)*.4,rnd(-.2,.2),rnd(-1.1,-.5),rnd(.7,1.3),1.3,'#8ff0a8',rnd(2.2,3.6),'plus');}
    }
    // Heal, per second, on one body in the field: tissue and bone come back, the oldest wound closes (it shrinks until it is gone), bleeding stops, bruises and burns fade, fire goes out and the temperature comes back to the room's.
    // The ragdoll it belongs to - if it is alive - gets its blood, oxygen, organs and ease from pain back, once per step however many of its parts are in the field. It never revives, regrows, reattaches or mends a broken joint.
    powerHeal(b,p,k,seconds) {
      const amb=this.settings.ambient;if(p.necrotic)return; /* a limb a tourniquet killed is past healing */p.hp=Math.min(p.maxHp,p.hp+HEAL_HP*k*seconds);p.burning=false;delete p.fuse;p.heat+=clamp(amb-p.heat,-HEAL_TEMP*k*seconds,HEAL_TEMP*k*seconds);if(p.char>0&&!p.debris)p.char=Math.max(0,p.char-.5*k*seconds);
      if(!p.part)return;p.bone=Math.min(100,(p.bone??100)+HEAL_HP*k*seconds);if(p.bone>50)delete p.brokeAt;if(p.bruise>0)p.bruise=Math.max(0,p.bruise-.6*k*seconds);if(p.internal>0)p.internal=Math.max(0,p.internal-1.5*k*seconds);if(p.leak>0)p.leak=Math.max(0,p.leak-k*seconds);
      let open=false;if(p.wounds)for(let i=0;i<p.wounds.length;i++){const wd=p.wounds[i];if(wd.bleed>0){wd.bleed=0;open=true;}}if(p.severed)for(let i=0;i<p.severed.length;i++)if(p.severed[i].bleed>0){p.severed[i].bleed=0;open=true;}if(open||p.bleed>0)this.bleedOf(p);
      if(p.wounds&&p.wounds.length){const wd=p.wounds[0];wd.radius-=HEAL_WOUND*k*seconds;wd.run=0;if(wd.depth>1&&wd.radius<2.6)wd.depth=1;if(wd.radius<1.2)p.wounds.shift();} /* oldest first, one at a time */
      const e=this.getEntity(b);if(!e||!e.alive||e.healStamp===this.powerStamp)return;e.healStamp=this.powerStamp;e.restTime=0;
      if(e.blood!==undefined)e.blood=Math.min(100,e.blood+HEAL_BLOOD*k*seconds);if(e.oxygen!==undefined)e.oxygen=Math.min(100,e.oxygen+40*k*seconds);if(e.pain>0)e.pain=Math.max(0,e.pain-HEAL_PAIN*k*seconds);if(e.trauma)e.trauma=Math.max(0,e.trauma-60*k*seconds);
      if(e.organs){let whole=true;for(const organ in e.organs){e.organs[organ]=Math.min(100,e.organs[organ]+HEAL_ORGAN*k*seconds);if(e.organs[organ]<100)whole=false;}if(whole)delete e.organs;}
    }
    // Shock: arcs leave the cursor for the best one to three conductors in reach - better conductors and nearer ones first, never two parts of one body - and each spreads through the ordinary shock() chain with a dose that goes with how close it is.
    // Where they struck is kept on the power (hits, n) for the interface to draw; with nothing in reach n is 0 and it only crackles.
    powerShock(w,R) {
      const near=this.powerNear,ks=this.powerK,pick=this.powerPick;w.hits??=[{x:0,y:0},{x:0,y:0},{x:0,y:0}];w.n=0;pick[0]=pick[1]=pick[2]=-1;
      for(let slot=0;slot<SHOCK_ARCS;slot++){let best=-1,score=0;for(let i=0;i<near.length;i++){const b=near[i],c=matOf(b.plugin).conductive;if(!(c>0)||i===pick[0]||i===pick[1])continue;const id=b.plugin.entityId;if((pick[0]>=0&&near[pick[0]].plugin.entityId===id)||(pick[1]>=0&&near[pick[1]].plugin.entityId===id))continue;if(c*ks[i]>score){score=c*ks[i];best=i;}}
        if(best<0)break;pick[slot]=best;w.n++;}
      for(let j=0;j<w.n;j++){const b=near[pick[j]],q=b.bounds,hit=w.hits[j];hit.x=clamp(w.x,q.min.x,q.max.x);hit.y=clamp(w.y,q.min.y,q.max.y);this.shock(b,SHOCK_DOSE*(.35+.65*ks[pick[j]])/w.n,hit,true);} /* the current is shared between the arcs */
    }
    // Where a fire or a cold field reaches the floor or a wall it leaves its mark: a scorch that darkens and widens the longer the fire stays, a patch of frost that fades when the cold has gone. Marks near each other are one mark; their number is capped.
    powerMark(w,R) {
      if(!this.settings.decals)return;const fire=w.kind==='fire',floor=w.y+R>this.groundY&&w.y<this.groundY+R,wall=w.x-R<0?1:w.x+R>this.width?this.width-1:0;if(!floor&&!wall)return;
      const x=floor?w.x:wall,y=floor?this.groundY-1:w.y,reach=1-(floor?Math.abs(this.groundY-w.y):Math.min(w.x,this.width-w.x))/R,stains=this.stains;if(!(reach>0))return;let mark=null,count=0;
      for(let i=0;i<stains.length;i++){const st=stains[i];if(!st.power||!!st.frost===fire)continue;count++;if(!!st.wall===!floor&&Math.abs((floor?st.x:st.y)-(floor?x:y))<st.r+6)mark=st;}
      if(!mark){if(count>=POWER_MARKS)return;mark=this.addStain(fire?{x,y,r:5,a:.1,scorch:true,power:true,age:0}:{x,y,r:6,a:.15,frost:true,power:true,age:0});if(!floor)mark.wall=true;}
      mark.a=Math.min(fire?.85:.9,mark.a+reach*POWER_SCAN*(fire?.5:.9));mark.r=Math.min(R*.7,mark.r+reach*POWER_SCAN*(fire?10:16));if(!fire)mark.age=0;
    }
    // Letting go changes nothing: what was held carries on with the velocity the pull had given it. That is the whole of throwing. (A last sanity limit, far above any real throw.)
    endDrag(){if(this.drag&&!this.drag.bodyB.isStatic)for(const b of this.connected(this.drag.bodyB,this.joints.filter(c=>c.plugin.joint||c.plugin.hold||c.plugin.pierce)))if(!b.isStatic&&b.speed>THROW_MAX)Body.setVelocity(b,Vector.mult(b.velocity,THROW_MAX/b.speed));
      if(this.drag&&this.dragAngle!=null&&!this.drag.bodyB.isStatic)Body.setAngularVelocity(this.drag.bodyB,0); /* turned to an angle with A / D, it leaves at that angle, without spin */
      if(this.drag?.inertia&&!this.drag.bodyB.isStatic)Body.setInertia(this.drag.bodyB,this.drag.inertia);this.drag=null;this.dragAngle=null;}
    // One substep of the cursor's pull. A spring-damper on the grabbed point, critically damped, sized to the mass it has to move: the body's own plus a share of whatever hangs off it (a ragdoll held by the hand),
    // capped so that a light part hauling a heavy body does not turn into a spring too stiff for the step. Gravity is not cancelled - held things hang and dangle - and there is a limit to the force, so very heavy things trail.
    grab(seconds) {
      const d=this.drag,b=d.bodyB;if(!this.bodies.includes(b)){this.drag=null;this.dragAngle=null;return;}if(b.isStatic)return;
      Vector.rotate(d.pointB,b.angle-d.angleB,d.pointB);d.angleB=b.angle; /* the grabbed point turns with the body */
      if(this.time-d.loadAt>.25){d.loadAt=this.time;d.load=0;for(const x of this.connected(b,this.joints.filter(c=>c.plugin.joint||c.plugin.hold||c.plugin.pierce)))if(!x.isStatic)d.load+=x.mass;}
      const rate=GRAB_RATE*this.settings.grabStrength,m=Math.min(d.load||b.mass,b.mass*Math.min(GRAB_GEAR,(GRAB_STABLE/rate)**2)),per=60,/* outside collision events Matter reports velocity per 1/60 s, whatever the substep */ax=b.position.x+d.pointB.x,ay=b.position.y+d.pointB.y,
        vx=(b.velocity.x-b.angularVelocity*d.pointB.y)*per,vy=(b.velocity.y+b.angularVelocity*d.pointB.x)*per; /* the grabbed point's own velocity, px/s */
      let fx=m*(rate*rate*(d.pointA.x-ax)-2*GRAB_DAMP*rate*vx),fy=m*(rate*rate*(d.pointA.y-ay)-2*GRAB_DAMP*rate*vy);const f=Math.hypot(fx,fy),most=Math.min(m*GRAB_ACCEL,GRAB_FORCE);if(f>most){fx*=most/f;fy*=most/f;}
      Body.applyForce(b,{x:ax,y:ay},{x:fx*1e-6,y:fy*1e-6}); /* px/s2 to Matter's px/ms2 */
      if(this.dragAngle==null)Body.setAngularVelocity(b,b.angularVelocity*(1-(b.plugin.part?GRAB_CALM_PART:GRAB_CALM))); /* a hand steadies what it holds: it swings, it does not spin */
    }
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
    unrope(c){if(!c?.plugin?.rope||!this.joints.includes(c))return false;Composite.remove(this.world,c);return true;}
    // Blood thrown by a blow. With a direction it is a cone: forward says how much of it carries on with the blow (negative = back-spatter toward the attacker,
    // which is what an entry wound does; an exit wound throws it all forward). Without a direction it is the old radial burst.
    spray(point,direction,count,speed,forward) {
      if(!direction||(!direction.x&&!direction.y)){this.burst(point.x,point.y,count,'#a4373c',speed,'blood');return;}
      const d=Vector.normalise(direction);count=Math.round(count*Math.max(1,this.settings.bloodAmount));
      for(let i=0;i<count;i++){const along=(random()<Math.abs(forward)?Math.sign(forward):-Math.sign(forward)*.4)*rnd(.4,1)*speed,side=rnd(-.45,.45)*speed;this.emit(point.x,point.y,d.x*along-d.y*side,d.y*along+d.x*side-rnd(0,1),rnd(.3,1),1,'#a4373c',rnd(1,3.2),'blood');}
    }
    // Particles are recycled: dead ones go to a free list and come back, and the live array is compacted in place, so a long bleed allocates nothing.
    emit(x,y,vx,vy,life,maxLife,color,size,type) {
      if(type==='blood'||type==='oil'){if(this.settings.bloodAmount<1&&random()>this.settings.bloodAmount)return null;}
      const list=this.particles,p=list.length>=900?list.shift():(this.spare.pop()||{});p.x=x;p.y=y;p.vx=vx;p.vy=vy;p.life=life;p.maxLife=maxLife;p.color=color;p.size=size;p.type=type;p.owner=0;list.push(p);return p;
    }
    burst(x,y,count,color,speed=5,type='spark') {
      if(type==='blood')count=Math.round(count*Math.max(1,this.settings.bloodAmount));
      for(let i=0;i<count;i++)this.emit(x,y,rnd(-speed,speed),rnd(-speed,speed),rnd(.25,1),1,color,rnd(1,3.5),type);
    }
    sever(c) {
      if(!this.joints.includes(c))return;
      for(const [b,point] of [[c.bodyA,c.pointA],[c.bodyB,c.pointB]]){
        if(!b)continue;const p=b.plugin;const local=Vector.rotate(point,-b.angle);
        const other=b===c.bodyA?c.bodyB:c.bodyA,away=other?Math.atan2(other.position.y-b.position.y,other.position.x-b.position.x)-b.angle:Math.atan2(local.y,local.x);
        p.severed??=[];p.severed.push({x:p.flip?-local.x:local.x,y:local.y,bleed:p.material==='flesh'?1.8:0,fresh:1.6,pull:p.flip?Math.PI-away:away});this.bleedOf(p); // the stump's bone is not marked fractured: losing an arm must not break the chest it hung from
        if(p.material==='flesh')this.burst(b.position.x+point.x,b.position.y+point.y,16,'#a32e31',4,'blood');
      }
      Composite.remove(this.world,c);const owner=this.getEntity(c.bodyA||c.bodyB);if(owner){owner.restTime=0;this.split(owner);}
    }
    // What is no longer joined to a ragdoll is no longer part of it: each loose piece becomes remains of its own, with the little blood that is in it. The side with the chest keeps the identity (failing that, the bigger side).
    // Without this a severed arm still slept, woke and answered to its old slot number along with the body it came from.
    split(e) {
      if(e.blood===undefined)return;const links=this.joints.filter(c=>c.plugin.joint),sets=[];for(const b of e.bodies)if(!sets.some(set=>set.has(b)))sets.push(this.connected(b,links));if(sets.length<2)return;
      const keep=sets.find(set=>[...set].some(b=>b.plugin.slot===2))||sets.reduce((a,b)=>b.size>a.size?b:a);
      for(const set of sets){if(set===keep)continue;const bodies=e.bodies.filter(b=>set.has(b)),left={id:this.nextId++,kind:e.kind,bodies,joints:e.joints.filter(c=>set.has(c.bodyA)),upright:false,blood:LIMB_BLOOD*bodies.length,alive:false,consciousness:'dead'};this.entities.push(left);for(const b of bodies)b.plugin.entityId=left.id;}
      e.bodies=e.bodies.filter(b=>keep.has(b));e.joints=e.joints.filter(c=>keep.has(c.bodyA));e.pin=null;
      if(e.alive&&!e.bodies.some(b=>b.plugin.slot===0))this.kill(e,'decapitation');
    }
    // direction (optional, world space) is where the blow was travelling; cuts and sprays follow it.
    damage(body,amount,point=body?.position,type='impact',direction=null) {
      if(!body||body.plugin.boundary||!Number.isFinite(amount)||amount<=0)return;
      const p=body.plugin,set=this.settings,gone=p.hp<=0,profile=PROFILES[type]||PROFILES.impact;if(p.part)amount*=set.fragility*(p.material==='flesh'&&p.heat<0?1+Math.min(2,-p.heat/50):1); // frozen flesh is brittle
      // A bullet wounds. It never takes a limb off, and it only destroys the part it hits when the muzzle is pressed against it (a contact shot, within CONTACT_SHOT px).
      const gunshot=type==='bullet'||type==='exit',spared=!!p.part&&(this.falling||gunshot&&!this.contactShot); /* a round never takes a part to nothing by its damage alone: whether it destroys or severs a part is decided by the energy it spends there (see ruin()); a fall never does */
      p.hp=spared?Math.max(Math.min(p.hp,this.falling?FALL_FLOOR:BULLET_FLOOR),p.hp-amount):Math.max(0,p.hp-amount);
      const e=this.getEntity(body),hurts=(STUN_PART[p.part]??1)*profile.stun,stun=e&&amount>KNOCKDOWN&&set.stunScale>0&&hurts?clamp(amount/20,.6,5)*set.stunScale*hurts:0;if(e)e.restTime=0;
      if(e&&e.alive&&p.part)this.react(e,body,amount,direction,stun);else if(e&&stun)e.stun=Math.max(e.stun||0,stun);
      if(e){e.hitTime=this.time;e.hitHard=amount;}
      if(e&&e.kind==='human'&&e.alive){const hurt=amount*profile.pain*(PAIN_PART[p.part]??1)*set.painSensitivity;e.pain=Math.min(100,(e.pain||0)+hurt);
        // the wound that hurts most is the one the hands go to; an older one only keeps that place while it still hurts more
        if(p.slot!==undefined&&hurt>=(e.hurtScore||0)){const local=Vector.rotate(Vector.sub(point,body.position),-body.angle);e.hurtScore=hurt;e.hurtSlot=p.slot;e.hurtX=local.x;e.hurtY=local.y;}}
      if(e&&e.alive&&type==='shock')e.shockT=Math.max(e.shockT||0,SHOCK_LOCK);
      if(p.part&&p.heat<=FROZEN&&amount>=FROZEN_BLOW&&type!=='burn'&&type!=='shock'&&!p.destroying){p.destroying=true;this.damageQueue.push(()=>{const owner=this.getEntity(body);if(owner&&owner.alive&&(p.slot===0||p.slot===2))this.kill(owner,`${p.part} shattered`);this.shatter(body);});return;} /* frozen solid, a hard blow does not wound it: it breaks like the brittle thing it is */
      if(p.material==='flesh'){
        const local=Vector.rotate(Vector.sub(point,body.position),-body.angle),lx=p.flip?-local.x:local.x;
        const fx=lx/(p.w/2),fy=local.y/(p.h/2),zone=(ZONES[p.part]||[]).find(([,x0,y0,x1,y1])=>fx>=x0&&fx<=x1&&fy>=y0&&fy<=y1)?.[0];
        p.bone=Math.max(0,(p.bone??100)-amount*profile.bone*(zone==='joint'&&p.slot>=5?JOINT_HIT:1));
        if(amount>4){if(HIT_SOUND[type])this.onEffect(HIT_SOUND[type],clamp(amount/40,.25,1.4));if(type!=='burn'&&type!=='shock')this.emit(point.x,point.y,0,0,.09,.09,'#fff1d8',clamp(amount/12,1.5,4.5),'spark');} /* a pop of light where it landed, for a tenth of a second */
        if(p.bone<=50&&p.brokeAt===undefined){p.brokeAt=this.time;if(p.slot>=5){this.onEffect('crack',1);for(let i=0;i<3;i++)this.emit(point.x,point.y,rnd(-2.5,2.5),rnd(-3.5,-.5),rnd(.5,.9),.9,'#e8dfc8',rnd(1,1.8),'spark');}} /* the break itself: a crack, and a few chips of bone - only ever here, so they mean something */ /* the swelling starts here */
        // Bleeding belongs to the wound, not the limb. A burn seals what is there; a new blow next to an old wound opens it again.
        const artery=set.arterialSpurts&&zone==='artery'&&(profile.deep||(type==='cut'&&amount>25)),rate=this.noBleed?0:amount*profile.bleed*(artery?ARTERY_RATE:1);
        if(type==='burn')for(const w of [...(p.wounds||[]),...(p.severed||[])])w.bleed=Math.max(0,(w.bleed||0)-amount/40);
        else for(const w of p.wounds||[])if(Math.hypot(w.x-lx,w.y-local.y)<9){if(w.stitched)continue;if(w.sealed){if(amount<BANDAGE_HOLDS)continue;w.sealed=false;}w.bleed=Math.min(4,(w.bleed||0)+rate*.3);} /* a dressing keeps a wound shut unless the blow is hard enough to tear it off */
        if(profile.wound&&!(type==='shock'&&amount<SHOCK_MARK)){const dir=direction?Math.atan2(direction.y,direction.x)-body.angle:random()*6.28;
          const made=this.wound(p,{x:clamp(lx,-p.w/2+1,p.w/2-1),y:clamp(local.y,-p.h/2+1,p.h/2-1),radius:this.woundRadius??clamp(amount/(profile.deep?13:type==='exit'?4:10),1.5,11),type,dir:p.flip?Math.PI-dir:dir,seed:random()*6.28,t:this.time,wet:this.time,force:amount,depth:WOUND_DEPTH[type](amount),hits:1,bleed:Math.min(4,rate),...(artery?{artery:true}:{}),...(zone&&(zone!=='artery'||artery)?{hit:zone}:{}),...(FATAL_SPOTS.has(p.part)||artery?{}:this.shotPool?{pool:this.shotPool}:{left:artery?ARTERY_BLOOD:WOUND_BLOOD})});
          if(type!=='burn'&&!this.noBleed){if(type==='bullet')this.spray(point,direction,Math.min(4,Math.ceil(amount/10))*(set.extraGunshot?3:1),3,-.35); /* the entry: a small puff back toward the gun */
            else if(type==='exit'){const left=this.sprayE??1;this.spray(point,direction,Math.min(44,Math.round(6+left*9))*(set.extraGunshot?2:1),Math.min(12,4+left*2.4),1);} /* the exit: a cone along the round's line, as big as what it still carries - it paints whatever is behind */
            else this.spray(point,direction,Math.min(24,Math.ceil(amount/3)),3,.6);}}
        this.bleedOf(p);
        if(e&&e.alive&&zone==='spine'&&(profile.deep||type==='exit')&&amount>=(type==='exit'?SPINE_HIT*.3:SPINE_HIT)){if(p.slot<=2)e.upright=false;e.paralysed=true;e.restTime=0;} /* the cord: below the chest it takes the legs, at the chest or neck everything */
        if(e&&p.slot>=5&&p.slot<=10&&amount>=DROP_HIT){const hand=e.bodies.find(b=>b.plugin.slot===(p.slot<=7?7:10)),item=hand&&this.held(hand);if(item)this.release(item);} /* a wounded arm lets go of what it holds */
        if(e&&e.kind==='human'&&e.alive){if(set.organDamage&&!this.channelled&&(profile.deep||(type==='impact'&&amount>20))){const organ=this.organHit(e,body,lx,local.y,amount*(profile.deep?1:.4),type);if(organ&&profile.wound){const w=(p.wounds||[]).find(x=>x.type===type&&Math.hypot(x.x-clamp(lx,-p.w/2+1,p.w/2-1),x.y-clamp(local.y,-p.h/2+1,p.h/2-1))<12);if(w)w.hit??=organ;}}
          if(e.alive&&(p.part==='head'||p.part==='chest')&&p.hp<12)this.kill(e,type==='shock'?'cardiac arrest':`massive ${p.part} trauma`);} /* current that does this much to the trunk has stopped the heart */
      }
      else{this.burst(point.x,point.y,Math.min(8,Math.ceil(amount/8)),p.material==='glass'?'#a7dbe2':'#e1bc7b',3);if(p.part&&profile.deep)p.leak=Math.min(3,(p.leak||0)+amount/70);}
      if(p.hp<=0) {
        if(defs[p.kind]?.explosive?.onBreak){if(!p.detonating){p.detonating=true;this.damageQueue.push(()=>this.detonate(body));}}
        else if(p.material==='flesh'||p.kind==='android'){
          // A bullet can incapacitate without automatically detaching the whole limb.
          if(!gunshot&&type!=='blast'&&(amount>85*set.jointStrength||p.bone<=0))for(const c of [...this.joints])if(c.plugin.joint&&(c.bodyA===body||c.bodyB===body))this.sever(c);
          // Limb crushing: a limb that was already destroyed and takes another heavy blow is pulped.
          if(type==='blast'&&p.part&&!p.gibbed){p.gibbed=true;const at={...body.position},v={...body.velocity},m=p.material;this.damageQueue.push(()=>this.gibs(at.x,at.y,m,v,.6));}
          if(set.limbCrush&&!gunshot&&gone&&p.part&&!p.crushing&&amount*set.crushSensitivity/100>40){p.crushing=true;this.damageQueue.push(()=>this.crush(body));}
        }
        else if(defs[p.kind]?.garment){if(!p.destroying){p.destroying=true;this.damageQueue.push(()=>this.removeBody(body));}}
        else if(!p.debris&&!p.destroying&&!defs[p.kind]?.indestructible){p.destroying=true;this.damageQueue.push(()=>this.shatter(body));}
      }
    }
    // Blood that lands on a body stays where it landed, in that body's own frame, so it turns with it. Oldest goes first.
    stain(body,point,r,oil) {
      const p=body.plugin,local=Vector.rotate(Vector.sub(point,body.position),-body.angle);p.stains??=[];
      for(const st of p.stains)if(Math.hypot(st.x-local.x,st.y-local.y)<st.r+2){st.r=Math.min(p.part?2.4:3.6,Math.sqrt(st.r*st.r+r*r*.4));st.wet=1;return;} // landing on a stain makes it bigger and wet again
      if(p.stains.length>=(p.part?PART_STAINS:BODY_STAINS)){let near=p.stains[0];for(const st of p.stains)if(Math.hypot(st.x-local.x,st.y-local.y)<Math.hypot(near.x-local.x,near.y-local.y))near=st;near.wet=1;return;} /* full: the nearest mark is wetted again. Nothing is taken away to make room, so the marks on a body never jump about */
      p.stains.push({x:local.x,y:local.y,r:p.part?Math.min(r,2):r,wet:1,oil:oil||undefined});
    }
    addStain(st){const stains=this.stains;if(stains.length>=this.settings.maxStains)stains.shift();stains.push(st);return st;}
    // Blood that lands on the floor joins a pool if one is there. Pools grow by area, up to a limit, instead of stacking dots.
    pool(x,r,oil) {
      const stains=this.stains;for(let i=stains.length-1;i>=0;i--){const st=stains[i];if(st.wall||st.scorch||st.frost||st.smear||!!st.oil!==!!oil||Math.abs(st.x-x)>st.r+4)continue;
        st.r=Math.min(POOL_MAX,Math.sqrt(st.r*st.r+r*r*.55));st.x+=(x-st.x)*.04;st.wet=1;st.age=0;return st;}
      return this.addStain({x,y:this.groundY-1,r,wet:1,age:0,oil:oil||undefined});
    }
    // Thirty times a second: blood dries, old stains fade out, and the count is capped.
    stainsTick(dt,bodies) {
      const stains=this.stains,life=this.settings.stainLifetime;let keep=0;
      for(let i=0;i<stains.length;i++){const st=stains[i];if(st.wet>0)st.wet=Math.max(0,st.wet-dt/DRY_TIME);st.age=(st.age||0)+dt;if(st.frost?st.age<FROST_LIFE:(!life||st.age<life))stains[keep++]=st;}stains.length=keep;
      // A pool that has spread over smaller floor stains swallows them.
      for(let i=0;i<stains.length;i++){const big=stains[i];if(big.r<10||big.wall||big.scorch||big.frost||big.smear||big.gone)continue;for(let j=0;j<stains.length;j++){const st=stains[j];if(j===i||st.gone||st.wall||st.scorch||st.frost||st.smear||st.r>=big.r||!!st.oil!==!!big.oil||Math.abs(st.x-big.x)>big.r-st.r*.5)continue;st.gone=true;big.wet=Math.max(big.wet,st.wet);}}
      keep=0;for(let i=0;i<stains.length;i++)if(!stains[i].gone)stains[keep++]=stains[i];stains.length=keep;
      const over=stains.length-this.settings.maxStains;if(over>0)stains.splice(0,over);
      for(const b of bodies){const p=b.plugin;if(p.stains)for(const st of p.stains)if(st.wet>0)st.wet=Math.max(0,st.wet-dt/DRY_TIME);
      }
    }
    // A part's bleeding is the sum of its wounds and stumps.
    // A new wound either joins one of its own kind that it overlaps, or is added. Joining digs deeper rather than wider: the force adds up, and depth follows the total - skin (1), muscle (2), bone (3).
    // So three cuts in one place are one deep gash and a burst into one spot is one big hole.
    wound(p,w) {
      p.wounds??=[];const old=w.type==='shock'?p.wounds.find(o=>o.type==='shock'):p.wounds.find(o=>o.type===w.type&&!o.sealed&&Math.hypot(o.x-w.x,o.y-w.y)<Math.max(5,(o.radius+w.radius)*.7));
      if(!old){p.wounds.push(w);return w;} /* every wound is kept, however many: nothing is dropped to make room. Wounds of one kind that overlap join, which is what bounds the list - a part only has room for a few dozen that do not touch */
      const a=old.radius,b=w.radius;old.radius=Math.min(11,Math.hypot(a,b*.6)); /* it gets bigger and deeper, but it stays exactly where it was made: a wound never moves */old.force=(old.force||0)+w.force;old.depth=Math.min(3,Math.max(old.depth||0,w.depth,WOUND_DEPTH[w.type](old.force*.7)));
      old.hits=(old.hits||1)+1;old.bleed=Math.min(4,(old.bleed||0)+w.bleed*.7);old.wet=w.t;old.artery=old.artery||w.artery;if(w.type==='impact')old.t=Math.min(old.t,w.t-BRUISE_RISE);return old; /* a fresh blow on a bruise does not send it back to invisible */
    }
    bleedOf(p){let sum=0;for(const w of p.wounds||[])sum+=w.bleed||0;for(const w of p.severed||[])sum+=w.bleed||0;return p.bleed=Math.min(7,sum);}
    kill(e,cause){if(!e.alive||e.immortal)return; /* the immortal takes the harm and not the death */if(e.conduit&&e.power>0){e.power=Math.max(0,e.power-STORM_SAVE);return;} /* nor does Storm while charged: each death he cheats costs him charge */e.diedAt=this.time;e.heartRate=0;e.pulse=0;e.alive=false;e.upright=false;e.causeOfDeath=cause;e.consciousness='dead';e.restTime=0;e.deadFor=0;{const chest=e.bodies.find(b=>b.plugin.slot===2);if(chest&&!chest.isStatic){const way=random()<.5?-1:1;Body.setAngularVelocity(chest,chest.angularVelocity+way*rnd(.015,.04));Body.setVelocity(chest,{x:chest.velocity.x+way*rnd(.3,.9),y:chest.velocity.y});}} // a body going limp never goes straight down: it buckles to one side
      e.twitchAt=e.kind==='human'&&!/destroyed/.test(cause)?[rnd(.4,1.4),random()<.6?rnd(1.8,TWITCH_WINDOW):99]:[];}
    // Where on the part the blow landed decides whether it found an organ. Blunt force only reaches the brain (concussion).
    organHit(e,body,lx,ly,amount,type) {
      const p=body.plugin,zones=ORGANS[p.part];if(!zones)return;const fx=lx/(p.w/2),fy=ly/(p.h/2),zone=zones.find(([organ,x0,y0,x1,y1])=>fx>=x0&&fx<=x1&&fy>=y0&&fy<=y1&&(type!=='impact'||organ==='brain'));if(!zone)return;
      return this.organ(e,body,zone[0],zone[5],amount);
    }
    organ(e,body,organ,scale,amount) {
      const p=body.plugin;e.organs??={brain:100,heart:100,lungs:100,gut:100};e.organs[organ]=Math.max(0,e.organs[organ]-amount*scale);
      if(organ==='brain'){if(e.organs.brain<=0)this.kill(e,'brain destroyed');else e.stun=Math.max(e.stun||0,(100-e.organs.brain)/12);} // a long blackout
      else if(organ==='heart'){p.internal=(p.internal||0)+amount/18;if(e.organs.heart<=0&&e.heartStops===undefined){e.heartStops=this.time+rnd(HEART_LAST[0],HEART_LAST[1]);e.hurtSlot=2;e.hurtScore=999;e.hurtX=0;e.hurtY=-p.h*.25;e.pain=Math.max(e.pain||0,85);if(this.balancing(e)&&!(e.stagN>0)){e.stagN=2;e.stagDir=random()<.5?-1:1;e.stagT=0;e.stagLeg=0;e.stagPush=STAGGER_MAX*.8;}}} /* the heart is gone, but not the blood in the head: a few seconds of staggering and clutching the chest, then down (see vitals) */               // massive internal bleed
      else if(organ==='gut'){let all=0;for(const b of e.bodies)all+=b.plugin.internal||0;p.internal=(p.internal||0)+Math.min(amount/80,Math.max(0,GUT_BLEED-all));} /* capped over the whole body: the belly and the pelvis are both gut, and one round crosses both */                                                                          // slow internal bleed
      // lungs: no immediate effect; vitals() runs the oxygen down while they are damaged
      return organ;
    }
    // Gibs: small physical chunks of what used to be a limb, and half as many bone fragments. They trail blood for a moment, and do not last.
    gibs(x,y,material,velocity,scale=1) {
      const set=this.settings,count=Math.round(set.gibCount*scale);if(!set.fragments||!count||this.bodies.length>set.maxObjects-12)return;
      const old=this.bodies.filter(b=>b.plugin.gib);for(const b of old.slice(0,Math.max(0,old.length+count*1.5-GIB_MAX)))this.removeBody(b);
      const bits=[],total=count+(material==='flesh'?Math.ceil(count/2):0);for(let i=0;i<total;i++){const bone=i>=count,w=bone?rnd(3,6):rnd(4,9),h=bone?rnd(2,3):rnd(4,8),b=Bodies.rectangle(x+rnd(-8,8),y+rnd(-8,8),w,h,{density:bone?.002:.0015,friction:.8,restitution:.15,frictionAir:.01*set.airDrag});
        this.meta(b,'gib',{material:bone?'bone':material,w,h,hp:10,maxHp:10,debris:true,gib:true,life:GIB_LIFE*rnd(.7,1.2),trail:material==='flesh'&&!bone?rnd(.8,1.8):0,seed:random()*100});
        Body.setVelocity(b,{x:velocity.x*.5+rnd(-5,5),y:velocity.y*.5+rnd(-7,-1)});Body.setAngularVelocity(b,rnd(-.4,.4));bits.push(b);}
      this.entity('debris',bits);
    }
    crush(body) {
      if(!this.bodies.includes(body))return;const p=body.plugin,{x,y}=body.position,e=this.getEntity(body),flesh=p.material==='flesh';
      this.burst(x,y,flesh?45:20,flesh?'#8d2a31':'#e1bc7b',7,flesh?'blood':'spark');if(flesh)this.burst(x,y,14,'#7a2a30',3,'smoke');
      if(e&&(p.part==='head'||p.part==='chest'))this.kill(e,`${p.part} destroyed`);this.removeBody(body);
      this.gibs(x,y,flesh?'flesh':p.material,body.velocity,1);
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
        this.damage(b,f*f*170*power,b.position,'blast',{x:dx,y:dy});b.plugin.heat+=f*180;
        if(b.plugin.part&&b.plugin.slot!==2&&random()<f*f*BLAST_SEVER*power/this.settings.jointStrength)this.dismember(b); /* a blast may take a limb off, likelier the closer it is, never for certain */
      }this.onEffect('explosion',power);
    }
    detonate(body){if(!this.bodies.includes(body))return;const {x,y}=body.position,ex=defs[body.plugin.kind]?.explosive||{radius:170,power:1};this.removeBody(body);this.explode(x,y,ex.radius,ex.power);}
    // Bullets are rays. Each body the ray crosses is hit in order; whether the bullet stops there depends on what it is made of and the state it is in.
    // Flesh stops a first bullet. A limb that is already perforated or destroyed no longer does: the next bullet goes in one side and out the other
    // (entry and exit wound) and carries on, weaker, into whatever is behind it.
    // A shot is one or more rounds (spec.pellets) leaving a muzzle. spec comes from the weapon's row: damage (multiple of the bullet-damage setting), speed (muzzle velocity, m/s), spread (radians), force.
    // Without a speed (the shoot tool) the round arrives at once and the first thing it hit is returned. With one it flies: step() moves it along at SHOT_SCALE of its real speed, so a rifle round visibly outruns a pistol's.
    shoot(from,to,ignore=null,spec={}) {
      const aim=Vector.normalise(Vector.sub(to,from));if(!aim.x&&!aim.y)return;let first=null;const E0=spec.energy??spec.damage??1;let pellets=spec.pellets||1;
      // Buckshot pressed close has not spread yet: within POINT_BLANK px of the muzzle the pellets are one massive wound - their energy together, a wide hole, and the power to take a part off.
      let mass=null;if(pellets>1)for(let d=4;d<=POINT_BLANK&&!mass;d+=4){const q={x:from.x+aim.x*d,y:from.y+aim.y*d},hit=Query.point(this.bodies,q).find(b=>b!==ignore&&b.collisionFilter.group!==ignore?.collisionFilter.group);if(hit)mass=hit;}
      if(mass)pellets=1;
      for(let i=0;i<pellets;i++){const direction=spec.spread&&!mass?Vector.rotate(aim,rnd(-spec.spread,spec.spread)):aim,speed=spec.speed?spec.speed*PX_PER_M*SHOT_SCALE*this.settings.bulletSpeed:0,ms=spec.speed??spec.ms??0,e=mass?E0*(spec.pellets||1):E0;
        const shot={x:from.x,y:from.y,dx:direction.x,dy:direction.y,speed,ms,E0:e,E:e,klass:mass?HEAVY_E:e,diameter:mass?18:spec.diameter??9,force:spec.force??1,ignore,done:new Set(),travelled:0,first:null,spent:0,bounces:0,tumbling:false};
        if(speed)this.shots.push(shot);else{let turns=0;while(!this.fly(shot,SHOT_REACH,.14)&&turns++<8);first=shot.first;}} /* an instant round is traced to its end, round every turn it takes */
      this.burst(from.x,from.y,5,'#ffe1a2',3);this.onEffect('shot',.3,spec.sound);return first;
    }
    // Move a round L px along its line, spending its energy on each body the line crosses, in order. It may stop, pass through, or turn - off a bone, off a skull, off a hard surface (a ricochet) or grazing an edge;
    // a turn ends this stretch where it happened and the round goes on from there on its new line. Returns true when the round is spent.
    fly(shot,L,glow=.1) {
      const fx=shot.x,fy=shot.y,dx=shot.dx,dy=shot.dy,direction={x:dx,y:dy},ignore=shot.ignore,rx=dx*SHOT_REACH,ry=dy*SHOT_REACH,hits=this.hitList??=[],pool=this.hitPool??=[];hits.length=0;
      // Exact segment/polygon intersection avoids tunnelling and query-order artifacts. Entry and exit are the nearest and farthest crossing of each body; the edge it enters by gives the surface normal for a ricochet.
      const test=body=>{if(shot.done.has(body)||body===ignore||(ignore?.plugin.heldBy!==undefined&&body.collisionFilter.group===ignore.collisionFilter.group))return; // a held gun never shoots its own holder
        let near=Infinity,far=-Infinity,nx=0,ny=0;const v=body.vertices;for(let i=0;i<v.length;i++){const a=v[i],b=v[(i+1)%v.length],sx=b.x-a.x,sy=b.y-a.y,den=rx*sy-ry*sx;
          if(Math.abs(den)<1e-8)continue;const qx=a.x-fx,qy=a.y-fy,t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;if(t>=0&&t<=1&&u>=0&&u<=1){if(t<near){near=t;const l=Math.hypot(sx,sy)||1;nx=-sy/l;ny=sx/l;}far=Math.max(far,t);}}
        if(near<Infinity){if(M.Vertices.contains(body.vertices,{x:fx,y:fy}))near=0;if(near*SHOT_REACH<=L){const h=pool[hits.length]??={};h.body=body;h.near=near;h.far=far;const flipN=nx*dx+ny*dy>0?-1:1;h.nx=nx*flipN;h.ny=ny*flipN;hits.push(h);}}}; /* a muzzle pushed into a body: the entry is where the muzzle is */
      for(const body of this.bodies)test(body);for(const body of this.boundaries)test(body);
      hits.sort((a,b)=>Math.abs(a.near-b.near)>1e-6?a.near-b.near:(b.body.plugin.slot??0)-(a.body.plugin.slot??0)); /* in a profile the two arms and the two legs overlap exactly: the near one, the one you can see, is hit first */
      const at=t=>({x:fx+rx*t,y:fy+ry*t}),range=d=>clamp(RANGE_POINT_BLANK-(d-RANGE_NEAR)/RANGE_FALLOFF,RANGE_MIN,RANGE_POINT_BLANK),bd=this.settings.bulletDamage;let stop=null,spent=false,turned=-1;
      const turn=(ang,dist)=>{const c=Math.cos(ang),sn=Math.sin(ang),ox=shot.dx,oy=shot.dy;shot.dx=ox*c-oy*sn;shot.dy=ox*sn+oy*c;turned=dist;};
      this.shotPool=shot.pool??={left:SHOT_BLOOD}; /* every wound one round makes outside the fatal spots - through an arm, the belly and the other arm, entries and exits - draws on one allowance. ponytail: a saved game turns the shared allowance into one per wound */
      for(const h of hits){const body=h.body,near=h.near,far=h.far,p=body.plugin,first=!shot.first;shot.first??=body;stop=at(near);shot.done.add(body);const gone=shot.travelled+near*SHOT_REACH;
        if(first)shot.E=shot.E0*range(gone); /* the round has lost energy to the air on the way: the range falloff */
        const hard=!!p.boundary||(matOf(p).absorb>=1&&!p.part),/* an android's casing is metal, but it is a body the round goes into, not a plate it skims off */flesh=p.material==='flesh',chord=far>near?(far-near)*SHOT_REACH:Math.min(p.w||p.r*2||10,p.h||p.r*2||10);
        let rate=flesh?FLESH_E*(1+FLESH_FAST*shot.E)*(shot.tumbling?TUMBLE_RATE:1):RESIST_K*matOf(p).absorb**4;const exitAt=at(far>near?far:near+chord/SHOT_REACH);
        // A hard surface - metal, stone, the floor and the walls - turns a round that meets it at a glancing angle, or that has too little left to go in: it bounces off with most of its energy (less, the more squarely it hit), a spark and a whine.
        if(hard){const cosI=Math.abs(dx*h.nx+dy*h.ny),glancing=cosI<RICO_GLANCE,need=p.boundary?Infinity:chord*rate;
          if(shot.bounces<RICO_MAX&&(glancing||need>=shot.E)){shot.bounces++;shot.E*=glancing?RICO_KEEP:RICO_KEEP*(1-cosI*.65);if(!p.boundary)this.damage(body,shot.E*bd*.05,stop,'bullet',direction);
            const r=2*(dx*h.nx+dy*h.ny);shot.dx=dx-r*h.nx;shot.dy=dy-r*h.ny;turn(rnd(-RICO_JITTER,RICO_JITTER),near*SHOT_REACH);stop={x:stop.x+h.nx*.6,y:stop.y+h.ny*.6};shot.ignore=null;shot.done=new Set([body]); /* bounced: it can hit anything now, the one who fired it too */
            this.hole(body,stop,false);this.burst(stop.x,stop.y,6,'#ffe7a0',4);this.onEffect('ricochet',.5);if(this.shotLog)this.shotLog.push({body,E:shot.E,use:0,through:false,ricochet:true});break;}
          if(p.boundary){this.hole(body,stop,false);spent=true;shot.E=0;break;}}
        this.contactShot=shot.first===body&&gone<=CONTACT_SHOT;
        const toLocal=q=>{const l=Vector.rotate(Vector.sub(q,body.position),-body.angle);return {x:(p.flip?-l.x:l.x)/(p.w/2),y:l.y/(p.h/2)};};let a=null,b=null,bone=0,channel=false;
        if(flesh&&p.part){a=toLocal(stop);b=toLocal(exitAt);if(BONE_ZONE[p.part]&&crosses(a.x,a.y,b.x,b.y,BONE_ZONE[p.part]))bone=BONE_E[p.part]; /* the line crosses the bone */
          const ex=a.x*p.w/2,ey=a.y*p.h/2;channel=!!p.wounds?.some(w=>(w.type==='bullet'||w.type==='exit')&&Math.hypot(w.x-ex,w.y-ey)<CHANNEL_NEAR);} /* a round going in where one went before follows the channel it tore: little flesh and no whole bone in the way */
        if(channel){bone=0;rate*=CHANNEL_EASE;}
        const e=this.getEntity(body),human=flesh&&e&&e.kind==='human',glancing=p.part==='head'&&Math.abs(dx*(body.position.y-fy)-dy*(body.position.x-fx))>GLANCE_B*Math.max(p.w,p.h)/2; /* the head is round: a line that passes it well off its centre meets it at a glance */
        // Armour. Whatever covers this part meets the round first: it stops up to its rating (less as it wears: in proportion to what is left of it), and loses durability by the energy it takes. A stopped round is still a blow -
        // a bruise, pain, perhaps a knockdown - but no wound and no blood. A round with more than the rating goes on, weaker by it. A helmet turns a glancing round up to its glance limit.
        const cover=flesh&&p.part&&!this.contactShot?p.armour?.[ARMOUR_ON[p.part]]:null,armour=cover&&cover.hp>0?ARMOURS[cover.id]:null;
        if(armour){const held=armour.rating*cover.hp/armour.durability;
          if(armour.glance&&glancing&&shot.E<armour.glance){cover.hp=Math.max(0,cover.hp-shot.E*armour.wear*.5);this.blunt(body,shot.E*.3,stop,direction,e);turn((random()<.5?-1:1)*rnd(.3,.6),near*SHOT_REACH);shot.E*=.6;if(this.shotLog)this.shotLog.push({body,E:shot.E,use:0,through:false,armour:true,glance:true});this.burst(stop.x,stop.y,4,'#ffe7a0',3);this.onEffect('armour',.5);break;}
          if(shot.E<=held){cover.hp=Math.max(0,cover.hp-shot.E*armour.wear);this.blunt(body,shot.E,stop,direction,e);if(this.shotLog)this.shotLog.push({body,E:shot.E,use:0,through:false,armour:true,stopped:true});shot.spent+=shot.E;shot.E=0;spent=true;this.onEffect('armour',.6);break;}
          cover.hp=Math.max(0,cover.hp-held*armour.wear);shot.E-=held;shot.spent+=held;rate=FLESH_E*(1+FLESH_FAST*shot.E);if(this.shotLog)this.shotLog.push({body,E:shot.E+held,use:held,through:true,armour:true});this.onEffect('armour',.4);}
        // A low-energy round meeting the skull at a glancing angle does not go in: it furrows the scalp, rings the brain and goes off on a new line.
        if(glancing&&!this.contactShot&&shot.E<SKULL_E){const use=Math.min(shot.E*.3,chord*rate);shot.E-=use;shot.spent+=use;this.woundRadius=null;this.damage(body,use*bd,stop,'bullet',direction);
          if(human&&e.alive){e.stun=Math.max(e.stun||0,CONCUSSION*this.settings.stunScale);if(this.settings.organDamage){e.organs??={brain:100,heart:100,lungs:100,gut:100};e.organs.brain=Math.max(1,e.organs.brain-8);}}
          turn((random()<.5?-1:1)*rnd(.25,.55),near*SHOT_REACH);if(this.shotLog)this.shotLog.push({body,E:shot.E+use,use,through:false,glance:true});break;}
        if(flesh&&chord<GRAZE_CHORD&&!this.contactShot){const use=Math.min(shot.E,chord*rate);shot.E-=use;shot.spent+=use;this.woundRadius=null;this.damage(body,use*bd,stop,'bullet',direction);turn((random()<.5?-1:1)*GRAZE_TURN,near*SHOT_REACH);break;} /* it clipped the edge: a furrow in the skin, and the round glances off on a new line */
        const broken=flesh&&p.part?this.fractured(body):false,need=chord*rate+bone,use=Math.min(shot.E,need),through=shot.E>need;if(this.shotLog)this.shotLog.push({body,E:shot.E,use,through}); /* tests only: what the round had going in, and spent */shot.E-=use;shot.spent+=use;const left=shot.E;
        Body.applyForce(body,stop,Vector.mult(direction,.018*this.settings.bulletForce*shot.force*Math.min(3,use+left*.2)));
        const end=through?exitAt:{x:stop.x+dx*chord*(use/need||0),y:stop.y+dy*chord*(use/need||0)};
        if(flesh&&p.part&&human&&e.alive&&this.settings.organDamage&&ORGANS[p.part]){const la=a,lb=toLocal(end);for(const zone of ORGANS[p.part])if(crosses(la.x,la.y,lb.x,lb.y,zone.slice(1,5))){this.organ(e,body,zone[0],zone[5],use*bd);if(this.shotLog)this.shotLog.push({organ:zone[0]});}} /* every organ the wound channel crosses, not just the one at the entry - before the wound itself, which may kill */
        if(flesh){this.channelled=true;this.woundRadius=clamp(shot.diameter*.28,1.5,4)*(shot.tumbling?TUMBLE_WOUND:1);this.damage(body,this.contactShot&&p.part?Math.max(use*bd,p.hp+p.maxHp):use*bd*(through?SHOT_ENTRY:1),stop,'bullet',direction); /* the entry is always about the calibre (bigger from a tumbling round). With the muzzle against the body the gas goes in with the round and the part is destroyed, whatever the round */
          if(through&&this.bodies.includes(body)){this.woundRadius=clamp(2.6+left*1.4,2.6,11);this.sprayE=left;this.damage(body,use*bd*(1-SHOT_ENTRY),exitAt,'exit',direction);this.sprayE=null;} /* out the far side: small from a pistol, ragged from a rifle */
          this.woundRadius=null;this.channelled=false;
          if(p.part){const la=a,lb=toLocal(end);
            if(bone){p.bone=Math.max(0,(p.bone??100)-BONE_HIT*Math.min(1.5,shot.E+use));if(p.bone<=FRACTURE&&p.brokeAt===undefined){p.brokeAt=this.time;if(p.slot>=5)this.onEffect('crack',.8);}} /* a round through a bone always hurts it, and enough of them break it */
            if(shot.ms>=CAVITY_MS){p.bruise=Math.min(1,(p.bruise||0)+use*CAVITY_BRUISE);if(human)p.internal=(p.internal||0)+use*CAVITY_BLEED;} /* a fast round's shock wave bruises and tears round its path without widening the hole: rifles, not pistols */
            if(human&&e.alive&&p.slot===0&&through&&use>=SKULL_KILL){this.spray(exitAt,direction,30,7,1);this.kill(e,'shot through the head');}
            if(!through&&!this.contactShot){const la=a;p.lodged??=[];if(p.lodged.length<LODGED_MAX)p.lodged.push({x:lb.x*p.w/2,y:lb.y*p.h/2,calibre:shot.diameter,ex:la.x*p.w/2,ey:la.y*p.h/2}); /* where it stopped, and the wound it went in by */}}} /* it stopped inside: the round stays there */
        else{this.damage(body,use*bd,stop,'bullet',direction);this.hole(body,stop,false);if(through)this.hole(body,exitAt,true);if(matOf(p).absorb>=.9)this.onEffect('metal',.4);}
        if(flesh&&p.part&&!this.contactShot)this.ruin(body,use,shot,stop,exitAt,direction,bone>0,through,left,broken);
        if(!through){spent=true;stop=end;break;}
        if(shot.ms>=CAVITY_MS)shot.tumbling=true; /* through something, a rifle round begins to tumble */
        stop=exitAt;if(bone){turn(rnd(-1,1)*BONE_DEFLECT/(1+left),(far>near?far:near)*SHOT_REACH);break;}} /* a bone turns it, more the less it has left */
      this.contactShot=false;this.shotPool=null;this.woundRadius=null;this.channelled=false;const to=spent||turned>=0?stop:{x:fx+dx*L,y:fy+dy*L};if(turned>=0)L=turned;this.traces.push({from:{x:fx,y:fy},to,life:glow,maxLife:glow});
      shot.x=to.x;shot.y=to.y;shot.travelled+=L;return spent||shot.travelled>=SHOT_REACH||shot.E<=0;
    }
    // A bullet hole in something that is not flesh: a bright dent in metal, a splintered hole in wood, a chipped pock in stone, a star in glass; in the floor and the walls a world decal. Capped per object and in all.
    hole(body,at,exit){if(!this.settings.decals)return;const p=body.plugin;if(p.boundary){this.addStain({x:at.x,y:at.y,r:1.6,hole:true,age:0,wall:at.y<this.groundY-2||undefined});return;}
      if(p.material==='flesh'||p.part||p.debris)return;let total=0;for(const b of this.bodies)total+=b.plugin.holes?.length||0;if(total>=HOLE_MAX||(p.holes?.length||0)>=HOLES_PER_BODY)return;
      const l=Vector.rotate(Vector.sub(at,body.position),-body.angle),abs=matOf(p).absorb,kind=abs>=.9?(p.material==='stone'?'chip':'dent'):matOf(p).brittle?'crack':'splinter';(p.holes??=[]).push(exit?{x:p.flip?-l.x:l.x,y:l.y,kind,exit:true}:{x:p.flip?-l.x:l.x,y:l.y,kind});}
    // A casing thrown out of the ejection port, up and back, to bounce with a clink and lie about for a while. Not for a revolver or a crossbow; a pump shotgun throws its shell when it is worked.
    eject(gun,kind){const set=this.settings;if(set.particles==='Off'||(set.particles==='Low'&&(this.ejected=(this.ejected||0)+1)%2)||this.bodies.length>set.maxObjects-5)return;const [w,h,colour]=CASING[kind]||CASING.pistol;
      const old=this.bodies.filter(b=>b.plugin.casing);for(const b of old.slice(0,Math.max(0,old.length+1-CASING_MAX)))this.removeBody(b);
      const side=gun.plugin.flip?-1:1,port=Vector.add(gun.position,Vector.rotate({x:-side*2,y:-(gun.plugin.h||8)/2},gun.angle)),b=Bodies.rectangle(port.x,port.y,w,h,{density:.004,friction:.5,restitution:.45});
      this.meta(b,'casing',{material:'metal',w,h,hp:5,maxHp:5,debris:true,casing:kind,colour,life:CASING_LIFE});Body.setVelocity(b,Vector.add(gun.velocity,Vector.rotate({x:-side*rnd(1,2.5),y:-rnd(3,4.5)},gun.angle)));Body.setAngularVelocity(b,rnd(-.5,.5));this.entity('debris',[b]);}
    // Storm's charge: electricity he is hit by is stored as power (0-100) instead of hurting. A big jolt makes him surge: every part lit, a flash, the sound of it.
    charge(e,amount,at){if(!e.alive){const chest=this.chestOf(e);if(!chest||!e.bodies.some(b=>b.plugin.slot===0))return;this.revive(chest);e.power=0;amount=Math.max(amount,SURGE_AT);} /* electricity brings him back, head and chest whole */
      else{e.healStamp=null;for(const b of e.bodies)this.powerHeal(b,b.plugin,1,amount*CONDUIT_HEAL);} /* and knits him: like the Heal field, for as long as the dose is worth */
      const before=e.power||0;e.power=Math.min(100,before+amount);if(e.power-before>=SURGE_AT||(before<20&&e.power>=20)){for(const b of e.bodies)b.plugin.surge=1;e.surge=1.5;const c=at?.position||this.chestOf(e)?.position;if(c){this.flashes.push({x:c.x,y:c.y,radius:120,life:.6,maxLife:.6,surge:true});this.burst(c.x,c.y,26,'#8fe9ff',8);}this.onEffect('surge',.8);}}
    // Lightning from a hand: an arc to the nearest thing in front of him within reach - or, with nothing there, into the floor - which shocks it (a person, through the ordinary chain) and burns it. Every throw costs charge; held, it throws again every ZAP_EVERY.
    zap(e,hand,held){if(held&&this.time-(e.zapAt??-9)<ZAP_EVERY)return '';if((e.power||0)<ZAP_COST)return held?'':'Out of charge: hit him with electricity first';e.zapAt=this.time;e.power-=ZAP_COST;
      const face=this.chestOf(e)?.plugin.flip?-1:1,from=hand.position;let best=null,far=ZAP_REACH;for(const b of this.bodies){if(b.plugin.entityId===e.id||b.isStatic&&!b.plugin.boundary)continue;const dx=b.position.x-from.x,dy=b.position.y-from.y,d=Math.hypot(dx,dy);if(d<far&&dx*face>0&&Math.abs(dy)<d*.9){far=d;best=b;}}
      const to=best?{x:clamp(from.x,best.bounds.min.x,best.bounds.max.x),y:clamp(from.y,best.bounds.min.y,best.bounds.max.y)}:{x:from.x+face*rnd(120,220),y:this.groundY};this.traces.push({from:{...from},to,life:.28,maxLife:.28,electric:true,zap:true});this.flashes.push({x:from.x,y:from.y,radius:40,life:.15,maxLife:.15,muzzle:true});
      if(best){this.shock(best,ZAP_DOSE,to);this.damage(best,ZAP_BURN,to,'burn');if(!best.isStatic)Body.setVelocity(best,{x:best.velocity.x+face*ZAP_KICK,y:best.velocity.y-ZAP_KICK*.3});this.flashes.push({x:to.x,y:to.y,radius:90,life:.3,maxLife:.3,surge:true});this.burst(to.x,to.y,16,'#dff3ff',7);} /* a real bolt: it throws what it hits */else{this.burst(to.x,to.y,10,'#dff3ff',6);if(this.settings.decals)this.addStain({x:to.x,y:this.groundY-1,r:rnd(5,9),scorch:true,age:0});}this.onEffect('electric',.9);if(!held)this.onEffect('thunder',.5);return held?'':'Lightning';}
    // Laser beams from the eyes: a straight line from the eyes the way he faces (and his head is tilted), burning the first thing it meets - scorch and burn wounds, but it never sets anything alight; held, it keeps burning, a little charge a moment.
    laser(e,head,held){if((e.power||0)<LASER_COST)return held?'':'Out of charge: hit him with electricity first';e.power-=LASER_COST;e.laserAt=this.time;const p=head.plugin,face=p.flip?-1:1,dir=Vector.rotate({x:face,y:0},head.angle),eye=Vector.add(head.position,Vector.rotate({x:face*p.w*.25,y:-p.h*.05},head.angle));
      const end=Vector.add(eye,Vector.mult(dir,LASER_REACH)),hits=Query.ray([...this.bodies,...this.boundaries],eye,end,1).map(c=>c.bodyA===c.bodyB||!c.bodyB?c.bodyA:c.bodyA.plugin?.entityId===e.id?c.bodyB:c.bodyA).filter(b=>b&&b.plugin.entityId!==e.id).sort((a,b)=>Vector.magnitude(Vector.sub(a.position,eye))-Vector.magnitude(Vector.sub(b.position,eye)));
      let stop=end;const hit=hits[0];if(hit){const d=Vector.dot(Vector.sub(hit.position,eye),dir);stop=Vector.add(eye,Vector.mult(dir,Math.max(0,d-(hit.plugin.w||hit.plugin.r*2||20)/2)));if(!hit.plugin.boundary){this.damage(hit,LASER_BURN,stop,'burn',dir);if(!hit.plugin.debris)hit.plugin.char=Math.min(LASER_CHAR,(hit.plugin.char||0)+.02);} /* scorches, never heats: nothing it touches catches fire */else if(this.settings.decals&&random()<.3)this.addStain({x:stop.x,y:Math.min(stop.y,this.groundY-1),r:2,scorch:true,age:0});this.burst(stop.x,stop.y,3,'#ff6a5a',3);}
      for(const s of [-1,1])this.traces.push({from:{x:eye.x,y:eye.y+s*1.2},to:{x:stop.x,y:stop.y+s*1.2},life:.06,maxLife:.06,laser:true});if(!held)this.onEffect('laser',.6);return held?'':'Laser';}
    // What a heavy round does to the part it spent energy in, beyond the wound: bone chips where it crossed a bone hard, flesh thrown out of a big exit, and - if the part is within the round's class and took more than it can -
    // the part destroyed, or severed at the joint it was hit near. Deferred to after the step's contacts, since it removes bodies.
    // The blow of a round that armour stopped: impact damage, with a bruise and pain and no bleeding; enough of it knocks the body down.
    blunt(body,E,at,dir,e) {this.noBleed=true;this.damage(body,E*this.settings.bulletDamage*BLUNT_K,at,'impact',dir);this.noBleed=false;if(e&&e.kind==='human'&&e.alive){e.pain=Math.min(100,(e.pain||0)+E*BLUNT_PAIN*this.settings.painSensitivity);body.plugin.bruise=Math.min(1,(body.plugin.bruise||0)+E*.12);}}
    ruin(body,use,shot,at,exit,dir,bone,through,left,broken) { /* broken: the bone was already broken before this round */
      const p=body.plugin,set=this.settings;if(bone&&shot.E0>=CHIP_E&&set.fragments)for(let i=0;i<Math.min(6,Math.round(use*2));i++)this.emit(at.x,at.y,dir.x*rnd(1,4)+rnd(-1.5,1.5),dir.y*rnd(1,4)+rnd(-2,.5),rnd(.4,.8),.8,'#e8dfc8',rnd(.9,1.6),'spark');
      if(through&&left>=GIB_EXIT_E){const v={x:dir.x*Math.min(12,4+left*.4),y:dir.y*Math.min(12,4+left*.4)};this.damageQueue.push(()=>this.gibs(exit.x,exit.y,'flesh',v,.35));} /* a big exit throws flesh out along the round's line */
      const E0=shot.klass??shot.E0,part=p.part,limb=p.slot>=5,small=part==='hand'||part==='foot';if(E0<RIFLE_E||p.ruined)return;
      const allowed=E0>=FIFTY_E||(E0>=HEAVY_E&&limb)||(limb&&(small||broken));if(!allowed||use<RUIN_E[part]*set.jointStrength*(broken?.5:1))return;
      p.ruined=true;const pool=this.shotPool,local=Vector.rotate(Vector.sub(at,body.position),-body.angle),end=limb?local.y/(p.h/2):0;
      this.damageQueue.push(()=>{if(!this.bodies.includes(body))return;const cut=c=>{const before=[c.bodyA,c.bodyB].map(b=>(b.plugin.severed||[]).length);this.sever(c);if(!ARTERIAL_JOINT.has(c.plugin.name))[c.bodyA,c.bodyB].forEach((b,i)=>{for(const st of (b.plugin.severed||[]).slice(before[i]))if(pool)st.pool=pool;});}; /* a stump at a knee, an elbow, a wrist or an ankle draws on the round's blood allowance; one at the hip or the shoulder is the femoral or the brachial artery, and bleeds until it is stopped */
        if(part==='abdomen'){const waist=this.joints.find(c=>c.plugin.joint&&c.plugin.name==='waist'&&(c.bodyA===body||c.bodyB===body));if(waist){cut(waist);this.spray(at,dir,24,6,.8);return;}} /* cut in two at the waist */
        if(limb&&!small&&Math.abs(end)>RUIN_JOINT){const c=this.joints.find(c=>c.plugin.joint&&(end<0?c.bodyB===body:c.bodyA===body));if(c){cut(c);this.spray(at,dir,18,6,.8);return;}} /* hit near a joint: it comes off there */
        for(const c of this.joints.filter(c=>c.plugin.joint&&(c.bodyA===body||c.bodyB===body)))cut(c);this.crush(body);}); /* anywhere else, the part is destroyed - its joints torn first, so what is left has stumps - with gibs, spray and fragments; a head or a chest kills */
    }
    ignite(body){if(!body)return;body.plugin.heat=Math.max(body.plugin.heat,330);if(matOf(body.plugin).flammable>0)body.plugin.burning=true;if(defs[body.plugin.kind]?.explosive?.onHeat)body.plugin.fuse=.35;this.onEffect('fire',.1);}
    // A strike takes the highest thing under it. It is a massive shock: current jumps through conductors, flesh burns, flammables catch.
    lightning(x) {
      const under=this.bodies.filter(b=>b.bounds.min.x<=x&&b.bounds.max.x>=x).sort((a,b)=>a.bounds.min.y-b.bounds.min.y)[0],y=under?under.bounds.min.y:this.groundY,top=-370;
      this.traces.push({from:{x:x+rnd(-140,140),y:top},to:{x,y},life:.55,maxLife:.55,electric:true,bolt:true});this.flashes.push({x,y,radius:90,life:.35,maxLife:.35,sky:true});
      this.burst(x,y,26,'#dff3ff',9);this.burst(x,y,10,'#8f9aa0',3,'smoke');if(this.settings.decals&&!under)this.addStain({x,y:this.groundY-1,r:rnd(14,24),scorch:true,age:0});
      const storm=under?.plugin.part?this.getEntity(under):null;if(storm?.conduit){this.shock(under,LIGHTNING_DOSE);this.charge(storm,CONDUIT_BOLT,under);this.onEffect('thunder',1);return under;} /* a bolt is only more power to him */
      if(under){this.shock(under,LIGHTNING_DOSE);this.damage(under,45,{x,y},'burn');under.plugin.heat+=520;if(!under.isStatic)Body.setVelocity(under,{x:under.velocity.x,y:under.velocity.y+3});}
      this.onEffect('thunder',1);return under||null;
    }
    shock(body,dose=1,at=null,held=false) { /* held: one tick of the shock power, twelve a second - a shorter chain and briefer arcs, or the screen fills with them */
      if(!body)return;{const point=at||body.position,life=held?.1:.24;this.traces.push({from:{...point},to:{...point},life,maxLife:life,electric:true,contact:true});this.burst(point.x,point.y,held?1:5,'#cfeeff',4);} /* where the current goes in: a flash, a star of short arcs, a few sparks that fall */const deadBefore=new Set(this.entities.filter(e=>e.alive===false)); /* only someone who was already dead can be brought back by this shock: the one that stops a heart does not also restart it */const touched=new Set(),queue=[body];
      const most=held?SHOCK_CHAIN_HELD:30,arc=held?.1:.3;while(queue.length&&touched.size<most){const b=queue.shift();if(touched.has(b))continue;touched.add(b);b.plugin.charge=1;const own=b.plugin.part?this.getEntity(b):null;if(own?.conduit)this.charge(own,dose*CONDUIT_GAIN/own.bodies.length*Math.pow(.95,touched.size-1),b);else this.damage(b,(b.plugin.material==='flesh'?24:5)*Math.min(1,dose)*Math.pow(.8,touched.size-1),b.position,'shock');if(!b.isStatic){const jolt=Math.min(1,dose)*(held?.35:1);Body.setVelocity(b,{x:b.velocity.x+rnd(-2,2)*jolt,y:b.velocity.y-2*jolt});} /* the jolt goes with the dose; a held shock is many small ones, and must not lift what it holds off the floor */
        for(const other of this.bodies)if(!touched.has(other)&&matOf(other.plugin).conductive>0&&Vector.magnitude(Vector.sub(other.position,b.position))<65){queue.push(other);const edge=(of,toward)=>({x:clamp(toward.x,of.bounds.min.x,of.bounds.max.x),y:clamp(toward.y,of.bounds.min.y,of.bounds.max.y)}),from=edge(b,other.position);this.traces.push({from,to:edge(other,from),life:arc,maxLife:arc,electric:true});} /* arcs jump surface to surface, not centre to centre */
      }this.onEffect('electric',.3);
      // What current does to a person depends on the state they are in, and on how much of it they have had.
      // Out cold: it brings them round - the stun goes, and pain that had put them under is cut through (it cannot wake someone who is out for want of blood, air or brain).
      // Too much: every shock adds to a dose that fades over seconds; past SHOCK_SAFE each further shock may stop the heart. Dead: it may start it again - nearly always if the heart is what failed, less often otherwise. It mends nothing.
      for(const e of new Set([...touched].map(b=>this.getEntity(b)))){if(!e||e.kind!=='human'||e.conduit||!e.bodies.some(b=>b.plugin.slot===0)||!e.bodies.some(b=>b.plugin.slot===2))continue;
        if(e.alive&&!deadBefore.has(e)){e.shockDose=(e.shockDose||0)+dose;e.stun=0;e.stunNext=0;e.stunIn=0;if(e.pain>WAKE_PAIN)e.pain=WAKE_PAIN;e.restTime=0;
          if(e.shockDose>SHOCK_SAFE&&random()<(e.shockDose-SHOCK_SAFE)*SHOCK_ARREST)this.kill(e,'cardiac arrest');continue;}
        if(!deadBefore.has(e)||!e.causeOfDeath||this.chestOf(e).plugin.char>.9)continue;const heart=/cardiac|heart/.test(e.causeOfDeath);
        if(random()<(heart?HEART_RESTART:SHOCK_REVIVE)){this.partialRevive(e.bodies[0]);e.shockDose=SHOCK_SAFE;this.onRevive?.(e);}} /* back, but with no margin: more current now and the heart may stop again */
    }
    // Tourniquet: on a limb part - an upper arm, a forearm, a thigh, a shin - it stops the bleeding of that part and of every part further out, for as long as it is on. What is below it goes numb over TOURNIQUET_NUMB seconds;
    // left on for TOURNIQUET_DEAD seconds it dies, and a dead limb is not healed by anything - only regrown once it has been taken off. The same tool takes it off again. Returns what to tell the player.
    tourniquet(part){const p=part?.plugin;if(!p?.part||!LIMB_CHAIN[p.part])return 'A tourniquet goes on an arm or a leg';if(p.tourniquet){delete p.tourniquet;this.limbs(this.getEntity(part));return 'Tourniquet off';}p.tourniquet={at:this.time};this.limbs(this.getEntity(part));return 'Tourniquet on';}
    // Which parts are below a tourniquet, and for how long: set on each part, once a step (see vitals). The four limbs are chains of slots from the shoulder or the hip out.
    limbs(e){if(!e)return;for(const b of e.bodies){const p=b.plugin;if(p.slot===undefined||p.slot<5){p.tied=false;p.numb=0;continue;}const base=p.slot<8?5:p.slot<11?8:p.slot<14?11:14;let since=null;
      for(let k=base;k<=p.slot;k++){const up=e.bodies.find(x=>x.plugin.slot===k);if(up?.plugin.tourniquet)since=Math.min(since??Infinity,up.plugin.tourniquet.at);}
      p.tied=since!==null;p.numb=p.tied?.9*clamp((this.time-since)/TOURNIQUET_NUMB,0,1):0;if(p.tied&&this.time-since>=TOURNIQUET_DEAD&&!p.necrotic){p.necrotic=true;p.hp=Math.min(p.hp,20);}}}
    // Stitch: the wound nearest the point on a part is closed for good - a lodged round in it is taken out first - its bleeding stops, and the pain of it eases. It does not bring back tissue or blood.
    stitch(part,point){const p=part?.plugin;if(!p?.part||p.material!=='flesh')return 'Only a ragdoll can be stitched';const l=Vector.rotate(Vector.sub(point,part.position),-part.angle),lx=p.flip?-l.x:l.x;
      let best=null,d=Infinity;for(const w of p.wounds||[]){if(w.stitched||w.type==='impact'||w.type==='burn'||w.type==='shock')continue;const k=Math.hypot(w.x-lx,w.y-l.y);if(k<d){d=k;best=w;}}if(!best)return 'No wound to stitch there';
      let removed=0;if(p.lodged)p.lodged=p.lodged.filter(r=>{const near=Math.hypot((r.ex??r.x)-best.x,(r.ey??r.y)-best.y)<STITCH_REACH;if(near)removed++;return !near;});best.stitched=true;best.bleed=0;best.run=0;this.bleedOf(p);
      const e=this.getEntity(part);if(e?.alive&&e.kind==='human')e.pain=Math.max(0,(e.pain||0)-STITCH_EASE);this.onEffect('cloth',.3);return removed?'Round taken out, wound stitched':'Wound stitched';}
    // Stop bleeding: every wound, stump and internal bleed on the whole ragdoll closes. Nothing is mended: the wounds, the pain and the lost blood stay.
    stopBleeding(body){const e=this.getEntity(body),parts=e?e.bodies:body?[body]:[];let n=0;for(const b of parts){const p=b.plugin;if(p.material!=='flesh')continue;for(const w of [...(p.wounds||[]),...(p.severed||[])])if(w.bleed>0){w.bleed=0;w.fresh=0;n++;}if(p.internal>0){p.internal=0;n++;}this.bleedOf(p);}return n;}
    // Bandage: one part. Its open wounds and stumps are dressed - sealed, so a knock does not reopen them - and the dressing shows. A hard enough hit on the dressing tears it off (see damage).
    bandage(body){const p=body?.plugin;if(!p||p.material!=='flesh'||!p.part)return 0;let n=0;for(const w of [...(p.wounds||[]),...(p.severed||[])]){if(w.sealed||w.type==='impact'||w.type==='burn')continue;w.sealed=true;w.bleed=0;w.fresh=0;n++;}this.bleedOf(p);return n;}
    heal(body){const e=this.getEntity(body);if(e&&e.blood!==undefined){e.blood=100;e.pain=0;e.oxygen=100;delete e.organs;e.hurtScore=0;e.clutching=0;e.shockT=0;e.tremor=null;}for(const b of e?e.bodies:[body]){if(!b||b.plugin.necrotic)continue;b.plugin.hp=b.plugin.maxHp;b.plugin.heat=this.settings.ambient;b.plugin.burning=false;b.plugin.char=0;b.plugin.charge=0;b.plugin.bleed=0;b.plugin.bone=100;delete b.plugin.brokeAt;b.plugin.wounds=[];b.plugin.internal=0;b.plugin.bruise=0;b.plugin.stains=[];b.plugin.leak=0;for(const w of b.plugin.severed||[])w.bleed=0;delete b.plugin.fuse;}this.burst(body.position.x,body.position.y,15,'#9fcbb1',2);}
    activate(body,held=false) {
      if(!body)return '';
      // Activating any part of a ragdoll works whatever it is holding: that hand first, then the near hand, then the far one.
      if(body.plugin.part){const e0=this.getEntity(body);if(e0?.conduit&&e0.alive&&e0.consciousness!=='unconscious'){if(body.plugin.part==='head')return this.laser(e0,body,held);if(body.plugin.part==='hand'&&!this.held(body))return this.zap(e0,body,held);} /* his powers: the head fires the eyes, an empty hand throws lightning */
        const e=this.getEntity(body),hands=[body,...(e?e.bodies.filter(b=>b.plugin.part==='hand').sort((a,b)=>b.plugin.slot-a.plugin.slot):[])];for(const hand of hands){const item=hand.plugin.part==='hand'&&this.held(hand);if(item)return this.activate(item,held);}return held?'':'Empty-handed: select a hand next to something to pick it up';}
      const p=body.plugin;
      const def=defs[p.kind]||{},name=def.name||'Object';if(held&&!def.firearm)return '';
      if(def.explosive?.arm==='activate'){if(!def.explosive.fuse){this.detonate(body);return `${name} detonated`;}p.fuse=def.explosive.fuse;return `Fuse lit — ${def.explosive.fuse} seconds`;}
      if(def.syringe)return held?'':this.syringe(body);
      if(def.firearm){const gun=def.firearm;if(held&&!gun.auto)return '';if(p.cool>0)return '';p.cool=gun.rate?1/gun.rate:0; /* no rate: a pistol or a revolver fires every time the trigger is pulled, with no wait between shots */ // held = the trigger is being kept down: only automatic weapons keep firing; every weapon has its own rate of fire
        const aim=body.angle+(p.flip?Math.PI:0),d={x:Math.cos(aim),y:Math.sin(aim)},muzzle=Vector.add(body.position,Vector.mult(d,gun.muzzle));Body.applyForce(body,body.position,Vector.mult(d,-gun.recoil));
        if(gun.launch){ /* a crossbow throws a real bolt: it flies, drops, goes in point-first and stays, like one thrown by hand - only faster */ const item=defs[gun.launch],e=this.spawn(gun.launch,muzzle.x+d.x*item.h*.55,muzzle.y+d.y*item.h*.55);if(!e)return 'No room for another bolt';const bolt=e.bodies[0],v=gun.speed*PX_PER_M*SHOT_SCALE*this.settings.bulletSpeed/60; /* px per 1/60 s, which is what setVelocity takes */
          Body.setAngle(bolt,aim+Math.PI/2);Body.setVelocity(bolt,Vector.add(body.velocity,Vector.mult(d,v)));bolt.plugin.shotBy=body.id;this.onEffect('shot',.5,'crossbow');return held?'':`${name} loosed`;}
        this.shoot(muzzle,Vector.add(muzzle,d),body,{...gun,sound:p.kind});this.flashes.push({x:muzzle.x,y:muzzle.y,radius:26,life:.06,maxLife:.06,muzzle:true}); /* a muzzle flash: lights the chamber for a moment when the floodlights are off */
        if(gun.casing){if(gun.casing==='shell')(this.pumps??=[]).push({gun:body,at:this.time+PUMP_DELAY});else this.eject(body,gun.casing);}return held?'':`${name} fired`;}
      if(def.device==='ram')return this.ram(body);
      if(def.device){p.active=!p.active;return `${name} ${p.active?'on':'off'}`;}
      return 'This object has no activation';
    }
    // ponytail: a blade in a hand shares that body's collision group, which piercing also needs, so held blades slash and do not pierce. Per-pair filtering would lift this.
    // A hot blade seals what it cuts: the wound does not bleed, and the flesh round it is cooked.
    sear(part){const p=part.plugin;for(const w of p.wounds||[])w.bleed=0;this.bleedOf(p);p.heat=Math.min(260,p.heat+90);p.char=Math.min(1,(p.char||0)+.12);}
    // Blades: the tip is the -y end of a sharp body. A fast, point-first hit on flesh runs it through instead of bouncing off.
    blade(sword){const h=sword.plugin.h,axis=Vector.rotate({x:0,y:-1},sword.angle);return {axis,tip:Vector.add(sword.position,Vector.mult(axis,h/2)),length:h*(defs[sword.plugin.kind]?.sharp?.length??.76)};}
    // Is this thing's blade live right now? A plain blade always is; a powered one (chainsaw, energy sword) only while it is switched on.
    cuts(body,how){const def=defs[body.plugin.kind];return !!def?.sharp?.[how]&&(!def.device||!!body.plugin.active);}
    pierce(pair,sword,part) {
      const p=sword.plugin;if(!this.cuts(sword,'tip')||p.stuck||p.heldBy!==undefined||this.time-(p.freedAt??-9)<REPIERCE_WAIT||part.plugin.material!=='flesh'||part.isStatic)return false;
      const {axis,tip}=this.blade(sword),contact=pair.collision.supports[0]||part.position;if(Vector.magnitude(Vector.sub(contact,tip))>26)return false;
      const arm=Vector.sub(tip,sword.position),tipVelocity={x:sword.velocity.x-sword.angularVelocity*arm.y,y:sword.velocity.y+sword.angularVelocity*arm.x};
      const sharp=defs[p.kind].sharp,speed=Vector.dot(Vector.sub(tipVelocity,part.velocity),axis);if(speed<this.settings.pierceSpeed*(sharp.ease??1))return false;
      // ponytail: the blade joins the victim's no-collide group, so one sword skewers one ragdoll at a time. Per-pair filtering if kebabs matter.
      pair.isSensor=true;p.stuck=part.plugin.entityId;p.bloody=true;sword.collisionFilter.group=part.collisionFilter.group;
      this.piercing.set(sword,{part,steps:40});
      this.damage(part,sharp.prick??clamp(20+speed*3,25,70),contact,'stab',axis);if(sharp.hot)this.sear(part);this.onEffect('impact',sharp.prick?.1:.4);
      if(defs[p.kind].syringe&&!p.fill)this.syringe(sword); /* an empty syringe fills as it goes in */ return true;
    }
    // A syringe works on the body it is in. Empty, it draws a dose of blood (on going in, or when activated); holding something, activating it pushes that into the body - or, out of a body, onto the floor.
    syringe(body) {
      const p=body.plugin,dose=defs[p.kind].syringe.dose,host=p.stuck!==undefined?this.entities.find(e=>e.id===p.stuck):null,{axis,tip}=this.blade(body);
      if(p.fill){const what=p.fill;delete p.fill;if(host&&host.blood!==undefined&&host.kind==='human'){host.blood=Math.min(100,host.blood+dose);return `Injected ${dose}% ${what}`;}
        for(let i=0;i<10;i++)this.emit(tip.x,tip.y,axis.x*rnd(2,5)+rnd(-.5,.5),axis.y*rnd(2,5)+rnd(-.5,.5),rnd(.6,1.2),1.2,BLOOD,rnd(1,2.2),'blood');return 'Syringe emptied';}
      if(!host||host.kind!=='human'||!(host.blood>0))return host?'Nothing to draw':'The syringe is empty: put it in a body';
      const took=Math.min(dose,host.blood);host.blood-=took;p.fill='blood';host.restTime=0;return `Drew ${took}% blood`;
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
        const e=this.getEntity(part);if(!defs[sword.plugin.kind].sharp.prick)for(let d=2;d<length;d+=10){const point=Vector.add(tip,Vector.mult(axis,-d)),other=e&&Query.point(e.bodies,point)[0];if(other&&other!==part&&!other.plugin.run){other.plugin.run=true;this.damage(other,22,point,'stab');}}
        if(e)for(const b of e.bodies)delete b.plugin.run;if(along>part.plugin.w&&!defs[sword.plugin.kind].sharp.prick)this.damage(part,12,tip,'stab');
      }
      for(const sword of this.bodies){const p=sword.plugin;if(p.stuck===undefined||this.piercing.has(sword))continue;
        const pins=this.joints.filter(c=>c.plugin.pierce&&c.bodyB===sword);
        // Matter's pins barely stretch, so a hand pull is measured on the grab itself: how far the cursor has drawn away from the hilt.
        const sharp=defs[p.kind]?.sharp||{},pulled=this.drag?.bodyB===sword&&Constraint.currentLength(this.drag)>this.settings.bladeGrip*4; /* ease is for going in only: picking a syringe up must not draw it out */
        // A blade in the body hurts all the time, and much more when someone moves it.
        if(pins.length){const host=this.getEntity(pins[0].bodyA);if(host&&host.kind==='human'&&host.alive){const moved=this.drag?.bodyB===sword;host.pain=Math.min(100,(host.pain||0)+(moved?14:1.6)*(sharp.prick?.1:1)/120*this.settings.painSensitivity);if(moved&&!sharp.prick&&!(host.flinch>0)){host.flinch=FLINCH_TIME;host.flinchMag=.5;host.flinchSlot=pins[0].bodyA.plugin.slot;host.flinchDir=host.flinchDir||1;}}}
        if(pins.length&&!pulled&&(this.drag?.bodyB===sword||pins.every(c=>Constraint.currentLength(c)<PIN_TEAR)))continue; // a hand pull is what the grip setting governs; the pins themselves only give way to real violence
        for(const c of pins){Composite.remove(this.world,c);{const host=c.bodyA.plugin,stab=!sharp.prick&&(host.wounds||[]).filter(w=>w.type==='stab').pop();if(stab)stab.bleed=Math.min(4,(stab.bleed||0)+.8);this.bleedOf(host);}const owner=this.getEntity(c.bodyA);if(owner)owner.restTime=0;}
        // Collisions come back only once the blade is clear, otherwise the solver would fire it out of the body.
        const e=this.entities.find(e=>e.id===p.stuck);if(!e||!e.bodies.some(b=>M.Bounds.overlaps(b.bounds,sword.bounds))){sword.collisionFilter.group=0;delete p.stuck;p.freedAt=this.time;} /* just drawn out: it does not go straight back in on the rebound */
      }
    }
    // A blunt impact on a body part: a fall, a wall, a thrown crate, a bat. Damage goes with the energy of the impact, v squared above a speed that does no harm, and with how much of the other thing there is behind it.
    // What lands decides what breaks. The end of a limb (foot, shin, hand, forearm) takes the load along the bone and passes what it does not absorb up the chain toward the trunk: ankle, shin, knee, pelvis, spine.
    // The head takes it all, from a lower speed. The broad parts of the body spread it over their area. Parts that land after the first, in the same fall, land softer: the body is already stopping.
    // A conscious body that comes down on its feet, upright, rides the landing with its legs and takes well under two thirds. Falls break bones and knock out; they do not tear limbs off (the part is spared at FALL_FLOOR hp).
    land(part,other,closing,point,toward,normal) {
      const p=part.plugin,head=p.slot===0,endOn=FALL_AXIAL.has(p.part)&&!!normal&&Math.abs(normal.x*-Math.sin(part.angle)+normal.y*Math.cos(part.angle))>.7, /* a limb that comes down on its end, not along its side */safe=head?FALL_SAFE_HEAD:FALL_SAFE;if(closing<=safe)return;const e=this.getEntity(part),fixed=other.isStatic||!!other.plugin.boundary||(!other.plugin.part&&(other.vx0??0)**2+(other.vy0??0)**2<FALL_REST*FALL_REST&&other.mass>part.mass); /* a crate or a beam lying still is backed by whatever it rests on: landing on it is landing on the floor */
      let amount=(closing*closing-safe*safe)*FALL_K*rnd(.75,1.25)*(endOn?FALL_AREA[p.part]:FALL_FLAT[p.part]??FALL_AREA[p.part]??1)*(fixed?this.settings.fallDamage:OBJECT_K*other.mass/(other.mass+part.mass+FALL_MASS)*(defs[other.plugin.kind]?.blunt||1));if(!(amount>.5))return;
      if(e){if(!(this.time-(e.landT??-9)<LAND_WINDOW)){e.landT=this.time;e.landN=0;}amount/=1+(e.landN++);} /* what is struck first takes the brunt: the rest of the body meets something that is already slowing */
      if(e&&fixed){
        const feet=p.slot===13||p.slot===16||p.slot===12||p.slot===15,chest=this.chestOf(e);if(feet&&chest&&this.active(e)&&Math.abs(wrap(chest.angle))<.6)amount*=LAND_ABSORB;
        if(e.alive&&!feet&&amount>6)e.stun=Math.max(e.stun||0,Math.min(6,amount/14)*this.settings.stunScale);} /* coming down on anything but your feet knocks the wind out of you */
      const chain=[part];if(e&&fixed&&endOn)for(let at=part,c;chain.length<6&&(c=this.joints.find(j=>j.plugin.joint&&j.bodyB===at));at=c.bodyA)chain.push(c.bodyA); /* up the limb, toward the chest */
      this.falling=true;chain.forEach((b,i)=>{const share=chain.length===1?1:FALL_SHARE[i]??0,give=amount*share;if(give<1)return;const q=b.plugin,limb=q.slot>=5;
        if(limb)q.bone=Math.max(0,(q.bone??100)-give*(1-FALL_HP));this.damage(b,limb?give*FALL_HP:give,b===part?point:b.position,'impact',toward);
        if(e&&e.alive&&e.kind==='human'&&fixed&&q.slot>=2&&q.slot<=4)e.trauma=(e.trauma||0)+give; /* what the trunk took in this fall, all told: see vitals() */
        if(e&&e.alive&&(q.slot===3||q.slot===4)&&give>=FALL_SPINE&&random()<.5){e.paralysed=true;e.restTime=0;}}); /* enough of it reaching the small of the back breaks it */
      this.falling=false;
      if(head&&e&&e.alive&&fixed&&amount>=NECK_FALL&&random()<(amount-NECK_FALL)/NECK_FALL)this.kill(e,'broken neck');
    }
    // Clothes. A loose garment that touches a part of its own region of a human ragdoll is put on: the item goes, and every part of that ragdoll that the garment paints now wears it. Any touch will do - a throw, a drop, being carried there by the cursor.
    // The wrong region, an android, a loose limb, or a body already wearing that kind of garment: nothing happens and it bounces off like any object. It is cosmetic: no damage, no stun, no push, and nothing in the simulation reads what a part wears.
    touchGarment(item,part) {
      const g=defs[item.plugin.kind].garment,p=part.plugin;if(item.plugin.worn||item.plugin.heldBy!==undefined||this.time-(item.plugin.freshAt??-9)<REDRESS_WAIT||p.kind!=='human'||!GARMENT_TOUCH[g.kind].includes(p.part))return;const e=this.getEntity(part);
      if(!e||e.kind!=='human'||!e.bodies.some(b=>b.plugin.slot===2)||!e.bodies.some(b=>b.plugin.part===GARMENT_NEEDS[g.kind])||e.bodies.some(b=>b.plugin.wear?.[g.kind]))return; /* a whole body, with the part this goes on, not already wearing one */
      item.plugin.worn=true;this.damageQueue.push(()=>{if(!this.bodies.includes(item))return;const at={...item.position},armour=ARMOURS[g.outfit],hp=item.plugin.durability??armour?.durability;this.removeEntity(item);for(const b of e.bodies)if(g.parts.includes(b.plugin.part)){b.plugin.wear={...b.plugin.wear,[g.kind]:g.outfit};if(armour)b.plugin.armour={...b.plugin.armour,[g.kind]:{id:g.outfit,hp}};}
        for(let i=0;i<6;i++)this.emit(at.x+rnd(-6,6),at.y+rnd(-5,5),rnd(-.6,.6),rnd(-.7,.1),rnd(.4,.8),.8,'#e6e2d6',rnd(4,7),'mist');this.onEffect('cloth',.5);this.onDress?.(defs[item.plugin.kind].name,e);});
    }
    // Undress: the garment on the clicked part comes off the whole ragdoll and drops beside it as a fresh item - the outermost first where a part wears two (hat before mask, top before trousers). Returns what to tell the player.
    undress(part,point=null) {
      if(point&&part?.plugin.part&&!GARMENT_ORDER.some(k=>part.plugin.wear?.[k])){const under=Query.point(this.bodies,point).reverse().find(b=>b.plugin.part&&GARMENT_ORDER.some(k=>b.plugin.wear?.[k]));if(under)part=under;} /* in profile a bare hand hangs in front of the trousers: the click goes through to the first clothed part under it */
      const p=part?.plugin,e=part&&this.getEntity(part);if(!p?.part||!e)return 'Click a clothed ragdoll part.';const kind=GARMENT_ORDER.find(k=>p.wear?.[k]);if(!kind)return 'Nothing to take off there';
      if(!e.bodies.some(b=>b.plugin.slot===2))return 'Only a whole ragdoll can be undressed';const row=ITEMS.find(item=>item.garment&&item.garment.kind===kind&&item.garment.outfit===p.wear[kind]);if(!row)return 'Nothing to take off there';
      if(this.bodies.length>=this.settings.maxObjects)return 'The chamber is full - delete something before taking clothes off';
      let durability=null;for(const b of e.bodies)if(b.plugin.armour?.[kind]){durability=Math.min(durability??Infinity,b.plugin.armour[kind].hp);const {[kind]:off,...keep}=b.plugin.armour;b.plugin.armour=Object.keys(keep).length?keep:undefined;} /* armour comes off as worn as its most worn part */
      for(const b of e.bodies)if(b.plugin.wear?.[kind]){const {[kind]:gone,...rest}=b.plugin.wear;b.plugin.wear=rest;} /* an empty set stays: it marks the part as one of a dressed body's */
      const chest=this.chestOf(e),side=chest.position.x>this.width/2?-1:1,item=this.spawn(row.id,clamp(chest.position.x+side*(46+row.w/2),30,this.width-30),Math.min(part.position.y,this.groundY-row.h));if(item){const b=item.bodies[0];b.plugin.freshAt=this.time;if(durability!==null)b.plugin.durability=durability;Body.setVelocity(b,{x:side*1.5,y:-1});} /* always a pristine item: holes, blood and scorching stay with the body. For a moment it cannot be put straight back on by brushing the body it came off */
      this.onEffect('cloth',.5);return `Took off: ${row.name.toLowerCase()}`;
    }
    // Immense pressure against something hard bursts a part. The pressure is the cursor's: how far past the surface it is pushing the part it holds (or pushing something hard down onto a part that lies on something hard),
    // measured along the contact normal. How far a part sinks into the floor would do as a reading, but under the same push a hand sinks 20 px and a thigh 6, so the push itself is used: the same for every part, and the player can feel it.
    // It has to be held - a landing, however hard, is over too soon - and then it does damage by how far past the limit it is: the part bruises, its bone goes (the crack), and when there is nothing left of it, it bursts.
    squeeze(pairs){const d=this.drag;if(!d||d.bodyB.isStatic)return;const held=d.bodyB,sx=d.pointA.x-(held.position.x+d.pointB.x),sy=d.pointA.y-(held.position.y+d.pointB.y);if(sx*sx+sy*sy<CRUSH_PULL*CRUSH_PULL)return;
      for(const pair of pairs){if(!(pair.collision.depth>.5))continue;for(const [part,other] of [[pair.bodyA,pair.bodyB],[pair.bodyB,pair.bodyA]]){if(!part.plugin.part||part.isStatic)continue;const hard=other.isStatic||!!other.plugin.boundary||matOf(other.plugin).soft<.5;if(hard)part.squeezeHard=true;
        if(held===part&&hard){let n=pair.collision.normal;{let best=0;for(const axis of other.axes||[]){const along=Math.abs(axis.x*n.x+axis.y*n.y);if(along>best){best=along;n=axis;}}} /* the face of the hard thing, not whatever normal the part's rounded corner happened to give: a pull along the floor is not a push into it */
          const at=pair.collision.supports[0]||other.position,sign=Math.sign((at.x-part.position.x)*n.x+(at.y-part.position.y)*n.y)||1;part.squeeze=Math.max(part.squeeze||0,(sx*n.x+sy*n.y)*sign);} /* the push, along the normal, into the surface */
        else if(held===other&&!other.plugin.part){const dx=part.position.x-other.position.x,dy=part.position.y-other.position.y,len=Math.hypot(dx,dy)||1;part.squeeze=Math.max(part.squeeze||0,(sx*dx+sy*dy)/len*(hard?1:.5));}}}}
    press(bodies,seconds){for(const b of bodies){if(!b.plugin.part)continue;const p=b.plugin,over=b.squeezeHard?(b.squeeze||0)-CRUSH_PULL*this.settings.jointStrength:-1;
      if(!(over>=0)){if(b.squeezeT)b.squeezeT=Math.max(0,b.squeezeT-seconds*2);continue;}b.squeezeT=(b.squeezeT||0)+seconds;if(b.squeezeT<CRUSH_HOLD||p.crushing)continue;
      this.damage(b,(CRUSH_RATE+over*CRUSH_MORE)*seconds*(p.material==='flesh'?1:.5),b.position,'impact');if(p.hp<=0&&!p.crushing&&this.bodies.includes(b)){p.crushing=true;this.onEffect('crack',1);this.onEffect('wet',1.2);this.damageQueue.push(()=>this.crush(b));}}}
    disturb(pairs){this.squeeze(pairs);for(const {bodyA:a,bodyB:b} of pairs)for(const [target,other] of [[a,b],[b,a]]){this.touching.add(target);if(other.plugin.part&&defs[target.plugin.kind]?.garment)this.touchGarment(target,other);
      if(other.plugin.active&&defs[other.plugin.kind]?.device==='chainsaw'&&!target.plugin.boundary&&this.time-(this.bites.get(target)||0)>.1){this.bites.set(target,this.time); /* ten bites a second into each thing the bar touches */ const at=Vector.mult(Vector.add(target.position,other.position),.5);this.damage(target,14,at,'cut',Vector.rotate({x:0,y:-1},other.angle));if(matOf(target.plugin).soft>=1)other.plugin.bloody=true;else this.burst(at.x,at.y,4,'#ffe7a0',5);}if(other.isStatic||other.speed<.15)continue;const e=this.getEntity(target);if(e?.restTime&&e!==this.getEntity(other))e.restTime=0;}}
    // The power hammer's ram: everything in front of the head is struck along the hammer's axis, and the hammer kicks back.
    ram(body) {
      const axis=Vector.rotate({x:0,y:-1},body.angle),head=Vector.add(body.position,Vector.mult(axis,body.plugin.h*.42));let struck=0;
      for(const b of this.bodies){if(b===body||b.isStatic||Vector.magnitude(Vector.sub(b.position,head))>46+Math.max(b.plugin.w||0,b.plugin.r||0)/2)continue;const toward=Vector.dot(Vector.sub(b.position,body.position),axis);if(toward<0)continue;
        Body.setVelocity(b,Vector.add(b.velocity,Vector.mult(axis,16)));this.damage(b,75,head,'impact',axis);struck++;}
      Body.setVelocity(body,Vector.add(body.velocity,Vector.mult(axis,-5)));this.flashes.push({x:head.x,y:head.y,radius:60,life:.25,maxLife:.25});this.onEffect('explosion',.5);return struck?`Ram fired: ${struck} hit`:'Ram fired';
    }
    // Units: inside Matter's collision events a body's velocity is per substep (1/120 s), half the per-frame figure the rest of the engine sees. Every speed threshold in here and in pierce() is in those units.
    collisions(pairs){this.disturb(pairs);for(const pair of pairs){const {bodyA:a,bodyB:b}=pair;if(defs[a.plugin.kind]?.garment||defs[b.plugin.kind]?.garment)continue; /* cloth does no damage and takes none from a knock */ if(this.pierce(pair,a,b)||this.pierce(pair,b,a))continue;
      // Inside this event Matter has already resolved the contact, so a body that has just hit the floor reads as nearly still. What counts is how fast the two were closing before it: the velocities saved at the top of the step,
      // and for a blunt hit only the part of that along the contact normal - sliding along a floor is not hitting it. A blade's edge cuts with all of its speed.
      const rvx=(a.vx0??a.velocity.x)-(b.vx0??b.velocity.x),rvy=(a.vy0??a.velocity.y)-(b.vy0??b.velocity.y),n=pair.collision.normal,closing=Math.abs(rvx*n.x+rvy*n.y),speed=Math.hypot(rvx,rvy),point=pair.collision.supports[0]?{x:pair.collision.supports[0].x,y:pair.collision.supports[0].y}:Vector.mult(Vector.add(a.position,b.position),.5);
      for(const [target,other,sign] of [[a,b,-1],[b,a,1]]){if(target.plugin.boundary)continue;const blade=this.cuts(other,'edge'),od=defs[other.plugin.kind],toward={x:sign*rvx,y:sign*rvy}; /* the way the other thing was coming at the target */
        if(target.plugin.material==='flesh'&&target.plugin.part&&!other.plugin.part&&!other.plugin.boundary&&this.settings.decals&&(target.plugin.bleed>.1&&closing>3||closing>11))this.stain(other,point,rnd(1.2,2.2)); /* what hits a bleeding body, or hits a body hard, comes away marked */
        if(blade){if(speed>7){this.damage(target,Math.min(od.sharp.power??60,(speed-7)*4.5),point,'cut',toward);if(od.sharp.hot)this.sear(target);}}
        else if(target.plugin.part)this.land(target,other,closing,point,toward,n);
        else if(closing>OBJECT_SAFE)this.damage(target,(closing-OBJECT_SAFE)*(matOf(target.plugin).brittle?3:1)*.75*(od?.blunt||1),point,'impact',toward);}
      if(closing>3)this.onEffect(a.plugin.casing||b.plugin.casing?'clink':'impact',Math.min(.5,closing/30));
      if(a.plugin.burning&&!b.plugin.boundary)b.plugin.heat+=30;if(b.plugin.burning&&!a.plugin.boundary)a.plugin.heat+=30;
    }}
    step(dt=1000/60) {
      if(dt>1000/120+.001){this.step(dt/2);this.step(dt/2);return;}
      const seconds=dt/1000;this.time+=seconds;random=this.random;this.engine.gravity.y=this.gravity;
      const bodies=this.bodies;this.bodiesNow=bodies;if(this.pumps?.length)this.pumps=this.pumps.filter(q=>{if(this.time<q.at)return true;if(this.bodies.includes(q.gun))this.eject(q.gun,'shell');return false;});if(this.shots.length)this.shots=this.shots.filter(shot=>!this.fly(shot,shot.speed*seconds));if(random()<seconds*this.settings.lightning/100*.45)this.lightning(rnd(80,this.width-80));
      for(const e of this.entities){if(!['human','android'].includes(e.kind))continue;
        {const k=!e.alive&&this.settings.rigorMortis&&e.diedAt!==undefined?RIGOR_STIFF*clamp((this.time-e.diedAt)/RIGOR_TIME,0,1):0;if(k||e.bodies[0]?.plugin.rigor)for(const b of e.bodies)b.plugin.rigor=k;} /* the dead stiffen over a minute */
        if(e.alive)this.vitals(e,seconds);else{if(e.twitchAt?.length)this.twitch(e,seconds);if(e.blood>0){let open=0;for(const b of e.bodies)open+=b.plugin.bleed||0;e.blood=Math.max(0,e.blood-open*BLEED_DRAIN*seconds*this.settings.bleedRate);}} /* a corpse, or a loose limb, drains until it is empty; then nothing more comes out */
        if(e.conduit&&e.alive){const k=e.power>15?.15+e.power/100*.35:0;if(k)for(const b of e.bodies)b.plugin.charge=Math.max(b.plugin.charge||0,k);} /* charged, he crackles all over */
        if(e.bodies.some(b=>b.plugin.tourniquet||b.plugin.tied))this.limbs(e);e.shoutT=Math.max(0,(e.shoutT||0)-seconds);e.stun=Math.max(0,(e.stun||0)-seconds);e.surge=Math.max(0,(e.surge||0)-seconds);if(e.stunIn>0){e.stunIn-=seconds;if(e.stunIn<=0){e.stun=Math.max(e.stun,e.stunNext||0);e.stunNext=0;}}const locked=e.alive&&e.shockT>0&&this.settings.autoBalance; // current locks the muscles whether or not anyone is awake to use them
        if(!this.active(e)&&!locked){if(e.rung==='stand')this.buckle(e);e.effort=0;e.rung='limp';e.rise=null;continue;}if(locked)e.effort=1;
        e.effort=Math.min(e.consciousness==='dazed'?.85:1,(e.effort??1)+seconds/this.settings.getUpTime*(1-Math.min(.7,(e.pain||0)/140))); // strength returns gradually, slower in pain, and never fully while dazed
        {const next=this.capability(e);if(e.rung==='stand'&&(next==='crawl'||next==='drag'))e.toppleT=TOPPLE_TIME;this.balance(e,e.rung=next);}
      }
      for(const b of bodies){const p=b.plugin;
        if(!Number.isFinite(b.position.x)||!Number.isFinite(b.position.y)||Math.abs(b.position.x)>10000||Math.abs(b.position.y)>10000){this.removeBody(b);continue;}
        if(p.fuse!==undefined){p.fuse-=seconds;if(p.fuse<=0&&!p.detonating){p.detonating=true;this.damageQueue.push(()=>this.detonate(b));}}
        // A sanity limit, not a behaviour: if solver and muscles ever gang up on a limb, it is slowed rather than fired across the room. Far above anything a throw, a blast or a fall produces.
        if(p.part&&!b.isStatic){if(b.speed>LIMB_SPEED)Body.setVelocity(b,Vector.mult(b.velocity,LIMB_SPEED/b.speed));if(b.angularSpeed>LIMB_SPIN)Body.setAngularVelocity(b,Math.sign(b.angularVelocity)*LIMB_SPIN);}
        if(p.gib||p.casing){p.life-=seconds;if(p.life<=0){this.damageQueue.push(()=>this.removeBody(b));continue;}if(p.trail>0){p.trail-=seconds;if(b.speed>1&&random()<seconds*40)this.emit(b.position.x,b.position.y,b.velocity.x*.3+rnd(-.4,.4),b.velocity.y*.3+rnd(-.4,.4),2,2,BLOOD,rnd(.7,1.7),'blood');}}
        if(p.cool>0)p.cool-=seconds;p.charge=Math.max(0,p.charge-seconds*1.5);if(p.surge){p.surge-=seconds*.7;if(p.surge<=0)delete p.surge;}if(p.grow!==undefined){p.grow+=seconds/(p.kind==='human'?REGROW_LAYERS:REGROW_SWELL);if(p.grow>=1){delete p.grow;delete p.growFrom;}}
        // A bleeding part dragged along the floor wipes a smear behind it: one streak that lengthens as the part moves, and a new one when it is lifted and set down somewhere else or the streak is long enough. It also leaves the odd small pool along the way.
        if(p.part&&p.bleed>.3&&this.settings.decals&&b.bounds.max.y>=this.groundY-1.5){const x=b.position.x;let sm=this.smears.get(b);
          if(sm&&(x<sm.from-SMEAR_GAP||x>sm.to+SMEAR_GAP||sm.to-sm.from>SMEAR_MAX||!this.stains.includes(sm)))sm=null;
          if(!sm&&Math.abs(x-(p.smearX??x))>2){sm=this.addStain({x,y:this.groundY-1,r:1,from:x,to:x,thick:clamp(p.bleed*1.1,2,4),smear:true,wet:1,age:0});this.smears.set(b,sm);}
          if(sm&&(x<sm.from||x>sm.to)){sm.from=Math.min(sm.from,x);sm.to=Math.max(sm.to,x);sm.x=(sm.from+sm.to)/2;sm.r=(sm.to-sm.from)/2+1;sm.wet=1;sm.age=0;}
          if(Math.abs(x-(p.smearX??x))>SMEAR_STEP*4){this.pool(x,2.2);p.smearX=x;}else if(p.smearX===undefined)p.smearX=x;}else if(this.smears.has(b))this.smears.delete(b);
        if(p.tied&&p.bleed>0)p.bleed=0; /* below a tourniquet nothing bleeds, and nothing clots either: the wounds are only held */
        if(p.material==='flesh'&&!p.tied&&(p.bleed>.02||p.wounds?.length||p.severed?.length)){
          // Wounds clot: quickly on a still limb, slowly on one that keeps moving. No allocation in here: it runs for every bleeding part, every substep.
          const lodged=p.lodged?.length?p.lodged:null,iced=p.heat<=FROZEN,/* frozen solid: nothing flows and nothing clots, until it thaws */e=this.getEntity(b),clot=iced?0:seconds*CLOT*(b.speed<.6?1:.3)*(e&&!e.alive?DEAD_CLOT:1),/* with no heart behind it the flow soon stops */blood=e?.blood??100,pulse=e?.pulse||0,amount=Math.min(2,this.settings.bleedRate),share=p.bleedRaw>7?7/p.bleedRaw:1; /* a part bleeds at most 7 however many holes are in it, so each wound is charged its share of what actually left */ let sum=0,drop=null;
          for(let pass=0;pass<2;pass++){const list=pass?p.severed:p.wounds;if(!list)continue;for(let i=0;i<list.length;i++){const w=list[i];if(w.stitched){w.bleed=0;continue;}if(!(w.bleed>0)){ /* dry. A clot that is not yet a scab tears open again if the limb is thrown about; a bruise that has faded is forgotten */
              if(!pass&&w.type==='impact'&&!w.depth&&this.time-w.t>BRUISE_LIFE){list.splice(i--,1);continue;}
              if(!pass&&w.depth>=2&&!w.sealed&&e?.alive&&b.speed>REOPEN_SPEED&&this.time-(w.wet??w.t)>CLOT_AT&&this.time-(w.wet??w.t)<SCAB_AT&&(w.pool||w).left!==0&&!((w.pool||w).left<0)&&random()<seconds*REOPEN_RATE){w.bleed=REOPEN_BLEED;w.wet=this.time;}else continue;}w.bleed=Math.max(0,w.bleed-clot*(pass?.35:1)*(lodged&&!pass&&lodged.some(r=>Math.hypot((r.ex??r.x)-w.x,(r.ey??r.y)-w.y)<LODGED_NEAR)?LODGED_CLOT:1)); /* a round left in a wound keeps it from closing */if(w.fresh)w.fresh=Math.max(0,w.fresh-seconds);{const bank=w.pool||w;if(bank.left!==undefined){bank.left-=w.bleed*share*BLEED_DRAIN*seconds*this.settings.bleedRate;if(bank.left<=0){w.bleed=0;continue;}}} /* a wound outside the fatal spots can only cost so much blood before it closes */ sum+=w.bleed;
            if(blood<=0||iced)continue;w.run=Math.min(RUN_MAX,(w.run||0)+w.bleed*seconds*RUN_RATE);w.runDir=p.flip?Math.PI/2+b.angle:Math.PI/2-b.angle; /* blood runs down the skin from the wound: further the more it bleeds, and down is wherever down is while it is wet */
            const gush=(w.artery||w.fresh>0)&&pulse>.55,chance=w.bleed*seconds*(gush?26:w.artery?1.2:5*(FLOW[w.type]??1))*amount; /* a cut drips, a stab flows, an artery pulses */if(random()>=chance)continue;
            const wx=p.flip?-w.x:w.x,cos=Math.cos(b.angle),sin=Math.sin(b.angle),px=b.position.x+wx*cos-w.y*sin,py=b.position.y+wx*sin+w.y*cos;
            // A spurt leaves along the line from the limb's centre through the wound, weaker as the blood runs out; anything else just drips.
            if(gush){const len=Math.hypot(wx,w.y)||1,ox=(wx*cos-w.y*sin)/len,oy=(wx*sin+w.y*cos)/len,force=(2+2.4*pulse)*(.35+.65*blood/100);drop=this.emit(px,py,b.velocity.x*.4+ox*force+rnd(-.5,.5),b.velocity.y*.4+oy*force-1+rnd(-.5,.5),2.5,2.5,BLOOD,rnd(1.2,2.8),'blood');}
            else drop=this.emit(px,py,b.velocity.x*.4+rnd(-1.2,1.2),b.velocity.y*.4+rnd(-.7,.8),3,3,BLOOD,rnd(.8,2.6),'blood');if(drop)drop.owner=p.entityId;}}
          p.bleedRaw=sum;p.bleed=iced?0:Math.min(7,sum);
        }
        // Androids do not bleed. A holed casing leaks coolant and throws the odd spark until it runs dry.
        if(p.leak>.02){p.leak=Math.max(0,p.leak-seconds*.03);if(random()<p.leak*seconds*4)this.emit(b.position.x+rnd(-3,3),b.position.y+rnd(-3,3),b.velocity.x*.4+rnd(-.8,.8),b.velocity.y*.4+rnd(-.3,.8),3,3,OIL,rnd(1,2.4),'oil');if(random()<p.leak*seconds*1.5)this.burst(b.position.x,b.position.y,3,'#ffe7a0',4);}
        // Blood on a surface runs: while it is wet, a stain lets go of the odd drop.
        if(p.stains?.length&&random()<seconds*.5){const st=p.stains[(random()*p.stains.length)|0];if(st.wet>.45){const cos=Math.cos(b.angle),sin=Math.sin(b.angle);this.emit(b.position.x+st.x*cos-st.y*sin,b.position.y+st.x*sin+st.y*cos,b.velocity.x*.3,b.velocity.y*.3+.4,2.5,2.5,st.oil?OIL:BLOOD,rnd(.7,1.6),st.oil?'oil':'blood');}}
        if(p.heat>matOf(p).burnAt)p.burning=true;
        if(p.burning){p.heat=Math.min(700,p.heat+seconds*35);p.hp=Math.max(0,p.hp-seconds*7);p.char=Math.min(1,(p.char||0)+seconds*CHAR_RATE);if(p.part&&p.char>=1){p.burning=false;p.heat=Math.min(p.heat,160);p.bleed=0;p.wounds=[];p.stains=[];const owner=this.getEntity(b);if(owner?.alive&&(p.slot===0||p.slot===2))this.kill(owner,'burned to death');} // burnt down to the bone: nothing left to burn, to bleed, or to live
          if(p.bleed){for(const w of [...(p.wounds||[]),...(p.severed||[])])w.bleed=Math.max(0,(w.bleed||0)-seconds*.5);}
          // Embers and smoke come off the top of the body, more of both the hotter it burns.
          const hot=clamp((p.heat-150)/400,.3,1.2),wide=b.bounds.max.x-b.bounds.min.x,top=b.bounds.min.y+(b.position.y-b.bounds.min.y)*.4;
          if(random()<seconds*9*hot)this.emit(b.position.x+rnd(-.5,.5)*wide,top,rnd(-.6,.6),rnd(-2.6,-1.2),rnd(.5,1.4),1.4,'#ffcf7a',rnd(.7,1.8),'ember');
          if(random()<seconds*5*hot*clamp(wide/50,.2,1))this.emit(b.position.x+rnd(-.4,.4)*wide,top-rnd(55,95),rnd(-.3,.3),rnd(-1.5,-.8),rnd(1.4,2.6),2.6,'#1c1d1f',rnd(6,12),'smoke'); // smoke leaves from above the flame tips, and small parts make little
          if(random()<.1){for(const other of bodies)if(other!==b&&Vector.magnitude(Vector.sub(other.position,b.position))<45)other.plugin.heat+=4;}
          if(p.hp<=0)this.damage(b,.1);
        }else{if(p.part&&p.char>0)p.char=Math.max(0,p.char-seconds/SKIN_REGROW); /* a burnt body slowly grows its flesh and skin back, the reverse of the way it lost them */ p.heat+=clamp(this.settings.ambient-p.heat,-seconds*8,seconds*8);
        }
        // ponytail: rain reaches everything, roofs do not shelter. Ray test upward if that matters.
        if(this.settings.rain&&p.heat>this.settings.ambient){p.heat-=seconds*(p.burning?140:25);if(p.burning&&p.heat<150)p.burning=false;}
        {const hot=defs[p.kind]?.explosive?.onHeat;if(hot&&p.heat>hot&&p.fuse===undefined)p.fuse=.5;}
        if(p.active&&!b.isStatic){const device=defs[p.kind]?.device;if(device==='thruster'){const force=Vector.rotate({x:0,y:-.0025*b.mass},b.angle);Body.applyForce(b,b.position,force);const jet=Vector.add(b.position,Vector.rotate({x:0,y:30},b.angle));this.burst(jet.x,jet.y,2,'#f3c885',2,'fire');}
          if(device==='wheel')Body.setAngularVelocity(b,.18);
          if(device==='chainsaw')Body.setVelocity(b,{x:b.velocity.x+rnd(-.25,.25),y:b.velocity.y+rnd(-.25,.25)});
        }
        if(p.active&&defs[p.kind]?.device==='battery'&&Math.floor(this.time/BATTERY_EVERY)!==p.lastPulse){p.lastPulse=Math.floor(this.time/BATTERY_EVERY);p.pulseAt=this.time;this.shock(b,1,Vector.add(b.position,Vector.rotate({x:0,y:-(p.h||0)/2},b.angle)));} /* from the terminals */
      }
      if(this.drag)this.grab(seconds);
      if(this.power)this.powers(seconds,bodies);
      if(this.drag&&this.dragAngle!=null&&!this.drag.bodyB.isStatic)Body.setAngularVelocity(this.drag.bodyB,clamp(wrap(this.dragAngle-this.drag.bodyB.angle)*.35,-.3,.3));
      // Limits are equal-and-opposite angular impulses: momentum-neutral, so a body pinned against the floor cannot walk itself sideways.
      for(const c of this.joints){if(!c.plugin.joint||c.plugin.min===undefined)continue;const a=c.bodyA,b=c.bodyB,slack=this.fractured(a)||this.fractured(b)||c.plugin.broken?FRACTURE_SLACK:0,relative=wrap(b.angle-a.angle),error=relative-clamp(relative,c.plugin.min-slack,c.plugin.max+slack);
        // Breaking takes force from outside: the cursor wrenching the body about, or a blow in the last moments. A body folding under its own weight, or pushing itself up off its face, does not snap its own neck.
        const limp=this.getEntity(a)?.alive===false;if(Math.abs(error)>BREAK_BEND*(VITAL_JOINT[c.plugin.name]?1.5:1)&&!slack&&(limp||this.forced(a))){c.plugin.strain=(c.plugin.strain||0)+seconds;if(c.plugin.strain>(limp&&!this.forced(a)?BREAK_TIME*8:BREAK_TIME)*(VITAL_JOINT[c.plugin.name]||1))this.snap(c);} /* a dead body that lands with a limb folded the wrong way under it breaks it too, given a moment */ else if(c.plugin.strain)c.plugin.strain=0;
        const ia=a.isStatic?0:a.inverseInertia,ib=b.isStatic?0:b.inverseInertia,total=ia+ib;if(!total)continue;
        // A neck is not a hinge with nothing in it: ligaments and muscle tone damp it whether or not anyone is awake, or alive. Without this the head - a light body on a lighter one - nods and rattles after every knock.
        {const cold=Math.max(this.chill(a),this.chill(b),a.plugin.rigor||0,b.plugin.rigor||0);if(cold>0){const ease=(b.angularVelocity-a.angularVelocity)*cold*FROST_STIFF;Body.setAngularVelocity(a,a.angularVelocity+ease*ia/total);Body.setAngularVelocity(b,b.angularVelocity-ease*ib/total);}} /* a joint stiffens as it freezes; frozen solid it holds its pose */
        if(NECK_DAMP[c.plugin.name]){const ease=(b.angularVelocity-a.angularVelocity)*NECK_DAMP[c.plugin.name];Body.setAngularVelocity(a,a.angularVelocity+ease*ia/total);Body.setAngularVelocity(b,b.angularVelocity-ease*ib/total);}
        if(Math.abs(error)<.005)continue;
        // The soft limit below is a push, and a hard yank outruns it: a head could be swung right round its neck, after which the shortest way back is the wrong way. Past a margin the joint simply stops: the parts are turned back about the joint, each by its share.
        {const hard=HARD_STOP[c.plugin.name]??HARD_STOP.other;if(Math.abs(error)>hard){const excess=error-Math.sign(error)*hard;if(ia)Body.rotate(a,excess*ia/total,Constraint.pointAWorld(c));if(ib)Body.rotate(b,-excess*ib/total,Constraint.pointBWorld(c));
          const closing=(b.angularVelocity-a.angularVelocity)*Math.sign(error);if(closing>0){if(ia)Body.setAngularVelocity(a,a.angularVelocity+Math.sign(error)*closing*ia/total);if(ib)Body.setAngularVelocity(b,b.angularVelocity-Math.sign(error)*closing*ib/total);}}} /* and whatever was still carrying it outward is stopped */
        const velocity=b.angularVelocity-a.angularVelocity,target=clamp(-error*LIMIT_GAIN,-LIMIT_SPEED,LIMIT_SPEED),impulse=(target-velocity)*LIMIT_SHARE; // only part of the correction per step: the muscles across the same joint damp it too, and together a full correction overshoots and rings
        if(Math.sign(impulse)===Math.sign(error))continue; // already returning faster than required
        if(ia)Body.setAngularVelocity(a,a.angularVelocity-impulse*ia/total);if(ib)Body.setAngularVelocity(b,b.angularVelocity+impulse*ib/total);
      }
      this.touching.clear();this.air(bodies,seconds);for(const b of bodies){b.vx0=b.velocity.x;b.vy0=b.velocity.y;b.squeeze=0;b.squeezeHard=false;} /* how fast everything was going before this step's contacts were resolved */ Engine.update(this.engine,dt);this.press(bodies,seconds);
      // Constraint solving leaves a limp pile jittering forever, and that residue crawls sideways; Matter's own sleeping never triggers on it.
      // So ragdolls sleep as a unit: fall at full speed, then once nearly still hold the whole pose. Holding every part adds no joint tension.
      for(const e of this.entities){if(e.blood===undefined)continue;
        const held=this.gravity<=0||(this.active(e)&&e.rung!=='curl'&&!e.idle)||e.bodies.includes(this.drag?.bodyB);
        const peak=Math.max(...e.bodies.map(b=>Math.max(b.speed,b.angularSpeed*Math.max(b.plugin.w,b.plugin.h)/2)))/REST_SPEED; // spin counts as tip speed, so a small hand flicking is small
        // A single twitch only drains the timer; real motion (or anything 3x over) clears it at once.
        e.restTime=held||peak>3?0:peak<1?(e.restTime||0)+seconds:Math.max(0,(e.restTime||0)-seconds*10);
        if(e.restTime<REST_DELAY){e.pin=null;continue;}
        const contacts=e.bodies.filter(b=>this.touching.has(b)).length;
        if(e.pin&&e.pin.count!==e.bodies.length){e.pin=null;e.restTime=0;continue;} // a part came or went (graft, reattach, regrow, dismemberment): the saved pose is stale
        e.pin??={contacts,count:e.bodies.length,gravity:this.gravity,pose:e.bodies.map(b=>({b,x:b.position.x,y:b.position.y,angle:b.angle}))};
        // Wakes: support taken away, or gravity changed. Hits, shoves and drags clear restTime where they happen.
        if(contacts<e.pin.contacts*.6||this.gravity!==e.pin.gravity){e.restTime=0;e.pin=null;continue;}
        for(const {b,x,y,angle} of e.pin.pose){if(b.isStatic||b.plugin.entityId!==e.id)continue;Body.setPosition(b,{x,y});Body.setAngle(b,angle);Body.setVelocity(b,{x:0,y:0});Body.setAngularVelocity(b,0);}
      }
      for(const c of [...this.joints])if(c.plugin.joint&&Constraint.currentLength(c)>c.plugin.breakForce*this.settings.jointStrength)this.sever(c);
      this.blades();this.hands();
      this.regrowing=this.regrowing.filter(job=>{job.wait-=seconds;if(job.wait>0)return true;job.wait=REGROW_BEAT;return this.growNext(job);});
      const pending=this.damageQueue.splice(0);for(const fn of pending)fn();
      // Particles move every substep, but what they land on is tested 30 times a second: bounds first, exact shape only on a hit.
      const land=(this.tick=(this.tick+1)%4)===0,decals=this.settings.decals,list=this.particles;let keep=0;
      for(let i=0;i<list.length;i++){const p=list[i];p.life-=seconds;p.x+=p.vx*seconds*60;p.y+=p.vy*seconds*60;const wet=p.type==='blood'||p.type==='oil';
        if(wet||p.type==='spark')p.vy+=seconds*12;
        else if(p.type==='mist'){p.vy+=seconds*.5;p.vx*=1-seconds*1.5;}else if(p.type==='ice'){p.vy+=seconds*5;}else if(p.type==='plus'){p.vy-=seconds*.4;p.vx*=1-seconds*2;}
        else if(p.type==='ember'){p.vx+=Math.sin(this.time*9+p.y*.05)*seconds*5;p.vy-=seconds*.6;}else if(p.type==='smoke'){p.vx+=seconds*.35;p.vy*=1-seconds*.5;}
        if(wet&&p.life>0){if(p.y>=this.groundY){if(decals)this.pool(p.x,rnd(2,5),p.type==='oil');p.life=0;}
          else if(p.x<=2||p.x>=this.width-2){if(decals)this.addStain({x:p.x<=2?1:this.width-1,y:p.y,r:rnd(2,5),wet:1,age:0,wall:true,oil:p.type==='oil'||undefined});p.life=0;}
          else if(land&&p.life<p.maxLife-.08){for(let j=0;j<bodies.length;j++){const b=bodies[j],q=b.bounds;if(p.x<q.min.x||p.x>q.max.x||p.y<q.min.y||p.y>q.max.y||(p.owner===b.plugin.entityId&&p.life>p.maxLife-.45)||!M.Vertices.contains(b.vertices,p))continue;if(decals&&random()<.55)this.stain(b,p,rnd(.8,2),p.type==='oil');p.life=0;break;}}}
        if(p.life>0)list[keep++]=p;else if(this.spare.length<900)this.spare.push(p);}
      list.length=keep;
      if(land)this.stainsTick(seconds*4,bodies);
      for(const list of [this.flashes,this.traces]){for(const f of list)f.life-=seconds;while(list.length&&list[0].life<=0)list.shift();}
    }
    loadPreset(name) {
      this.clear();this.scene=name;
      if(name==='workshop'){
        this.spawn('human',900,555);this.spawn('android',1050,555);
        this.spawn('crate',1350,622);this.spawn('crate',1405,622);this.spawn('crate',1377,568);this.spawn('barrel',1530,619);
        this.spawn('ball',1150,627);this.spawn('metal',1180,433).bodies.forEach(b=>Body.setStatic(b,true));this.spawn('battery',1180,399);
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
      return {version:1,scene:this.scene,gravity:this.gravity,entities:this.entities.map(e=>({id:e.id,kind:e.kind,immortal:e.immortal||undefined,conduit:e.conduit||undefined,power:e.power,upright:e.upright,blood:e.blood,alive:e.alive,stun:e.stun,pain:e.pain,oxygen:e.oxygen,heartRate:e.heartRate,breath:e.breath,hurtSlot:e.hurtSlot,hurtX:e.hurtX,hurtY:e.hurtY,hurtScore:e.hurtScore,deadFor:e.deadFor,twitchAt:e.twitchAt&&[...e.twitchAt],organs:e.organs&&{...e.organs},consciousness:e.consciousness,causeOfDeath:e.causeOfDeath,paralysed:e.paralysed,poseNow:e.poseNow&&{angle:[...e.poseNow.angle],power:[...e.poseNow.power]}})),bodies:bodies.map(b=>({x:b.position.x,y:b.position.y,angle:b.angle,velocity:{...b.velocity},angularVelocity:b.angularVelocity,isStatic:b.isStatic,density:b._original?.density||b.density,friction:b.friction,restitution:b.restitution,group:b.collisionFilter.group,plugin:{...b.plugin}})),joints:this.joints.map(c=>({a:c.bodyA?index.get(c.bodyA):null,b:c.bodyB?index.get(c.bodyB):null,pointA:{...c.pointA},pointB:{...c.pointB},length:c.length,stiffness:c.stiffness,damping:c.damping,plugin:{...c.plugin}})),stains:this.stains.map(s=>({...s}))};
    }
    restore(data) {
      if(!data||data.version!==1||!Array.isArray(data.bodies)||!Array.isArray(data.joints)||!Array.isArray(data.entities)||data.bodies.length>600)throw new Error('Invalid scene file');
      for(const b of data.bodies){const p=b.plugin;if(!p||![b.x,b.y,b.angle].every(Number.isFinite)||(!p.r&&(!Number.isFinite(p.w)||!Number.isFinite(p.h))))throw new Error('Invalid body');}
      for(const c of data.joints)if((c.a!==null&&!data.bodies[c.a])||(c.b!==null&&!data.bodies[c.b]))throw new Error('Invalid joint');
      this.clear();this.scene=data.scene||'empty';this.gravity=Number.isFinite(data.gravity)?data.gravity:1;this.settings.gravity=clamp(this.gravity*EARTH,-40,40);
      const bodies=data.bodies.map(d=>{const p=d.plugin,opts={density:d.density||.002,friction:d.friction,restitution:d.restitution,collisionFilter:{group:d.group||0}};
        const b=p.r?Bodies.circle(d.x,d.y,p.r,opts):Bodies.rectangle(d.x,d.y,p.w,p.h,{...opts,chamfer:{radius:Math.min(3,p.w/3,p.h/3)}});
        b.plugin={...p};if(b.plugin.outfit){if(!b.plugin.wear)b.plugin.wear=Items.dress(b.plugin.outfit,b.plugin.part);delete b.plugin.outfit;} /* a save from before there were garments: the whole outfit */ Body.setAngle(b,d.angle);Body.setVelocity(b,d.velocity||{x:0,y:0});Body.setAngularVelocity(b,d.angularVelocity||0);if(d.isStatic)Body.setStatic(b,true);return b;
      });Composite.add(this.world,bodies);
      // Constraint.create discards a plugin passed in its options, so it is assigned afterwards.
      const joints=data.joints.map(d=>{const a=d.a===null?null:bodies[d.a],b=d.b===null?null:bodies[d.b];const c=Constraint.create({bodyA:a,bodyB:b,angleA:a?.angle||0,angleB:b?.angle||0,pointA:{...d.pointA},pointB:{...d.pointB},length:d.length,stiffness:d.stiffness,damping:d.damping});c.plugin={...d.plugin};return c;});Composite.add(this.world,joints);
      this.entities=data.entities.map(e=>({...e,bodies:bodies.filter(b=>b.plugin.entityId===e.id),joints:joints.filter(c=>c.plugin.joint&&c.bodyA?.plugin.entityId===e.id)}));
      for(const b of bodies)b.frictionAir=this.drag_(b); // bodies are rebuilt without their drag, so give it back
      this.nextId=Math.max(0,...this.entities.map(e=>e.id))+1;this.stains=Array.isArray(data.stains)?data.stains.filter(st=>st&&Number.isFinite(st.x)&&Number.isFinite(st.r)).slice(-600):[];
      // Keep new ragdolls' collision groups distinct from restored groups.
      Body._nextNonCollidingGroup=Math.min(Body._nextNonCollidingGroup,...bodies.map(b=>b.collisionFilter.group-1));
    }
  }
  return {Simulation,CATALOG,CATEGORIES,MATERIALS,SETTINGS,defaults,sanitize,defs,clamp,ANATOMY,ORGANS,CLOT_AT,SCAB_AT};
});

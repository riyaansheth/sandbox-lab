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
  const LIMIT_GAIN=.4,LIMIT_SPEED=.3,REST_SPEED=.8,REST_DELAY=1,PIERCE_SPEED=5,PIERCE_GRIP=14,STAND_HEIGHT=148,LEG_STRENGTH=2,GETUP_TORQUE=3,GETUP_TIME=1.2; // calibration knobs: limit stiffness, and rest thresholds just above the solver's idle jitter
  class Simulation {
    constructor() {
      this.engine=Engine.create({positionIterations:10,velocityIterations:10,constraintIterations:10,enableSleeping:false});
      this.world=this.engine.world;this.entities=[];this.particles=[];this.flashes=[];this.traces=[];this.stains=[];
      this.nextId=1;this.time=0;this.gravity=1;this.onEffect=()=>{};this.drag=null;this.damageQueue=[];this.touching=new Set();this.piercing=new Map();
      this.groundY=650;this.width=2600;this.height=1000;this.scene='workshop';
      this.boundaries=[Bodies.rectangle(1300,720,3000,140,{isStatic:true,label:'Ground'}),Bodies.rectangle(-50,100,100,1300,{isStatic:true}),Bodies.rectangle(2650,100,100,1300,{isStatic:true}),Bodies.rectangle(1300,-420,3000,100,{isStatic:true})];
      this.boundaries.forEach(b=>{b.plugin={boundary:true};b.friction=.85;b.frictionStatic=1;});Composite.add(this.world,this.boundaries);
      Events.on(this.engine,'collisionStart',e=>this.collisions(e.pairs));Events.on(this.engine,'collisionActive',e=>this.disturb(e.pairs));
    }
    get bodies(){return Composite.allBodies(this.world).filter(b=>!b.plugin.boundary);}
    get joints(){return Composite.allConstraints(this.world).filter(c=>c!==this.drag);}
    meta(body,kind,extra={}) {
      const d=defs[kind]||{};body.plugin={kind,material:d.material||'flesh',hp:d.hp||100,maxHp:d.hp||100,heat:20,burning:false,charge:0,active:false,w:d.w,h:d.h,r:d.r,...extra};
      return body;
    }
    entity(kind,bodies,joints=[]) {
      const entity={id:this.nextId++,kind,bodies,joints};
      for(const b of bodies)b.plugin.entityId=entity.id;
      this.entities.push(entity);Composite.add(this.world,[...bodies,...joints]);return entity;
    }
    spawn(kind,x,y,flip=false) {
      if(this.bodies.length>500)return null;
      if(kind==='human'||kind==='android')return this.ragdoll(kind,x,y,flip);
      const d=defs[kind];if(!d)return null;
      const opts={density:d.density,friction:.65,frictionStatic:.9,restitution:d.restitution||.1,frictionAir:.006,isStatic:!!d.static,label:kind};
      const b=d.r?Bodies.circle(x,y,d.r,opts):Bodies.rectangle(x,y,d.w,d.h,{...opts,chamfer:{radius:kind==='sword'?1:3}});
      this.meta(b,kind,flip?{flip:true}:{});return this.entity(kind,[b]);
    }
    ragdoll(kind,x,y,flip=false) {
      const robot=kind==='android',group=Body.nextGroup(true),parts=[];
      const opts={collisionFilter:{group},density:robot?.0036:.0018,friction:.8,frictionStatic:1,restitution:0,frictionAir:.015};
      for(const [name,dx,dy,w,h] of ANATOMY){
        const b=Bodies.rectangle(x+dx,y+dy,w,h,{...opts,density:opts.density*(name==='head'?1.15:name==='chest'?1.3:1),chamfer:{radius:Math.min(w/2-1,name==='head'?8:4)}});
        this.meta(b,kind,{part:name,w,h,r:0,material:robot?'metal':'flesh',hp:robot?230:100,maxHp:robot?230:100,wounds:[],severed:[],bleed:0,bone:100,...(flip?{flip:true}:{})});parts.push(b);
      }
      const [head,neck,chest,abdomen,hip,ua,la,handA,ub,lb,handB,tl,ll,footA,tr,lr,footB]=parts;
      const joints=[];
      const join=(a,b,pa,pb,min,max,name)=>{
        const c=Constraint.create({bodyA:a,bodyB:b,pointA:pa,pointB:pb,length:0,stiffness:.97,damping:.2});
        c.plugin={joint:true,breakForce:robot?45:29,min:flip?-max:min,max:flip?-min:max,name};joints.push(c);
      };
      join(neck,head,{x:0,y:-7},{x:0,y:14},-.6,.6,'atlas');
      join(chest,neck,{x:0,y:-18},{x:0,y:6},-.35,.35,'neck');
      join(chest,abdomen,{x:0,y:17},{x:0,y:-11},-.4,.4,'spine');
      join(abdomen,hip,{x:0,y:10},{x:0,y:-11},-.4,.4,'waist');
      join(chest,ua,{x:-21,y:-12},{x:3,y:-16},-2.6,1.4,'shoulder');
      join(ua,la,{x:-1,y:17},{x:0,y:-16},-2.5,.08,'elbow');
      join(la,handA,{x:0,y:15},{x:0,y:-7},-.65,.65,'wrist');
      join(chest,ub,{x:21,y:-12},{x:-3,y:-16},-1.4,2.6,'shoulder');
      join(ub,lb,{x:1,y:17},{x:0,y:-16},-.08,2.5,'elbow');
      join(lb,handB,{x:0,y:15},{x:0,y:-7},-.65,.65,'wrist');
      join(hip,tl,{x:-10,y:11},{x:0,y:-22},-1.3,1.3,'hip');
      join(tl,ll,{x:0,y:22},{x:0,y:-20},-.06,2.4,'knee');
      join(ll,footA,{x:0,y:20},{x:0,y:-4},-.5,.7,'ankle');
      join(hip,tr,{x:10,y:11},{x:0,y:-22},-1.3,1.3,'hip');
      join(tr,lr,{x:0,y:22},{x:0,y:-20},-.06,2.4,'knee');
      join(lr,footB,{x:0,y:20},{x:0,y:-4},-.5,.7,'ankle');
      const e=this.entity(kind,parts,joints);e.upright=true;e.blood=100;e.alive=true;return e;
    }
    getEntity(body){return body&&this.entities.find(e=>e.id===body.plugin.entityId);}
    // upright = wants to stand. Whether it can is derived from what is left of the body, so losing an arm never drops it but losing the spine does.
    canStand(e){
      if(!e.alive||!e.upright)return false;const part=n=>e.bodies.filter(b=>b.plugin.part===n),chest=part('chest')[0],head=part('head')[0];
      if(!chest||!head||chest.plugin.hp<35||head.plugin.hp<35||(e.kind==='human'&&e.blood<40))return false;
      const live=this.joints.filter(c=>c.plugin.joint&&c.bodyA.plugin.entityId===e.id),has=n=>live.filter(c=>c.plugin.name===n).length;
      if(!has('atlas')||!has('neck')||!has('spine')||!has('waist'))return false;
      return part('foot').some(foot=>{const ankle=live.find(c=>c.bodyB===foot),knee=ankle&&live.find(c=>c.bodyB===ankle.bodyA),hip=knee&&live.find(c=>c.bodyB===knee.bodyA);return !!hip&&foot.plugin.hp>0;});
    }
    balancing(e){return !(e.stun>0)&&this.canStand(e);}
    revive(body){const e=this.getEntity(body);if(!e||e.blood===undefined)return false;this.heal(body);e.alive=true;e.upright=true;e.stun=0;e.effort=0;e.restTime=0;return true;}
    // Standing is posture torques plus a leg push: the lift on the torso is reacted on the planted feet, so it is an internal force.
    // Feet that are not on something produce no lift, so a ragdoll can never fly or hover its way upright.
    balance(e){
      const part=n=>e.bodies.filter(b=>b.plugin.part===n),chest=part('chest')[0],pelvis=part('pelvis')[0],feet=part('foot').filter(f=>this.touching.has(f));
      const free=b=>!b.isStatic&&this.drag?.bodyB!==b,down=Math.abs(wrap(chest.angle))>.6||feet.length===0;
      for(const b of e.bodies){if(!free(b))continue;const kind=b.plugin.part,foot=kind==='foot',arm=['upper arm','forearm','hand'].includes(kind);
        const strength=(foot?.0024:arm?.00015:.0009)*(down&&!arm?GETUP_TORQUE:1)*e.effort;
        b.torque+=clamp(wrap(-b.angle),-.5,.5)*b.inertia*strength-b.angularVelocity*b.inertia*(foot?.003:.002);}
      if(!feet.length||!pelvis||!free(chest))return;
      const mass=e.bodies.reduce((n,b)=>n+b.mass,0),weight=mass*.001*Math.max(this.gravity,.2),footX=feet.reduce((n,f)=>n+f.position.x,0)/feet.length,footY=Math.max(...feet.map(f=>f.position.y));
      const lift=clamp((STAND_HEIGHT-(footY-chest.position.y))*.035+chest.velocity.y*.25,0,LEG_STRENGTH)*weight*e.effort;
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
    clear(){this.endDrag();for(const b of [...this.bodies])this.removeBody(b);for(const c of this.joints)Composite.remove(this.world,c);this.entities=[];this.particles=[];this.flashes=[];this.traces=[];this.stains=[];this.damageQueue=[];Engine.clear(this.engine);}
    freeze(body){if(!body)return;Body.setStatic(body,!body.isStatic);return body.isStatic;}
    beginDrag(body,point) {
      this.endDrag();if(!body)return;
      this.drag=Constraint.create({pointA:{...point},bodyB:body,pointB:Vector.sub(point,body.position),length:0,stiffness:.16,damping:.15});
      this.drag.plugin={drag:true};Composite.add(this.world,this.drag);
    }
    moveDrag(point){if(this.drag)this.drag.pointA={...point};}
    translateConnected(body,delta){
      const connected=new Set([body]),queue=[body],joints=this.joints.filter(c=>c.plugin.joint||c.plugin.pierce);
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
      const p=body.plugin;p.hp=Math.max(0,p.hp-amount);
      const e=this.getEntity(body);if(e&&amount>12)e.stun=Math.max(e.stun||0,clamp(amount/20,.6,5));if(e)e.restTime=0;
      if(p.material==='flesh'){
        const local=Vector.rotate(Vector.sub(point,body.position),-body.angle);
        const wound={x:clamp(p.flip?-local.x:local.x,-p.w/2+1,p.w/2-1),y:clamp(local.y,-p.h/2+1,p.h/2-1),radius:clamp(amount/(type==='bullet'||type==='stab'?13:10),1.5,11),type,seed:Math.random()*6.28};
        p.wounds??=[];p.wounds.push(wound);p.wounds=p.wounds.slice(-14);
        p.bone=Math.max(0,(p.bone??100)-amount*(type==='bullet'||type==='stab'?.55:1));
        p.bleed=Math.min(7,(p.bleed||0)+amount/(type==='bullet'||type==='stab'?45:150));
        this.burst(point.x,point.y,Math.min(24,Math.ceil(amount/3)),'#a4373c',type==='bullet'?6:3,'blood');
        if(e&&(p.part==='head'||p.part==='chest')&&p.hp<12){e.alive=false;e.upright=false;}
      }
      else this.burst(point.x,point.y,Math.min(8,Math.ceil(amount/8)),p.material==='glass'?'#a7dbe2':'#e1bc7b',3);
      if(p.hp<=0) {
        if(p.kind==='bomb'||p.kind==='barrel'){if(!p.detonating){p.detonating=true;this.damageQueue.push(()=>this.detonate(body));}}
        else if(p.material==='flesh'||p.kind==='android'){
          // A bullet can incapacitate without automatically detaching the whole limb.
          if(type==='blast'||amount>85||p.bone<=0)for(const c of [...this.joints])if(c.plugin.joint&&(c.bodyA===body||c.bodyB===body))this.sever(c);
        }
        else if(!p.debris&&!p.destroying&&p.kind!=='platform'){p.destroying=true;this.damageQueue.push(()=>this.shatter(body));}
      }
    }
    shatter(body) {
      if(!this.bodies.includes(body))return;
      const p=body.plugin,{x,y}=body.position,vel={...body.velocity};this.removeBody(body);
      if(this.bodies.length>480)return;
      const fragments=[];for(let i=0;i<5;i++){
        const w=rnd(6,16),h=rnd(5,14),b=Bodies.rectangle(x+rnd(-15,15),y+rnd(-15,15),w,h,{density:.001,friction:.6});
        this.meta(b,p.kind,{material:p.material,w,h,hp:10,maxHp:10,debris:true});Body.setVelocity(b,{x:vel.x+rnd(-3,3),y:vel.y+rnd(-4,1)});Body.setAngularVelocity(b,rnd(-.15,.15));fragments.push(b);
      }this.entity('debris',fragments);this.onEffect('break',.3);
    }
    explode(x,y,radius=175,power=1) {
      this.flashes.push({x,y,radius,life:.6,maxLife:.6});this.burst(x,y,70,'#eabb69',13*power);this.burst(x,y,30,'#cd7050',9*power,'smoke');
      for(const b of this.bodies){const dx=b.position.x-x,dy=b.position.y-y,d=Math.hypot(dx,dy);if(d>radius)continue;const f=1-d/radius;
        if(!b.isStatic){Body.setVelocity(b,{x:b.velocity.x+(dx/(d||1))*f*20*power,y:b.velocity.y+(dy/(d||1))*f*20*power-3*f});Body.setAngularVelocity(b,rnd(-.2,.2)*f);}
        this.damage(b,f*140*power,b.position,'blast');b.plugin.heat+=f*180;
      }this.onEffect('explosion',power);
    }
    detonate(body){if(!this.bodies.includes(body))return;const {x,y}=body.position,barrel=body.plugin.kind==='barrel';this.removeBody(body);this.explode(x,y,barrel?220:170,barrel?1.2:1);}
    shoot(from,to,ignore=null) {
      const direction=Vector.normalise(Vector.sub(to,from));if(!direction.x&&!direction.y)return;
      const end=Vector.add(from,Vector.mult(direction,2500));let nearest=null,hit=end,best=Infinity;
      // Exact segment/polygon intersection avoids tunnelling and query-order artifacts.
      for(const body of [...this.bodies,...this.boundaries]){if(body===ignore)continue;
        const v=body.vertices;for(let i=0;i<v.length;i++){const a=v[i],b=v[(i+1)%v.length],sx=b.x-a.x,sy=b.y-a.y,rx=end.x-from.x,ry=end.y-from.y,den=rx*sy-ry*sx;
          if(Math.abs(den)<1e-8)continue;const qx=a.x-from.x,qy=a.y-from.y,t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
          if(t>=0&&t<=1&&u>=0&&u<=1&&t<best){best=t;nearest=body;hit={x:from.x+rx*t,y:from.y+ry*t};}
        }
      }
      this.traces.push({from:{...from},to:hit,life:.14,maxLife:.14});this.burst(from.x,from.y,5,'#ffe1a2',3);
      if(nearest&&!nearest.plugin.boundary){Body.applyForce(nearest,hit,Vector.mult(direction,.018));this.damage(nearest,55,hit,'bullet');}
      this.onEffect('shot',.3);return nearest;
    }
    ignite(body){if(!body)return;body.plugin.heat=Math.max(body.plugin.heat,330);if(['flesh','wood','rubber'].includes(body.plugin.material))body.plugin.burning=true;if(body.plugin.kind==='barrel'||body.plugin.kind==='bomb')body.plugin.fuse=.35;this.onEffect('fire',.1);}
    shock(body) {
      if(!body)return;const touched=new Set(),queue=[body];
      while(queue.length&&touched.size<30){const b=queue.shift();if(touched.has(b))continue;touched.add(b);b.plugin.charge=1;this.damage(b,b.plugin.material==='flesh'?24:5);if(!b.isStatic)Body.setVelocity(b,{x:b.velocity.x+rnd(-2,2),y:b.velocity.y-2});
        for(const other of this.bodies)if(!touched.has(other)&&['flesh','metal'].includes(other.plugin.material)&&Vector.magnitude(Vector.sub(other.position,b.position))<65){queue.push(other);this.traces.push({from:{...b.position},to:{...other.position},life:.3,maxLife:.3,electric:true});}
      }this.onEffect('electric',.3);
    }
    heal(body){const e=this.getEntity(body);if(e&&e.blood!==undefined)e.blood=100;for(const b of e?e.bodies:[body]){if(!b)continue;b.plugin.hp=b.plugin.maxHp;b.plugin.heat=20;b.plugin.burning=false;b.plugin.charge=0;b.plugin.bleed=0;b.plugin.bone=100;b.plugin.wounds=[];delete b.plugin.fuse;}this.burst(body.position.x,body.position.y,15,'#9fcbb1',2);}
    activate(body) {
      if(!body)return '';const p=body.plugin;
      if(p.kind==='barrel'){this.detonate(body);return 'Fuel barrel detonated';}
      if(p.kind==='bomb'){p.fuse=3;return 'Fuse lit — 3 seconds';}
      if(p.kind==='gun'){const aim=body.angle+(p.flip?Math.PI:0),d={x:Math.cos(aim),y:Math.sin(aim)};this.shoot(Vector.add(body.position,Vector.mult(d,28)),Vector.add(body.position,Vector.mult(d,800)),body);Body.applyForce(body,body.position,Vector.mult(d,-.015));return 'Pistol fired';}
      if(['thruster','wheel','battery'].includes(p.kind)){p.active=!p.active;return `${CATALOG.find(c=>c.id===p.kind).name} ${p.active?'on':'off'}`;}
      return 'This object has no activation';
    }
    // Blades: the tip is the -y end of a sharp body. A fast, point-first hit on flesh runs it through instead of bouncing off.
    blade(sword){const h=sword.plugin.h,axis=Vector.rotate({x:0,y:-1},sword.angle);return {axis,tip:Vector.add(sword.position,Vector.mult(axis,h/2)),length:h*.76};}
    pierce(pair,sword,part) {
      const p=sword.plugin;if(!defs[p.kind]?.sharp||p.stuck||part.plugin.material!=='flesh'||part.isStatic)return false;
      const {axis,tip}=this.blade(sword),contact=pair.collision.supports[0]||part.position;if(Vector.magnitude(Vector.sub(contact,tip))>26)return false;
      const arm=Vector.sub(tip,sword.position),tipVelocity={x:sword.velocity.x-sword.angularVelocity*arm.y,y:sword.velocity.y+sword.angularVelocity*arm.x};
      const speed=Vector.dot(Vector.sub(tipVelocity,part.velocity),axis);if(speed<PIERCE_SPEED)return false;
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
        for(const offset of [0,14]){const point=Vector.add(tip,Vector.mult(axis,-(along+offset)));const c=Constraint.create({bodyA:part,bodyB:sword,pointA:Vector.sub(point,part.position),pointB:Vector.sub(point,sword.position),length:0,stiffness:.5,damping:.1});c.plugin={pierce:true};Composite.add(this.world,c);}
        // Anything else of the same body that the blade now passes through is wounded too, including the far side.
        const e=this.getEntity(part);for(let d=2;d<length;d+=10){const point=Vector.add(tip,Vector.mult(axis,-d)),other=e&&Query.point(e.bodies,point)[0];if(other&&other!==part&&!other.plugin.run){other.plugin.run=true;this.damage(other,22,point,'stab');}}
        if(e)for(const b of e.bodies)delete b.plugin.run;if(along>part.plugin.w)this.damage(part,12,tip,'stab');
      }
      for(const sword of this.bodies){const p=sword.plugin;if(p.stuck===undefined||this.piercing.has(sword))continue;
        const pins=this.joints.filter(c=>c.plugin.pierce&&c.bodyB===sword);
        if(pins.length&&pins.every(c=>Constraint.currentLength(c)<PIERCE_GRIP))continue;
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
      const bodies=this.bodies;
      for(const e of this.entities){if(!['human','android'].includes(e.kind))continue;
        if(e.kind==='human'){const bleeding=e.bodies.reduce((n,b)=>n+(b.plugin.bleed||0),0);e.blood=Math.max(0,(e.blood??100)-bleeding*seconds*.5);if(e.blood<25){e.alive=false;e.upright=false;}}
        e.stun=Math.max(0,(e.stun||0)-seconds);if(!this.balancing(e)){e.effort=0;continue;}
        e.effort=Math.min(1,(e.effort??1)+seconds/GETUP_TIME); // strength returns gradually, so getting up is a push rather than a snap
        this.balance(e);
      }
      for(const b of bodies){const p=b.plugin;
        if(!Number.isFinite(b.position.x)||!Number.isFinite(b.position.y)||Math.abs(b.position.x)>10000||Math.abs(b.position.y)>10000){this.removeBody(b);continue;}
        if(p.fuse!==undefined){p.fuse-=seconds;if(p.fuse<=0&&!p.detonating){p.detonating=true;this.damageQueue.push(()=>this.detonate(b));}}
        p.charge=Math.max(0,p.charge-seconds*1.5);
        if(p.material==='flesh'&&p.bleed>.02){
          const e=this.getEntity(b);if((e?.blood??100)>0&&Math.random()<p.bleed*seconds*5){
            const source=p.severed?.[0]||p.wounds?.[p.wounds.length-1]||{x:0,y:0};const pos=Vector.add(b.position,Vector.rotate({x:p.flip?-source.x:source.x,y:source.y},b.angle));
            this.particles.push({x:pos.x,y:pos.y,vx:b.velocity.x*.4+rnd(-1.2,1.2),vy:b.velocity.y*.4+rnd(-.7,.8),life:3,maxLife:3,color:'#922c33',size:rnd(.8,2.6),type:'blood'});
          }p.bleed=Math.max(0,p.bleed-seconds*.009);
        }
        if(p.heat>170&&['wood','flesh','rubber'].includes(p.material))p.burning=true;
        if(p.burning){p.heat=Math.min(700,p.heat+seconds*35);p.hp=Math.max(0,p.hp-seconds*7);
          if(Math.random()<dt/25){const x=b.position.x+rnd(-10,10),y=b.position.y;this.particles.push({x,y,vx:rnd(-.8,.8),vy:rnd(-3,-1),life:rnd(.25,.7),maxLife:.7,color:Math.random()>.4?'#e5b660':'#c86943',size:rnd(3,7),type:'fire'});}
          if(Math.random()<.1){for(const other of bodies)if(other!==b&&Vector.magnitude(Vector.sub(other.position,b.position))<45)other.plugin.heat+=4;}
          if(p.hp<=0)this.damage(b,.1);
        }else p.heat=Math.max(20,p.heat-seconds*8);
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
      for(const c of [...this.joints])if(c.plugin.joint&&Constraint.currentLength(c)>c.plugin.breakForce)this.sever(c);
      this.blades();
      const pending=this.damageQueue.splice(0);for(const fn of pending)fn();
      for(const p of this.particles){p.life-=seconds;p.x+=p.vx*seconds*60;p.y+=p.vy*seconds*60;
        if(p.type==='blood'||p.type==='spark')p.vy+=seconds*12;
        if(p.type==='blood'&&p.y>=this.groundY){this.stains.push({x:p.x,y:this.groundY-1,r:rnd(2,8),wet:1});p.life=0;}
      }
      this.particles=this.particles.filter(p=>p.life>0).slice(-900);this.stains=this.stains.slice(-300);
      for(const list of [this.flashes,this.traces]){for(const f of list)f.life-=seconds;while(list.length&&list[0].life<=0)list.shift();}
    }
    loadPreset(name) {
      this.clear();this.scene=name;this.gravity=1;
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
      this.clear();this.scene=data.scene||'empty';this.gravity=Number.isFinite(data.gravity)?data.gravity:1;
      const bodies=data.bodies.map(d=>{const p=d.plugin,opts={density:d.density||.002,friction:d.friction,restitution:d.restitution,collisionFilter:{group:d.group||0}};
        const b=p.r?Bodies.circle(d.x,d.y,p.r,opts):Bodies.rectangle(d.x,d.y,p.w,p.h,{...opts,chamfer:{radius:Math.min(3,p.w/3,p.h/3)}});
        b.plugin={...p};Body.setAngle(b,d.angle);Body.setVelocity(b,d.velocity||{x:0,y:0});Body.setAngularVelocity(b,d.angularVelocity||0);if(d.isStatic)Body.setStatic(b,true);return b;
      });Composite.add(this.world,bodies);
      // Constraint.create discards a plugin passed in its options, so it is assigned afterwards.
      const joints=data.joints.map(d=>{const a=d.a===null?null:bodies[d.a],b=d.b===null?null:bodies[d.b];const c=Constraint.create({bodyA:a,bodyB:b,angleA:a?.angle||0,angleB:b?.angle||0,pointA:{...d.pointA},pointB:{...d.pointB},length:d.length,stiffness:d.stiffness,damping:d.damping});c.plugin={...d.plugin};return c;});Composite.add(this.world,joints);
      this.entities=data.entities.map(e=>({...e,bodies:bodies.filter(b=>b.plugin.entityId===e.id),joints:joints.filter(c=>c.plugin.joint&&c.bodyA?.plugin.entityId===e.id)}));
      this.nextId=Math.max(0,...this.entities.map(e=>e.id))+1;this.stains=Array.isArray(data.stains)?data.stains.slice(-300):[];
      // Keep new ragdolls' collision groups distinct from restored groups.
      Body._nextNonCollidingGroup=Math.min(Body._nextNonCollidingGroup,...bodies.map(b=>b.collisionFilter.group-1));
    }
  }
  return {Simulation,CATALOG,defs,clamp,ANATOMY};
});

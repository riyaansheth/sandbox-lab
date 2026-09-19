/* Sandbox Lab — canvas renderer and interaction layer. */
(() => {
  'use strict';
  const {Simulation,CATALOG,clamp}=Sandbox;
  const {Body,Constraint,Vector}=Matter;
  const $=s=>document.querySelector(s);
  const sim=new Simulation(),canvas=$('#world'),ctx=canvas.getContext('2d'),stage=$('#stage');
  const camera={x:1220,y:400,zoom:1};
  const state={tool:'grab',spawn:null,selected:null,paused:false,speed:1,category:'all',pointer:{x:0,y:0},worldPointer:{x:0,y:0},inside:false,down:false,pan:null,ropeStart:null,shift:false,rotation:0,sound:false};
  const TOOLS=[
    {id:'grab',name:'Grab',symbol:'↖',key:'1',title:'Grab & move',desc:'Drag anything. See what happens.'},
    {id:'rope',name:'Rope',symbol:'⌁',key:'2',title:'Connect objects',desc:'Click two objects, or an object and empty space.'},
    {id:'freeze',name:'Freeze',symbol:'❄',key:'3',title:'Freeze in place',desc:'Click a body to freeze it. Click again to release.'},
    {id:'shoot',name:'Shoot',symbol:'⌖',key:'4',title:'Take your shot',desc:'Click or hold. Fires from close range, left to right, into whatever is under the cursor. Bullets wound; they never take a limb off.'},
    {id:'fire',name:'Fire',symbol:'♨',key:'5',title:'Turn up the heat',desc:'Click or hold on an object to ignite it.'},
    {id:'shock',name:'Shock',symbol:'ϟ',key:'6',title:'A little electricity',desc:'Click a conductor. Electricity spreads to nearby objects.'},
    {id:'blast',name:'Blast',symbol:'✳',key:'7',title:'Make an impact',desc:'Click anywhere to create an explosion.'},
    {id:'heal',name:'Heal',symbol:'✚',key:'8',title:'Patch it up',desc:'Restore tissue and extinguish. It does not bring anyone back; broken joints stay broken.'},
    {id:'revive',name:'Revive',symbol:'♥',key:'9',title:'Back on your feet',desc:'Click a dead or collapsed ragdoll to bring it back to life and standing.'},
    {id:'partial',name:'Partial revive',symbol:'♡',key:'\\',title:'Alive, not mended',desc:'Click a dead ragdoll to bring it back as it is: every wound, fracture and missing limb stays.'},
    {id:'clot',name:'Stop bleeding',symbol:'◍',key:';',title:'Stem the flow',desc:'Click a ragdoll to stop all its bleeding, inside and out. The wounds stay.'},
    {id:'bandage',name:'Bandage',symbol:'▤',key:"'",title:'Dress the wound',desc:'Click a wounded part to bandage its cuts, bullet holes and stumps. Dressed wounds stop bleeding and stay shut.'},
    {id:'regrow',name:'Regrow',symbol:'❋',key:'-',title:'Grow it back',desc:'Click a ragdoll to regrow every missing limb. The torn-off pieces stay where they fell.'},
    {id:'reattach',name:'Reattach',symbol:'⚭',key:'=',title:'Put it back',desc:'Click a severed limb to return it to its own body, or click the body to collect all its pieces.'},
    {id:'graft',name:'Graft',symbol:'⚡',key:'[',title:'Build a better body',desc:'Click the body part to build on, then any loose limb — human or android, either side. It locks on with a surge of power.'},
    {id:'dismember',name:'Dismember',symbol:'✂',key:']',title:'Take it off',desc:'Click a limb to cut it off at the joint nearest the body.'},
    {id:'delete',name:'Delete',symbol:'⌫',key:'0',title:'Clean up',desc:'Click an object to remove it and its connections.'}
  ];
  let width=0,height=0,dpr=1,toastTimer,lastShot=0,lastAction=0,lastTime=0,accumulator=0,frameCount=0,fpsTime=0,uiTime=0;
  let audio=null,lastImpact=0;
  function sound(type,volume=.2){const set=sim.settings;if(!set.sound||!set.volume)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const now=audio.currentTime,level=set.volume/60;if(type==='impact'&&now-lastImpact<.12)return;if(type==='impact')lastImpact=now;
    if(type==='thunder'){thunder(now,level);return;}
    if(type==='grunt'){const o=audio.createOscillator(),g=audio.createGain(),f=audio.createBiquadFilter();o.type='sawtooth';o.frequency.setValueAtTime(125+volume*40,now);o.frequency.exponentialRampToValueAtTime(78,now+.16);f.type='lowpass';f.frequency.value=520;g.gain.setValueAtTime(Math.min(.12,.06*volume*level),now);g.gain.exponentialRampToValueAtTime(.001,now+.2);o.connect(f);f.connect(g);g.connect(audio.destination);o.start(now);o.stop(now+.22);return;}
    if(type==='grow'||type==='surge'){const rise=audio.createOscillator(),g=audio.createGain(),long=type==='surge'?.7:.22;rise.type=type==='surge'?'sawtooth':'sine';rise.frequency.setValueAtTime(type==='surge'?90:220+volume*260,now);rise.frequency.exponentialRampToValueAtTime(type==='surge'?1400:520+volume*400,now+long);g.gain.setValueAtTime(.001,now);g.gain.exponentialRampToValueAtTime(Math.min(.2,.09*level),now+long*.6);g.gain.exponentialRampToValueAtTime(.001,now+long);rise.connect(g);g.connect(audio.destination);rise.start(now);rise.stop(now+long+.02);if(type==='surge')shake=7*set.shake;return;}
    const gain=audio.createGain();gain.connect(audio.destination);gain.gain.setValueAtTime(Math.min(.2,volume*.15*level),now);gain.gain.exponentialRampToValueAtTime(.001,now+.18);
    const oscillator=audio.createOscillator();oscillator.type=type==='electric'?'sawtooth':'triangle';oscillator.frequency.setValueAtTime(type==='explosion'?70:type==='shot'?210:type==='electric'?650:160,now);oscillator.frequency.exponentialRampToValueAtTime(30,now+.2);oscillator.connect(gain);oscillator.start(now);oscillator.stop(now+.22);
  }catch{applySettings({sound:false});$('#sound-btn').textContent='Sound unavailable';}}
  // Thunder: a sharp crack, then low-passed noise that rolls off over a couple of seconds.
  function thunder(now,level){const length=2.6,buffer=audio.createBuffer(1,audio.sampleRate*length,audio.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++){const t=i/audio.sampleRate;data[i]=(Math.random()*2-1)*(Math.exp(-t*30)+.55*Math.exp(-t*1.6)*(.6+.4*Math.sin(t*9)));}
    const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();source.buffer=buffer;filter.type='lowpass';filter.frequency.setValueAtTime(2400,now);filter.frequency.exponentialRampToValueAtTime(120,now+.5);
    gain.gain.value=Math.min(.5,.35*level);source.connect(filter);filter.connect(gain);gain.connect(audio.destination);source.start(now);}
  sim.onEffect=(type,volume)=>{sound(type,volume);if(type==='explosion'||type==='thunder')shake=Math.min(14,volume*8)*sim.settings.shake;};
  let shake=0;
  function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2400);}
  function resize(){const r=stage.getBoundingClientRect();width=r.width;height=r.height;dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
  function fit(){camera.x=1220;camera.y=390;camera.zoom=Math.min(width/1040,height/660);camera.zoom=clamp(camera.zoom,.25,1.6);updateZoom();}
  function updateZoom(){$('#zoom-reset').textContent=Math.round(camera.zoom*100)+'%';}
  function toWorld(point){return {x:(point.x-width/2)/camera.zoom+camera.x,y:(point.y-height/2)/camera.zoom+camera.y};}
  function setTool(id){state.tool=id;state.ropeStart=null;state.graftStump=null;sim.endDrag();document.querySelectorAll('.tool').forEach(b=>{b.classList.toggle('active',b.dataset.tool===id);b.setAttribute('aria-pressed',String(b.dataset.tool===id));});const t=TOOLS.find(t=>t.id===id);$('#tool-caption-icon').textContent=t.symbol;$('#tool-caption-name').textContent=t.title;$('#tool-caption-desc').textContent=t.desc;canvas.style.cursor=id==='grab'?'grab':'crosshair';}
  function chooseSpawn(id){state.spawn=state.spawn===id?null:id;state.rotation=0;document.querySelectorAll('.object-card').forEach(b=>b.classList.toggle('active',b.dataset.object===state.spawn));if(state.spawn)toast(CATALOG.find(c=>c.id===id).name+' ready — Q / E places it at the cursor, facing left / right');}
  function temperature(c){const unit=sim.settings.tempUnit;return unit==='Fahrenheit'?Math.round(c*9/5+32)+'°F':unit==='Kelvin'?Math.round(c+273)+' K':Math.round(c)+'°C';}
  function select(body){state.selected=body;if(body?.plugin.part==='hand'){const picked=sim.equip(body);if(picked)toast(picked);}updateSelection();}
  function updateSelection(){const b=state.selected;if(!b||!sim.bodies.includes(b)){state.selected=null;$('#selection-panel').hidden=true;return;}$('#selection-panel').hidden=false;const p=b.plugin,c=CATALOG.find(c=>c.id===p.kind);$('#selection-name').textContent=(c?.name||'Fragment')+(p.part?' · '+p.part:'');$('#selection-info').innerHTML=`<div class="stat-row"><span>Integrity</span><b>${Math.round(p.hp/p.maxHp*100)}%</b></div><div class="health-bar"><i style="width:${clamp(p.hp/p.maxHp*100,0,100)}%"></i></div><div class="stat-row"><span>Temperature</span><b>${temperature(p.heat)}</b></div><div class="stat-row"><span>State</span><b>${b.isStatic?'Frozen':p.burning?'Burning':p.charge>.1?'Electrified':p.hp<=0?'Broken':p.active?'Active':'Dynamic'}</b></div>`;$('#freeze-selection').textContent=b.isStatic?'Unfreeze':'Freeze';$('#activate-selection').disabled=!['barrel','bomb','gun','thruster','wheel','battery'].includes(p.kind);}
  function heartStatus(e){const heart=e.organs?e.organs.heart:100;return heart<=0?'Destroyed':!e.alive?'Stopped':heart<100?`Damaged · ${Math.round(e.heartRate||0)} bpm`:`${Math.round(e.heartRate||70)} bpm`;}
  function brainStatus(e){const brain=e.organs?e.organs.brain:100;return brain<=0?'Destroyed':brain<100?`Damaged · ${Math.round(brain)}%`:!e.alive?'No activity':e.consciousness==='unconscious'?'Unconscious':'Normal';}
  function updateAnatomyInfo(){const b=state.selected;if(!b||b.plugin.material!=='flesh'||!b.plugin.part)return;const e=sim.getEntity(b),p=b.plugin,whole=!!e?.bodies.some(x=>x.plugin.slot===2);/* a loose limb is remains: it has no vitals of its own */$('#selection-info').insertAdjacentHTML('beforeend',(whole?`<div class="stat-row"><span>Blood volume</span><b>${Math.round(e?.blood??100)}%</b></div>`:'')+`<div class="stat-row"><span>Bone integrity</span><b>${Math.round(p.bone??100)}%</b></div><div class="stat-row"><span>Condition</span><b>${!whole?'Severed':e?.alive===false?'Dead':e?.consciousness==='unconscious'?'Unconscious':e?.stun>0?'Knocked down':e?.consciousness==='dazed'?'Dazed':p.bleed>.05?'Bleeding':'Stable'}</b></div>`+(p.bone<=50?`<div class="stat-row"><span>Limb</span><b>Fractured</b></div>`:'')+(p.internal>.02?`<div class="stat-row"><span>Internal bleeding</span><b>${p.internal>1?'Massive':p.internal>.3?'Heavy':'Slow'}</b></div>`:'')
    +(whole&&e.kind==='human'?`<div class="stat-row"><span>Heart</span><b>${heartStatus(e)}</b></div><div class="stat-row"><span>Brain</span><b>${brainStatus(e)}</b></div><div class="stat-row"><span>Pain</span><b>${Math.round(e.pain||0)}%</b></div><div class="stat-row"><span>Oxygen</span><b>${Math.round(e.oxygen??100)}%</b></div>`+(e.organs?Object.entries(e.organs).filter(([k,v])=>v<100&&k!=='heart'&&k!=='brain').map(([k,v])=>`<div class="stat-row"><span>${k[0].toUpperCase()+k.slice(1)}</span><b>${v<=0?'Destroyed':Math.round(v)+'%'}</b></div>`).join(''):'')+(e.causeOfDeath?`<div class="stat-row"><span>Cause of death</span><b>${e.causeOfDeath}</b></div>`:''):''));}
  function roundRect(c,x,y,w,h,r=2){c.beginPath();c.roundRect(x,y,w,h,r);}
  const ANATOMY_SLOT=Object.fromEntries(Sandbox.ANATOMY.map(([part],slot)=>[part,slot]).reverse());
  function drawObject(c,kind,p={},time=0){
    const d=Sandbox.defs[kind]||{},w=p.w||d.w||25,h=p.h||d.h||35,r=p.r||d.r;
    const item=CATALOG.find(i=>i.id===kind);c.fillStyle=item?.color||'#b5bdb8';c.strokeStyle='#141c21';c.lineWidth=1.5;
    if(p.gib){const bone=p.material==='bone',plain=sim.settings.noGore;c.fillStyle=bone?'#ece3cb':plain?'#8d8a84':p.material==='flesh'?'#8a2a31':'#8f9a9e';c.strokeStyle=bone?'#b8ab8a':plain?'#6f6c66':'#5a161c';c.lineWidth=.6;c.beginPath();
      for(let i=0;i<7;i++){const a=i/7*6.283,r=(i%2?.62:1)*(bone?.55:.5)*(.8+hash(p.seed+i)*.4);(i?c.lineTo:c.moveTo).call(c,Math.cos(a)*w*r,Math.sin(a)*h*r);}c.closePath();c.fill();c.stroke();if(!bone&&!plain){c.fillStyle='#c0565a';c.beginPath();c.arc(-w*.12,-h*.1,Math.min(w,h)*.16,0,7);c.fill();}return;}
    if(p.debris){if(p.material==='flesh')c.fillStyle=sim.settings.noGore?'#8d8a84':'#7d2f33';c.fillRect(-w/2,-h/2,w,h);return;}
    if(ItemArt.has(kind)){if(!p.w&&!p.r){p={...d,...p};}p.noGore=sim.settings.noGore;ItemArt.draw(c,kind,p,time);return;} // every catalogue item is a cached sprite from art.js; what follows is the fallback for things without a painter
    if(kind==='human'||kind==='android'){
      if(kind==='human'){BodyArt.preview(c,p.part,p.slot??ANATOMY_SLOT[p.part],p.w,p.h);return;} // previews only; live humans are drawn by BodyArt.draw with their damage state
      const robot=kind==='android';c.fillStyle=robot?'#8ba8a4':p.part==='chest'?'#99a9a0':p.part==='hip'?'#727f7b':'#c9c3b6';
      if(p.hp<=0)c.fillStyle=robot?'#637777':'#aa9289';
      if(p.part==='head'){roundRect(c,-w/2,-h/2,w,h,robot?3:7);c.fill();c.stroke();c.fillStyle=robot?'#d3cd83':'#394746';c.fillRect(5,-4,4,robot?3:2);if(robot){c.fillStyle='#506763';c.fillRect(-7,-9,12,3);}}
      else {roundRect(c,-w/2,-h/2,w,h,3);c.fill();c.stroke();c.fillStyle=robot?'#bacac2':'#b3c1b3';if(p.part==='chest'){c.fillRect(-w/2+4,-h/2+5,4,h-12);c.fillStyle='#667d76';c.fillRect(-6,0,12,5);}if(robot){c.strokeStyle='#476962';c.beginPath();c.moveTo(-w/2+3,0);c.lineTo(w/2-3,0);c.stroke();}}
      return;
    }
    if(r){c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();c.stroke();}else{roundRect(c,-w/2,-h/2,w,h,2);c.fill();c.stroke();}
  }
  function drawMini(c,kind){c.clearRect(0,0,160,114);c.save();c.translate(80,55);if(kind==='human'||kind==='android'){
    c.scale(.45,.45);c.translate(0,12);Sandbox.ANATOMY.map((row,slot)=>[...row,slot]).sort((a,b)=>BodyArt.layer({part:a[0],slot:a[5]})-BodyArt.layer({part:b[0],slot:b[5]})).forEach(([part,x,y,w,h,slot])=>{c.save();c.translate(x,y);drawObject(c,kind,{part,slot,w,h,r:0,hp:100});c.restore();});
  }else{const d=Sandbox.defs[kind],s=Math.min(1.3,120/(d.w||d.r*2),78/(d.h||d.r*2));c.scale(s,s);drawObject(c,kind,d);}c.restore();}
  function renderCatalog(){const query=$('#search').value.trim().toLowerCase();const list=CATALOG.filter(c=>(state.category==='all'||c.category===state.category)&&`${c.name} ${c.description}`.toLowerCase().includes(query));$('#catalog-count').textContent=list.length+' objects';$('#catalog').replaceChildren();for(const item of list){const button=document.createElement('button');button.className='object-card'+(state.spawn===item.id?' active':'');button.dataset.object=item.id;button.title=item.description;button.setAttribute('aria-label','Spawn '+item.name);const preview=document.createElement('canvas');preview.width=160;preview.height=114;preview.setAttribute('aria-hidden','true');button.appendChild(preview);const name=document.createElement('span');name.className='name';name.textContent=item.name;button.appendChild(name);if(item.id==='human'){const tag=document.createElement('span');tag.className='tag';tag.textContent='Start here';button.appendChild(tag);}button.addEventListener('click',()=>chooseSpawn(item.id));$('#catalog').appendChild(button);drawMini(preview.getContext('2d'),item.id);}if(!list.length){const p=document.createElement('p');p.className='no-results';p.textContent='No objects match your search.';$('#catalog').appendChild(p);}}
  for(const tool of TOOLS){const b=document.createElement('button');b.className='tool'+(tool.id==='grab'?' active':'');b.dataset.tool=tool.id;b.title=`${tool.title} (${tool.key})`;b.setAttribute('aria-label',tool.title);b.setAttribute('aria-pressed',String(tool.id==='grab'));b.innerHTML=`<span class="shortcut">${tool.key}</span><span class="symbol">${tool.symbol}</span><span class="tool-name">${tool.name}</span>`;b.addEventListener('click',()=>setTool(tool.id));$('#tools').appendChild(b);}
  const hash=n=>{const x=Math.sin(n*127.1)*43758.5453;return x-Math.floor(x);};
  // Fire. A flame is hundreds of soft blobs drawn additively: each is born somewhere on the burning body, accelerates upward, wanders in the turbulence,
  // shrinks and cools from white-yellow through orange to red. Overlapping blobs add up into one continuous, flickering flame body, so a burning ragdoll
  // is wrapped in a single fire rather than wearing seventeen small ones. Visual only, so it lives here and not in the engine.
  const smooth=t=>{const i=Math.floor(t),f=t-i,u=f*f*(3-2*f);return hash(i)*(1-u)+hash(i+1)*u;};
  const FLAMES=1600,flame={x:new Float32Array(FLAMES),y:new Float32Array(FLAMES),vx:new Float32Array(FLAMES),vy:new Float32Array(FLAMES),age:new Float32Array(FLAMES),life:new Float32Array(FLAMES),size:new Float32Array(FLAMES),next:0,alive:0};
  function emitFlames(b,dt){const p=b.plugin,w=p.w||p.r*2||20,h=p.h||p.r*2||20,power=clamp((p.heat-150)/380,.5,1.3),rate=clamp(w*h/34,8,115)*power*(flame.alive>1200?.35:1); // by surface area: a crate burns with many more blobs than a hand
    let count=rate*dt;count=Math.floor(count)+(Math.random()<count%1?1:0);const cos=Math.cos(b.angle),sin=Math.sin(b.angle),base=clamp(Math.min(w,h)*.5,5,15);
    for(;count>0;count--){const i=flame.next=(flame.next+1)%FLAMES;let x=0,y=1e9;
      // Fire climbs: of two random points on the body, the higher one burns. That keeps the base of the flame on the object and its bulk above it.
      for(let tries=0;tries<2;tries++){const lx=(Math.random()-.5)*w,ly=(Math.random()-.5)*h,wy=b.position.y+lx*sin+ly*cos;if(wy<y){y=wy;x=b.position.x+lx*cos-ly*sin;}}
      flame.x[i]=x;flame.y[i]=y;flame.vx[i]=b.velocity.x*30+(Math.random()-.5)*22;flame.vy[i]=b.velocity.y*18-45-Math.random()*55;
      flame.age[i]=0;flame.life[i]=(.55+Math.random()*.65)*(.8+power*.3);flame.size[i]=base*(.75+Math.random()*.6)*(.85+power*.25);}}
  function drawFire(dt,left,right){
    if(dt>0)for(const b of sim.bodies)if(b.plugin.burning&&b.bounds.max.x>left-80&&b.bounds.min.x<right+80)emitFlames(b,dt);
    const hot=glowSprite('flameHot','255,236,170',1),mid=glowSprite('flameMid','255,138,32',1),cool=glowSprite('flameCool','205,44,12',1),t=sim.time;let alive=0;
    for(let i=0;i<FLAMES;i++){if(flame.age[i]>=flame.life[i])continue;alive++;
      if(dt>0){flame.age[i]+=dt;flame.vy[i]-=230*dt;flame.vx[i]+=((smooth(flame.y[i]*.035+t*2.2+i%7)-.5)*260-flame.vx[i]*2.2)*dt;flame.x[i]+=flame.vx[i]*dt;flame.y[i]+=flame.vy[i]*dt;}
      const k=flame.age[i]/flame.life[i];if(k>=1)continue;const r=flame.size[i]*(1.2-k*1.02),x=flame.x[i],y=flame.y[i],stretch=1+k*.9; // blobs stretch upward as they rise, which reads as licking tongues
      // red outer haze the whole way up, orange through the middle of its life, yellow-white only while young. Alphas are low because the blobs add up.
      ctx.globalAlpha=.2*(1-k);ctx.drawImage(cool,x-r*1.45,y-r*1.45*stretch,r*2.9,r*2.9*stretch);
      if(k<.7){ctx.globalAlpha=.3*(1-k/.7);ctx.drawImage(mid,x-r,y-r*stretch,r*2,r*2*stretch);}
      if(k<.28){ctx.globalAlpha=.32*(1-k/.28);ctx.drawImage(hot,x-r*.5,y-r*.5,r,r);}}
    flame.alive=alive;ctx.globalAlpha=1;}
  // Performance: nothing here builds a gradient or blurs per frame. Flame tongues, glows and smoke are painted once into small sprites and stamped with drawImage.
  const sprites={};
  function sprite(name,w,h,paint){if(!sprites[name]){const c=document.createElement('canvas');c.width=w;c.height=h;paint(c.getContext('2d'),w,h);sprites[name]=c;}return sprites[name];}
  const glowSprite=(name,rgb,alpha)=>sprite(name,128,128,c=>{const g=c.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,`rgba(${rgb},${alpha})`);g.addColorStop(1,`rgba(${rgb},0)`);c.fillStyle=g;c.fillRect(0,0,128,128);});
  const view={a:1,e:0,f:0}; // the world transform (uniform scale + offset)
  function fireGlow(b){const wide=b.bounds.max.x-b.bounds.min.x,reach=wide*.8+55;ctx.globalAlpha=clamp(wide/80,.1,1);ctx.drawImage(glowSprite('fireGlow','255,130,40',.2),b.position.x-reach,b.position.y-reach,reach*2,reach*2);ctx.globalAlpha=1;}
  // Lightning. A channel is a midpoint-displaced path that forks on the way down. The channel keeps its shape for the whole strike;
  // what changes is the light: a first return stroke, then one or two dimmer restrikes down the same path, each decaying fast. Forks only show on the first.
  function jagged(from,to,roughness,depth,seed){let points=[from,to];for(let d=0;d<depth;d++){const next=[points[0]];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],len=Math.hypot(b.x-a.x,b.y-a.y),nx=-(b.y-a.y)/(len||1),ny=(b.x-a.x)/(len||1),offset=(hash(seed+=1.7)-.5)*len*roughness;next.push({x:(a.x+b.x)/2+nx*offset,y:(a.y+b.y)/2+ny*offset},b);}points=next;}return points;}
  function boltShape(t){const seed=t.from.x*.37+t.to.y,main=jagged(t.from,t.to,.34,6,seed),forks=[],drop=t.to.y-t.from.y;
    for(let i=0;i<5;i++){const at=main[Math.floor((.12+hash(seed+i*9.1)*.6)*main.length)],side=hash(seed+i*3.3)<.5?-1:1,reach=drop*(.12+hash(seed+i*5.7)*.2),end={x:at.x+side*reach*(.45+hash(seed+i)*.5),y:at.y+reach};
      const fork=jagged(at,end,.4,4,seed+i*31);forks.push(fork);if(hash(seed+i*7.7)<.5){const twigFrom=fork[Math.floor(fork.length*.55)];forks.push(jagged(twigFrom,{x:twigFrom.x-side*reach*.3,y:twigFrom.y+reach*.4},.45,3,seed+i*57));}}
    return {main,forks};}
  function strokeLight(t){const age=t.maxLife-t.life;return Math.max(...[[0,1],[.13,.6],[.27,.38]].map(([start,power])=>age>=start?power*Math.exp(-(age-start)*17):0));}
  const pathOf=list=>{const path=new Path2D();for(const points of list)points.forEach((p,i)=>i?path.lineTo(p.x,p.y):path.moveTo(p.x,p.y));return path;};
  function stroke(path,width,color){ctx.lineWidth=width;ctx.strokeStyle=color;ctx.stroke(path);}
  function drawElectric(t){ctx.lineJoin='round';ctx.lineCap='round';
    if(t.bolt){if(!t.shape){const shape=boltShape(t);t.shape={main:pathOf([shape.main]),forks:pathOf(shape.forks)};}const light=strokeLight(t),first=t.maxLife-t.life<.12,z=1/Math.max(.5,camera.zoom);if(light<.02)return;
      stroke(t.shape.main,26*z,`rgba(110,150,255,${.07*light})`);stroke(t.shape.main,12*z,`rgba(140,175,255,${.16*light})`);stroke(t.shape.main,5*z,`rgba(185,210,255,${.45*light})`);stroke(t.shape.main,2*z,`rgba(255,255,255,${Math.min(1,light*1.25)})`);
      if(first){stroke(t.shape.forks,4*z,`rgba(150,185,255,${.22*light})`);stroke(t.shape.forks,1.1*z,`rgba(240,246,255,${.85*light})`);}ctx.lineCap='butt';return;}
    // Arcs between conductors are short-lived and restless: a new path several times a second.
    const fade=t.life/t.maxLife,arc=pathOf([jagged(t.from,t.to,.42,3,Math.floor(sim.time*28)+t.from.x)]);stroke(arc,5,`rgba(120,200,255,${.22*fade})`);stroke(arc,1.4,`rgba(235,250,255,${fade})`);ctx.lineCap='butt';}
  // With the floodlights off the chamber is dark, and anything that burns, flashes or arcs cuts a hole in the dark.
  let shade=null;
  function darkness(){shade??=document.createElement('canvas');if(shade.width!==canvas.width||shade.height!==canvas.height){shade.width=canvas.width;shade.height=canvas.height;}
    const d=shade.getContext('2d'),toScreen=p=>({x:(p.x-camera.x)*camera.zoom+width/2,y:(p.y-camera.y)*camera.zoom+height/2});d.setTransform(dpr,0,0,dpr,0,0);d.globalCompositeOperation='source-over';d.clearRect(0,0,width,height);d.fillStyle='rgba(4,7,10,.86)';d.fillRect(0,0,width,height);d.globalCompositeOperation='destination-out';
    const hole=glowSprite('hole','0,0,0',1),light=(point,radius,power=1)=>{const p=toScreen(point),r=radius*camera.zoom;d.globalAlpha=Math.min(1,power);d.drawImage(hole,p.x-r,p.y-r,r*2,r*2);};
    for(const b of sim.bodies){const p=b.plugin;if(p.burning)light(b.position,150+Math.sin(sim.time*23+b.id)*12);else if(p.charge>.1)light(b.position,70,p.charge);else if(p.active&&p.kind==='thruster')light(b.position,110);}
    for(const f of sim.flashes)light(f,f.radius*2.2,f.life/f.maxLife);for(const t of sim.traces)if(t.bolt){const power=Math.min(1,strokeLight(t)*1.4);if(power>.02){light(t.to,520,power);light({x:(t.from.x+t.to.x)/2,y:(t.from.y+t.to.y)/2},620,power*.8);}}else if(t.electric)light(t.to,60,t.life/t.maxLife);
    if(state.inside)light(state.worldPointer,95,.55); // a little working light at the cursor, or the room is unusable
    d.globalAlpha=1;ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(shade,0,0);ctx.restore();}
  // Rain, snow and fog are stateless: every streak's position is a function of its index and the clock.
  function weather(){const set=sim.settings,time=sim.time;
    if(set.fog){const fog=ctx.createLinearGradient(0,height*.25,0,height);fog.addColorStop(0,'rgba(168,182,188,.05)');fog.addColorStop(1,'rgba(168,182,188,.4)');ctx.fillStyle=fog;ctx.fillRect(0,0,width,height);
      for(let i=0;i<6;i++){const x=((hash(i+3)*width*1.6+time*(9+i*3))%(width*1.6))-width*.3,y=height*(.55+hash(i+11)*.35),r=190+hash(i+5)*160,g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(190,202,206,.13)');g.addColorStop(1,'rgba(190,202,206,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}}
    if(set.rain){ctx.strokeStyle='rgba(170,195,215,.34)';ctx.lineWidth=1;ctx.beginPath();for(let i=0;i<170;i++){const speed=900+hash(i)*500,x=(hash(i+.5)*(width+200)+time*120)%(width+200)-100,y=(hash(i+.25)*height+time*speed)%height,len=13+hash(i+.75)*12;ctx.moveTo(x,y);ctx.lineTo(x-len*.16,y-len);}ctx.stroke();}
    if(set.snow){ctx.fillStyle='rgba(235,242,246,.8)';for(let i=0;i<120;i++){const fall=32+hash(i)*45,x=(hash(i+.5)*width+Math.sin(time*.9+i)*22+time*8)%width,y=(hash(i+.25)*height+time*fall)%height,r=.9+hash(i+.75)*1.9;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();}}
  }
  // Blood dries from bright red to a dark brown over about half a minute; android coolant from teal to near black.
  const STAIN_RAMP=[[155,31,42],[72,26,28]],OIL_RAMP=[[47,84,90],[24,34,36]];
  function stainColor(wet,oil){const [a,b]=oil?OIL_RAMP:STAIN_RAMP;return `rgb(${Math.round(b[0]+(a[0]-b[0])*wet)},${Math.round(b[1]+(a[1]-b[1])*wet)},${Math.round(b[2]+(a[2]-b[2])*wet)})`;}
  const fillers=new Map(),drawList=[];
  const LIVOR_AFTER=12,LIVOR_TIME=40; // the dead go pale over the first seconds; then the blood settles into whatever side is down
  const REMAINS={livor:0,pale:0,face:'dead',faceId:13,gaze:0,dead:true,noGore:false,time:0,char:0,breath:0}; // parts whose owner is gone
  const looks=new Map(); // entity id -> how that ragdoll looks this frame: pallor, face, dead. Filled once per frame, shared by its 17 parts.
  function render(){
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.fillStyle='#20282d';ctx.fillRect(0,0,width,height);
    ctx.save();ctx.translate(width/2+(Math.random()-.5)*shake,height/2+(Math.random()-.5)*shake);ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x,-camera.y);shake*=.88;{const m=ctx.getTransform();view.a=m.a;view.e=m.e;view.f=m.f;}
    const left=camera.x-width/2/camera.zoom,right=camera.x+width/2/camera.zoom,top=camera.y-height/2/camera.zoom,bottom=camera.y+height/2/camera.zoom;
    ctx.lineWidth=1/camera.zoom;
    const set=sim.settings;looks.clear();for(const e of sim.entities){if(e.kind!=='human')continue;const face=!set.faces?'neutral':!e.alive?'dead':e.consciousness==='unconscious'?'closed':e.shoutT>0?'shout':(sim.time-(e.hitTime??-9)<.6||e.pain>65)?'tense':e.consciousness==='dazed'?'dazed':'neutral';
      looks.set(e.id,{livor:e.alive||e.diedAt===undefined?0:clamp((sim.time-e.diedAt-LIVOR_AFTER)/LIVOR_TIME,0,1),pale:Math.max(e.blood<75?clamp((75-e.blood)/50,0,1):0,e.alive||e.diedAt===undefined?0:clamp((sim.time-e.diedAt)/LIVOR_AFTER,0,1)*.5),face,faceId:BodyArt.FACES.indexOf(face)*3+((set.faces&&e.alive?e.gaze:0)||0)+1,gaze:(set.faces&&e.alive?e.gaze:0)||0,dead:!e.alive,noGore:set.noGore,time:sim.time,char:0,breath:e.alive&&set.breathing?Math.sin((e.breath||0)*Math.PI*2)*(.018+Math.min(.03,(e.pain||0)/2500)):0});}
    if(set.grid)for(let x=Math.floor(left/32)*32;x<right;x+=32){ctx.strokeStyle=x%160===0?'#39464e':'#2c383f';ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,Math.min(bottom,sim.groundY));ctx.stroke();}
    if(set.grid)for(let y=Math.floor(top/32)*32;y<Math.min(bottom,sim.groundY);y+=32){ctx.strokeStyle=y%160===0?'#39464e':'#2c383f';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();}
    // Far wall measurement ticks and subtle workshop fixtures.
    ctx.strokeStyle='#56626a';ctx.fillStyle='#54646d';ctx.font='10px Barlow, Arial';ctx.textAlign='left';
    for(let x=0;x<2600;x+=160){ctx.beginPath();ctx.moveTo(x,sim.groundY-9);ctx.lineTo(x,sim.groundY);ctx.stroke();ctx.fillText(String(x/100).padStart(2,'0'),x+5,sim.groundY-11);}
    ctx.fillStyle='#303a3f';ctx.fillRect(left,sim.groundY,right-left,bottom-sim.groundY+100);ctx.fillStyle='#85928f';ctx.fillRect(left,sim.groundY,right-left,3);ctx.fillStyle='#414c50';ctx.fillRect(left,sim.groundY+3,right-left,11);
    ctx.strokeStyle='#222d34';ctx.lineWidth=2;for(let x=Math.floor(left/35)*35;x<right;x+=35){ctx.beginPath();ctx.moveTo(x,sim.groundY+15);ctx.lineTo(x+22,sim.groundY+37);ctx.stroke();}
    ctx.strokeStyle='#465357';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,sim.groundY+38);ctx.lineTo(right,sim.groundY+38);ctx.stroke();
    for(const x of [0,2600]){ctx.fillStyle='#3d494e';ctx.fillRect(x-8,-370,16,1020);}
    if(set.decals)for(const st of sim.stains){if(st.x+st.r<left||st.x-st.r>right)continue;
      if(st.scorch){ctx.globalAlpha=.8;ctx.drawImage(glowSprite('scorch','11,13,14',1),st.x-st.r,st.y-3.5,st.r*2,7);ctx.globalAlpha=1;continue;}
      if(set.noGore&&!st.oil)continue;const wet=st.wet||0,fade=set.stainLifetime?clamp((set.stainLifetime-(st.age||0))/8,0,1):1;ctx.globalAlpha=.9*fade;ctx.fillStyle=stainColor(wet,st.oil);ctx.beginPath();
      if(st.wall){ctx.ellipse(st.x,st.y,2.6,st.r,0,0,7);ctx.fill();ctx.fillRect(st.x-.8,st.y,1.6,st.r*(2.2-wet)*1.4);} // a run down the wall that lengthens as it dries
      else{const ry=Math.min(4.2,1.4+st.r*.07);ctx.ellipse(st.x,st.y,st.r,ry,0,0,7);ctx.fill();}
    }ctx.globalAlpha=1;
    fillers.clear();for(const c of sim.joints){if(c.plugin.joint){fillers.set(c.bodyB,c);continue;}if(c.plugin.pierce||c.plugin.hold)continue;const a=Constraint.pointAWorld(c),b=Constraint.pointBWorld(c);ctx.strokeStyle='#c8b889';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.fillStyle='#d0c6aa';for(const p of [a,b]){ctx.beginPath();ctx.arc(p.x,p.y,3,0,7);ctx.fill();}}
    // A lodged blade is drawn first, so the body hides the part inside it and the point shows out the far side.
    // Profile bodies are layered: lodged blades, far arm and leg, objects, trunk and head, near leg and arm, things in the near hand. The sort is stable, so parts keep their order within a layer.
    drawList.length=0;for(const b of sim.bodies)drawList.push(b);drawList.sort((a,b)=>BodyArt.layer(a.plugin)-BodyArt.layer(b.plugin));
    for(const b of drawList){const p=b.plugin;if(b.bounds.max.x<left||b.bounds.min.x>right||b.bounds.max.y<top||b.bounds.min.y>bottom)continue;
      // Contact shadow anchors objects in the chamber.
      if(set.shadows&&b.position.y>520){ctx.fillStyle='#10191d30';ctx.beginPath();ctx.ellipse(b.position.x,sim.groundY-1,Math.max(5,(p.w||p.r*2||20)*.5),3,0,0,7);ctx.fill();}
      {const c=fillers.get(b);if(c)BodyArt.filler(ctx,c,Constraint.pointAWorld(c),Constraint.pointBWorld(c));}
      ctx.save();ctx.translate(b.position.x,b.position.y);ctx.rotate(b.angle);if(p.flip)ctx.scale(-1,1);const growing=p.grow!==undefined;
      if(growing){const g=1-Math.pow(1-clamp(p.grow/(p.kind==='human'?.3:1),.02,1),3),/* a human part is full size a third of the way in: the rest of the time is flesh, then skin, closing over the bone */ax=p.flip?-p.growFrom.x:p.growFrom.x;ctx.translate(ax,p.growFrom.y);ctx.scale(g,g);ctx.translate(-ax,-p.growFrom.y);}
      if(p.kind==='human'&&p.part){const look=looks.get(p.entityId)||REMAINS;look.noGore=set.noGore;look.time=sim.time;look.char=p.char||0;if(look.breath&&(p.slot===2||p.slot===3)){ctx.save();ctx.scale(1+look.breath,1+look.breath*.5);BodyArt.draw(ctx,b,look);ctx.restore();}else BodyArt.draw(ctx,b,look);
        // for a second or two after a limb comes off, strands hang and swing from the stump
        if(!set.noGore)for(const end of p.severed||[])if(end.fresh>0){ctx.strokeStyle='#8a2830';ctx.lineWidth=.9;ctx.globalAlpha=Math.min(1,end.fresh);for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(end.x+i*2.2,end.y);ctx.quadraticCurveTo(end.x+i*3+Math.sin(sim.time*9+i)*2.5,end.y+4,end.x+i*2.6+Math.sin(sim.time*7+i*2)*3.5,end.y+7+i);ctx.stroke();}ctx.globalAlpha=1;}}
      else drawObject(ctx,p.kind,p,sim.time);
      // A growing part starts raw and wet and settles into skin; a grafted body glows while the surge runs through it.
      if(growing){ctx.beginPath();ctx.roundRect(-p.w/2,-p.h/2,p.w,p.h,4);if(p.kind!=='human'){ctx.globalAlpha=(1-p.grow)*.7;ctx.fillStyle='#7fe3ff';ctx.fill();ctx.globalAlpha=1;}ctx.strokeStyle=`rgba(150,255,210,${(1-p.grow)*.3})`;ctx.lineWidth=6;ctx.stroke();ctx.strokeStyle=`rgba(190,255,230,${1-p.grow})`;ctx.lineWidth=1.5;ctx.stroke();}
      if(p.surge){const pulse=p.surge*(.65+.35*Math.sin(sim.time*40));ctx.beginPath();ctx.roundRect(-(p.w||20)/2-1,-(p.h||20)/2-1,(p.w||20)+2,(p.h||20)+2,4);ctx.strokeStyle=`rgba(120,230,255,${Math.min(.35,pulse*.35)})`;ctx.lineWidth=8;ctx.stroke();ctx.strokeStyle=`rgba(200,250,255,${Math.min(1,pulse)})`;ctx.lineWidth=2;ctx.stroke();}
      if(p.stains?.length&&set.decals){ctx.save();if(p.flip)ctx.scale(-1,1);if(p.part&&p.material==='flesh')BodyArt.trace(ctx,p);else{ctx.beginPath();if(p.r)ctx.arc(0,0,p.r,0,7);else ctx.roundRect(-(p.w||24)/2,-(p.h||24)/2,p.w||24,p.h||24,3);}ctx.clip(); /* blood on skin stops at the skin's edge */
        for(const st of p.stains){if(set.noGore&&!st.oil)continue;ctx.globalAlpha=p.part?.7:.88;ctx.fillStyle=stainColor(st.wet||0,st.oil);ctx.beginPath();ctx.ellipse(st.x,st.y,st.r*(.75+hash(st.x*3.1+st.y)*.5),st.r*(1+(1-(st.wet||0))*.6),-b.angle,0,7);ctx.fill();
          // a splat, not a dot: a couple of satellite droplets thrown off it, placed by where it landed
          for(let k=0;k<2;k++){const a=hash(st.x+st.y*2.3+k)*6.28,d=st.r*(1.5+hash(st.y+k*5)*1.2);ctx.beginPath();ctx.arc(st.x+Math.cos(a)*d,st.y+Math.sin(a)*d,st.r*.28,0,7);ctx.fill();}}ctx.restore();} // they sag downward as they dry: the long axis stays vertical in the world
      if(p.char&&p.kind!=='human'){ctx.fillStyle=`rgba(14,11,9,${Math.min(.8,p.char*.85)})`;ctx.beginPath();if(p.r)ctx.arc(0,0,p.r,0,7);else ctx.roundRect(-(p.w||24)/2,-(p.h||24)/2,p.w||24,p.h||24,2);ctx.fill();}
      if(p.heat>100&&p.kind!=='human'){ctx.fillStyle=`rgba(219,99,49,${Math.min(.55,(p.heat-100)/1000)})`;ctx.fillRect(-(p.w||24)/2,-(p.h||24)/2,p.w||24,p.h||24);}
      if(b.isStatic){ctx.fillStyle='#acd4e9';ctx.fillRect(-2,-2,4,4);}
      if(p.charge>.05){ctx.strokeStyle='#a7d9e8';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-8,-15);ctx.lineTo(4,-4);ctx.lineTo(-4,4);ctx.lineTo(7,17);ctx.stroke();}
      ctx.restore();
    }
    ctx.globalCompositeOperation='lighter';for(const b of sim.bodies)if(b.plugin.burning&&b.bounds.max.x>left&&b.bounds.min.x<right)fireGlow(b);drawFire(state.paused?0:frameDt*state.speed,left,right);ctx.globalCompositeOperation='source-over';
    if(set.particles!=='Off')for(let i=0;i<sim.particles.length;i++){const p=sim.particles[i];if((set.particles==='Low'&&i%2)||(set.noGore&&p.type==='blood'))continue;const age=1-clamp(p.life/p.maxLife,0,1);
      if(p.type==='smoke'){const r=p.size*(1+2.2*age);ctx.globalAlpha=1-age;ctx.drawImage(glowSprite('smoke','38,38,40',.36),p.x-r,p.y-r,r*2,r*2);ctx.globalAlpha=1;continue;}
      if(p.type==='ember'){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=1-age*age;ctx.fillStyle=age<.5?'#ffd98a':'#ff8a3c';ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;continue;}
      ctx.globalAlpha=1-age;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size*.8,0,7);ctx.fill();}ctx.globalAlpha=1;
    for(const f of sim.flashes){const t=1-f.life/f.maxLife;if(f.grow||f.surge){const tint=f.grow?'150,255,205':'130,235,255';for(const lag of f.surge?[]:[0]){ // the graft surge has no ring: just the core flash, arcs and sparks
      const k=clamp(t-lag,0,1);if(!k)continue;ctx.strokeStyle=`rgba(${tint},${(1-k)*.9})`;ctx.lineWidth=(f.surge?7:3)*(1-k)+1;ctx.beginPath();ctx.arc(f.x,f.y,f.radius*(1-Math.pow(1-k,3)),0,7);ctx.stroke();ctx.strokeStyle=`rgba(${tint},${(1-k)*.18})`;ctx.lineWidth*=3.5;ctx.stroke();}const core=ctx.createRadialGradient(f.x,f.y,0,f.x,f.y,f.radius*.6);core.addColorStop(0,`rgba(255,255,255,${(1-t)*(f.surge?.7:.35)})`);core.addColorStop(1,`rgba(${tint},0)`);ctx.fillStyle=core;ctx.beginPath();ctx.arc(f.x,f.y,f.radius*.6,0,7);ctx.fill();continue;}ctx.strokeStyle=`rgba(236,192,116,${1-t})`;ctx.lineWidth=5*(1-t)+1;ctx.beginPath();ctx.arc(f.x,f.y,f.radius*t,0,7);ctx.stroke();const gradient=ctx.createRadialGradient(f.x,f.y,0,f.x,f.y,Math.max(1,f.radius*t));gradient.addColorStop(0,`rgba(255,220,156,${(1-t)*.55})`);gradient.addColorStop(1,'rgba(226,133,62,0)');ctx.fillStyle=gradient;ctx.fill();}
    for(const t of sim.traces){if(t.bolt)continue;if(t.electric){drawElectric(t);continue;}if(!set.tracers)continue;ctx.globalAlpha=t.life/t.maxLife;ctx.strokeStyle='#f0cd84';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(t.from.x,t.from.y);ctx.lineTo(t.to.x,t.to.y);ctx.stroke();}ctx.globalAlpha=1;
    if(sim.drag){ctx.strokeStyle='#cbb78588';ctx.lineWidth=1;const p=Constraint.pointBWorld(sim.drag);ctx.beginPath();ctx.moveTo(sim.drag.pointA.x,sim.drag.pointA.y);ctx.lineTo(p.x,p.y);ctx.stroke();}
    if(state.graftStump&&sim.bodies.includes(state.graftStump)){const g=state.graftStump.position,pulse=10+Math.sin(sim.time*9)*3;ctx.strokeStyle='#8fe9ff';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(g.x,g.y,pulse+8,0,7);ctx.stroke();ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(g.x,g.y);ctx.lineTo(state.worldPointer.x,state.worldPointer.y);ctx.stroke();ctx.setLineDash([]);}
    if(state.ropeStart){ctx.strokeStyle='#dec58e';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(state.ropeStart.point.x,state.ropeStart.point.y);ctx.lineTo(state.worldPointer.x,state.worldPointer.y);ctx.stroke();ctx.setLineDash([]);}
    if(state.inside&&state.spawn&&!state.down){ctx.save();ctx.globalAlpha=.3;ctx.translate(state.worldPointer.x,state.worldPointer.y);ctx.rotate(state.rotation);if(state.spawn==='human'||state.spawn==='android'){Sandbox.ANATOMY.map((row,slot)=>[...row,slot]).sort((a,b)=>BodyArt.layer({part:a[0],slot:a[5]})-BodyArt.layer({part:b[0],slot:b[5]})).forEach(([part,x,y,w,h,slot])=>{ctx.save();ctx.translate(x,y);drawObject(ctx,state.spawn,{part,slot,w,h,hp:100});ctx.restore();});}else drawObject(ctx,state.spawn);ctx.restore();}
    if(state.inside&&['blast','fire','shock','heal','revive','partial','regrow','reattach','graft','dismember'].includes(state.tool)){ctx.strokeStyle=state.tool==='blast'?'#e3b07966':'#c6d9d977';ctx.lineWidth=1/camera.zoom;ctx.setLineDash([4,5]);ctx.beginPath();ctx.arc(state.worldPointer.x,state.worldPointer.y,state.tool==='blast'?175:24,0,7);ctx.stroke();ctx.setLineDash([]);}
    if(!set.floodlights)darkness();
    ctx.restore();weather();
    // Gentle edge falloff adds depth without obscuring the simulation.
    if(set.vignette){const vignette=ctx.createRadialGradient(width/2,height/2,Math.min(width,height)*.25,width/2,height/2,Math.max(width,height)*.7);vignette.addColorStop(0,'#101a2000');vignette.addColorStop(1,'#101a2044');ctx.fillStyle=vignette;ctx.fillRect(0,0,width,height);}
    // A strike lights the sky, brightest around the channel, and the channel itself is drawn last so rain, fog and the dark never bury it.
    for(const t of sim.traces){if(!t.bolt)continue;const light=strokeLight(t);if(light<.02)continue;const x=(t.to.x-camera.x)*camera.zoom+width/2,reach=Math.max(width,height)*1.3;ctx.globalAlpha=Math.min(1,light);ctx.drawImage(glowSprite('sky','195,215,255',.55),x-reach,height*.3-reach,reach*2,reach*2);ctx.globalAlpha=Math.min(.12,light*.1);ctx.fillStyle='#b4c8ff';ctx.fillRect(0,0,width,height);ctx.globalAlpha=1;
      ctx.save();ctx.translate(width/2,height/2);ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x,-camera.y);drawElectric(t);ctx.restore();}
  }
  const spawned=[];
  function place(point,flip=false){const e=sim.spawn(state.spawn,point.x,point.y,flip);if(!e){toast('Chamber is full — delete some objects first.');return;}if(state.rotation){const center={x:point.x,y:point.y};for(const b of e.bodies)Body.rotate(b,state.rotation,center);}spawned.push(e);if(spawned.length>50)spawned.shift();sound('impact',.1);}
  function perform(point,continuous=false){const body=sim.bodyAt(point);
    switch(state.tool){case'grab':if(!continuous){select(body);if(body){sim.beginDrag(body,point);canvas.style.cursor='grabbing';}}break;
      case'rope':if(!continuous){if(!state.ropeStart){state.ropeStart={body,point:{...point}};toast('Choose the other end of the rope.');}else{const a=state.ropeStart;if(!a.body&&!body){toast('At least one end must attach to an object.');}else{const c=sim.rope(a.body,body,a.point,point);if(c)spawned.push({rope:c});toast('Rope connected');}state.ropeStart=null;}}break;
      case'freeze':if(!continuous&&body){select(body);toast(sim.freeze(body)?'Body frozen':'Body released');}break;
      // Point blank: the shot starts just outside whatever is under the cursor, so it hits that and not the first thing on a long line from the left.
      case'shoot':if(performance.now()-lastShot>120){const from={x:(body?body.bounds.min.x:point.x)-8,y:point.y-1};sim.shoot(from,{x:from.x+100,y:point.y+.5});lastShot=performance.now();}break;
      case'fire':if(body)sim.ignite(body);break;
      case'shock':if(body&&performance.now()-lastAction>180){sim.shock(body);lastAction=performance.now();}break;
      case'blast':if(!continuous)sim.explode(point.x,point.y);break;
      case'heal':if(body){sim.heal(body);select(body);}break;
      case'revive':if(body&&!continuous){toast(sim.revive(body)?'Revived':'Only humans and androids can be revived');select(body);}break;
      case'clot':if(body&&!continuous){const n=sim.stopBleeding(body);toast(n?'Bleeding stopped':'Nothing is bleeding');select(body);}break;
      case'bandage':if(body&&!continuous){const n=sim.bandage(body);toast(n?`Bandaged ${n} wound${n>1?'s':''}`:'No open wound on that part');select(body);}break;
      case'partial':if(body&&!continuous){toast(sim.partialRevive(body)?'Revived, wounds and all':'Only humans and androids can be revived');select(body);}break;
      case'regrow':if(body&&!continuous){const n=sim.regenerate(body);toast(n?`Regrowing ${n} part${n>1?'s':''}…`:body.plugin.part?'Nothing is missing':'Only ragdolls regrow');}break;
      case'reattach':if(body&&!continuous){const n=sim.reattach(body);toast(n?`Reattached ${n} piece${n>1?'s':''}`:body.plugin.part?'Nothing to reattach here — the place may already be taken':'Only ragdoll parts reattach');}break;
      case'graft':if(!continuous){if(!body?.plugin.part){state.graftStump=null;toast('Click a ragdoll part to build on.');}else if(!state.graftStump||!sim.bodies.includes(state.graftStump)){state.graftStump=body;toast('Now click the loose limb to graft on.');}
        else{const problem=sim.graft(state.graftStump,body);toast(problem||'Grafted. Power surge!');state.graftStump=null;}}break;
      case'dismember':if(body&&!continuous){const cut=sim.dismember(body);toast(cut?`Severed at the ${cut}`:body.plugin.part?'Nothing left to cut there':'Only ragdoll limbs come off');}break;
      case'delete':if(body){sim.removeEntity(body);select(null);}break;
    }
  }
  const trail=[]; // the last few cursor positions with their times, for the throw
  function throwVelocity(){const now=performance.now(),recent=trail.filter(t=>now-t.t<90);if(recent.length<2)return null;const a=recent[0],b=recent[recent.length-1],ms=Math.max(8,b.t-a.t);return {x:(b.x-a.x)/ms*16.67,y:(b.y-a.y)/ms*16.67};}
  function pointer(e){const r=canvas.getBoundingClientRect();state.pointer={x:e.clientX-r.left,y:e.clientY-r.top};state.worldPointer=toWorld(state.pointer);$('#coordinates').textContent=`x ${Math.round(state.worldPointer.x)} : y ${Math.round(state.worldPointer.y)}`;trail.push({x:state.worldPointer.x,y:state.worldPointer.y,t:performance.now()});if(trail.length>8)trail.shift();return state.worldPointer;}
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0&&e.button!==1&&e.button!==2)return;canvas.focus();canvas.setPointerCapture(e.pointerId);pointer(e);state.inside=true;if(e.button===2||e.button===1||state.shift){state.pan={x:e.clientX,y:e.clientY,cx:camera.x,cy:camera.y};canvas.style.cursor='grabbing';return;}state.down=true;perform(state.worldPointer);});
  canvas.addEventListener('pointermove',e=>{pointer(e);state.inside=true;if(state.pan){camera.x=state.pan.cx-(e.clientX-state.pan.x)/camera.zoom;camera.y=state.pan.cy-(e.clientY-state.pan.y)/camera.zoom;return;}if(sim.drag){const body=sim.drag.bodyB,target=Vector.sub(state.worldPointer,sim.drag.pointB);if(state.paused)sim.translateConnected(body,Vector.sub(target,body.position));else if(body.isStatic)Body.setPosition(body,target);sim.moveDrag(state.worldPointer);}});
  function release(){state.down=false;state.pan=null;sim.endDrag(state.paused?null:throwVelocity());canvas.style.cursor=state.tool!=='grab'?'crosshair':'grab';}
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);canvas.addEventListener('pointerleave',()=>state.inside=false);window.addEventListener('blur',()=>{release();state.shift=false;held.clear();});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('dblclick',e=>{const b=sim.bodyAt(pointer(e));if(b&&state.tool==='grab')toast(sim.activate(b));});
  function zoom(factor,p={x:width/2,y:height/2}){const before=toWorld(p);camera.zoom=clamp(camera.zoom*factor,.2,3);const after=toWorld(p);camera.x+=before.x-after.x;camera.y+=before.y-after.y;updateZoom();}
  canvas.addEventListener('wheel',e=>{e.preventDefault();pointer(e);zoom(Math.exp(-e.deltaY*.0015*sim.settings.zoomSensitivity),state.pointer);},{passive:false});
  function setPaused(value){state.paused=value;$('#play-btn').textContent=value?'▶':'Ⅱ';$('#play-btn').setAttribute('aria-label',value?'Play simulation':'Pause simulation');$('#pause-overlay').hidden=!value;$('#simulation-badge').innerHTML=`<i style="background:${value?'#cfb27c':'#91bba6'}"></i> ${value?'Simulation paused':'Simulation live'}`;$('#step-btn').disabled=!value;}
  function loadPreset(name){sim.loadPreset(name);state.selected=null;state.ropeStart=null;$('#scene-name').textContent=$('#scene-select').selectedOptions[0].textContent;reflectSettings();setPaused(false);fit();updateSelection();}
  $('#play-btn').onclick=()=>setPaused(!state.paused);$('#step-btn').onclick=()=>{if(state.paused)sim.step();};
  document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>setSpeed(Number(b.dataset.speed)));
  $('#gravity').onchange=e=>{if(e.target.value==='custom')return;applySettings({gravity:Number(e.target.value)*9.81});toast(e.target.selectedOptions[0].textContent+' gravity');};
  $('#sound-btn').onclick=()=>{applySettings({sound:!sim.settings.sound});if(sim.settings.sound)sound('impact',.2);};
  $('#zoom-in').onclick=()=>zoom(1.2);$('#zoom-out').onclick=()=>zoom(1/1.2);$('#zoom-reset').onclick=fit;
  $('#scene-select').onchange=e=>loadPreset(e.target.value);$('#reset-btn').onclick=()=>{loadPreset($('#scene-select').value);toast('Scene reset');};$('#clear-btn').onclick=()=>{sim.clear();select(null);state.ropeStart=null;toast('Chamber cleared');};
  $('#clear-fire-btn').onclick=()=>{const n=sim.clearFire();toast(n?`Put out ${n} fire${n>1?'s':''}`:'Nothing is burning');};
  $('#clear-dead-btn').onclick=()=>{const n=sim.clearDead();select(null);toast(n?'Cleared the dead and the debris':'Nothing dead to clear');};
  $('#clear-objects-btn').onclick=()=>{const n=sim.clearObjects();select(null);toast(n?`Cleared ${n} object${n>1?'s':''}; ragdolls stay`:'No objects to clear');};
  $('#save-btn').onclick=()=>{try{const data=sim.serialize();localStorage.setItem('sandbox-lab-scene',JSON.stringify({...data,camera:{...camera},savedAt:new Date().toISOString()}));toast('Scene saved on this device');}catch{toast('Could not save. Browser storage may be full or disabled.');}};
  $('#load-btn').onclick=()=>{try{const raw=localStorage.getItem('sandbox-lab-scene');if(!raw){toast('No saved scene yet. Build something and save it first.');return;}const data=JSON.parse(raw);sim.restore(data);state.selected=null;state.ropeStart=null;if(data.camera&&[data.camera.x,data.camera.y,data.camera.zoom].every(Number.isFinite))Object.assign(camera,data.camera);$('#scene-select').value=sim.scene;$('#scene-name').textContent='Saved experiment';applySettings({});setPaused(true);updateZoom();toast('Scene loaded — paused so you can pick up where you left off.');}catch{toast('Could not load this saved scene. Your current scene was kept if validation failed.');}};
  // ---- Settings. The page is generated from the engine's SETTINGS table, so adding a row there adds a control here.
  const {SETTINGS}=Sandbox,STORE='sandbox-lab-settings',DEFAULTS=Sandbox.defaults(),GAMEPLAY=['World','Ragdolls','Gore','Weapons','Physics'];
  const PRESETS=[
    {name:'Default',note:'Everything as shipped',values:{}},
    {name:'Realistic',note:'Fragile bodies, long knockdowns, slow healing',values:{fragility:1.6,bleedRate:1.5,stunScale:1.8,getUpTime:2.4,brainDamage:true,slowHealing:true,limbCrush:true,jointStrength:.8,bulletDamage:80}},
    {name:'Glass dolls',note:'A stiff breeze takes a limb off',values:{fragility:6,jointStrength:.3,limbCrush:true,crushSensitivity:300,extraGunshot:true,stunScale:2}},
    {name:'Invincible',note:'Nearly unbreakable, never bleeds out',values:{fragility:.1,jointStrength:5,bleedRate:0,stunScale:.3,getUpTime:.4,legStrength:3.5}},
    {name:'Moon base',note:'Low gravity, no air',values:{gravity:1.62,airDrag:0}},
    {name:'Thunderstorm',note:'Dark, wet and dangerous',values:{rain:true,fog:true,floodlights:false,lightning:45,ambient:8}},
    {name:'Blizzard',note:'Frozen, brittle and slippery',values:{snow:true,fog:true,ambient:-60}},
    {name:'Overkill',note:'Everything hits four times harder',values:{bulletDamage:220,bulletForce:4,explosionPower:3,pierceSpeed:2,limbCrush:true,extraGunshot:true}}
  ];
  const format=(item,value)=>item.type!=='range'?String(value):(+value.toFixed(item.step<.1?2:item.step<1?1:0))+item.unit;
  function applySettings(values){sim.configure(values);try{localStorage.setItem(STORE,JSON.stringify({version:2,...Object.fromEntries(SETTINGS.filter(i=>sim.settings[i.id]!==i.def).map(i=>[i.id,sim.settings[i.id]]))}));}catch{/* private mode: settings last for this visit only */}reflectSettings();}
  // Everything outside the canvas that mirrors a setting.
  function reflectSettings(){const set=sim.settings;$('#fps').hidden=!set.showFps;$('#tool-caption').hidden=!set.hints;$('#sound-btn').textContent=set.sound?'Sound on':'Sound off';$('#sound-btn').setAttribute('aria-pressed',String(set.sound));
    const preset=[...$('#gravity').options].find(o=>o.value!=='custom'&&Math.abs(Number(o.value)*9.81-set.gravity)<.02);$('#gravity').value=preset?preset.value:'custom';$('#gravity-custom').textContent=`Custom (${format(SETTINGS[0],set.gravity).trim()})`;
    for(const row of document.querySelectorAll('.set-row')){const item=SETTINGS.find(i=>i.id===row.dataset.id),value=set[item.id],input=row.querySelector('.set-input');
      if(item.type==='toggle')input.setAttribute('aria-checked',String(value));else input.value=value;if(item.type==='range')row.querySelector('output').textContent=format(item,value);
      row.querySelector('.set-reset').hidden=value===item.def;row.classList.toggle('changed',value!==item.def);}
    const changed=SETTINGS.filter(i=>set[i.id]!==i.def).length;$('#settings-changed').textContent=changed?`${changed} changed from default`:'All defaults';
    for(const b of document.querySelectorAll('.preset'))b.classList.toggle('active',GAMEPLAY.every(sec=>SETTINGS.filter(i=>i.section===sec).every(i=>set[i.id]===(PRESETS[b.dataset.preset].values[i.id]??i.def))));}
  function buildSettings(){const nav=$('#settings-nav'),body=$('#settings-body'),sections=[...new Set(SETTINGS.map(i=>i.section))];
    PRESETS.forEach((preset,index)=>{const b=document.createElement('button');b.className='preset';b.dataset.preset=index;b.innerHTML=`<strong></strong><span></span>`;b.children[0].textContent=preset.name;b.children[1].textContent=preset.note;
      // A preset replaces the gameplay sections and leaves how the game looks, sounds and handles alone.
      b.onclick=()=>{applySettings({...Object.fromEntries(SETTINGS.filter(i=>GAMEPLAY.includes(i.section)).map(i=>[i.id,i.def])),...preset.values});toast(preset.name+' preset applied');};$('#settings-presets').appendChild(b);});
    for(const section of sections){const link=document.createElement('button');link.textContent=section;link.dataset.section=section;link.onclick=()=>document.getElementById('set-'+section).scrollIntoView({behavior:'smooth',block:'start'});nav.appendChild(link);
      const group=document.createElement('section');group.id='set-'+section;group.innerHTML=`<header><h3></h3><button class="section-reset">Reset section</button></header>`;group.querySelector('h3').textContent=section;
      group.querySelector('.section-reset').onclick=()=>applySettings(Object.fromEntries(SETTINGS.filter(i=>i.section===section).map(i=>[i.id,i.def])));
      for(const item of SETTINGS.filter(i=>i.section===section)){const row=document.createElement('div');row.className='set-row';row.dataset.id=item.id;row.dataset.search=(item.label+' '+item.help+' '+section).toLowerCase();
        const control=item.type==='range'?`<input class="set-input" id="s-${item.id}" type="range" min="${item.min}" max="${item.max}" step="${item.step}"><output for="s-${item.id}"></output>`:item.type==='toggle'?`<button class="set-input switch" id="s-${item.id}" role="switch" aria-checked="false"><i></i></button>`:`<select class="set-input" id="s-${item.id}">${item.options.map(o=>`<option>${o}</option>`).join('')}</select>`;
        row.innerHTML=`<div class="set-text"><label for="s-${item.id}"></label><p></p></div><div class="set-control">${control}<button class="set-reset" title="Reset to default" aria-label="Reset to default" hidden>↺</button></div>`;row.querySelector('label').textContent=item.label;row.querySelector('p').textContent=item.help;
        const input=row.querySelector('.set-input');if(item.type==='range'){input.oninput=()=>applySettings({[item.id]:Number(input.value)});input.ondblclick=()=>applySettings({[item.id]:item.def});}
        else if(item.type==='toggle')input.onclick=()=>applySettings({[item.id]:!sim.settings[item.id]});else input.onchange=()=>applySettings({[item.id]:input.value});
        row.querySelector('.set-reset').onclick=()=>applySettings({[item.id]:item.def});group.appendChild(row);}
      body.appendChild(group);}
    $('#settings-search').oninput=e=>{const query=e.target.value.trim().toLowerCase();let shown=0;for(const group of body.children){let any=false;for(const row of group.querySelectorAll('.set-row')){row.hidden=!row.dataset.search.includes(query);any||=!row.hidden;shown+=!row.hidden;}group.hidden=!any;}$('#settings-empty').hidden=shown>0;};
    body.onscroll=()=>{const current=[...body.children].filter(g=>!g.hidden&&g.offsetTop-body.scrollTop<=40).pop();for(const b of nav.children)b.classList.toggle('active',b.dataset.section===current?.id.slice(4));};
    const dialog=$('#settings-dialog');$('#settings-btn').onclick=()=>{dialog.showModal();body.onscroll();};$('#close-settings').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
    $('#settings-reset').onclick=()=>{applySettings(DEFAULTS);toast('All settings reset');};
    $('#settings-export').onclick=()=>{const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(sim.settings,null,2)],{type:'application/json'}));link.download='sandbox-lab-settings.json';link.click();URL.revokeObjectURL(link.href);};
    // An imported file is untrusted: configure() keeps only known ids with values inside their ranges.
    $('#settings-import').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>100000)throw 0;const values=JSON.parse(await file.text());if(!values||typeof values!=='object')throw 0;const kept=Object.keys(Sandbox.sanitize(values)).length;applySettings(values);toast(`Imported ${kept} settings`);}catch{toast('That file is not a settings export.');}};
  }
  buildSettings();try{const saved=JSON.parse(localStorage.getItem(STORE)||'{}');if(saved.version!==2)for(const id of ['pierceSpeed','bladeGrip','shadows'])delete saved[id]; /* version 1 stored every value, so old defaults would otherwise stick for ever */ sim.configure(saved);}catch{/* corrupt or unavailable storage: defaults */}reflectSettings();
  const help=$('#help-dialog');function showHelp(){if(!help.open)help.showModal();}$('#help-btn').onclick=showHelp;$('#more-help').onclick=showHelp;$('#close-help').onclick=()=>help.close();$('#start-btn').onclick=()=>help.close();help.addEventListener('click',e=>{if(e.target===help){const r=help.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)help.close();}});
  $('#deselect-btn').onclick=()=>select(null);$('#freeze-selection').onclick=()=>{sim.freeze(state.selected);updateSelection();};$('#activate-selection').onclick=()=>{toast(sim.activate(state.selected));updateSelection();};$('#delete-selection').onclick=()=>{sim.removeEntity(state.selected);select(null);};
  $('#search').addEventListener('input',renderCatalog);
  // Category tabs come from the item table; one with nothing in it yet is left out.
  for(const name of ['all',...Sandbox.CATEGORIES.filter(cat=>CATALOG.some(i=>i.category===cat))]){const b=document.createElement('button');b.dataset.category=name;b.textContent=name==='all'?'All':name;b.classList.toggle('active',name==='all');b.onclick=()=>{state.category=name;document.querySelectorAll('[data-category]').forEach(x=>x.classList.toggle('active',x===b));renderCatalog();};$('#categories').appendChild(b);}
  // Keys follow People Playground's defaults: A/D rotate (Q/E too while something is held), Q/E spawn facing left/right, F activate, G slow motion, S detail, Space pause, Backspace delete, Tab hides the UI, arrows pan, Z undoes a spawn.
  const held=new Set();let rotateTime=0;
  const target=()=>sim.drag?.bodyB||(state.inside&&sim.bodyAt(state.worldPointer))||state.selected;
  function setSpeed(value){state.speed=value;document.querySelectorAll('[data-speed]').forEach(el=>el.classList.toggle('active',Number(el.dataset.speed)===value));}
  window.addEventListener('keydown',e=>{
    if(e.key==='Shift')state.shift=true;if(help.open||$('#settings-dialog').open||e.ctrlKey||e.metaKey||e.altKey)return;if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
    const key=e.key.length===1?e.key.toLowerCase():e.key;
    if(['a','d','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)||(sim.drag&&(key==='q'||key==='e'))){e.preventDefault();held.add(key);return;}
    if(e.code==='Space'||key==='Tab'||key==='Backspace')e.preventDefault();if(e.repeat)return;
    const t=TOOLS.find(t=>t.key===key);if(t){setTool(t.id);return;}
    if(e.code==='Space')setPaused(!state.paused);
    else if(key==='Tab')document.body.classList.toggle('ui-hidden');
    else if(key==='Escape'){if(state.spawn)chooseSpawn(state.spawn);setTool('grab');select(null);}
    else if(key==='g'){setSpeed(state.speed===1?sim.settings.slowMotion/100:1);toast(state.speed===1?'Normal speed':'Slow motion');}
    else if(key==='f'){const b=target();if(b){const said=sim.activate(b);if(said)toast(said);held.add('f');}} /* kept down, an automatic weapon keeps firing: see heldKeys */
    else if(key==='s'){const b=state.inside&&sim.bodyAt(state.worldPointer);select(b&&b!==state.selected?b:null);}
    else if(key==='q'||key==='e'){if(state.spawn&&state.inside)place(state.worldPointer,key==='q');else if(!state.spawn)toast('Pick an object from the library first.');}
    else if(key==='r'){const b=target();if(b&&sim.flip(b))toast(b.plugin.part?'Turned round':'Flipped');}
    else if(key==='z'){let e;while((e=spawned.pop())&&!(e.rope?sim.joints.includes(e.rope):sim.entities.includes(e)));if(e?.rope){sim.unrope(e.rope);toast('Rope undone');}else if(e){sim.removeEntity(e.bodies[0]);select(null);toast('Spawn undone');}}
    else if(key==='Delete'||key==='Backspace'){if(state.selected){sim.removeEntity(state.selected);select(null);}}
  });window.addEventListener('keyup',e=>{if(e.key==='Shift')state.shift=false;held.delete(e.key.length===1?e.key.toLowerCase():e.key);});
  // Held keys act every frame: rotation accelerates the longer A/D is down (faster with Shift), and the grab keeps the angle on release.
  function heldKeys(seconds){if(held.has('f')&&!state.paused){const b=target();if(b)sim.activate(b,true);}
    if(!sim.drag){held.delete('q');held.delete('e');}
    const turn=(held.has('d')||held.has('e')?1:0)-(held.has('a')||held.has('q')?1:0);rotateTime=turn?rotateTime+seconds:0;
    // What turns: the held body first, then the spawn preview, then the selection.
    if(turn){const amount=turn*seconds*Math.min(6,1.2+rotateTime*3)*(state.shift?2.5:1);if(sim.drag)sim.rotate(sim.drag.bodyB,amount,state.paused);else if(state.spawn)state.rotation+=amount;else if(state.selected)sim.rotate(state.selected,amount,state.paused);}
    const px=(held.has('ArrowRight')?1:0)-(held.has('ArrowLeft')?1:0),py=(held.has('ArrowDown')?1:0)-(held.has('ArrowUp')?1:0),pace=700*seconds/camera.zoom*(state.shift?2.5:1)*sim.settings.panSpeed;camera.x+=px*pace;camera.y+=py*pace;
  }
  let frameDt=0;
  function frame(now){const elapsed=Math.min(50,now-(lastTime||now));lastTime=now;frameDt=elapsed/1000;heldKeys(elapsed/1000);
    if(!state.paused&&!document.hidden){accumulator+=elapsed*state.speed;let steps=0;while(accumulator>=1000/60&&steps<8){sim.step();accumulator-=1000/60;steps++;}}else accumulator=0;
    if(state.down&&!state.pan&&['shoot','fire','shock'].includes(state.tool))perform(state.worldPointer,true);
    render();frameCount++;if(now-fpsTime>=1000){$('#fps').textContent=Math.min(240,Math.round(frameCount*1000/(now-fpsTime)))+' fps';frameCount=0;fpsTime=now;}
    if(now-uiTime>180){$('#object-count').textContent=sim.entities.length+' objects';$('#joint-count').textContent=sim.joints.length+' joints';updateSelection();updateAnatomyInfo();uiTime=now;}
    requestAnimationFrame(frame);
  }
  new ResizeObserver(()=>{const initial=!width;resize();if(initial)fit();}).observe(stage);
  resize();fit();renderCatalog();sim.loadPreset('workshop');setPaused(false);setTool('grab');requestAnimationFrame(frame);
})();

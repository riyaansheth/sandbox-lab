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
    {id:'shoot',name:'Shoot',symbol:'⌖',key:'4',title:'Take your shot',desc:'Click or hold. Bullets travel from the left toward your cursor.'},
    {id:'fire',name:'Fire',symbol:'♨',key:'5',title:'Turn up the heat',desc:'Click or hold on an object to ignite it.'},
    {id:'shock',name:'Shock',symbol:'ϟ',key:'6',title:'A little electricity',desc:'Click a conductor. Electricity spreads to nearby objects.'},
    {id:'blast',name:'Blast',symbol:'✳',key:'7',title:'Make an impact',desc:'Click anywhere to create an explosion.'},
    {id:'heal',name:'Heal',symbol:'✚',key:'8',title:'Patch it up',desc:'Restore tissue and extinguish. It does not bring anyone back; broken joints stay broken.'},
    {id:'revive',name:'Revive',symbol:'♥',key:'9',title:'Back on your feet',desc:'Click a dead or collapsed ragdoll to bring it back to life and standing.'},
    {id:'delete',name:'Delete',symbol:'⌫',key:'0',title:'Clean up',desc:'Click an object to remove it and its connections.'}
  ];
  let width=0,height=0,dpr=1,toastTimer,lastShot=0,lastAction=0,lastTime=0,accumulator=0,frameCount=0,fpsTime=0,uiTime=0;
  let audio=null,lastImpact=0;
  function sound(type,volume=.2){if(!state.sound)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const now=audio.currentTime;if(type==='impact'&&now-lastImpact<.12)return;if(type==='impact')lastImpact=now;
    const gain=audio.createGain();gain.connect(audio.destination);gain.gain.setValueAtTime(Math.min(.12,volume*.15),now);gain.gain.exponentialRampToValueAtTime(.001,now+.18);
    const oscillator=audio.createOscillator();oscillator.type=type==='electric'?'sawtooth':'triangle';oscillator.frequency.setValueAtTime(type==='explosion'?70:type==='shot'?210:type==='electric'?650:160,now);oscillator.frequency.exponentialRampToValueAtTime(30,now+.2);oscillator.connect(gain);oscillator.start(now);oscillator.stop(now+.22);
  }catch{state.sound=false;$('#sound-btn').textContent='Sound unavailable';}}
  sim.onEffect=(type,volume)=>{sound(type,volume);if(type==='explosion')shake=Math.min(12,volume*8);};
  let shake=0;
  function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2400);}
  function resize(){const r=stage.getBoundingClientRect();width=r.width;height=r.height;dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
  function fit(){camera.x=1220;camera.y=390;camera.zoom=Math.min(width/1040,height/660);camera.zoom=clamp(camera.zoom,.25,1.6);updateZoom();}
  function updateZoom(){$('#zoom-reset').textContent=Math.round(camera.zoom*100)+'%';}
  function toWorld(point){return {x:(point.x-width/2)/camera.zoom+camera.x,y:(point.y-height/2)/camera.zoom+camera.y};}
  function setTool(id){state.tool=id;state.ropeStart=null;sim.endDrag();document.querySelectorAll('.tool').forEach(b=>{b.classList.toggle('active',b.dataset.tool===id);b.setAttribute('aria-pressed',String(b.dataset.tool===id));});const t=TOOLS.find(t=>t.id===id);$('#tool-caption-icon').textContent=t.symbol;$('#tool-caption-name').textContent=t.title;$('#tool-caption-desc').textContent=t.desc;canvas.style.cursor=id==='grab'?'grab':'crosshair';}
  function chooseSpawn(id){state.spawn=state.spawn===id?null:id;state.rotation=0;document.querySelectorAll('.object-card').forEach(b=>b.classList.toggle('active',b.dataset.object===state.spawn));if(state.spawn)toast(CATALOG.find(c=>c.id===id).name+' ready — Q / E places it at the cursor, facing left / right');}
  function select(body){state.selected=body;updateSelection();}
  function updateSelection(){const b=state.selected;if(!b||!sim.bodies.includes(b)){state.selected=null;$('#selection-panel').hidden=true;return;}$('#selection-panel').hidden=false;const p=b.plugin,c=CATALOG.find(c=>c.id===p.kind);$('#selection-name').textContent=(c?.name||'Fragment')+(p.part?' · '+p.part:'');$('#selection-info').innerHTML=`<div class="stat-row"><span>Integrity</span><b>${Math.round(p.hp/p.maxHp*100)}%</b></div><div class="health-bar"><i style="width:${clamp(p.hp/p.maxHp*100,0,100)}%"></i></div><div class="stat-row"><span>Temperature</span><b>${Math.round(p.heat)}°C</b></div><div class="stat-row"><span>State</span><b>${b.isStatic?'Frozen':p.burning?'Burning':p.charge>.1?'Electrified':p.hp<=0?'Broken':p.active?'Active':'Dynamic'}</b></div>`;$('#freeze-selection').textContent=b.isStatic?'Unfreeze':'Freeze';$('#activate-selection').disabled=!['barrel','bomb','gun','thruster','wheel','battery'].includes(p.kind);}
  function updateAnatomyInfo(){const b=state.selected;if(!b||b.plugin.material!=='flesh')return;const e=sim.getEntity(b),p=b.plugin;$('#selection-info').insertAdjacentHTML('beforeend',`<div class="stat-row"><span>Blood volume</span><b>${Math.round(e?.blood??100)}%</b></div><div class="stat-row"><span>Bone integrity</span><b>${Math.round(p.bone??100)}%</b></div><div class="stat-row"><span>Condition</span><b>${e?.alive===false?'Unresponsive':p.bleed>.05?'Bleeding':'Stable'}</b></div>`);}
  function roundRect(c,x,y,w,h,r=2){c.beginPath();c.roundRect(x,y,w,h,r);}
  function humanOutline(c,p){
    const w=p.w||14,h=p.h||30;c.beginPath();
    if(p.part==='head'){c.moveTo(-8,-15);c.bezierCurveTo(-15,-10,-12,5,-7,11);c.lineTo(-3,15);c.lineTo(6,13);c.lineTo(9,8);c.lineTo(10,2);c.lineTo(13,0);c.lineTo(10,-5);c.bezierCurveTo(11,-13,4,-17,-8,-15);}
    else if(p.part==='chest'){c.moveTo(-10,-h/2);c.lineTo(10,-h/2);c.quadraticCurveTo(21,-15,18,-4);c.lineTo(12,h/2);c.quadraticCurveTo(0,h/2+2,-12,h/2);c.lineTo(-18,-4);c.quadraticCurveTo(-21,-15,-10,-h/2);}
    else if(p.part==='abdomen'){c.moveTo(-12,-h/2);c.quadraticCurveTo(-10,0,-13,h/2);c.lineTo(13,h/2);c.quadraticCurveTo(10,0,12,-h/2);}
    else if(p.part==='pelvis'){c.moveTo(-13,-h/2);c.lineTo(13,-h/2);c.quadraticCurveTo(17,0,13,h/2);c.lineTo(4,h/2);c.lineTo(0,h/2-4);c.lineTo(-4,h/2);c.lineTo(-13,h/2);c.quadraticCurveTo(-17,0,-13,-h/2);}
    else if(p.part==='foot'){c.moveTo(-w/2,-h/2);c.lineTo(-1,-h/2);c.lineTo(3,-1);c.quadraticCurveTo(w/2+3,0,w/2,5);c.lineTo(-w/2,5);}
    else if(p.part==='hand'){c.roundRect(-w/2,-h/2,w,h,3);}
    else{const lower=p.part==='thigh'?.66:p.part==='upper arm'?.8:p.part==='shin'?.58:p.part==='forearm'?.64:.9;c.moveTo(-w*.36,-h/2);c.quadraticCurveTo(-w*.58,-h*.22,-w*.45,h*.1);c.lineTo(-w*.5*lower,h/2);c.quadraticCurveTo(0,h/2+2,w*.5*lower,h/2);c.lineTo(w*.45,h*.1);c.quadraticCurveTo(w*.58,-h*.22,w*.36,-h/2);}
    c.closePath();
  }
  function drawAnatomy(c,p,time){
    const w=p.w||14,h=p.h||30,health=p.hp??100,dead=health<=0,char=clamp(((p.heat||20)-180)/600,0,.85);
    humanOutline(c,p);
    const skin=c.createLinearGradient(-w/2,0,w/2,0);skin.addColorStop(0,dead?'#8b7873':'#b48d78');skin.addColorStop(.32,dead?'#b49a8b':'#e1bca2');skin.addColorStop(.7,dead?'#a68c81':'#d6ac91');skin.addColorStop(1,dead?'#776b68':'#967762');
    c.fillStyle=skin;c.fill();c.strokeStyle='#58483e';c.lineWidth=.7;c.stroke();
    c.save();humanOutline(c,p);c.clip();
    // Muscle contours and anatomical landmarks remain subtle until tissue is damaged.
    c.strokeStyle='#8c645850';c.lineWidth=.65;c.beginPath();
    if(p.part==='chest'){c.moveTo(-13,-10);c.quadraticCurveTo(-5,-15,0,-10);c.quadraticCurveTo(5,-15,13,-10);c.moveTo(-13,-2);c.quadraticCurveTo(-7,3,-1,-1);c.moveTo(1,-1);c.quadraticCurveTo(7,3,13,-2);c.moveTo(0,-9);c.lineTo(0,13);}
    else if(p.part==='abdomen'){c.moveTo(0,-10);c.lineTo(0,10);for(let y=-6;y<9;y+=6){c.moveTo(-7,y);c.quadraticCurveTo(0,y+2,7,y);}c.moveTo(-10,-8);c.lineTo(-7,8);c.moveTo(10,-8);c.lineTo(7,8);}
    else if(p.part==='head'){c.moveTo(1,-5);c.lineTo(9,-5);c.moveTo(5,7);c.lineTo(9,7);c.moveTo(1,10);c.lineTo(4,12);}
    else if(p.part==='hand'){for(let x=-2;x<4;x+=2){c.moveTo(x,1);c.lineTo(x,h/2-1);}}
    else{c.moveTo(-w*.16,-h*.27);c.quadraticCurveTo(w*.14,0,-w*.05,h*.3);c.moveTo(-w*.3,h*.35);c.lineTo(w*.3,h*.35);}
    c.stroke();
    if(p.part==='pelvis'){c.fillStyle='#545c59';c.fillRect(-w/2-2,-h/2,w+4,h*.82);c.fillStyle='#717c73';c.fillRect(-w/2,-h/2,w,3);}
    if(p.part==='head'){c.fillStyle='#403b36';c.beginPath();c.moveTo(-13,-3);c.lineTo(-10,-15);c.quadraticCurveTo(3,-20,10,-10);c.lineTo(3,-11);c.lineTo(-4,-7);c.lineTo(-8,2);c.lineTo(-10,3);c.fill();c.fillStyle=dead?'#463d39':'#e9e6d5';c.fillRect(5,-4,4,1.8);if(!dead){c.fillStyle='#373b35';c.fillRect(7,-4,1.3,1.8);}c.strokeStyle='#9c7561';c.beginPath();c.ellipse(-5,1,2,3,0,0,7);c.stroke();}
    for(const wound of p.wounds||[]){
      const r=wound.radius||3,x=wound.x,y=wound.y;c.fillStyle=wound.type==='impact'?'#72425288':'#803039';c.beginPath();c.ellipse(x,y,r*1.65,r*1.3,wound.seed,0,7);c.fill();
      if(wound.type!=='impact'||health<35){c.fillStyle='#65272e';c.beginPath();for(let i=0;i<9;i++){const a=i/9*Math.PI*2,rr=r*(.7+.25*Math.sin(i*2.3+wound.seed));const px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;(i?c.lineTo:c.moveTo).call(c,px,py);}c.closePath();c.fill();c.strokeStyle='#c46861';c.lineWidth=.65;c.stroke();
        c.strokeStyle='#ac4c4c';for(let i=-1;i<=1;i++){c.beginPath();c.moveTo(x-r*.5,y+i*1.5);c.lineTo(x+r*.5,y+i*1.5+.8);c.stroke();}
        if(health<30||(p.bone??100)<35){c.strokeStyle='#d4c7a5';c.lineWidth=1.5;c.beginPath();c.moveTo(x,y-r*.7);c.lineTo(x+.5,y+r*.7);c.stroke();}
      }
    }
    if(health<22&&['chest','abdomen'].includes(p.part)){
      c.fillStyle='#62262ecc';roundRect(c,-w*.28,-h*.32,w*.56,h*.65,5);c.fill();
      if(p.part==='chest'){c.strokeStyle='#cfc1a4';c.lineWidth=1.4;for(let y=-10;y<=9;y+=5){c.beginPath();c.moveTo(-9,y);c.quadraticCurveTo(0,y+6,9,y);c.stroke();}c.beginPath();c.moveTo(0,-12);c.lineTo(0,12);c.stroke();}
      else{c.strokeStyle='#b36863';c.lineWidth=2;for(let y=-5;y<7;y+=4){c.beginPath();c.moveTo(-6,y);c.bezierCurveTo(8,y-5,-8,y+6,6,y+3);c.stroke();}}
    }
    if(char>0){c.fillStyle=`rgba(39,29,27,${char})`;c.fillRect(-w,-h,w*2,h*2);}
    c.restore();
    for(const end of p.severed||[]){const x=end.x,y=end.y,rad=Math.min(w*.46,7);c.fillStyle='#67252d';c.beginPath();c.ellipse(x,y,rad,3,0,0,7);c.fill();c.strokeStyle='#b05651';c.lineWidth=1;c.stroke();c.fillStyle='#dfd2b3';c.fillRect(x-1.5,y-3,3,6);c.strokeStyle='#ae393d';c.beginPath();c.moveTo(x+rad*.65,y);c.lineTo(x+rad*.6+Math.sin(time*2)*.8,y+5);c.stroke();}
  }
  // Weapons are drawn as silhouettes rather than decorated boxes. Both fit the physics body: pistol 48x18 with the muzzle at +x, sword 12x100 with the point at -y.
  function poly(c,points){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();}
  function drawPistol(c){
    c.lineJoin='round';c.lineWidth=.8;c.strokeStyle='#0e1316';
    // grip: raked back, stippled panel, magazine baseplate
    const grip=c.createLinearGradient(-26,0,-6,0);grip.addColorStop(0,'#1c2023');grip.addColorStop(.55,'#2e3438');grip.addColorStop(1,'#202528');
    poly(c,[[-21,1],[-5,1],[-7.5,9],[-9.5,22],[-11,25],[-24.5,25.5],[-26,22.5],[-23.5,9]]);c.fillStyle=grip;c.fill();c.stroke();
    c.save();poly(c,[[-20.5,6],[-9,6],[-11.5,21],[-23.5,21]]);c.clip();c.fillStyle='#0f131588';for(let y=6;y<22;y+=2.2)for(let x=-25+(Math.round(y/2.2)%2)*1.1;x<-8;x+=2.2)c.fillRect(x,y,1,1);c.restore();
    poly(c,[[-25,23.5],[-10.5,23],[-11,25],[-24.5,25.5],[-26,24.5]]);c.fillStyle='#3d4549';c.fill();c.stroke();
    // trigger guard and trigger
    c.strokeStyle='#15191c';c.lineWidth=1.7;c.beginPath();c.moveTo(-6,2.5);c.lineTo(-7,8);c.quadraticCurveTo(-6.5,12.5,-1,12.5);c.lineTo(5,12.5);c.quadraticCurveTo(9.5,12,9.5,7);c.lineTo(9.5,2.5);c.stroke();
    c.lineWidth=1.3;c.strokeStyle='#5c666b';c.beginPath();c.moveTo(1.5,3);c.quadraticCurveTo(-.5,6.5,2.2,9.6);c.stroke();
    // frame with dust cover, rail slots and takedown pin
    c.lineWidth=.8;c.strokeStyle='#0e1316';poly(c,[[-23,-1.5],[23,-1.5],[23,1.2],[21.5,3.2],[9.5,3.2],[-6,3.2],[-21,3.2],[-25.5,1.5],[-26.5,-.5]]);c.fillStyle='#262b2f';c.fill();c.stroke();
    c.fillStyle='#0d1113';for(const x of [12,15.2,18.4])c.fillRect(x,1.2,1.5,2);c.fillStyle='#596268';c.beginPath();c.arc(4.5,.9,1,0,7);c.fill();c.beginPath();c.arc(-9,.9,.8,0,7);c.fill();
    // slide: blued steel with a top highlight, rear serrations, ejection port and sights
    const slide=c.createLinearGradient(0,-9.5,0,-1.5);slide.addColorStop(0,'#69747b');slide.addColorStop(.18,'#454e55');slide.addColorStop(.75,'#2b3238');slide.addColorStop(1,'#1d2226');
    poly(c,[[-24.5,-1.5],[-25.5,-7.5],[-23.5,-9.3],[22.2,-9.3],[24,-8],[24,-1.5]]);c.fillStyle=slide;c.fill();c.stroke();
    c.strokeStyle='#ffffff26';c.lineWidth=.7;c.beginPath();c.moveTo(-23,-8.6);c.lineTo(22,-8.6);c.stroke();
    c.strokeStyle='#11161a';c.lineWidth=.9;for(let x=-22.5;x<-13;x+=1.9){c.beginPath();c.moveTo(x+1.1,-8);c.lineTo(x,-2.6);c.stroke();}
    c.fillStyle='#0c1012';c.beginPath();c.roundRect(-3,-8.4,12.5,3.6,.8);c.fill();c.fillStyle='#8d979c';c.fillRect(-2.2,-7.7,10.8,.9);
    c.fillStyle='#14181b';c.fillRect(19.2,-11.2,2.6,2);c.fillRect(-23.2,-11.4,4.2,2.2);c.fillStyle='#d9dccb';c.fillRect(20,-10.8,1,1);c.fillRect(-22.6,-10.9,.9,.9);c.fillRect(-20.5,-10.9,.9,.9);
    // muzzle: barrel crown inside the slide's front face
    c.fillStyle='#0a0d0f';c.fillRect(24,-7.4,1.4,4.4);c.fillStyle='#7f8a90';c.fillRect(24,-6.6,.7,2.8);
  }
  function drawSword(c,p){
    c.lineJoin='round';c.lineWidth=.7;c.strokeStyle='#1b2226';
    // blade: two bevels meeting at a ridge, a fuller, and a bright true edge
    const point=-50,shoulder=22;poly(c,[[0,point],[-3.1,point+13],[-4.4,shoulder],[0,shoulder]]);c.fillStyle='#eef2f1';c.fill();
    poly(c,[[0,point],[3.1,point+13],[4.4,shoulder],[0,shoulder]]);c.fillStyle='#9aa7ac';c.fill();
    const sheen=c.createLinearGradient(0,point,0,shoulder);sheen.addColorStop(0,'#ffffff00');sheen.addColorStop(.35,'#ffffff55');sheen.addColorStop(.5,'#ffffff00');sheen.addColorStop(.8,'#ffffff30');sheen.addColorStop(1,'#ffffff00');
    poly(c,[[0,point],[-3.1,point+13],[-4.4,shoulder],[4.4,shoulder],[3.1,point+13]]);c.fillStyle=sheen;c.fill();c.stroke();
    c.strokeStyle='#6f7c82';c.lineWidth=1.3;c.lineCap='round';c.beginPath();c.moveTo(0,point+20);c.lineTo(0,shoulder-3);c.stroke();c.strokeStyle='#f8fbfa';c.lineWidth=.5;c.beginPath();c.moveTo(-.9,point+21);c.lineTo(-.9,shoulder-4);c.stroke();c.lineCap='butt';
    // blood stays on a blade that has been run through someone
    if(p.bloody){const blood=c.createLinearGradient(0,point,0,shoulder);blood.addColorStop(0,'#7c1f26e6');blood.addColorStop(.45,'#7c1f26aa');blood.addColorStop(.7,'#7c1f2600');c.save();poly(c,[[0,point],[-3.1,point+13],[-4.4,shoulder],[4.4,shoulder],[3.1,point+13]]);c.clip();c.fillStyle=blood;c.fillRect(-6,point,12,72);c.fillStyle='#5a151b';for(const [x,y,r] of [[-1.5,-12,1.3],[1.8,-2,1],[-.6,6,.9]]){c.beginPath();c.ellipse(x,y,r,r*2.2,0,0,7);c.fill();}c.restore();}
    // ricasso, then a brass crossguard with flared quillons
    c.strokeStyle='#1b2226';c.lineWidth=.7;c.fillStyle='#5f6b70';c.fillRect(-4.4,shoulder,8.8,3);
    const brass=c.createLinearGradient(0,24,0,30);brass.addColorStop(0,'#e6c777');brass.addColorStop(.5,'#b08a3c');brass.addColorStop(1,'#6e5322');
    c.beginPath();c.moveTo(-17,24.2);c.quadraticCurveTo(-19.5,27,-17,30);c.lineTo(-6,29.2);c.lineTo(6,29.2);c.lineTo(17,30);c.quadraticCurveTo(19.5,27,17,24.2);c.lineTo(6,25.2);c.lineTo(-6,25.2);c.closePath();c.fillStyle=brass;c.fill();c.stroke();
    c.fillStyle='#f3dc9a88';c.fillRect(-15,25,30,.8);
    // grip: dark leather with a spiral wrap, brass pommel
    const leather=c.createLinearGradient(-3.6,0,3.6,0);leather.addColorStop(0,'#2a1c14');leather.addColorStop(.45,'#5b3d29');leather.addColorStop(1,'#23170f');
    c.beginPath();c.roundRect(-3.5,29.2,7,15.5,1.2);c.fillStyle=leather;c.fill();c.stroke();
    c.save();c.beginPath();c.rect(-3.5,29.2,7,15.5);c.clip();c.strokeStyle='#1509058c';c.lineWidth=1;for(let y=28;y<48;y+=3){c.beginPath();c.moveTo(-4,y+2.4);c.lineTo(4,y);c.stroke();}c.restore();
    const pommel=c.createRadialGradient(-1.2,45.5,.5,0,47,4.6);pommel.addColorStop(0,'#f1d78c');pommel.addColorStop(.6,'#a9843a');pommel.addColorStop(1,'#5f471c');
    c.strokeStyle='#1b2226';c.lineWidth=.7;c.beginPath();c.arc(0,47,4.3,0,7);c.fillStyle=pommel;c.fill();c.stroke();
  }
  function drawObject(c,kind,p={},time=0){
    const d=Sandbox.defs[kind]||{},w=p.w||d.w||25,h=p.h||d.h||35,r=p.r||d.r;
    const item=CATALOG.find(i=>i.id===kind);c.fillStyle=item?.color||'#b5bdb8';c.strokeStyle='#141c21';c.lineWidth=1.5;
    if(p.debris){c.fillRect(-w/2,-h/2,w,h);return;}
    if(kind==='gun'){drawPistol(c);return;}
    if(kind==='sword'){drawSword(c,p);return;}
    if(kind==='human'||kind==='android'){
      if(kind==='human'){drawAnatomy(c,p,time);return;}
      const robot=kind==='android';c.fillStyle=robot?'#8ba8a4':p.part==='chest'?'#99a9a0':p.part==='hip'?'#727f7b':'#c9c3b6';
      if(p.hp<=0)c.fillStyle=robot?'#637777':'#aa9289';
      if(p.part==='head'){roundRect(c,-w/2,-h/2,w,h,robot?3:7);c.fill();c.stroke();c.fillStyle=robot?'#d3cd83':'#394746';c.fillRect(5,-4,4,robot?3:2);if(robot){c.fillStyle='#506763';c.fillRect(-7,-9,12,3);}}
      else {roundRect(c,-w/2,-h/2,w,h,3);c.fill();c.stroke();c.fillStyle=robot?'#bacac2':'#b3c1b3';if(p.part==='chest'){c.fillRect(-w/2+4,-h/2+5,4,h-12);c.fillStyle='#667d76';c.fillRect(-6,0,12,5);}if(robot){c.strokeStyle='#476962';c.beginPath();c.moveTo(-w/2+3,0);c.lineTo(w/2-3,0);c.stroke();}}
      return;
    }
    if(r){c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();c.stroke();}else{roundRect(c,-w/2,-h/2,w,h,2);c.fill();c.stroke();}
    c.lineWidth=2;
    if(kind==='crate'){c.strokeStyle='#725839';c.strokeRect(-w/2+5,-h/2+5,w-10,h-10);c.lineWidth=5;c.beginPath();c.moveTo(-w/2+6,-h/2+6);c.lineTo(w/2-6,h/2-6);c.moveTo(w/2-6,-h/2+6);c.lineTo(-w/2+6,h/2-6);c.stroke();c.fillStyle='#d8b477';for(const x of [-20,20])for(const y of [-20,20])c.fillRect(x-1,y-1,2,2);}
    if(kind==='plank'){c.strokeStyle='#755d3e';c.lineWidth=1;c.beginPath();c.moveTo(-w/2+4,1);c.lineTo(w/2-5,2);c.stroke();for(const x of [-w/2+6,w/2-6]){c.fillStyle='#5a5347';c.fillRect(x,-2,2,3);}}
    if(kind==='metal'||kind==='platform'){c.fillStyle='#586b73';c.fillRect(-w/2,-h/2+4,w,3);c.fillStyle='#bdc8c7';c.fillRect(-w/2,-h/2,w,2);for(let x=-w/2+8;x<w/2;x+=24){c.fillStyle='#43545c';c.fillRect(x,1,3,3);}if(kind==='platform'){c.fillStyle='#c9b176';for(let x=-w/2;x<w/2;x+=17)c.fillRect(x,h/2-4,8,3);}}
    if(kind==='barrel'){c.fillStyle='#554f49';c.fillRect(-w/2,-h/2+9,w,5);c.fillRect(-w/2,h/2-14,w,5);c.fillStyle='#d4b078';c.fillRect(-10,-9,20,18);c.fillStyle='#6b4a36';c.font='bold 14px Arial';c.textAlign='center';c.fillText('!',0,5);}
    if(kind==='ball'){c.strokeStyle='#637f70';c.lineWidth=2;c.beginPath();c.arc(0,0,r-4,-1.5,1.5);c.stroke();c.fillStyle='#d3dfc8';c.beginPath();c.arc(-7,-8,5,0,7);c.fill();}
    if(kind==='brick'){c.fillStyle='#767f7b';c.fillRect(-w/2+5,-h/2+5,12,h-10);c.fillRect(w/2-17,-h/2+5,12,h-10);c.fillStyle='#bcc2b6';c.fillRect(-w/2,-h/2,w,3);}
    if(kind==='glass'){c.fillStyle='#b9e6e644';c.fillRect(-w/2,-h/2,w,h);c.strokeStyle='#d1f5ebbb';c.lineWidth=1;c.beginPath();c.moveTo(-w/2+3,h/2-6);c.lineTo(w/2-3,-h/2+6);c.stroke();}
    if(kind==='bomb'){c.fillStyle='#444a46';c.fillRect(-8,-r-3,16,8);c.strokeStyle=p.fuse!==undefined?'#ffd38a':'#b7b8a7';c.beginPath();c.moveTo(3,-r);c.quadraticCurveTo(8,-r-12,17,-r-7);c.stroke();c.fillStyle='#705d40';c.font='bold 11px Arial';c.textAlign='center';c.fillText(p.fuse!==undefined?Math.max(0,p.fuse).toFixed(1):'×',0,4);}
    if(kind==='wheel'){c.fillStyle='#39484c';c.beginPath();c.arc(0,0,r-7,0,7);c.fill();c.strokeStyle='#94aca1';c.lineWidth=3;for(let i=0;i<6;i++){const a=i*Math.PI/3;c.beginPath();c.moveTo(Math.cos(a)*6,Math.sin(a)*6);c.lineTo(Math.cos(a)*(r-9),Math.sin(a)*(r-9));c.stroke();}c.fillStyle=p.active?'#e3c580':'#c4c8b4';c.beginPath();c.arc(0,0,6,0,7);c.fill();}
    if(kind==='thruster'){c.fillStyle='#445961';c.fillRect(-w/2-3,h/2-12,w+6,12);c.fillStyle='#c4c6b0';c.fillRect(-6,-h/2+8,12,17);if(p.active){c.fillStyle='#ecc679';c.beginPath();c.moveTo(-10,h/2);c.lineTo(0,h/2+20+Math.sin(time*70)*7);c.lineTo(10,h/2);c.fill();}}
    if(kind==='battery'){c.fillStyle='#d4d5b1';c.fillRect(-9,-h/2-5,18,5);c.fillStyle='#4a594b';c.fillRect(-w/2+3,-h/2+6,w-6,12);c.fillStyle=p.active?'#f4dc8d':'#d7d7ae';c.font='bold 19px Arial';c.textAlign='center';c.fillText('ϟ',0,13);}
  }
  function drawMini(c,kind){c.clearRect(0,0,160,114);c.save();c.translate(80,55);if(kind==='human'||kind==='android'){
    c.scale(.45,.45);c.translate(0,12);for(const [part,x,y,w,h]of Sandbox.ANATOMY){c.save();c.translate(x,y);drawObject(c,kind,{part,w,h,r:0,hp:100});c.restore();}
  }else{const d=Sandbox.defs[kind],s=Math.min(1.3,120/(d.w||d.r*2),78/(d.h||d.r*2));c.scale(s,s);drawObject(c,kind,d);}c.restore();}
  function renderCatalog(){const query=$('#search').value.trim().toLowerCase();const list=CATALOG.filter(c=>(state.category==='all'||c.category===state.category)&&`${c.name} ${c.description}`.toLowerCase().includes(query));$('#catalog-count').textContent=list.length+' objects';$('#catalog').replaceChildren();for(const item of list){const button=document.createElement('button');button.className='object-card'+(state.spawn===item.id?' active':'');button.dataset.object=item.id;button.title=item.description;button.setAttribute('aria-label','Spawn '+item.name);const preview=document.createElement('canvas');preview.width=160;preview.height=114;preview.setAttribute('aria-hidden','true');button.appendChild(preview);const name=document.createElement('span');name.className='name';name.textContent=item.name;button.appendChild(name);if(item.id==='human'){const tag=document.createElement('span');tag.className='tag';tag.textContent='Start here';button.appendChild(tag);}button.addEventListener('click',()=>chooseSpawn(item.id));$('#catalog').appendChild(button);drawMini(preview.getContext('2d'),item.id);}if(!list.length){const p=document.createElement('p');p.className='no-results';p.textContent='No objects match your search.';$('#catalog').appendChild(p);}}
  for(const tool of TOOLS){const b=document.createElement('button');b.className='tool'+(tool.id==='grab'?' active':'');b.dataset.tool=tool.id;b.title=`${tool.title} (${tool.key})`;b.setAttribute('aria-label',tool.title);b.setAttribute('aria-pressed',String(tool.id==='grab'));b.innerHTML=`<span class="shortcut">${tool.key}</span><span class="symbol">${tool.symbol}</span><span class="tool-name">${tool.name}</span>`;b.addEventListener('click',()=>setTool(tool.id));$('#tools').appendChild(b);}
  function render(){
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.fillStyle='#20282d';ctx.fillRect(0,0,width,height);
    ctx.save();ctx.translate(width/2+(Math.random()-.5)*shake,height/2+(Math.random()-.5)*shake);ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x,-camera.y);shake*=.88;
    const left=camera.x-width/2/camera.zoom,right=camera.x+width/2/camera.zoom,top=camera.y-height/2/camera.zoom,bottom=camera.y+height/2/camera.zoom;
    ctx.lineWidth=1/camera.zoom;
    for(let x=Math.floor(left/32)*32;x<right;x+=32){ctx.strokeStyle=x%160===0?'#39464e':'#2c383f';ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,Math.min(bottom,sim.groundY));ctx.stroke();}
    for(let y=Math.floor(top/32)*32;y<Math.min(bottom,sim.groundY);y+=32){ctx.strokeStyle=y%160===0?'#39464e':'#2c383f';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();}
    // Far wall measurement ticks and subtle workshop fixtures.
    ctx.strokeStyle='#56626a';ctx.fillStyle='#54646d';ctx.font='10px Barlow, Arial';ctx.textAlign='left';
    for(let x=0;x<2600;x+=160){ctx.beginPath();ctx.moveTo(x,sim.groundY-9);ctx.lineTo(x,sim.groundY);ctx.stroke();ctx.fillText(String(x/100).padStart(2,'0'),x+5,sim.groundY-11);}
    ctx.fillStyle='#303a3f';ctx.fillRect(left,sim.groundY,right-left,bottom-sim.groundY+100);ctx.fillStyle='#85928f';ctx.fillRect(left,sim.groundY,right-left,3);ctx.fillStyle='#414c50';ctx.fillRect(left,sim.groundY+3,right-left,11);
    ctx.strokeStyle='#222d34';ctx.lineWidth=2;for(let x=Math.floor(left/35)*35;x<right;x+=35){ctx.beginPath();ctx.moveTo(x,sim.groundY+15);ctx.lineTo(x+22,sim.groundY+37);ctx.stroke();}
    ctx.strokeStyle='#465357';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,sim.groundY+38);ctx.lineTo(right,sim.groundY+38);ctx.stroke();
    for(const x of [0,2600]){ctx.fillStyle='#3d494e';ctx.fillRect(x-8,-370,16,1020);}
    for(const s of sim.stains){ctx.fillStyle='#81443eaa';ctx.beginPath();ctx.ellipse(s.x,s.y,s.r,1.5,0,0,7);ctx.fill();}
    for(const c of sim.joints){const a=Constraint.pointAWorld(c),b=Constraint.pointBWorld(c),organic=c.bodyA?.plugin.material==='flesh';ctx.strokeStyle=c.plugin.rope?'#c8b889':organic?'#bf967d':'#596d67';ctx.lineWidth=c.plugin.rope?2:organic?Math.min(c.bodyA.plugin.w,c.bodyB.plugin.w)*.72:6;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.lineCap='butt';if(c.plugin.rope){ctx.fillStyle='#d0c6aa';for(const p of [a,b]){ctx.beginPath();ctx.arc(p.x,p.y,3,0,7);ctx.fill();}}}
    // A lodged blade is drawn first, so the body hides the part inside it and the point shows out the far side.
    for(const b of [...sim.bodies].sort((a,b)=>(b.plugin.stuck!==undefined)-(a.plugin.stuck!==undefined))){const p=b.plugin;if(b.bounds.max.x<left||b.bounds.min.x>right||b.bounds.max.y<top||b.bounds.min.y>bottom)continue;
      // Contact shadow anchors objects in the chamber.
      if(b.position.y>520){ctx.fillStyle='#10191d30';ctx.beginPath();ctx.ellipse(b.position.x,sim.groundY-1,Math.max(5,(p.w||p.r*2||20)*.5),3,0,0,7);ctx.fill();}
      ctx.save();ctx.translate(b.position.x,b.position.y);ctx.rotate(b.angle);if(p.flip)ctx.scale(-1,1);drawObject(ctx,p.kind,p,sim.time);
      if(p.heat>100&&p.kind!=='human'){ctx.fillStyle=`rgba(219,99,49,${Math.min(.55,(p.heat-100)/1000)})`;ctx.fillRect(-(p.w||24)/2,-(p.h||24)/2,p.w||24,p.h||24);}
      if(b.isStatic){ctx.fillStyle='#acd4e9';ctx.fillRect(-2,-2,4,4);}
      if(p.charge>.05){ctx.strokeStyle='#a7d9e8';ctx.shadowColor='#9ad8e9';ctx.shadowBlur=10;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-8,-15);ctx.lineTo(4,-4);ctx.lineTo(-4,4);ctx.lineTo(7,17);ctx.stroke();ctx.shadowBlur=0;}
      ctx.restore();
      if(b===state.selected){ctx.strokeStyle='#dfbd7d';ctx.lineWidth=1.5/camera.zoom;ctx.setLineDash([4/camera.zoom,3/camera.zoom]);ctx.strokeRect(b.bounds.min.x-5,b.bounds.min.y-5,b.bounds.max.x-b.bounds.min.x+10,b.bounds.max.y-b.bounds.min.y+10);ctx.setLineDash([]);}
    }
    for(const p of sim.particles){ctx.globalAlpha=clamp(p.life/p.maxLife,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size*(p.type==='smoke'?2-p.life:.8),0,7);ctx.fill();}ctx.globalAlpha=1;
    for(const f of sim.flashes){const t=1-f.life/f.maxLife;ctx.strokeStyle=`rgba(236,192,116,${1-t})`;ctx.lineWidth=5*(1-t)+1;ctx.beginPath();ctx.arc(f.x,f.y,f.radius*t,0,7);ctx.stroke();const gradient=ctx.createRadialGradient(f.x,f.y,0,f.x,f.y,Math.max(1,f.radius*t));gradient.addColorStop(0,`rgba(255,220,156,${(1-t)*.55})`);gradient.addColorStop(1,'rgba(226,133,62,0)');ctx.fillStyle=gradient;ctx.fill();}
    for(const t of sim.traces){ctx.globalAlpha=t.life/t.maxLife;ctx.strokeStyle=t.electric?'#b4e6f1':'#f0cd84';ctx.lineWidth=t.electric?2:1.5;ctx.beginPath();ctx.moveTo(t.from.x,t.from.y);if(t.electric){const mid={x:(t.from.x+t.to.x)/2,y:(t.from.y+t.to.y)/2};ctx.lineTo(mid.x+Math.sin(sim.time*80)*10,mid.y-8);}ctx.lineTo(t.to.x,t.to.y);ctx.stroke();}ctx.globalAlpha=1;
    if(sim.drag){ctx.strokeStyle='#cbb78588';ctx.lineWidth=1;const p=Constraint.pointBWorld(sim.drag);ctx.beginPath();ctx.moveTo(sim.drag.pointA.x,sim.drag.pointA.y);ctx.lineTo(p.x,p.y);ctx.stroke();}
    if(state.ropeStart){ctx.strokeStyle='#dec58e';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(state.ropeStart.point.x,state.ropeStart.point.y);ctx.lineTo(state.worldPointer.x,state.worldPointer.y);ctx.stroke();ctx.setLineDash([]);}
    if(state.inside&&state.spawn&&!state.down){ctx.save();ctx.globalAlpha=.3;ctx.translate(state.worldPointer.x,state.worldPointer.y);ctx.rotate(state.rotation);if(state.spawn==='human'||state.spawn==='android'){for(const [part,x,y,w,h] of Sandbox.ANATOMY){ctx.save();ctx.translate(x,y);drawObject(ctx,state.spawn,{part,w,h,hp:100});ctx.restore();}}else drawObject(ctx,state.spawn);ctx.restore();}
    if(state.inside&&['blast','fire','shock','heal','revive'].includes(state.tool)){ctx.strokeStyle=state.tool==='blast'?'#e3b07966':'#c6d9d977';ctx.lineWidth=1/camera.zoom;ctx.setLineDash([4,5]);ctx.beginPath();ctx.arc(state.worldPointer.x,state.worldPointer.y,state.tool==='blast'?175:24,0,7);ctx.stroke();ctx.setLineDash([]);}
    ctx.restore();
    // Gentle edge falloff adds depth without obscuring the simulation.
    const vignette=ctx.createRadialGradient(width/2,height/2,Math.min(width,height)*.25,width/2,height/2,Math.max(width,height)*.7);vignette.addColorStop(0,'#101a2000');vignette.addColorStop(1,'#101a2044');ctx.fillStyle=vignette;ctx.fillRect(0,0,width,height);
  }
  const spawned=[];
  function place(point,flip=false){const e=sim.spawn(state.spawn,point.x,point.y,flip);if(!e){toast('Chamber is full — delete some objects first.');return;}if(state.rotation){const center={x:point.x,y:point.y};for(const b of e.bodies)Body.rotate(b,state.rotation,center);}spawned.push(e);if(spawned.length>50)spawned.shift();sound('impact',.1);}
  function perform(point,continuous=false){const body=sim.bodyAt(point);
    switch(state.tool){case'grab':if(!continuous){select(body);if(body){sim.beginDrag(body,point);canvas.style.cursor='grabbing';}}break;
      case'rope':if(!continuous){if(!state.ropeStart){state.ropeStart={body,point:{...point}};toast('Choose the other end of the rope.');}else{const a=state.ropeStart;if(!a.body&&!body){toast('At least one end must attach to an object.');}else{sim.rope(a.body,body,a.point,point);toast('Rope connected');}state.ropeStart=null;}}break;
      case'freeze':if(!continuous&&body){select(body);toast(sim.freeze(body)?'Body frozen':'Body released');}break;
      case'shoot':if(performance.now()-lastShot>120){sim.shoot({x:point.x-600,y:point.y-35},point);lastShot=performance.now();}break;
      case'fire':if(body)sim.ignite(body);break;
      case'shock':if(body&&performance.now()-lastAction>180){sim.shock(body);lastAction=performance.now();}break;
      case'blast':if(!continuous)sim.explode(point.x,point.y);break;
      case'heal':if(body){sim.heal(body);select(body);}break;
      case'revive':if(body&&!continuous){toast(sim.revive(body)?'Revived':'Only humans and androids can be revived');select(body);}break;
      case'delete':if(body){sim.removeEntity(body);select(null);}break;
    }
  }
  function pointer(e){const r=canvas.getBoundingClientRect();state.pointer={x:e.clientX-r.left,y:e.clientY-r.top};state.worldPointer=toWorld(state.pointer);$('#coordinates').textContent=`x ${Math.round(state.worldPointer.x)} : y ${Math.round(state.worldPointer.y)}`;return state.worldPointer;}
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0&&e.button!==1&&e.button!==2)return;canvas.focus();canvas.setPointerCapture(e.pointerId);pointer(e);state.inside=true;if(e.button===2||e.button===1||state.shift){state.pan={x:e.clientX,y:e.clientY,cx:camera.x,cy:camera.y};canvas.style.cursor='grabbing';return;}state.down=true;perform(state.worldPointer);});
  canvas.addEventListener('pointermove',e=>{pointer(e);state.inside=true;if(state.pan){camera.x=state.pan.cx-(e.clientX-state.pan.x)/camera.zoom;camera.y=state.pan.cy-(e.clientY-state.pan.y)/camera.zoom;return;}if(sim.drag){const body=sim.drag.bodyB,target=Vector.sub(state.worldPointer,sim.drag.pointB);if(state.paused)sim.translateConnected(body,Vector.sub(target,body.position));else if(body.isStatic)Body.setPosition(body,target);sim.moveDrag(state.worldPointer);}});
  function release(){state.down=false;state.pan=null;sim.endDrag();canvas.style.cursor=state.tool!=='grab'?'crosshair':'grab';}
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);canvas.addEventListener('pointerleave',()=>state.inside=false);window.addEventListener('blur',()=>{release();state.shift=false;held.clear();});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('dblclick',e=>{const b=sim.bodyAt(pointer(e));if(b&&state.tool==='grab')toast(sim.activate(b));});
  function zoom(factor,p={x:width/2,y:height/2}){const before=toWorld(p);camera.zoom=clamp(camera.zoom*factor,.2,3);const after=toWorld(p);camera.x+=before.x-after.x;camera.y+=before.y-after.y;updateZoom();}
  canvas.addEventListener('wheel',e=>{e.preventDefault();pointer(e);zoom(Math.exp(-e.deltaY*.0015),state.pointer);},{passive:false});
  function setPaused(value){state.paused=value;$('#play-btn').textContent=value?'▶':'Ⅱ';$('#play-btn').setAttribute('aria-label',value?'Play simulation':'Pause simulation');$('#pause-overlay').hidden=!value;$('#simulation-badge').innerHTML=`<i style="background:${value?'#cfb27c':'#91bba6'}"></i> ${value?'Simulation paused':'Simulation live'}`;$('#step-btn').disabled=!value;}
  function loadPreset(name){sim.loadPreset(name);state.selected=null;state.ropeStart=null;$('#scene-name').textContent=$('#scene-select').selectedOptions[0].textContent;$('#gravity').value='1';setPaused(false);fit();updateSelection();}
  $('#play-btn').onclick=()=>setPaused(!state.paused);$('#step-btn').onclick=()=>{if(state.paused)sim.step();};
  document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>setSpeed(Number(b.dataset.speed)));
  $('#gravity').onchange=e=>{sim.gravity=Number(e.target.value);toast(e.target.selectedOptions[0].textContent+' gravity');};
  $('#sound-btn').onclick=()=>{state.sound=!state.sound;$('#sound-btn').textContent=state.sound?'Sound on':'Sound off';$('#sound-btn').setAttribute('aria-pressed',String(state.sound));if(state.sound)sound('impact',.2);};
  $('#zoom-in').onclick=()=>zoom(1.2);$('#zoom-out').onclick=()=>zoom(1/1.2);$('#zoom-reset').onclick=fit;
  $('#scene-select').onchange=e=>loadPreset(e.target.value);$('#reset-btn').onclick=()=>{loadPreset($('#scene-select').value);toast('Scene reset');};$('#clear-btn').onclick=()=>{sim.clear();select(null);state.ropeStart=null;toast('Chamber cleared');};
  $('#save-btn').onclick=()=>{try{const data=sim.serialize();localStorage.setItem('sandbox-lab-scene',JSON.stringify({...data,camera:{...camera},savedAt:new Date().toISOString()}));toast('Scene saved on this device');}catch{toast('Could not save. Browser storage may be full or disabled.');}};
  $('#load-btn').onclick=()=>{try{const raw=localStorage.getItem('sandbox-lab-scene');if(!raw){toast('No saved scene yet. Build something and save it first.');return;}const data=JSON.parse(raw);sim.restore(data);state.selected=null;state.ropeStart=null;if(data.camera&&[data.camera.x,data.camera.y,data.camera.zoom].every(Number.isFinite))Object.assign(camera,data.camera);$('#scene-select').value=sim.scene;$('#scene-name').textContent='Saved experiment';$('#gravity').value=String(sim.gravity);setPaused(true);updateZoom();toast('Scene loaded — paused so you can pick up where you left off.');}catch{toast('Could not load this saved scene. Your current scene was kept if validation failed.');}};
  const help=$('#help-dialog');function showHelp(){if(!help.open)help.showModal();}$('#help-btn').onclick=showHelp;$('#more-help').onclick=showHelp;$('#close-help').onclick=()=>help.close();$('#start-btn').onclick=()=>help.close();help.addEventListener('click',e=>{if(e.target===help){const r=help.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)help.close();}});
  $('#deselect-btn').onclick=()=>select(null);$('#freeze-selection').onclick=()=>{sim.freeze(state.selected);updateSelection();};$('#activate-selection').onclick=()=>{toast(sim.activate(state.selected));updateSelection();};$('#delete-selection').onclick=()=>{sim.removeEntity(state.selected);select(null);};
  $('#search').addEventListener('input',renderCatalog);document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{state.category=b.dataset.category;document.querySelectorAll('[data-category]').forEach(x=>x.classList.toggle('active',x===b));renderCatalog();});
  // Keys follow People Playground's defaults: A/D rotate (Q/E too while something is held), Q/E spawn facing left/right, F activate, G slow motion, S detail, Space pause, Backspace delete, Tab hides the UI, arrows pan, Z undoes a spawn.
  const held=new Set();let rotateTime=0;
  const target=()=>sim.drag?.bodyB||(state.inside&&sim.bodyAt(state.worldPointer))||state.selected;
  function setSpeed(value){state.speed=value;document.querySelectorAll('[data-speed]').forEach(el=>el.classList.toggle('active',Number(el.dataset.speed)===value));}
  window.addEventListener('keydown',e=>{
    if(e.key==='Shift')state.shift=true;if(help.open||e.ctrlKey||e.metaKey||e.altKey)return;if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
    const key=e.key.length===1?e.key.toLowerCase():e.key;
    if(['a','d','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)||(sim.drag&&(key==='q'||key==='e'))){e.preventDefault();held.add(key);return;}
    if(e.code==='Space'||key==='Tab'||key==='Backspace')e.preventDefault();if(e.repeat)return;
    const t=TOOLS.find(t=>t.key===key);if(t){setTool(t.id);return;}
    if(e.code==='Space')setPaused(!state.paused);
    else if(key==='Tab')document.body.classList.toggle('ui-hidden');
    else if(key==='Escape'){if(state.spawn)chooseSpawn(state.spawn);setTool('grab');select(null);}
    else if(key==='g'){setSpeed(state.speed===1?.1:1);toast(state.speed===1?'Normal speed':'Slow motion');}
    else if(key==='f'){const b=target();if(b)toast(sim.activate(b));}
    else if(key==='s'){const b=state.inside&&sim.bodyAt(state.worldPointer);select(b&&b!==state.selected?b:null);}
    else if(key==='q'||key==='e'){if(state.spawn&&state.inside)place(state.worldPointer,key==='q');else if(!state.spawn)toast('Pick an object from the library first.');}
    else if(key==='z'){let e;while((e=spawned.pop())&&!sim.entities.includes(e));if(e){sim.removeEntity(e.bodies[0]);select(null);toast('Spawn undone');}}
    else if(key==='Delete'||key==='Backspace'){if(state.selected){sim.removeEntity(state.selected);select(null);}}
  });window.addEventListener('keyup',e=>{if(e.key==='Shift')state.shift=false;held.delete(e.key.length===1?e.key.toLowerCase():e.key);});
  // Held keys act every frame: rotation accelerates the longer A/D is down (faster with Shift), and the grab keeps the angle on release.
  function heldKeys(seconds){
    if(!sim.drag){held.delete('q');held.delete('e');}
    const turn=(held.has('d')||held.has('e')?1:0)-(held.has('a')||held.has('q')?1:0);rotateTime=turn?rotateTime+seconds:0;
    // What turns: the held body first, then the spawn preview, then the selection.
    if(turn){const amount=turn*seconds*Math.min(6,1.2+rotateTime*3)*(state.shift?2.5:1);if(sim.drag)sim.rotate(sim.drag.bodyB,amount,state.paused);else if(state.spawn)state.rotation+=amount;else if(state.selected)sim.rotate(state.selected,amount,state.paused);}
    const px=(held.has('ArrowRight')?1:0)-(held.has('ArrowLeft')?1:0),py=(held.has('ArrowDown')?1:0)-(held.has('ArrowUp')?1:0),pace=700*seconds/camera.zoom*(state.shift?2.5:1);camera.x+=px*pace;camera.y+=py*pace;
  }
  function frame(now){const elapsed=Math.min(50,now-(lastTime||now));lastTime=now;heldKeys(elapsed/1000);
    if(!state.paused&&!document.hidden){accumulator+=elapsed*state.speed;let steps=0;while(accumulator>=1000/60&&steps<8){sim.step();accumulator-=1000/60;steps++;}}else accumulator=0;
    if(state.down&&!state.pan&&['shoot','fire','shock'].includes(state.tool))perform(state.worldPointer,true);
    render();frameCount++;if(now-fpsTime>=1000){$('#fps').textContent=Math.min(240,Math.round(frameCount*1000/(now-fpsTime)))+' fps';frameCount=0;fpsTime=now;}
    if(now-uiTime>180){$('#object-count').textContent=sim.entities.length+' objects';$('#joint-count').textContent=sim.joints.length+' joints';updateSelection();updateAnatomyInfo();uiTime=now;}
    requestAnimationFrame(frame);
  }
  new ResizeObserver(()=>{const initial=!width;resize();if(initial)fit();}).observe(stage);
  resize();fit();renderCatalog();sim.loadPreset('workshop');setPaused(false);setTool('grab');requestAnimationFrame(frame);
})();

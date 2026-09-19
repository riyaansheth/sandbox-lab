/* Sandbox Lab — layered human body art. Rendering only: no simulation rules live here.
 *
 * Every part is three drawings stacked: skeleton, then muscle, then skin (see reference/ragdoll.png). Damage does not paint
 * over the skin; it cuts holes in the upper layers so the ones beneath show through, the way a wound actually opens. A bullet
 * is a small hole to the muscle with a pinprick to the bone, an exit wound a ragged one, a cut a long slit, a blast a crater.
 *
 * That is far too much path work to repeat for 170 parts every frame, so each part is drawn once into a small canvas and
 * redrawn only when its damage state changes. The per-frame cost of a body part is one drawImage.
 */
(function (root) {
  'use strict';
  const SCALE = 3, PAD = 7;                                   // sprite pixels per world pixel; world-pixel margin for stumps and shards
  const SKIN = { base: '#e2bb98', light: '#f1d3b5', shade: '#c4956f', line: '#9a6c4e', pale: '#e4e2d8', dead: '#b9a79a' };
  const MUSCLE = { base: '#a63a3c', dark: '#7a2429', light: '#cd6a63', fascia: '#eedfd3' };
  const BONE = { base: '#ece3cb', shade: '#b8ab8a', cavity: '#2e1216', marrow: '#8c2f35' };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  // ---- outlines: one closed path per part, in the part's own frame, centred on its physics rectangle (w x h). Everything is a side profile facing +x:
  // the front of the body (face, chest, belly, kneecaps, toes) is on the +x side and the back (skull, spine, buttocks, calves, heels) on the -x side.
  function outline(c, part, w, h) {
    const x = w / 2, y = h / 2; c.beginPath();
    switch (part) {
      case 'head': c.moveTo(-x * .15, -y); c.bezierCurveTo(x * .55, -y * 1.02, x * .92, -y * .7, x * .9, -y * .3);            // crown to brow
        c.lineTo(x * .84, -y * .12); c.lineTo(x * 1.12, y * .2); c.lineTo(x * .86, y * .3); c.lineTo(x * .92, y * .48); c.lineTo(x * .8, y * .56); c.lineTo(x * .84, y * .7);   // nose, lips
        c.bezierCurveTo(x * .78, y * .98, x * .45, y * 1.02, x * .2, y * .92); c.lineTo(-x * .1, y * .62);                        // chin and jaw, back to the neck
        c.bezierCurveTo(-x * .75, y * .6, -x * 1.08, y * .15, -x * 1.02, -y * .3); c.bezierCurveTo(-x * .98, -y * .8, -x * .6, -y, -x * .15, -y); break;                           // back of the skull
      case 'neck': c.moveTo(-x * .95, -y); c.lineTo(x * .7, -y); c.quadraticCurveTo(x * .85, 0, x * 1.05, y); c.lineTo(-x * 1.15, y); c.quadraticCurveTo(-x * .8, 0, -x * .95, -y); break;
      case 'chest': c.moveTo(-x * .55, -y); c.lineTo(x * .35, -y); c.bezierCurveTo(x * .9, -y * .9, x * 1.12, -y * .45, x * 1.06, -y * .05);                                          // collar, over the pectoral
        c.bezierCurveTo(x * 1.0, y * .25, x * .78, y * .55, x * .74, y); c.lineTo(-x * .72, y); c.bezierCurveTo(-x * .95, y * .5, -x * 1.12, -y * .1, -x * 1.02, -y * .55); c.quadraticCurveTo(-x * .95, -y * .95, -x * .55, -y); break;   // ribs, waist, up the back
      case 'abdomen': c.moveTo(-x * .85, -y); c.lineTo(x * .88, -y); c.bezierCurveTo(x * 1.06, -y * .3, x * 1.04, y * .45, x * .9, y); c.lineTo(-x * .95, y); c.bezierCurveTo(-x * .72, y * .3, -x * .7, -y * .4, -x * .85, -y); break;   // slight belly in front, the small of the back behind
      case 'pelvis': c.moveTo(-x * .9, -y); c.lineTo(x * .85, -y); c.bezierCurveTo(x * .98, -y * .2, x * .9, y * .5, x * .6, y); c.lineTo(-x * .55, y); c.bezierCurveTo(-x * 1.18, y * .75, -x * 1.2, -y * .25, -x * .9, -y); break;        // flat in front, the buttock behind
      case 'upper arm': c.moveTo(-x * .95, -y * .62); c.bezierCurveTo(-x * .95, -y * 1.12, x * 1.0, -y * 1.12, x * 1.0, -y * .62); c.bezierCurveTo(x * 1.2, -y * .3, x * 1.05, y * .35, x * .72, y); c.lineTo(-x * .72, y); c.bezierCurveTo(-x * 1.05, y * .2, -x * 1.08, -y * .3, -x * .95, -y * .62); break;
      case 'forearm': c.moveTo(-x * .8, -y); c.lineTo(x * .8, -y); c.bezierCurveTo(x * 1.12, -y * .45, x * .82, y * .4, x * .62, y); c.lineTo(-x * .62, y); c.bezierCurveTo(-x * .8, y * .4, -x * 1.02, -y * .5, -x * .8, -y); break;
      case 'hand': c.moveTo(-x * .6, -y); c.lineTo(x * .6, -y); c.lineTo(x * .75, -y * .45); c.lineTo(x * 1.15, -y * .1); c.lineTo(x * .95, y * .15); c.lineTo(x * .7, -y * .02);                   // thumb, forward
        c.bezierCurveTo(x * .85, y * .5, x * .6, y * 1.05, 0, y); c.bezierCurveTo(-x * .7, y * 1.02, -x * .85, y * .3, -x * .6, -y); break;
      case 'thigh': c.moveTo(-x * 1.0, -y * .7); c.bezierCurveTo(-x * 1.0, -y * 1.08, x * .95, -y * 1.08, x * .95, -y * .7); c.bezierCurveTo(x * 1.18, -y * .3, x * 1.0, y * .5, x * .7, y); c.lineTo(-x * .68, y); c.bezierCurveTo(-x * .9, y * .45, -x * 1.2, -y * .25, -x * 1.0, -y * .7); break;
      case 'shin': c.moveTo(-x * .8, -y); c.lineTo(x * .85, -y); c.bezierCurveTo(x * .9, -y * .3, x * .7, y * .4, x * .58, y); c.lineTo(-x * .6, y); c.bezierCurveTo(-x * .85, y * .35, -x * 1.35, -y * .45, -x * .8, -y); break;          // the calf bulges behind
      case 'foot': c.moveTo(-x * .55, -y); c.lineTo(x * .3, -y); c.bezierCurveTo(x * .55, -y * .2, x * 1.35, y * .1, x * 1.55, y * .55); c.quadraticCurveTo(x * 1.6, y, x * 1.35, y);                   // instep, out to the toes (the drawing runs forward of the physics box)
        c.lineTo(-x * .7, y); c.bezierCurveTo(-x * 1.05, y, -x * 1.05, y * .1, -x * .55, -y); break;                                                                                         // sole and heel
      default: c.roundRect(-x, -y, w, h, 3);
    }
    c.closePath();
  }

  // ---- layer 1: the skeleton, in a dark cavity
  function drawBone(c, part, w, h, broken, flesh = 1) {
    const x = w / 2, y = h / 2; if (flesh > 0) { c.globalAlpha = flesh; c.fillStyle = BONE.cavity; c.fill(); c.globalAlpha = 1; }   // the dark of the body cavity is the last of the flesh to go
    c.fillStyle = BONE.base; c.strokeStyle = BONE.shade; c.lineWidth = .5; c.lineCap = 'round';
    const shaft = (x0, y0, x1, y1, width) => { c.strokeStyle = BONE.shade; c.lineWidth = width + .9; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.strokeStyle = BONE.base; c.lineWidth = width; c.stroke(); };
    const knob = (kx, ky, r) => { c.fillStyle = BONE.base; c.strokeStyle = BONE.shade; c.lineWidth = .5; c.beginPath(); c.arc(kx, ky, r, 0, 7); c.fill(); c.stroke(); };
    const vertebra = vy => { c.fillStyle = BONE.base; c.strokeStyle = BONE.shade; c.lineWidth = .4; c.beginPath(); c.roundRect(-2.6, vy - 1.7, 5.2, 3.4, 1.2); c.fill(); c.stroke(); c.fillRect(-4.2, vy - .5, 1.6, 1); c.fillRect(2.6, vy - .5, 1.6, 1); };
    switch (part) {
      case 'head':                                                                 // skull in profile: cranium, eye socket, nasal gap, teeth, jaw
        c.beginPath(); c.moveTo(-x * .1, -y * .93); c.bezierCurveTo(x * .6, -y * .95, x * .82, -y * .55, x * .78, -y * .2); c.lineTo(x * .62, y * .2); c.lineTo(x * .7, y * .42); c.lineTo(x * .1, y * .42); c.lineTo(-x * .15, y * .5);
        c.bezierCurveTo(-x * .8, y * .45, -x * .98, 0, -x * .92, -y * .35); c.bezierCurveTo(-x * .88, -y * .78, -x * .55, -y * .93, -x * .1, -y * .93); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(x * .68, y * .5); c.lineTo(x * .72, y * .72); c.quadraticCurveTo(x * .5, y * .92, x * .15, y * .82); c.lineTo(-x * .2, y * .5); c.lineTo(x * .1, y * .5); c.closePath(); c.fill(); c.stroke();   // mandible
        c.fillStyle = BONE.cavity; c.beginPath(); c.ellipse(x * .42, -y * .08, x * .2, y * .15, 0, 0, 7); c.fill(); c.beginPath(); c.moveTo(x * .66, y * .08); c.lineTo(x * .78, y * .26); c.lineTo(x * .6, y * .26); c.closePath(); c.fill();
        c.strokeStyle = BONE.cavity; c.lineWidth = .45; c.beginPath(); c.moveTo(x * .2, y * .47); c.lineTo(x * .7, y * .47); for (let t = 0; t < 5; t++) { c.moveTo(x * (.26 + t * .1), y * .42); c.lineTo(x * (.26 + t * .1), y * .54); } c.stroke(); break;
      case 'neck': c.save(); c.translate(-x * .35, 0); for (let vy = -y + 2.2; vy < y - 1; vy += 4.4) vertebra(vy); c.restore(); break;
      case 'chest':                                                                // spine up the back, ribs curving forward and down to the sternum
        c.save(); c.translate(-x * .62, 0); for (let i = 0; i < 7; i++) vertebra(-y + 3 + i * 4.8); c.restore();
        for (let i = 0; i < 6; i++) { const ry = -y * .7 + i * 4.9, reach = x * (.78 - Math.abs(i - 2) * .06); c.strokeStyle = BONE.shade; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-x * .5, ry); c.bezierCurveTo(-x * .1, ry - 2.5, reach, ry - .5, reach * .95, ry + 4.2); c.stroke(); c.strokeStyle = BONE.base; c.lineWidth = 1.6; c.stroke(); }
        c.fillStyle = BONE.base; c.strokeStyle = BONE.shade; c.lineWidth = .5; c.beginPath(); c.roundRect(x * .62, -y * .62, 2.6, y * 1.0, 1.2); c.fill(); c.stroke(); shaft(-x * .3, -y * .82, x * .6, -y * .7, 1.5); break;   // sternum, collar bone
      case 'abdomen': c.save(); c.translate(-x * .55, 0); for (let i = 0; i < 5; i++) vertebra(-y + 2.4 + i * 4.5); c.restore(); break;
      case 'pelvis':                                                               // hip bone from the side: the iliac wing, the socket, the sit bone
        c.fillStyle = BONE.base; c.strokeStyle = BONE.shade; c.lineWidth = .5; c.beginPath(); c.moveTo(-x * .75, -y * .8); c.bezierCurveTo(-x * .2, -y * 1.05, x * .6, -y * .85, x * .7, -y * .3); c.bezierCurveTo(x * .55, y * .1, x * .3, y * .2, x * .25, y * .55);
        c.quadraticCurveTo(-x * .1, y * .95, -x * .55, y * .6); c.bezierCurveTo(-x * .95, y * .2, -x * 1.0, -y * .4, -x * .75, -y * .8); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = BONE.cavity; c.beginPath(); c.arc(0, y * .3, x * .2, 0, 7); c.fill(); c.beginPath(); c.ellipse(-x * .3, y * .55, x * .13, y * .12, .5, 0, 7); c.fill(); break;
      case 'upper arm': shaft(0, -y * .78, 0, y * .8, 2.6); knob(0, -y * .82, 2.6); knob(-1.2, y * .84, 1.8); knob(1.2, y * .84, 1.8); break;
      case 'forearm': shaft(-1.6, -y * .85, -1.3, y * .86, 1.7); shaft(1.7, -y * .82, 1.2, y * .86, 1.4); knob(-1.6, -y * .86, 1.6); knob(1.5, y * .88, 1.4); break;
      case 'hand': c.fillStyle = BONE.base; c.strokeStyle = BONE.shade; c.beginPath(); c.roundRect(-x * .6, -y * .85, x * 1.2, y * .5, 1.3); c.fill(); c.stroke(); for (let i = 0; i < 4; i++) { const fx = -x * .52 + i * x * .35; shaft(fx, -y * .3, fx * 1.15, y * .3, .9); shaft(fx * 1.15, y * .38, fx * 1.2, y * .78, .7); } break;
      case 'thigh': shaft(0, -y * .72, 0, y * .82, 3.4); knob(-2.2, -y * .84, 2.9); knob(1.4, -y * .7, 1.8); knob(-1.7, y * .86, 2.3); knob(1.7, y * .86, 2.3); break;
      case 'shin': shaft(-1, -y * .82, -.7, y * .86, 2.7); shaft(2.6, -y * .74, 2.2, y * .84, 1.1); knob(-1, -y * .86, 2.6); knob(-.6, y * .88, 1.9); break;
      case 'foot': c.fillStyle = BONE.base; c.strokeStyle = BONE.shade; c.beginPath(); c.roundRect(-x * .8, -y * .1, x * .8, y * .95, 1.8); c.fill(); c.stroke(); c.beginPath(); c.roundRect(-x * .35, -y * .8, x * .6, y * .8, 1.4); c.fill(); c.stroke();   // heel and ankle bones
        shaft(x * .05, y * .1, x * .95, y * .5, 1.5); shaft(x * 1.0, y * .55, x * 1.4, y * .7, 1.1); break;                                                                                  // the long bones of the foot, out to the toes
    }
    if (broken) {                                           // a fracture: the shaft parts, jagged ends, marrow showing
      c.strokeStyle = BONE.cavity; c.lineWidth = 2.6; c.beginPath(); c.moveTo(-x * .7, y * .02); c.lineTo(-x * .2, y * .16); c.lineTo(x * .15, -y * .04); c.lineTo(x * .7, y * .12); c.stroke();
      c.strokeStyle = BONE.marrow; c.lineWidth = .8; c.stroke();
    }
  }

  // ---- layer 2: muscle, with the fibres running the way the muscle pulls and white fascia between the groups
  function drawMuscle(c, part, w, h) {
    const x = w / 2, y = h / 2, g = c.createLinearGradient(-x, 0, x, 0); g.addColorStop(0, MUSCLE.dark); g.addColorStop(.3, MUSCLE.base); g.addColorStop(.62, MUSCLE.light); g.addColorStop(1, MUSCLE.dark); c.fillStyle = g; c.fill();
    const fibres = (lines, colour, width) => { c.strokeStyle = colour; c.lineWidth = width; c.beginPath(); for (const [x0, y0, cx, cy, x1, y1] of lines) { c.moveTo(x0, y0); c.quadraticCurveTo(cx, cy, x1, y1); } c.stroke(); };
    const along = n => { const lines = []; for (let i = 1; i < n; i++) { const fx = -x + i * w / n; lines.push([fx * .8, -y * .9, fx * 1.25, 0, fx * .7, y * .9]); } return lines; };
    switch (part) {
      case 'head': fibres([[-x * .7, -y * .2, -x * .5, y * .3, -x * .25, y * .7], [x * .7, -y * .2, x * .5, y * .3, x * .25, y * .7], [-x * .5, -y * .6, 0, -y * .75, x * .5, -y * .6], [-x * .3, y * .45, 0, y * .62, x * .3, y * .45]], MUSCLE.dark, .6);
        c.fillStyle = MUSCLE.dark; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * x * .4, -y * .08, x * .24, y * .13, 0, 0, 7); c.fill(); } break;
      case 'chest': fibres([[-1, -y * .62, -x * .6, -y * .8, -x * .98, -y * .35], [-1, -y * .3, -x * .6, -y * .4, -x, -y * .1], [-1, 0, -x * .55, y * .05, -x * .95, y * .12], [1, -y * .62, x * .6, -y * .8, x * .98, -y * .35], [1, -y * .3, x * .6, -y * .4, x, -y * .1], [1, 0, x * .55, y * .05, x * .95, y * .12]], MUSCLE.dark, .55);
        fibres([[0, -y * .85, 0, 0, 0, y], [-x * .95, y * .16, -x * .4, y * .34, 0, y * .2], [x * .95, y * .16, x * .4, y * .34, 0, y * .2], [-x * .6, y * .55, -x * .3, y * .62, 0, y * .55], [x * .6, y * .55, x * .3, y * .62, 0, y * .55]], MUSCLE.fascia, .7); break;
      case 'abdomen': fibres([[0, -y, 0, 0, 0, y], [-x * .55, -y * .45, 0, -y * .38, x * .55, -y * .45], [-x * .55, y * .08, 0, y * .15, x * .55, y * .08], [-x * .5, y * .6, 0, y * .67, x * .5, y * .6], [-x * .6, -y, -x * .66, 0, -x * .6, y], [x * .6, -y, x * .66, 0, x * .6, y]], MUSCLE.fascia, .7);
        fibres([[-x * .95, -y * .6, -x * .8, 0, -x * .7, y * .7], [x * .95, -y * .6, x * .8, 0, x * .7, y * .7]], MUSCLE.dark, .55); break;
      case 'pelvis': fibres([[-x * .9, -y * .7, -x * .5, -y * .1, -x * .1, y * .6], [x * .9, -y * .7, x * .5, -y * .1, x * .1, y * .6], [-x * .6, -y * .85, -x * .3, -y * .3, 0, y * .1], [x * .6, -y * .85, x * .3, -y * .3, 0, y * .1]], MUSCLE.dark, .55); fibres([[0, -y, 0, -y * .3, 0, y * .5]], MUSCLE.fascia, .7); break;
      case 'neck': fibres([[-x * .7, -y, -x * .3, 0, -1, y], [x * .7, -y, x * .3, 0, 1, y]], MUSCLE.fascia, .7); break;
      case 'hand': fibres(along(4), MUSCLE.fascia, .45); break;
      case 'foot': fibres([[-x * .7, -y * .1, 0, y * .1, x * .7, -y * .1], [-x * .7, y * .4, 0, y * .55, x * .7, y * .4]], MUSCLE.fascia, .5); break;
      default: fibres(along(part === 'thigh' ? 5 : 4), MUSCLE.dark, .55); fibres([[0, -y * .9, x * .2, 0, 0, y * .9]], MUSCLE.fascia, .7);
        c.fillStyle = MUSCLE.fascia; c.globalAlpha = .8; c.beginPath(); c.ellipse(0, y * .9, x * .55, y * .08, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(0, -y * .92, x * .6, y * .07, 0, 0, 7); c.fill(); c.globalAlpha = 1;   // tendon ends
    }
  }

  // ---- layer 3: skin. Shaded like a mannequin, light from the upper left; the face is drawn from the ragdoll's state.
  function drawSkin(c, part, w, h, slot, state) {
    const x = w / 2, y = h / 2, g = c.createLinearGradient(-x, 0, x, 0);
    g.addColorStop(0, SKIN.shade); g.addColorStop(.28, SKIN.light); g.addColorStop(.6, SKIN.base); g.addColorStop(1, SKIN.shade); c.fillStyle = g; c.fill();
    if (state.pale > 0) { c.fillStyle = SKIN.pale; c.globalAlpha = state.pale * .28; c.fill(); c.globalAlpha = 1; }   // a body keeps its colour in death; heavy blood loss only takes a little of it
    const lines = (list, width = .55, colour = SKIN.line) => { c.strokeStyle = colour; c.lineWidth = width; c.lineCap = 'round'; c.beginPath(); for (const [x0, y0, cx, cy, x1, y1] of list) { c.moveTo(x0, y0); c.quadraticCurveTo(cx, cy, x1, y1); } c.stroke(); };
    c.globalAlpha = .55;
    switch (part) {
      case 'chest': lines([[x * .2, -y * .78, x * .9, -y * .5, x * .98, -y * .08], [x * .98, -y * .02, x * .55, y * .2, x * .15, y * .05], [-x * .7, -y * .6, -x * .85, 0, -x * .6, y * .7]]);   // pectoral, and the line of the back
        c.fillStyle = SKIN.line; c.globalAlpha = .45; c.beginPath(); c.arc(x * .82, -y * .04, .9, 0, 7); c.fill(); break;
      case 'abdomen': lines([[x * .5, -y * .85, x * .62, 0, x * .5, y * .85], [x * .15, -y * .4, x * .5, -y * .34, x * .9, -y * .42], [x * .15, y * .08, x * .5, y * .14, x * .92, y * .06]], .45); break;      // the abdominal wall, seen edge-on
      case 'pelvis': lines([[-x * .2, -y * .75, -x * .9, -y * .1, -x * .55, y * .8], [x * .7, -y * .6, x * .45, y * .2, x * .2, y * .85]]); break;                                                          // the buttock, the hip crease
      case 'neck': lines([[x * .5, -y * .8, x * .1, 0, -x * .3, y * .85]], .45); break;                                                                                                                  // the big neck muscle, ear to collar
      case 'thigh': lines([[x * .55, -y * .7, x * .8, 0, x * .45, y * .7], [-x * .3, y * .8, x * .1, y * .66, x * .5, y * .8]], .45); break;
      case 'shin': lines([[-x * .75, -y * .7, -x * 1.0, -y * .2, -x * .45, y * .25], [x * .45, -y * .8, x * .5, 0, x * .35, y * .8]], .4); break;                                                          // calf, shin bone
      case 'upper arm': lines([[x * .3, -y * .55, x * .8, -y * .1, x * .35, y * .4]], .4); break;
      case 'hand': lines([[-x * .3, y * .25, -x * .32, y * .6, -x * .3, y * .9], [x * .15, y * .3, x * .15, y * .62, x * .12, y * .95]], .4); break;
      case 'foot': lines([[x * 1.0, y * .55, x * 1.02, y * .78, x * 1.0, y * .98], [x * 1.25, y * .62, x * 1.27, y * .82, x * 1.26, y * .98], [-x * .2, -y * .3, -x * .55, y * .1, -x * .35, y * .5]], .4); break;   // toes, ankle bone
    }
    c.globalAlpha = 1;
    if (state.far) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(40,22,14,.22)'; c.fillRect(-w * 2, -h, w * 4, h * 2); c.globalCompositeOperation = 'source-over'; }   // the far arm and leg sit in the body's shadow
    if (part === 'head') face(c, x, y, state.face, state.gaze || 0);
  }
  // The face in profile, after reference/ragdoll.png: dark tousled hair over the crown and the back of the head, one brow and one eye, the ear, and a mouth at the front edge.
  // Six moods: neutral, tense (eye screwed shut, teeth gritted), dazed (half-lidded), closed (unconscious), dead (a cross), shout (mouth open on a big hit). gaze slides the iris.
  const HAIR = { base: '#2b1e17', light: '#4d382b' };
  function face(c, x, y, mood, gaze) {
    const shout = mood === 'shout'; if (shout) mood = 'tense'; c.lineCap = 'round'; c.lineJoin = 'round'; const ink = '#2a1c15';
    // ear, then the hair that half covers it
    c.fillStyle = SKIN.base; c.strokeStyle = SKIN.line; c.lineWidth = .5; c.beginPath(); c.ellipse(-x * .12, y * .06, 2.3, 3.6, -.12, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.arc(-x * .1, y * .1, 1.2, .5, 3.7); c.stroke();
    c.fillStyle = HAIR.base; c.beginPath(); c.moveTo(x * .78, -y * .42); c.bezierCurveTo(x * .98, -y * .95, x * .35, -y * 1.2, -x * .2, -y * 1.12); c.bezierCurveTo(-x * .95, -y * 1.1, -x * 1.25, -y * .45, -x * 1.1, y * .1);
    c.bezierCurveTo(-x * 1.05, y * .42, -x * .8, y * .6, -x * .55, y * .5); c.lineTo(-x * .38, y * .1); c.lineTo(-x * .05, -y * .22); c.bezierCurveTo(x * .05, -y * .5, x * .3, -y * .6, x * .55, -y * .55); c.closePath(); c.fill();
    for (const [sx, sy, ex, ey] of [[0, -1.1, .25, -1.27], [.45, -1.0, .75, -1.14], [-.45, -1.08, -.4, -1.26], [-.9, -.85, -1.12, -.98], [.7, -.7, 1.0, -.72], [-1.05, -.2, -1.28, -.12]]) { c.beginPath(); c.moveTo(x * sx - 1.5, y * sy + 1.2); c.lineTo(x * ex, y * ey); c.lineTo(x * sx + 1.7, y * sy + 1.2); c.closePath(); c.fill(); }   // tufts
    c.strokeStyle = HAIR.light; c.lineWidth = .55; c.globalAlpha = .8; for (const [sx, sy, mx, my, ex, ey] of [[.6, -.55, .15, -.95, -.4, -.92], [.3, -.62, -.3, -.8, -.8, -.5], [-.3, -.2, -.85, -.35, -1.0, .15], [.75, -.5, .55, -.88, .1, -1.05]]) { c.beginPath(); c.moveTo(x * sx, y * sy); c.quadraticCurveTo(x * mx, y * my, x * ex, y * ey); c.stroke(); } c.globalAlpha = 1;
    // brow and eye
    const ex = x * .5, ey = -y * .1, half = 2.5, knit = mood === 'tense' ? 1.2 : mood === 'dazed' ? -.3 : 0; c.strokeStyle = HAIR.base; c.lineWidth = 1.1; c.beginPath(); c.moveTo(ex - 2.8, ey - 3.2 - knit * .3); c.quadraticCurveTo(ex, ey - 4.1 + knit * .3, ex + 2.9, ey - 3 + knit); c.stroke();
    c.strokeStyle = ink; c.lineWidth = .8; c.beginPath();
    if (mood === 'dead') { c.lineWidth = 1; c.moveTo(ex - 2, ey - 2); c.lineTo(ex + 2, ey + 2); c.moveTo(ex + 2, ey - 2); c.lineTo(ex - 2, ey + 2); c.stroke(); }
    else if (mood === 'tense') { c.moveTo(ex - half, ey - .6); c.quadraticCurveTo(ex, ey + 1.1, ex + half, ey - .2); c.moveTo(ex - half * .7, ey + 1.3); c.lineTo(ex + half * .6, ey + 1.6); c.stroke(); }
    else if (mood === 'closed') { c.moveTo(ex - half, ey); c.quadraticCurveTo(ex, ey + 1.5, ex + half, ey); c.stroke(); }
    else { const open = mood === 'dazed' ? .8 : 1.9; c.fillStyle = '#f4f1e8'; c.beginPath(); c.moveTo(ex - half, ey); c.quadraticCurveTo(ex, ey - open * 1.25, ex + half, ey); c.quadraticCurveTo(ex, ey + open, ex - half, ey); c.fill();
      c.save(); c.clip(); const ix = ex + .7 + gaze * 1.1; c.fillStyle = '#5a3d28'; c.beginPath(); c.arc(ix, ey, 1.3, 0, 7); c.fill(); c.fillStyle = '#120c08'; c.beginPath(); c.arc(ix, ey, .62, 0, 7); c.fill(); c.restore();
      c.strokeStyle = ink; c.lineWidth = .85; c.beginPath(); c.moveTo(ex - half, ey); c.quadraticCurveTo(ex, ey - open * 1.25, ex + half, ey); c.stroke(); if (mood === 'dazed') { c.lineWidth = .5; c.beginPath(); c.moveTo(ex - 2, ey + 1.7); c.quadraticCurveTo(ex, ey + 2.2, ex + 2, ey + 1.7); c.stroke(); } }
    // nostril, mouth at the front of the face, the line of the jaw
    c.fillStyle = '#7d4a3e'; c.globalAlpha = .7; c.beginPath(); c.ellipse(x * .86, y * .27, .9, .55, .4, 0, 7); c.fill(); c.globalAlpha = 1; c.strokeStyle = '#7d4a3e'; c.lineWidth = .9; const mx = x * .84, my = y * .56; c.beginPath();
    if (shout) { c.fillStyle = '#3a1518'; c.moveTo(mx + .4, my - 2); c.quadraticCurveTo(mx - 4.2, my + .4, mx + .2, my + 2.6); c.closePath(); c.fill(); c.fillStyle = '#efe9dc'; c.fillRect(mx - 1.9, my - 1.5, 2.2, .9); }
    else if (mood === 'tense') { c.moveTo(mx + .4, my); c.lineTo(mx - 4.2, my + .5); c.stroke(); c.strokeStyle = '#efe9dc'; c.lineWidth = .6; c.beginPath(); c.moveTo(mx - .4, my + .1); c.lineTo(mx - 3.4, my + .4); c.stroke(); }
    else if (mood === 'dazed') { c.moveTo(mx + .3, my); c.quadraticCurveTo(mx - 2, my + 1.4, mx - 3.6, my + .6); c.stroke(); }
    else { c.moveTo(mx + .3, my); c.quadraticCurveTo(mx - 2, my + (mood === 'dead' ? .3 : .9), mx - 4, my + .1); c.stroke(); }
    c.strokeStyle = SKIN.line; c.globalAlpha = .45; c.lineWidth = .6; c.beginPath(); c.moveTo(x * .15, y * .88); c.quadraticCurveTo(-x * .1, y * .7, -x * .2, y * .35); c.stroke(); c.globalAlpha = 1;
  }

  // ---- wounds. Every cause has its own shape, so a body can be read: what hit it, how hard, how long ago.
  // depth says which layers a wound opens (0 none: a bruise, a burn, a shock mark; 1 marks the skin; 2 opens it to the muscle; 3 goes through the muscle to bone). wet is when it last bled freely.
  const CLOT_AT = 30, SCAB_AT = 150, lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1), mix = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
  const stageOf = (w, time) => { const age = time - (w.wet ?? w.t ?? time); return w.bleed > .05 && age < CLOT_AT ? 0 : age < SCAB_AT ? 1 : 2; };   // 0 fresh and wet, 1 clotted, 2 scabbed over
  const depthOf = w => w.depth ?? (w.type === 'impact' || w.type === 'burn' || w.type === 'shock' ? 0 : 3), grown = w => Math.min(4, (w.hits || 1) - 1);
  const crater = w => w.type === 'exit' ? clamp(w.radius || 3, 3, 4.4) + grown(w) * .8 : clamp((w.radius || 3) * .95, 3, 5) + grown(w) * .6;   // wounds stay small and crisp; hits in one place make one bigger wound
  function ragged(c, x, y, r, seed, points = 11) { for (let i = 0; i < points; i++) { const a = i / points * Math.PI * 2, rr = r * (.72 + .42 * hash(seed + i * 3.1)); (i ? c.lineTo : c.moveTo).call(c, x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); }
  function slit(c, x, y, length, width, angle) { c.save(); c.translate(x, y); c.rotate(angle); c.moveTo(-length / 2, 0); c.quadraticCurveTo(0, -width, length / 2, 0); c.quadraticCurveTo(0, width, -length / 2, 0); c.closePath(); c.restore(); }
  const along = (c, w, sx, sy, draw) => { c.save(); c.translate(w.x, w.y); c.rotate(w.dir ?? w.seed); c.scale(sx, sy); draw(); c.restore(); };   // a wound is longer along the line of the blow
  // shrapnel: a scatter of small pits, each drawn out along the way the blast was going
  function pits(c, w, k) { const r = w.radius || 3, n = 5 + Math.round(r * .8), spread = r * 1.5 + 2, dir = w.dir ?? w.seed; for (let i = 0; i < n; i++) { const a = hash(w.seed + i * 1.7) * 6.28, d = Math.sqrt(hash(w.seed * 2 + i * 5.3)) * spread, px = w.x + Math.cos(a) * d, py = w.y + Math.sin(a) * d, pr = (.55 + hash(w.seed + i * 9.1) * .9) * k; c.moveTo(px + pr * 1.7, py); c.ellipse(px, py, pr * 1.7, pr * .8, dir, 0, 7); } }
  const cutLength = w => clamp((w.radius || 3) * 3.4, 7, 22), slitAngle = w => (w.dir ?? w.seed) + Math.PI / 2;
  // layer 0 = the hole in the skin, 1 = the hole in the muscle under it. Returns false when this wound does not reach that layer.
  function hole(c, w, layer) {
    const d = depthOf(w); if (d < layer + 2) return false; const r = w.radius || 3, k = layer ? .55 : 1; c.beginPath();
    switch (w.type) {
      case 'bullet': c.arc(w.x, w.y, (layer ? 1.1 : 2.1) + grown(w) * (layer ? .4 : .7), 0, 7); break;                              // small and neat
      case 'exit': along(c, w, 1.35, .85, () => ragged(c, 0, 0, crater(w) * k, w.seed)); break;                                          // bigger, ragged, blown outward
      case 'blast': pits(c, w, k); if (d >= 3) along(c, w, 1.25, .9, () => ragged(c, 0, 0, crater(w) * .7 * k, w.seed, 13)); break;
      case 'stab': slit(c, w.x, w.y, clamp(r * 1.5, 4, 9) * (layer ? .7 : 1), layer ? .8 : 1.3, slitAngle(w)); break;                  // the width of the blade, and it stays narrow
      case 'cut': slit(c, w.x, w.y, cutLength(w) * (layer ? .6 : 1), (d >= 3 ? 2.8 : 1.5) * (layer ? .5 : 1), slitAngle(w)); break;      // long, and it gapes wider the deeper it is
      case 'impact': slit(c, w.x, w.y, 5 + grown(w), layer ? .5 : 1, w.seed); break;                                                     // only a very hard blow splits the skin
      default: return false;
    }
    return true;
  }
  // What a wound does to the skin round it, painted on the skin before the holes are cut: the bruise, the burn, the scorch, the fern, the halo, and wounds too shallow to open anything.
  function mark(s, w, W, H, time) {
    const r = w.radius || 3, tint = (x, y, rad, stops) => { const g = s.createRadialGradient(x, y, 0, x, y, rad); for (const [at, col] of stops) g.addColorStop(at, col); s.fillStyle = g; s.fillRect(-W, -H, W * 2, H * 2); };
    if (w.type === 'impact') { // nothing for the first seconds, then red, spreading and turning purple, then yellow-green as it fades over minutes
      const age = time - (w.t ?? time), col = age < 8 ? mix([214, 84, 76], [88, 40, 96], (age - 2) / 6) : mix([88, 40, 96], [146, 150, 62], (age - 90) / 150), alpha = clamp(age / 3, 0, 1) * lerp(.62, 0, (age - 200) / 100), rad = r * 1.7 * lerp(.55, 1, age / 8) * lerp(1, 1.35, age / 120);
      if (alpha > .02) tint(w.x, w.y, rad, [[0, `rgba(${col},${alpha})`], [.6, `rgba(${mix(col, [120, 70, 60], .5)},${alpha * .6})`], [1, `rgba(${col},0)`]]); }
    else if (w.type === 'burn') { const dose = w.force ?? 99, rad = r * 2; // red, then blistered, then black char; never any blood
      if (dose < 40) { tint(w.x, w.y, rad, [[0, 'rgba(206,62,50,.7)'], [.7, 'rgba(206,80,60,.4)'], [1, 'rgba(206,80,60,0)']]);
        if (dose >= 15) for (let i = 0; i < 5; i++) { const a = hash(w.seed + i) * 6.28, d = hash(w.seed + i * 4.1) * rad * .55, bx = w.x + Math.cos(a) * d, by = w.y + Math.sin(a) * d, br = .9 + hash(w.seed + i * 7.7) * 1.1; s.fillStyle = 'rgba(238,214,160,.9)'; s.strokeStyle = 'rgba(150,60,46,.8)'; s.lineWidth = .35; s.beginPath(); s.arc(bx, by, br, 0, 7); s.fill(); s.stroke(); s.fillStyle = '#ffffffaa'; s.beginPath(); s.arc(bx - br * .3, by - br * .3, br * .3, 0, 7); s.fill(); } }
      else { tint(w.x, w.y, rad, [[0, 'rgba(14,10,9,.95)'], [.5, 'rgba(30,18,14,.85)'], [.75, 'rgba(150,50,36,.5)'], [1, 'rgba(150,70,40,0)']]); s.strokeStyle = 'rgba(190,80,50,.55)'; s.lineWidth = .4; for (let i = 0; i < 5; i++) { const a = hash(w.seed + i * 2.3) * 6.28; s.beginPath(); s.moveTo(w.x, w.y); s.lineTo(w.x + Math.cos(a) * rad * .3 + hash(i) - .5, w.y + Math.sin(a) * rad * .3); s.lineTo(w.x + Math.cos(a + .3) * rad * .55, w.y + Math.sin(a + .3) * rad * .55); s.stroke(); } } }
    else if (w.type === 'shock') { // where the current went in, where it came out, and the red fern it drew under the skin between them
      const ex = clamp(-w.x * .7 + (hash(w.seed) - .5) * W * .4, -W / 2 + 2, W / 2 - 2), ey = clamp(w.y + (hash(w.seed * 3) > .5 ? 1 : -1) * H * .38, -H / 2 + 2, H / 2 - 2), heading = Math.atan2(ey - w.y, ex - w.x), reach = Math.hypot(ex - w.x, ey - w.y);
      s.strokeStyle = 'rgba(168,44,56,.75)'; s.lineCap = 'round'; const fern = (x, y, a, len, n) => { if (n < 0 || len < 1) return; const bend = a + (hash(x * 3.1 + y * 1.7 + n) - .5) * .7, x2 = x + Math.cos(bend) * len, y2 = y + Math.sin(bend) * len; s.lineWidth = .3 + n * .18; s.beginPath(); s.moveTo(x, y); s.lineTo(x2, y2); s.stroke(); fern(x2, y2, bend + .55, len * .62, n - 1); fern(x2, y2, bend - .55, len * .62, n - 1); if (n > 1) fern(x2, y2, bend, len * .8, n - 1); };
      fern(w.x, w.y, heading, reach * .3, 3 + Math.min(1, grown(w))); s.lineCap = 'butt';
      for (const [x, y, size] of [[w.x, w.y, 1.5], [ex, ey, 1.9]]) tint(x, y, size * 2.4, [[0, 'rgba(16,10,9,.95)'], [.42, 'rgba(40,20,14,.9)'], [.6, 'rgba(190,60,44,.6)'], [1, 'rgba(190,60,44,0)']]); }
    else { const st = stageOf(w, time), d = depthOf(w);
      if (w.type === 'blast') tint(w.x, w.y, r * 2.4 + 3, [[0, 'rgba(22,15,12,.6)'], [.6, 'rgba(40,24,18,.35)'], [1, 'rgba(40,24,18,0)']]);   // scorched
      const halo = Math.min(7, r * (w.type === 'cut' ? 1 : 1.25) + 1.5), red = st === 0 ? .5 : st === 1 ? .28 : .1; tint(w.x, w.y, halo, [[0, `rgba(140,28,36,${red})`], [1, 'rgba(140,28,36,0)']]);
      if (d === 1) { s.strokeStyle = s.fillStyle = st === 0 ? '#9c2630' : st === 1 ? '#5d1820' : '#4a2a20'; s.lineCap = 'round'; // too shallow to open the skin: a scratch, a graze, a peppering
        if (w.type === 'cut') { s.lineWidth = .7; s.save(); s.translate(w.x, w.y); s.rotate(slitAngle(w)); s.beginPath(); s.moveTo(-cutLength(w) / 2, 0); s.quadraticCurveTo(0, -.8, cutLength(w) / 2, 0); s.stroke(); s.restore(); }
        else if (w.type === 'bullet') { s.lineWidth = 1.5; const a = w.dir ?? w.seed; s.beginPath(); s.moveTo(w.x - Math.cos(a) * 3.5, w.y - Math.sin(a) * 3.5); s.lineTo(w.x + Math.cos(a) * 3.5, w.y + Math.sin(a) * 3.5); s.stroke(); }
        else if (w.type === 'blast') { s.beginPath(); pits(s, w, .8); s.fill(); } s.lineCap = 'butt'; } }
  }
  // Over the finished layers: what is in the hole (wet blood, a clot, a scab), its rim, and the skin torn outward by exit wounds and blasts.
  function finish(c, w, time) {
    const d = depthOf(w); if (d < 2) return; const st = stageOf(w, time), rim = st === 0 ? '#a3222c' : st === 1 ? '#5d1820' : '#3a2018';
    if (st > 0 && hole(c, w, 0)) { c.fillStyle = st === 1 ? 'rgba(70,14,20,.62)' : 'rgba(44,25,19,.93)'; c.fill(); }             // the clot darkens it; the scab closes it
    if (w.type === 'bullet') { if (st < 2) { c.fillStyle = '#16060a'; c.beginPath(); c.arc(w.x, w.y, 1 + grown(w) * .3, 0, 7); c.fill(); } c.strokeStyle = rim; c.lineWidth = .7; c.beginPath(); c.arc(w.x, w.y, 2.3 + grown(w) * .7, 0, 7); c.stroke(); }
    else if (w.type === 'exit' || w.type === 'blast') { c.strokeStyle = rim; c.lineWidth = .7; c.beginPath(); along(c, w, w.type === 'exit' ? 1.35 : 1.25, w.type === 'exit' ? .85 : .9, () => ragged(c, 0, 0, crater(w) * (w.type === 'exit' || d < 3 ? 1 : .7), w.seed, w.type === 'exit' ? 11 : 13)); if (w.type === 'exit' || d >= 3) c.stroke();
      const a = w.dir ?? w.seed, reach = crater(w) * (w.type === 'exit' ? 1.3 : 1); c.fillStyle = '#c99a78'; for (const off of [-.55, 0, .55]) { const b = a + off, bx = w.x + Math.cos(b) * reach, by = w.y + Math.sin(b) * reach; c.beginPath(); c.moveTo(bx - Math.sin(b) * 1.1, by + Math.cos(b) * 1.1); c.lineTo(bx + Math.cos(b) * 1.8, by + Math.sin(b) * 1.8); c.lineTo(bx + Math.sin(b) * 1.1, by - Math.cos(b) * 1.1); c.closePath(); c.fill(); c.stroke(); } }   // flaps of skin, thrown the way the force went
    else if (hole(c, w, 0)) { c.strokeStyle = rim; c.lineWidth = .5; c.stroke(); }
    if (st === 0) { c.fillStyle = '#ffffff66'; c.beginPath(); c.arc(w.x - .7, w.y - .7, .55, 0, 7); c.fill(); }                        // wet
  }

  const scratch = [0, 1].map(() => document.createElement('canvas'));
  function layer(target, index, size, paint, holes) {         // draw a layer on a scratch canvas, punch its holes, then lay it down
    const canvas = scratch[index]; if (canvas.width !== size.w || canvas.height !== size.h) { canvas.width = size.w; canvas.height = size.h; }
    const c = canvas.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, size.w, size.h); c.setTransform(SCALE, 0, 0, SCALE, size.w / 2, size.h / 2);
    c.globalCompositeOperation = 'source-over'; paint(c); c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000'; holes(c); c.globalCompositeOperation = 'source-over';
    target.setTransform(1, 0, 0, 1, 0, 0); target.drawImage(canvas, 0, 0); target.setTransform(SCALE, 0, 0, SCALE, size.w / 2, size.h / 2);
  }

  function paintPart(canvas, p, state) {
    const w = p.w, h = p.h, part = p.part, slot = p.slot ?? 0; state.far = FAR.has(slot) && !!p.part; const size = { w: Math.ceil((w + PAD * 2) * SCALE), h: Math.ceil((h + PAD * 2) * SCALE) };
    canvas.width = size.w; canvas.height = size.h; const c = canvas.getContext('2d'); c.setTransform(SCALE, 0, 0, SCALE, size.w / 2, size.h / 2); c.lineJoin = 'round';
    const wounds = state.noGore ? [] : p.wounds || [], hp = p.hp ?? 100, broken = (p.bone ?? 100) <= 50 && slot >= 5 && !state.noGore;   // limbs only, like the engine's fractured()
    // Beyond its individual wounds, a part that is nearly destroyed loses skin, and then muscle, in seeded patches.
    const torn = []; if (!state.noGore) { const skinLoss = Math.floor(clamp((40 - hp) / 8, 0, 4)), deep = Math.floor(clamp((16 - hp) / 5, 0, 3));
      for (let i = 0; i < skinLoss; i++) torn.push({ x: (hash(slot * 9.1 + i) - .5) * w * .8, y: (hash(slot * 5.3 + i * 2.7) - .5) * h * .8, r: 2.2 + hash(i + slot) * 2, seed: slot + i, deep: i < deep }); }
    // Fire eats the body from the outside in. char runs 0..1 over about sixteen seconds of burning: the skin is gone by the middle of that, the muscle by the end, and the bone is left, blackened.
    // A regrowing part is the same picture run backwards: bone first, then the flesh closes over it, then the skin (p.grow runs 0..1). It shows even with gore off - it is growth, not injury.
    const charred = state.noGore ? 0 : state.char || 0, burn = Math.max(charred, p.grow !== undefined ? clamp(1.08 - p.grow * 1.1, 0, 1) : 0), reach = Math.max(w, h), burnSkin = [], burnMuscle = [];
    const eaten = p.grow !== undefined ? burn : clamp((burn - .14) / .86, 0, 1);   // fire spends its first seconds reddening and blistering the skin before it starts to go through it
    if (eaten > .04) for (let i = 0; i < 12; i++) { const bx = (hash(slot * 3.7 + i * 1.9) - .5) * w * .9, by = (hash(slot * 7.1 + i * 4.3) - .5) * h * .9, rs = clamp(eaten * 1.2 - i * .035, 0, 1) * reach * (eaten > .8 ? 1.6 : .62), rm = clamp((eaten - .45) * 2 - i * .04, 0, 1) * reach * (eaten > .92 ? 1.6 : .6); if (rs > .6) burnSkin.push([bx, by, rs, i]); if (rm > .6) burnMuscle.push([bx, by, rm, i]); }
    const view = state.view || 0, intact = !view && !wounds.length && !torn.length && !broken && !burnSkin.length;   // view 1 leaves the skin off, 2 the muscle too (the inspector's layer views)
    if (!intact) { c.save(); outline(c, part, w, h); c.clip(); outline(c, part, w, h); drawBone(c, part, w, h, broken, clamp((1 - burn) / .22, 0, 1)); c.restore();
      if (view < 2) layer(c, 0, size, m => { outline(m, part, w, h); drawMuscle(m, part, w, h); }, m => { for (const wd of wounds) if (hole(m, wd, 1)) m.fill(); for (const t of torn) if (t.deep) { m.beginPath(); ragged(m, t.x, t.y, t.r * .6, t.seed); m.fill(); } if (broken) { m.beginPath(); m.ellipse(0, h * .04, w * .34, h * .07, .25, 0, 7); m.fill(); } for (const [bx, by, r, i] of burnMuscle) { m.beginPath(); ragged(m, bx, by, r, slot + i, 12); m.fill(); } });
      if (charred > .5) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = `rgba(20,14,11,${Math.min(.28, (charred - .5) * .6)})`; c.fillRect(-w, -h, w * 2, h * 2); c.globalCompositeOperation = 'source-over'; } }   // and what is left chars
    if (view) { c.save(); outline(c, part, w, h); c.clip();   // organs in their places, green to red by how much is left of them; a ring round every fracture
      for (const [organ, x0, y0, x1, y1] of (root.Sandbox?.ORGANS?.[part] || [])) { const left = state.organs ? state.organs[organ] ?? 100 : 100, hue = Math.round(left * 1.2); c.fillStyle = `hsla(${hue},70%,50%,.42)`; c.strokeStyle = `hsla(${hue},80%,62%,.95)`; c.lineWidth = .6; c.beginPath(); c.roundRect(x0 * w / 2 + 1, y0 * h / 2 + 1, (x1 - x0) * w / 2 - 2, (y1 - y0) * h / 2 - 2, 3); c.fill(); c.stroke(); }
      if (broken) { c.strokeStyle = '#ff5a4a'; c.lineWidth = 1.2; c.beginPath(); c.arc(0, h * .04, w * .62, 0, 7); c.stroke(); } c.restore();
      c.save(); outline(c, part, w, h); c.strokeStyle = view > 1 ? '#8fb6c455' : '#c98a7a88'; c.lineWidth = .6; c.stroke(); c.restore(); }
    // A fracture swells: over twenty seconds the limb bulges at the break and the skin over it goes tight and dark.
    const swell = broken && p.brokeAt !== undefined ? clamp((state.time - p.brokeAt) / 20, 0, 1) : 0;
    if (!view) layer(c, 1, size, s => { outline(s, part, w, h); if (swell > .05) { s.moveTo(w / 2 + 1.8 * swell, h * .04); s.ellipse(0, h * .04, w / 2 + 1.8 * swell, Math.min(h * .2, 7), 0, 0, 7); } drawSkin(s, part, w, h, slot, state);
      // bruises, burns and charring are changes to the skin itself, so they are painted before the holes are cut
      if (!state.noGore) { s.globalCompositeOperation = 'source-atop'; for (const wd of wounds) mark(s, wd, w, h, state.time);
        if (swell > .05) { const g = s.createRadialGradient(0, h * .04, 0, 0, h * .04, w * .85); g.addColorStop(0, `rgba(120,44,92,${.5 * swell})`); g.addColorStop(.6, `rgba(170,60,70,${.3 * swell})`); g.addColorStop(1, 'rgba(170,60,70,0)'); s.fillStyle = g; s.fillRect(-w, -h, w * 2, h * 2); }
        if (charred > .01 && charred < .45) { s.fillStyle = `rgba(206,62,50,${Math.min(.45, charred * 4) * (1 - charred / .45)})`; s.fillRect(-w, -h, w * 2, h * 2);   // fire on skin: first it reddens, then it blisters, then it blackens and goes
          if (charred > .07) for (let i = 0; i < 7; i++) { const bx = (hash(slot * 2.3 + i * 3.7) - .5) * w * .8, by = (hash(slot * 4.1 + i * 1.3) - .5) * h * .8, br = .8 + hash(i + slot) * 1.2; s.fillStyle = 'rgba(238,214,160,.85)'; s.strokeStyle = 'rgba(150,60,46,.7)'; s.lineWidth = .35; s.beginPath(); s.arc(bx, by, br, 0, 7); s.fill(); s.stroke(); } }
        if (state.livor > .05 && state.down !== undefined) { const a = state.down * Math.PI / 4, reach = Math.abs(Math.cos(a)) * w / 2 + Math.abs(Math.sin(a)) * h / 2, g = s.createLinearGradient(-Math.cos(a) * reach * .15, -Math.sin(a) * reach * .15, Math.cos(a) * reach, Math.sin(a) * reach); g.addColorStop(0, 'rgba(104,44,84,0)'); g.addColorStop(1, `rgba(104,44,84,${.6 * state.livor})`); s.fillStyle = g; s.fillRect(-w, -h, w * 2, h * 2); }   // livor: the blood of the dead settles into the side that is down
        if (p.bruise > .05) { const r = Math.max(w, h) * .6 * p.bruise + 3, g = s.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, `rgba(70,28,78,${Math.min(.75, p.bruise)})`); g.addColorStop(1, 'rgba(96,60,44,0)'); s.fillStyle = g; s.globalCompositeOperation = 'source-atop'; s.fillRect(-w, -h, w * 2, h * 2); }
      }
      if (state.char > 0) { s.globalCompositeOperation = 'source-atop'; s.fillStyle = `rgba(24,17,14,${Math.min(.75, state.char * 1.6)})`; s.fillRect(-w, -h, w * 2, h * 2); }   // the skin that is still there blackens fast
      s.globalCompositeOperation = 'source-over'; outline(s, part, w, h); s.strokeStyle = SKIN.line; s.lineWidth = .7; s.stroke();
    }, s => { for (const wd of wounds) if (hole(s, wd, 0)) s.fill(); for (const t of torn) { s.beginPath(); ragged(s, t.x, t.y, t.r, t.seed); s.fill(); } if (broken) { s.beginPath(); s.ellipse(0, h * .04, w * .42, h * .1, .25, 0, 7); s.fill(); } for (const [bx, by, r, i] of burnSkin) { s.beginPath(); ragged(s, bx, by, r, slot * 2 + i, 12); s.fill(); } });
    if (state.noGore || view) return;
    // finishing: the dark bore of a bullet hole, torn edges round the big wounds, the shard of a broken bone
    c.save(); outline(c, part, w, h); c.clip();   // a wound's rim never shows outside the body it is on
    for (const wd of wounds) finish(c, wd, state.time);
    c.restore();
    if (broken) { c.fillStyle = BONE.base; c.strokeStyle = '#6b1b24'; c.lineWidth = .5; c.beginPath(); c.moveTo(-w * .08, h * .08); c.lineTo(w * .5, -h * .06); c.lineTo(w * .36, h * .05); c.lineTo(w * .05, h * .14); c.closePath(); c.fill(); c.stroke(); }
    // dressings: a cloth band round the part over each sealed wound (bands that overlap merge), with a little blood showing through where the wound is
    const bands = []; for (const wd of [...wounds, ...(p.severed || [])]) if (wd.sealed) { const y = clamp(wd.y, -h / 2 + 3, h / 2 - 3), near = bands.find(b => Math.abs(b.y - y) < 6); const half = wd.type === 'cut' ? 6.5 : 3.6; if (near) { near.y = (near.y + y) / 2; near.half = Math.max(near.half, half); near.spots.push(wd); } else bands.push({ y, half, spots: [wd] }); }   // a long cut takes a wider dressing
    if (bands.length) { c.save(); outline(c, part, w, h); c.clip();
      for (const band of bands) { c.fillStyle = '#e9e2d0'; c.fillRect(-w, band.y - band.half, w * 2, band.half * 2); c.strokeStyle = 'rgba(120,105,80,.55)'; c.lineWidth = .5; for (const dy of [-1, -.33, .33, 1].map(k => k * band.half)) { c.beginPath(); c.moveTo(-w, band.y + dy + .25 * dy); c.lineTo(w, band.y + dy - .25 * dy); c.stroke(); }
        for (const wd of band.spots) { c.fillStyle = 'rgba(150,40,46,.55)'; c.beginPath(); c.arc(clamp(wd.x, -w / 2 + 2, w / 2 - 2), band.y, 1.6, 0, 7); c.fill(); } }
      c.restore(); }
    // stumps: a ragged cap of muscle round a nub of bone, wherever a joint was torn away
    if (burn < .9) for (const end of p.severed || []) { if (end.sealed) continue; /* a dressed stump is wrapped, see above */ const r = Math.min(w * .52, 8); c.fillStyle = MUSCLE.dark; c.beginPath(); ragged(c, end.x, end.y, r, end.x + end.y, 12); c.fill(); c.fillStyle = MUSCLE.base; c.beginPath(); ragged(c, end.x, end.y, r * .72, end.x * 2 + end.y, 10); c.fill();
      c.fillStyle = BONE.base; c.strokeStyle = BONE.shade; c.lineWidth = .5; c.beginPath(); c.arc(end.x, end.y, r * .34, 0, 7); c.fill(); c.stroke(); c.fillStyle = BONE.marrow; c.beginPath(); c.arc(end.x, end.y, r * .13, 0, 7); c.fill(); }
  }

  // ---- cache. A numeric signature of everything that changes the picture; string keys only for the shared pristine sprites.
  const perBody = new WeakMap(), pristine = new Map();
  function signature(p, state) {
    let sig = (state.view ? state.view * 86028121 + (state.organs ? Math.round(state.organs.brain / 10) + Math.round(state.organs.heart / 10) * 11 + Math.round(state.organs.lungs / 10) * 121 + Math.round(state.organs.gut / 10) * 1331 : 0) * 7919 : 0) + (state.livor > .05 ? (Math.round(state.livor * 4) * 8 + state.down) * 1299709 : 0) + (p.brokeAt !== undefined && (p.bone ?? 100) <= 50 ? Math.round(clamp((state.time - p.brokeAt) / 20, 0, 1) * 4) * 15485863 : 0) + (p.grow !== undefined ? Math.round(p.grow * 24) * 2097143 : 0) + Math.round((p.hp ?? 100) / 4) + Math.round((p.bone ?? 100) / 10) * 31 + Math.round(state.pale * 8) * 977 + Math.round(state.char * 20) * 6151 + Math.round((p.bruise || 0) * 10) * 39119 + state.faceId * 100003 + (state.noGore ? 7 : 0) + (state.dead ? 13 : 0);
    const wounds = p.wounds; if (wounds) for (let i = 0; i < wounds.length; i++) { const w = wounds[i], age = state.time - (w.t ?? 0); sig += ((w.seed * 1e5 | 0) + depthOf(w) * 7 + stageOf(w, state.time) * 3 + (w.hits || 0) * 11 + Math.round((w.radius || 0) * 2) * 13 + Math.round((w.force || 0) / 8) * 17 + (w.type === 'impact' ? (age < 10 ? Math.floor(age) : 10 + Math.floor(age / 15)) * 19 : 0)) * (i + 3); }
    const ends = p.severed; if (ends) { sig += ends.length * 524287; for (let i = 0; i < ends.length; i++) if (ends[i].sealed) sig += 8191 * (i + 1); } if (wounds) for (let i = 0; i < wounds.length; i++) if (wounds[i].sealed) sig += 131071 * (i + 1); return sig;
  }
  function sprite(body, state) {
    const p = body.plugin; state.down = state.livor > .05 ? ((Math.round((Math.PI / 2 - (body.angle || 0)) / (Math.PI / 4)) % 8) + 8) % 8 : undefined; if (state.down !== undefined && p.flip) state.down = (12 - state.down) % 8; /* which way is down, in this part's own frame, to the nearest 45 degrees */ const sig = signature(p, state); let entry = perBody.get(body); if (entry && entry.sig === sig) return entry.canvas;
    const clean = !state.view && p.grow === undefined && !(state.livor > .05) && !p.wounds?.length && !p.severed?.length && (p.hp ?? 100) >= 48 && (p.bone ?? 100) > 50 && !(p.bruise > .05) && !(state.char > .03);
    if (clean) { const key = `${p.slot}|${state.faceId}|${Math.round(state.pale * 8)}|${Math.round(state.char * 20)}|${state.dead ? 1 : 0}`; let shared = pristine.get(key);
      if (!shared) { if (pristine.size > 400) pristine.clear(); shared = document.createElement('canvas'); paintPart(shared, p, state); pristine.set(key, shared); } perBody.set(body, { sig, canvas: shared, own: false }); return shared; }
    const canvas = entry?.own ? entry.canvas : document.createElement('canvas'); paintPart(canvas, p, state); perBody.set(body, { sig, canvas, own: true }); return canvas;
  }
  // Draw order for a profile body: the far arm and leg behind the trunk, the near ones in front. Objects go between (1), unless a hand holds them.
  const FAR = new Set([5, 6, 7, 11, 12, 13]);
  function depth(p) { if (p.stuck !== undefined) return -1; if (p.slot !== undefined && p.part) return FAR.has(p.slot) ? 0 : p.slot === 1 ? 1.9 : p.slot === 0 ? 2.1 : p.slot <= 4 ? 2 : 3; /* neck under the trunk, head over it: the head and chest each hide one end of the neck */ if (p.heldSlot !== undefined) return FAR.has(p.heldSlot) ? .5 : 3.5; return 1; }
  const FACES = ['neutral', 'tense', 'dazed', 'closed', 'dead', 'shout'];
  root.BodyArt = {
    SCALE, PAD, FACES, layer: depth,
    trace(ctx, p) { ctx.beginPath(); outline(ctx, p.part, p.w, p.h); },   // the part's silhouette as a path, for clipping what lies on the skin
    // The strip that closes the gap at a joint, drawn just before the outer part so it sits in that limb's layer.
    filler(ctx, c, a, b) { const pa = c.bodyA.plugin, pb = c.bodyB.plugin, organic = pb.material === 'flesh', burnt = Math.max(Math.min(pa.char || 0, pb.char || 0), pb.grow !== undefined ? 1 - pb.grow : 0);   /* a joint to a part that is still growing is bare bone, then raw, then skinned */ ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      if (!organic) { ctx.strokeStyle = '#596d67'; ctx.lineWidth = 6; } else if (burnt > .8) { ctx.strokeStyle = burnt > .95 ? '#b9ad92' : '#7a2429'; ctx.lineWidth = 2.2; } else { ctx.strokeStyle = burnt > .45 ? '#8e3034' : depth(pb) === 0 ? '#b48d6e' : '#d6ab88'; ctx.lineWidth = Math.min(pa.w, pb.w) * .72; }
      ctx.stroke(); ctx.lineCap = 'butt'; },
    // Draw a human part at the origin of the current transform (already translated, rotated and mirrored by the caller).
    draw(ctx, body, state) { const canvas = sprite(body, state); ctx.drawImage(canvas, -canvas.width / SCALE / 2, -canvas.height / SCALE / 2, canvas.width / SCALE, canvas.height / SCALE); },
    // For previews (library card, spawn ghost): a pristine part from its dimensions alone.
    preview(ctx, part, slot, w, h) { const canvas = sprite({ plugin: { part, slot, w, h, hp: 100, bone: 100 } }, { pale: 0, char: 0, face: 'neutral', faceId: 1, gaze: 0, noGore: true, dead: false, time: 0 }); ctx.drawImage(canvas, -canvas.width / SCALE / 2, -canvas.height / SCALE / 2, canvas.width / SCALE, canvas.height / SCALE); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

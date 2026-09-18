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

  // ---- outlines: one closed path per part, in the part's own frame, centred on its physics rectangle (w x h)
  function outline(c, part, w, h, slot) {
    const x = w / 2, y = h / 2; c.beginPath();
    switch (part) {
      case 'head': c.moveTo(-x * .1, -y); c.bezierCurveTo(x * .95, -y, x * 1.08, -y * .35, x * .98, y * .05); c.lineTo(x * 1.04, y * .34); c.bezierCurveTo(x * .98, y * .62, x * .8, y * .9, x * .42, y); c.bezierCurveTo(x * .05, y * 1.02, -x * .45, y * .85, -x * .62, y * .5); c.bezierCurveTo(-x * 1.08, y * .3, -x * 1.15, -y * .95, -x * .1, -y); break;
      case 'neck': c.moveTo(-x * .85, -y); c.lineTo(x * .85, -y); c.quadraticCurveTo(x * .8, 0, x * 1.15, y); c.lineTo(-x * 1.15, y); c.quadraticCurveTo(-x * .8, 0, -x * .85, -y); break;
      case 'chest': c.moveTo(-x * .5, -y); c.lineTo(x * .5, -y); c.bezierCurveTo(x * .95, -y * .98, x * 1.12, -y * .7, x * 1.08, -y * .3); c.bezierCurveTo(x * 1.02, y * .3, x * .86, y * .7, x * .78, y); c.lineTo(-x * .78, y); c.bezierCurveTo(-x * .86, y * .7, -x * 1.02, y * .3, -x * 1.08, -y * .3); c.bezierCurveTo(-x * 1.12, -y * .7, -x * .95, -y * .98, -x * .5, -y); break;
      case 'abdomen': c.moveTo(-x * 1.02, -y); c.lineTo(x * 1.02, -y); c.bezierCurveTo(x * .9, -y * .2, x * .92, y * .4, x * 1.06, y); c.lineTo(-x * 1.06, y); c.bezierCurveTo(-x * .92, y * .4, -x * .9, -y * .2, -x * 1.02, -y); break;
      case 'pelvis': c.moveTo(-x * .93, -y); c.lineTo(x * .93, -y); c.bezierCurveTo(x * 1.08, -y * .5, x * 1.06, y * .2, x * .9, y * .62); c.lineTo(x * .22, y); c.quadraticCurveTo(0, y * .72, -x * .22, y); c.lineTo(-x * .9, y * .62); c.bezierCurveTo(-x * 1.06, y * .2, -x * 1.08, -y * .5, -x * .93, -y); break;
      case 'upper arm': c.moveTo(-x * .8, -y); c.lineTo(x * .8, -y); c.bezierCurveTo(x * 1.15, -y * .55, x * 1.05, y * .3, x * .78, y); c.lineTo(-x * .78, y); c.bezierCurveTo(-x * 1.05, y * .3, -x * 1.15, -y * .55, -x * .8, -y); break;
      case 'forearm': c.moveTo(-x * .85, -y); c.lineTo(x * .85, -y); c.bezierCurveTo(x * 1.12, -y * .5, x * .85, y * .4, x * .68, y); c.lineTo(-x * .68, y); c.bezierCurveTo(-x * .85, y * .4, -x * 1.12, -y * .5, -x * .85, -y); break;
      case 'hand': c.moveTo(-x * .7, -y); c.lineTo(x * .7, -y); c.bezierCurveTo(x * 1.1, -y * .6, x * 1.05, y * .2, x * .8, y * .8); c.quadraticCurveTo(0, y * 1.12, -x * .8, y * .8); c.bezierCurveTo(-x * 1.05, y * .2, -x * 1.1, -y * .6, -x * .7, -y); break;
      case 'thigh': c.moveTo(-x * .9, -y); c.lineTo(x * .9, -y); c.bezierCurveTo(x * 1.14, -y * .45, x * 1.0, y * .45, x * .72, y); c.lineTo(-x * .72, y); c.bezierCurveTo(-x * 1.0, y * .45, -x * 1.14, -y * .45, -x * .9, -y); break;
      case 'shin': c.moveTo(-x * .85, -y); c.lineTo(x * .85, -y); c.bezierCurveTo(x * 1.18, -y * .55, x * .9, y * .3, x * .62, y); c.lineTo(-x * .62, y); c.bezierCurveTo(-x * .9, y * .3, -x * 1.18, -y * .55, -x * .85, -y); break;
      case 'foot': { const d = 1; c.moveTo(-d * x * .45, -y); c.lineTo(d * x * .25, -y); c.bezierCurveTo(d * x * .45, -y * .1, d * x * .95, y * .05, d * x * 1.02, y * .62); c.quadraticCurveTo(d * x * 1.0, y, d * x * .8, y); c.lineTo(-d * x * .5, y); c.quadraticCurveTo(-d * x * .72, y * .2, -d * x * .45, -y); break; }
      default: c.roundRect(-x, -y, w, h, 3);
    }
    c.closePath();
  }

  // ---- layer 1: the skeleton, in a dark cavity
  function drawBone(c, part, w, h, slot, broken) {
    const x = w / 2, y = h / 2; c.fillStyle = BONE.cavity; c.fill();
    c.fillStyle = BONE.base; c.strokeStyle = BONE.shade; c.lineWidth = .5; c.lineCap = 'round';
    const shaft = (x0, y0, x1, y1, width) => { c.strokeStyle = BONE.shade; c.lineWidth = width + .9; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.strokeStyle = BONE.base; c.lineWidth = width; c.stroke(); };
    const knob = (kx, ky, r) => { c.fillStyle = BONE.base; c.strokeStyle = BONE.shade; c.lineWidth = .5; c.beginPath(); c.arc(kx, ky, r, 0, 7); c.fill(); c.stroke(); };
    const vertebra = vy => { c.fillStyle = BONE.base; c.strokeStyle = BONE.shade; c.lineWidth = .4; c.beginPath(); c.roundRect(-2.6, vy - 1.7, 5.2, 3.4, 1.2); c.fill(); c.stroke(); c.fillRect(-4.2, vy - .5, 1.6, 1); c.fillRect(2.6, vy - .5, 1.6, 1); };
    switch (part) {
      case 'head':
        c.beginPath(); c.moveTo(0, -y * .93); c.bezierCurveTo(x * .98, -y * .93, x * .98, y * .02, x * .7, y * .3); c.lineTo(x * .5, y * .62); c.quadraticCurveTo(0, y * .95, -x * .5, y * .62); c.lineTo(-x * .7, y * .3); c.bezierCurveTo(-x * .98, y * .02, -x * .98, -y * .93, 0, -y * .93); c.fill(); c.stroke();
        c.fillStyle = BONE.cavity; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * x * .4, -y * .08, x * .25, y * .15, s * .2, 0, 7); c.fill(); }
        c.beginPath(); c.moveTo(0, y * .08); c.lineTo(x * .14, y * .3); c.lineTo(-x * .14, y * .3); c.closePath(); c.fill();
        c.strokeStyle = BONE.cavity; c.lineWidth = .45; c.beginPath(); c.moveTo(-x * .42, y * .52); c.lineTo(x * .42, y * .52); for (let t = -3; t <= 3; t++) { c.moveTo(t * x * .12, y * .44); c.lineTo(t * x * .12, y * .6); } c.stroke(); break;
      case 'neck': for (let i = 0; i < 3; i++) vertebra(-y + 2.6 + i * 4.4); break;
      case 'chest':
        for (let i = 0; i < 6; i++) { const ry = -y * .72 + i * 5.1, reach = x * (.92 - Math.abs(i - 2) * .05); c.strokeStyle = BONE.shade; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-1, ry); c.quadraticCurveTo(-reach, ry - 1.5, -reach * .96, ry + 3.4); c.moveTo(1, ry); c.quadraticCurveTo(reach, ry - 1.5, reach * .96, ry + 3.4); c.stroke(); c.strokeStyle = BONE.base; c.lineWidth = 1.7; c.stroke(); }
        shaft(-x * .78, -y * .78, -2, -y * .68, 1.6); shaft(x * .78, -y * .78, 2, -y * .68, 1.6);                // clavicles
        c.fillStyle = BONE.base; c.strokeStyle = BONE.shade; c.lineWidth = .5; c.beginPath(); c.roundRect(-2.1, -y * .7, 4.2, y * 1.05, 1.6); c.fill(); c.stroke();   // sternum
        for (let i = 0; i < 3; i++) vertebra(y * .5 + i * 3.6); break;
      case 'abdomen': for (let i = 0; i < 5; i++) vertebra(-y + 2.4 + i * 4.5); break;
      case 'pelvis':
        for (const s of [-1, 1]) { c.fillStyle = BONE.base; c.strokeStyle = BONE.shade; c.lineWidth = .5; c.beginPath(); c.moveTo(s * 1.5, -y * .55); c.bezierCurveTo(s * x * .5, -y * 1.0, s * x * 1.0, -y * .8, s * x * .92, -y * .1); c.bezierCurveTo(s * x * .85, y * .35, s * x * .5, y * .5, s * x * .3, y * .78); c.quadraticCurveTo(s * x * .1, y * .5, s * 1.5, y * .2); c.closePath(); c.fill(); c.stroke(); c.fillStyle = BONE.cavity; c.beginPath(); c.ellipse(s * x * .42, y * .38, x * .15, y * .17, 0, 0, 7); c.fill(); }
        c.fillStyle = BONE.base; c.beginPath(); c.moveTo(-2.6, -y * .7); c.lineTo(2.6, -y * .7); c.lineTo(1.2, y * .25); c.lineTo(-1.2, y * .25); c.closePath(); c.fill(); c.stroke(); break;
      case 'upper arm': shaft(0, -y * .78, 0, y * .8, 2.6); knob(0, -y * .82, 2.6); knob(-1.2, y * .84, 1.8); knob(1.2, y * .84, 1.8); break;
      case 'forearm': shaft(-1.6, -y * .85, -1.3, y * .86, 1.7); shaft(1.7, -y * .82, 1.2, y * .86, 1.4); knob(-1.6, -y * .86, 1.6); knob(1.5, y * .88, 1.4); break;
      case 'hand': c.fillStyle = BONE.base; c.strokeStyle = BONE.shade; c.beginPath(); c.roundRect(-x * .6, -y * .85, x * 1.2, y * .5, 1.3); c.fill(); c.stroke(); for (let i = 0; i < 4; i++) { const fx = -x * .52 + i * x * .35; shaft(fx, -y * .3, fx * 1.15, y * .3, .9); shaft(fx * 1.15, y * .38, fx * 1.2, y * .78, .7); } break;
      case 'thigh': shaft(0, -y * .72, 0, y * .82, 3.4); knob(-2.2, -y * .84, 2.9); knob(1.4, -y * .7, 1.8); knob(-1.7, y * .86, 2.3); knob(1.7, y * .86, 2.3); break;
      case 'shin': shaft(-1, -y * .82, -.7, y * .86, 2.7); shaft(2.6, -y * .74, 2.2, y * .84, 1.1); knob(-1, -y * .86, 2.6); knob(-.6, y * .88, 1.9); break;
      case 'foot': { const d = 1; c.fillStyle = BONE.base; c.strokeStyle = BONE.shade; c.beginPath(); c.roundRect(d > 0 ? -x * .4 : -x * .15, -y * .55, x * .55, y * 1.15, 1.6); c.fill(); c.stroke(); for (let i = 0; i < 4; i++) shaft(d * x * .18, -y * .2 + i * y * .3, d * x * .86, y * .1 + i * y * .2, .9); break; }
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
      case 'chest': lines([[-x * .88, -y * .02, -x * .45, y * .24, -1.2, y * .02], [x * .88, -y * .02, x * .45, y * .24, 1.2, y * .02], [0, -y * .55, 0, -y * .2, 0, y * .1], [-x * .5, -y * .78, -x * .25, -y * .66, -1.5, -y * .7], [x * .5, -y * .78, x * .25, -y * .66, 1.5, -y * .7]]);
        c.fillStyle = SKIN.line; c.globalAlpha = .45; for (const s of [-1, 1]) { c.beginPath(); c.arc(s * x * .5, -y * .02, .9, 0, 7); c.fill(); } break;
      case 'abdomen': lines([[0, -y * .9, 0, -y * .2, 0, y * .25], [-x * .42, -y * .4, 0, -y * .32, x * .42, -y * .4], [-x * .4, y * .02, 0, y * .1, x * .4, y * .02]], .45); c.fillStyle = SKIN.line; c.beginPath(); c.ellipse(0, y * .45, .9, 1.3, 0, 0, 7); c.fill(); break;
      case 'pelvis': lines([[-x * .82, -y * .2, -x * .45, y * .3, -x * .12, y * .78], [x * .82, -y * .2, x * .45, y * .3, x * .12, y * .78]]); break;
      case 'neck': lines([[-x * .45, -y * .8, -x * .2, 0, -1, y * .8], [x * .45, -y * .8, x * .2, 0, 1, y * .8]], .4); break;
      case 'thigh': lines([[x * .25, -y * .7, x * .4, 0, x * .1, y * .62], [-x * .45, y * .78, 0, y * .66, x * .45, y * .78]], .45); break;
      case 'shin': lines([[-x * .2, -y * .6, -x * .05, 0, -x * .15, y * .7]], .4); break;
      case 'upper arm': lines([[x * .2, -y * .5, x * .42, 0, x * .12, y * .45]], .4); break;
      case 'hand': lines([[-x * .35, y * .15, -x * .38, y * .5, -x * .4, y * .86], [0, y * .2, 0, y * .55, 0, y * .95], [x * .35, y * .15, x * .38, y * .5, x * .4, y * .86]], .4); break;
      case 'foot': { const d = 1; lines([[d * x * .62, y * .45, d * x * .64, y * .7, d * x * .62, y * .95], [d * x * .78, y * .5, d * x * .8, y * .72, d * x * .8, y * .95], [d * x * .45, y * .42, d * x * .46, y * .7, d * x * .44, y * .95]], .4); break; }
    }
    c.globalAlpha = 1;
    if (part === 'head') face(c, x, y, state.face, state.gaze || 0);
  }
  // The face, after reference/ragdoll.png, turned three-quarters toward +x: dark tousled hair, brows, two eyes (the far one narrower), nose, mouth, an ear half under the hair.
  // Six moods: neutral, tense (eyes screwed shut, teeth gritted), dazed (half-lidded), closed (unconscious), dead (crosses), shout (mouth open on a big hit). gaze slides the irises.
  const HAIR = { base: '#2b1e17', light: '#4d382b' };
  function face(c, x, y, mood, gaze) {
    const shout = mood === 'shout'; if (shout) mood = 'tense'; c.lineCap = 'round'; c.lineJoin = 'round';
    // ear, then hair over it
    c.fillStyle = SKIN.base; c.strokeStyle = SKIN.line; c.lineWidth = .5; c.beginPath(); c.ellipse(-x * .42, y * .08, 2, 3.2, -.15, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.arc(-x * .42, y * .1, 1, .6, 3.6); c.stroke();
    c.fillStyle = HAIR.base; c.beginPath(); c.moveTo(x * .78, -y * .5); c.bezierCurveTo(x * .9, -y * .95, x * .2, -y * 1.16, -x * .2, -y * 1.1); c.bezierCurveTo(-x * .9, -y * 1.08, -x * 1.22, -y * .45, -x * 1.08, y * .12);
    c.bezierCurveTo(-x * 1.02, y * .42, -x * .8, y * .5, -x * .66, y * .36); c.lineTo(-x * .6, y * .02); c.lineTo(-x * .34, -y * .12); c.bezierCurveTo(-x * .3, -y * .45, -x * .05, -y * .62, x * .3, -y * .6); c.bezierCurveTo(x * .55, -y * .62, x * .66, -y * .52, x * .78, -y * .5); c.closePath(); c.fill();
    for (const [sx, sy, ex, ey] of [[-.1, -1.08, .12, -1.24], [.3, -1.02, .55, -1.15], [-.5, -1.04, -.42, -1.22], [-.85, -.85, -1.02, -.98], [.6, -.86, .86, -.9]]) { c.beginPath(); c.moveTo(x * sx - 1.4, y * sy + 1); c.lineTo(x * ex, y * ey); c.lineTo(x * sx + 1.6, y * sy + 1); c.closePath(); c.fill(); }   // tousled tufts
    c.strokeStyle = HAIR.light; c.lineWidth = .55; c.globalAlpha = .8; for (const [sx, sy, mx, my, ex, ey] of [[.5, -.62, .1, -.95, -.4, -.9], [.2, -.66, -.3, -.8, -.75, -.55], [-.35, -.2, -.8, -.4, -.95, .05], [.7, -.55, .5, -.85, .15, -1.0]]) { c.beginPath(); c.moveTo(x * sx, y * sy); c.quadraticCurveTo(x * mx, y * my, x * ex, y * ey); c.stroke(); } c.globalAlpha = 1;
    // brows
    const near = x * .16, far = x * .72, ey = -y * .1, ink = '#2a1c15'; c.strokeStyle = HAIR.base; c.lineWidth = 1.05; const knit = mood === 'tense' ? 1.1 : mood === 'dazed' ? -.3 : 0;
    c.beginPath(); c.moveTo(near - 2.6, ey - 3 - knit * .2); c.quadraticCurveTo(near, ey - 4 + knit * .3, near + 2.6, ey - 3.1 + knit); c.moveTo(far - 1.7, ey - 3.1 + knit); c.quadraticCurveTo(far + .2, ey - 4 + knit * .3, far + 1.8, ey - 3 - knit * .1); c.stroke();
    // eyes
    for (const [ex, half] of [[near, 2.5], [far, 1.7]]) { c.strokeStyle = ink; c.lineWidth = .8; c.beginPath();
      if (mood === 'dead') { c.lineWidth = 1; c.moveTo(ex - half * .8, ey - 1.8); c.lineTo(ex + half * .8, ey + 1.8); c.moveTo(ex + half * .8, ey - 1.8); c.lineTo(ex - half * .8, ey + 1.8); c.stroke(); continue; }
      if (mood === 'tense') { c.moveTo(ex - half, ey - .6); c.quadraticCurveTo(ex, ey + 1.1, ex + half, ey - .2); c.moveTo(ex - half * .7, ey + 1.2); c.lineTo(ex + half * .6, ey + 1.5); c.stroke(); continue; }   // screwed shut, with a crease under
      if (mood === 'closed') { c.moveTo(ex - half, ey); c.quadraticCurveTo(ex, ey + 1.5, ex + half, ey); c.stroke(); continue; }
      const open = mood === 'dazed' ? .8 : 1.9; c.fillStyle = '#f4f1e8'; c.beginPath(); c.moveTo(ex - half, ey); c.quadraticCurveTo(ex, ey - open * 1.25, ex + half, ey); c.quadraticCurveTo(ex, ey + open, ex - half, ey); c.fill();
      c.save(); c.clip(); c.fillStyle = '#5a3d28'; c.beginPath(); c.arc(ex + gaze * half * .45 + .3, ey, 1.25, 0, 7); c.fill(); c.fillStyle = '#120c08'; c.beginPath(); c.arc(ex + gaze * half * .45 + .3, ey, .6, 0, 7); c.fill(); c.restore();
      c.strokeStyle = ink; c.lineWidth = .85; c.beginPath(); c.moveTo(ex - half, ey); c.quadraticCurveTo(ex, ey - open * 1.25, ex + half, ey); c.stroke(); if (mood === 'dazed') { c.lineWidth = .5; c.beginPath(); c.moveTo(ex - half * .8, ey + 1.6); c.quadraticCurveTo(ex, ey + 2.1, ex + half * .8, ey + 1.6); c.stroke(); } }
    // nose, mouth, jaw shadow
    c.strokeStyle = SKIN.line; c.lineWidth = .8; c.beginPath(); c.moveTo(x * .46, ey + .5); c.quadraticCurveTo(x * .62, y * .2, x * .66, y * .34); c.quadraticCurveTo(x * .56, y * .42, x * .42, y * .38); c.stroke();
    c.strokeStyle = '#7d4a3e'; c.lineWidth = .9; c.beginPath(); const mx = x * .44, my = y * .62;
    if (shout) { c.fillStyle = '#3a1518'; c.ellipse(mx, my + .6, 2.6, 2, 0, 0, 7); c.fill(); c.fillStyle = '#efe9dc'; c.fillRect(mx - 1.8, my - 1.1, 3.6, .9); }
    else if (mood === 'tense') { c.moveTo(mx - 3, my + .3); c.lineTo(mx + 3, my - .1); c.stroke(); c.strokeStyle = '#efe9dc'; c.lineWidth = .6; c.beginPath(); c.moveTo(mx - 2.2, my + .1); c.lineTo(mx + 2.2, my - .1); c.stroke(); }
    else if (mood === 'dazed') { c.moveTo(mx - 2.4, my); c.quadraticCurveTo(mx, my + 1.3, mx + 2.4, my + .2); c.stroke(); }
    else { c.moveTo(mx - 2.8, my); c.quadraticCurveTo(mx, my + (mood === 'dead' ? .2 : .9), mx + 2.8, my - .2); c.stroke(); }
    c.strokeStyle = SKIN.line; c.globalAlpha = .4; c.lineWidth = .6; c.beginPath(); c.moveTo(mx - 1.4, my + 3); c.quadraticCurveTo(mx, my + 3.6, mx + 1.4, my + 3); c.stroke(); c.globalAlpha = 1;
  }

  // ---- wounds: what each one removes from the skin and from the muscle
  function ragged(c, x, y, r, seed, points = 11) { for (let i = 0; i < points; i++) { const a = i / points * Math.PI * 2, rr = r * (.72 + .42 * hash(seed + i * 3.1)); (i ? c.lineTo : c.moveTo).call(c, x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); }
  function slit(c, x, y, length, width, angle) { c.save(); c.translate(x, y); c.rotate(angle); c.moveTo(-length / 2, 0); c.quadraticCurveTo(0, -width, length / 2, 0); c.quadraticCurveTo(0, width, -length / 2, 0); c.closePath(); c.restore(); }
  // depth 0 = the hole in the skin, 1 = the hole in the muscle under it
  function hole(c, w, depth) {
    const r = w.radius || 3, k = depth ? .5 : 1; c.beginPath();
    switch (w.type) {
      case 'bullet': c.arc(w.x, w.y, depth ? 1.1 : 2.3, 0, 7); break;
      case 'exit': ragged(c, w.x, w.y, Math.max(3.4, r) * k, w.seed); break;
      case 'blast': ragged(c, w.x, w.y, Math.max(3, r * .95) * k, w.seed, 13); break;
      case 'stab': slit(c, w.x, w.y, clamp(r * 1.5, 4, 9) * (depth ? .7 : 1), depth ? .9 : 1.7, (w.dir ?? w.seed) + Math.PI / 2); break;
      case 'cut': if (depth && r < 5) return false; slit(c, w.x, w.y, clamp(r * 3.4, 7, 22) * (depth ? .6 : 1), depth ? .7 : 1.5, (w.dir ?? w.seed) + Math.PI / 2); break;
      default: return false;                                 // bruises and burns leave the layers intact
    }
    return true;
  }

  const scratch = [0, 1].map(() => document.createElement('canvas'));
  function layer(target, index, size, paint, holes) {         // draw a layer on a scratch canvas, punch its holes, then lay it down
    const canvas = scratch[index]; if (canvas.width !== size.w || canvas.height !== size.h) { canvas.width = size.w; canvas.height = size.h; }
    const c = canvas.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, size.w, size.h); c.setTransform(SCALE, 0, 0, SCALE, size.w / 2, size.h / 2);
    c.globalCompositeOperation = 'source-over'; paint(c); c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000'; holes(c); c.globalCompositeOperation = 'source-over';
    target.setTransform(1, 0, 0, 1, 0, 0); target.drawImage(canvas, 0, 0); target.setTransform(SCALE, 0, 0, SCALE, size.w / 2, size.h / 2);
  }

  function paintPart(canvas, p, state) {
    const w = p.w, h = p.h, part = p.part, slot = p.slot ?? 0, size = { w: Math.ceil((w + PAD * 2) * SCALE), h: Math.ceil((h + PAD * 2) * SCALE) };
    canvas.width = size.w; canvas.height = size.h; const c = canvas.getContext('2d'); c.setTransform(SCALE, 0, 0, SCALE, size.w / 2, size.h / 2); c.lineJoin = 'round';
    const wounds = state.noGore ? [] : p.wounds || [], hp = p.hp ?? 100, broken = (p.bone ?? 100) <= 50 && slot >= 5 && !state.noGore;   // limbs only, like the engine's fractured()
    // Beyond its individual wounds, a part that is nearly destroyed loses skin, and then muscle, in seeded patches.
    const torn = []; if (!state.noGore) { const skinLoss = Math.floor(clamp((48 - hp) / 7, 0, 7)), deep = Math.floor(clamp((16 - hp) / 4, 0, 4));
      for (let i = 0; i < skinLoss; i++) torn.push({ x: (hash(slot * 9.1 + i) - .5) * w * .8, y: (hash(slot * 5.3 + i * 2.7) - .5) * h * .8, r: 3 + hash(i + slot) * 3.5, seed: slot + i, deep: i < deep }); }
    // Fire eats the body from the outside in. char runs 0..1 over about sixteen seconds of burning: the skin is gone by the middle of that, the muscle by the end, and the bone is left, blackened.
    const burn = state.noGore ? 0 : state.char || 0, reach = Math.max(w, h), burnSkin = [], burnMuscle = [];
    if (burn > .04) for (let i = 0; i < 12; i++) { const bx = (hash(slot * 3.7 + i * 1.9) - .5) * w * .9, by = (hash(slot * 7.1 + i * 4.3) - .5) * h * .9, rs = clamp(burn * 1.2 - i * .035, 0, 1) * reach * .62, rm = clamp((burn - .45) * 2 - i * .04, 0, 1) * reach * .6; if (rs > .6) burnSkin.push([bx, by, rs, i]); if (rm > .6) burnMuscle.push([bx, by, rm, i]); }
    const intact = !wounds.length && !torn.length && !broken && !burnSkin.length;
    if (!intact) { outline(c, part, w, h, slot); drawBone(c, part, w, h, slot, broken);
      layer(c, 0, size, m => { outline(m, part, w, h, slot); drawMuscle(m, part, w, h); }, m => { for (const wd of wounds) if (hole(m, wd, 1)) m.fill(); for (const t of torn) if (t.deep) { m.beginPath(); ragged(m, t.x, t.y, t.r * .6, t.seed); m.fill(); } if (broken) { m.beginPath(); m.ellipse(0, h * .04, w * .34, h * .07, .25, 0, 7); m.fill(); } for (const [bx, by, r, i] of burnMuscle) { m.beginPath(); ragged(m, bx, by, r, slot + i, 12); m.fill(); } });
      if (burn > .5) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = `rgba(20,14,11,${(burn - .5) * 1.3})`; c.fillRect(-w, -h, w * 2, h * 2); c.globalCompositeOperation = 'source-over'; } }   // and what is left chars
    layer(c, 1, size, s => { outline(s, part, w, h, slot); drawSkin(s, part, w, h, slot, state);
      // bruises, burns and charring are changes to the skin itself, so they are painted before the holes are cut
      if (!state.noGore) { for (const wd of wounds) { if (wd.type === 'impact') { const fade = clamp(1 - (state.time - (wd.t ?? state.time)) / 150, .25, 1), r = (wd.radius || 3) * 1.7, g = s.createRadialGradient(wd.x, wd.y, 0, wd.x, wd.y, r); g.addColorStop(0, `rgba(88,40,96,${.62 * fade})`); g.addColorStop(.6, `rgba(120,70,60,${.4 * fade})`); g.addColorStop(1, 'rgba(150,130,60,0)'); s.fillStyle = g; s.globalCompositeOperation = 'source-atop'; s.fillRect(-w, -h, w * 2, h * 2); }
          else if (wd.type === 'burn') { const r = (wd.radius || 3) * 2, g = s.createRadialGradient(wd.x, wd.y, 0, wd.x, wd.y, r); g.addColorStop(0, 'rgba(18,12,10,.9)'); g.addColorStop(.55, 'rgba(96,40,24,.6)'); g.addColorStop(1, 'rgba(150,70,40,0)'); s.fillStyle = g; s.globalCompositeOperation = 'source-atop'; s.fillRect(-w, -h, w * 2, h * 2); } }
        if (p.bruise > .05) { const r = Math.max(w, h) * .6 * p.bruise + 3, g = s.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, `rgba(70,28,78,${Math.min(.75, p.bruise)})`); g.addColorStop(1, 'rgba(96,60,44,0)'); s.fillStyle = g; s.globalCompositeOperation = 'source-atop'; s.fillRect(-w, -h, w * 2, h * 2); }
        // every open wound reddens the skin around it
        for (const wd of wounds) if (wd.type !== 'impact' && wd.type !== 'burn') { const r = (wd.radius || 3) * (wd.type === 'cut' ? 1.2 : 1.9) + 2, g = s.createRadialGradient(wd.x, wd.y, 0, wd.x, wd.y, r); g.addColorStop(0, 'rgba(140,28,36,.75)'); g.addColorStop(1, 'rgba(140,28,36,0)'); s.fillStyle = g; s.globalCompositeOperation = 'source-atop'; s.fillRect(-w, -h, w * 2, h * 2); } }
      if (state.char > 0) { s.globalCompositeOperation = 'source-atop'; s.fillStyle = `rgba(24,17,14,${Math.min(.75, state.char * 1.6)})`; s.fillRect(-w, -h, w * 2, h * 2); }   // the skin that is still there blackens fast
      s.globalCompositeOperation = 'source-over'; outline(s, part, w, h, slot); s.strokeStyle = SKIN.line; s.lineWidth = .7; s.stroke();
    }, s => { for (const wd of wounds) if (hole(s, wd, 0)) s.fill(); for (const t of torn) { s.beginPath(); ragged(s, t.x, t.y, t.r, t.seed); s.fill(); } if (broken) { s.beginPath(); s.ellipse(0, h * .04, w * .42, h * .1, .25, 0, 7); s.fill(); } for (const [bx, by, r, i] of burnSkin) { s.beginPath(); ragged(s, bx, by, r, slot * 2 + i, 12); s.fill(); } });
    if (state.noGore) return;
    // finishing: the dark bore of a bullet hole, torn edges round the big wounds, the shard of a broken bone
    for (const wd of wounds) { if (wd.type === 'bullet') { c.fillStyle = '#16060a'; c.beginPath(); c.arc(wd.x, wd.y, 1, 0, 7); c.fill(); c.strokeStyle = '#5d1820'; c.lineWidth = .6; c.beginPath(); c.arc(wd.x, wd.y, 2.3, 0, 7); c.stroke(); }
      else if (wd.type === 'exit' || wd.type === 'blast') { c.strokeStyle = '#6b1b24'; c.lineWidth = .7; c.beginPath(); ragged(c, wd.x, wd.y, Math.max(3.2, (wd.radius || 3) * (wd.type === 'exit' ? 1 : .95)), wd.seed, wd.type === 'exit' ? 11 : 13); c.stroke(); } }
    if (broken) { c.fillStyle = BONE.base; c.strokeStyle = '#6b1b24'; c.lineWidth = .5; c.beginPath(); c.moveTo(-w * .08, h * .08); c.lineTo(w * .5, -h * .06); c.lineTo(w * .36, h * .05); c.lineTo(w * .05, h * .14); c.closePath(); c.fill(); c.stroke(); }
    // stumps: a ragged cap of muscle round a nub of bone, wherever a joint was torn away
    for (const end of p.severed || []) { const r = Math.min(w * .52, 8); c.fillStyle = MUSCLE.dark; c.beginPath(); ragged(c, end.x, end.y, r, end.x + end.y, 12); c.fill(); c.fillStyle = MUSCLE.base; c.beginPath(); ragged(c, end.x, end.y, r * .72, end.x * 2 + end.y, 10); c.fill();
      c.fillStyle = BONE.base; c.strokeStyle = BONE.shade; c.lineWidth = .5; c.beginPath(); c.arc(end.x, end.y, r * .34, 0, 7); c.fill(); c.stroke(); c.fillStyle = BONE.marrow; c.beginPath(); c.arc(end.x, end.y, r * .13, 0, 7); c.fill(); }
  }

  // ---- cache. A numeric signature of everything that changes the picture; string keys only for the shared pristine sprites.
  const perBody = new WeakMap(), pristine = new Map();
  function signature(p, state) {
    let sig = Math.round((p.hp ?? 100) / 4) + Math.round((p.bone ?? 100) / 10) * 31 + Math.round(state.pale * 8) * 977 + Math.round(state.char * 20) * 6151 + Math.round((p.bruise || 0) * 10) * 39119 + state.faceId * 100003 + (state.noGore ? 7 : 0) + (state.dead ? 13 : 0);
    const wounds = p.wounds; if (wounds) for (let i = 0; i < wounds.length; i++) { const w = wounds[i]; sig += (w.seed * 1e5 | 0) * (i + 3) + (w.type === 'impact' ? Math.floor((state.time - (w.t ?? 0)) / 12) * 17 : 0); }
    const ends = p.severed; if (ends) sig += ends.length * 524287; return sig;
  }
  function sprite(body, state) {
    const p = body.plugin, sig = signature(p, state); let entry = perBody.get(body); if (entry && entry.sig === sig) return entry.canvas;
    const clean = !p.wounds?.length && !p.severed?.length && (p.hp ?? 100) >= 48 && (p.bone ?? 100) > 50 && !(p.bruise > .05) && !(state.char > .03);
    if (clean) { const key = `${p.slot}|${state.faceId}|${Math.round(state.pale * 8)}|${Math.round(state.char * 20)}|${state.dead ? 1 : 0}`; let shared = pristine.get(key);
      if (!shared) { if (pristine.size > 400) pristine.clear(); shared = document.createElement('canvas'); paintPart(shared, p, state); pristine.set(key, shared); } perBody.set(body, { sig, canvas: shared, own: false }); return shared; }
    const canvas = entry?.own ? entry.canvas : document.createElement('canvas'); paintPart(canvas, p, state); perBody.set(body, { sig, canvas, own: true }); return canvas;
  }
  const FACES = ['neutral', 'tense', 'dazed', 'closed', 'dead', 'shout'];
  root.BodyArt = {
    SCALE, PAD, FACES,
    // Draw a human part at the origin of the current transform (already translated, rotated and mirrored by the caller).
    draw(ctx, body, state) { const canvas = sprite(body, state); ctx.drawImage(canvas, -canvas.width / SCALE / 2, -canvas.height / SCALE / 2, canvas.width / SCALE, canvas.height / SCALE); },
    // For previews (library card, spawn ghost): a pristine part from its dimensions alone.
    preview(ctx, part, slot, w, h) { const canvas = sprite({ plugin: { part, slot, w, h, hp: 100, bone: 100 } }, { pale: 0, char: 0, face: 'neutral', faceId: 1, gaze: 0, noGore: true, dead: false, time: 0 }); ctx.drawImage(canvas, -canvas.width / SCALE / 2, -canvas.height / SCALE / 2, canvas.width / SCALE, canvas.height / SCALE); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

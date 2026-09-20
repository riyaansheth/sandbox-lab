/* Sandbox Lab — item art. Rendering only.
 *
 * Every item is painted once, at three times world scale, into its own small canvas and stamped from there; the per-frame cost of an
 * object is one drawImage however much shading went into it. A painter is { pad, state?, paint, live? }:
 *   scale  optional: the painter draws on a grid this many times smaller than it looks
 *   pad    world pixels the drawing may extend beyond the physics shape (a pistol's grip hangs below its box)
 *   state  a short string of whatever changes the picture (on/off, bloodied); each state gets its own sprite
 *   paint  (c, p) draws the item centred on the origin, in world units
 *   live   (c, p, time) draws the parts that move every frame, straight onto the screen: a flame, a countdown
 */
(function (root) {
  'use strict';
  const SCALE = 3, cache = new Map();
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const poly = (c, points) => { c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); };
  const grad = (c, x0, y0, x1, y1, stops) => { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(([at, colour]) => g.addColorStop(at, colour)); return g; };
  const radial = (c, x, y, r0, r1, stops) => { const g = c.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(([at, colour]) => g.addColorStop(at, colour)); return g; };
  const OUTLINE = '#10161a';
  // Shared surfaces
  const steel = (c, y0, y1) => grad(c, 0, y0, 0, y1, [[0, '#c3ccd0'], [.18, '#8e999f'], [.55, '#66727a'], [1, '#3e484f']]);
  const grain = (c, x, y, w, h, seed, colour = '#5d4526') => { c.strokeStyle = colour; c.lineWidth = .5; c.globalAlpha = .55; for (let i = 0; i < Math.round(h / 2.6); i++) { const gy = y + 1.5 + i * 2.6 + hash(seed + i) * 1.2; c.beginPath(); c.moveTo(x + 1, gy); c.bezierCurveTo(x + w * .3, gy + (hash(seed + i * 3) - .5) * 2.4, x + w * .7, gy + (hash(seed + i * 5) - .5) * 2.4, x + w - 1, gy + (hash(seed + i * 7) - .5)); c.stroke(); } c.globalAlpha = 1; };
  const rivet = (c, x, y, r = 1.1) => { c.fillStyle = '#2c353a'; c.beginPath(); c.arc(x, y + .3, r, 0, 7); c.fill(); c.fillStyle = '#c9d2d4'; c.beginPath(); c.arc(x - .25, y - .25, r * .6, 0, 7); c.fill(); };

  const painters = {
    crate: { pad: 2, paint(c, p) { const s = p.w / 2;
      c.fillStyle = grad(c, -s, -s, s, s, [[0, '#c29a5f'], [1, '#8f6a3a']]); c.strokeStyle = OUTLINE; c.lineWidth = 1.2; c.beginPath(); c.roundRect(-s, -s, p.w, p.h, 2.5); c.fill(); c.stroke();
      for (let i = 0; i < 4; i++) { const y = -s + 6 + i * (p.h - 12) / 4; grain(c, -s + 6, y, p.w - 12, (p.h - 12) / 4, i * 9); c.strokeStyle = '#6b4d27'; c.lineWidth = .8; c.beginPath(); c.moveTo(-s + 6, y); c.lineTo(s - 6, y); c.stroke(); }
      // frame boards and the diagonal brace
      c.fillStyle = grad(c, -s, 0, s, 0, [[0, '#b58a4e'], [.5, '#d2a86a'], [1, '#a17940']]); for (const [x, y, w, h] of [[-s, -s, p.w, 7], [-s, s - 7, p.w, 7], [-s, -s, 7, p.h], [s - 7, -s, 7, p.h]]) { c.fillRect(x, y, w, h); c.strokeStyle = '#5f4322'; c.lineWidth = .6; c.strokeRect(x, y, w, h); }
      c.save(); c.beginPath(); c.rect(-s + 7, -s + 7, p.w - 14, p.h - 14); c.clip(); c.lineWidth = 7; c.strokeStyle = '#b98f53'; c.beginPath(); c.moveTo(-s + 5, s - 5); c.lineTo(s - 5, -s + 5); c.stroke(); c.lineWidth = .6; c.strokeStyle = '#5f4322'; c.beginPath(); c.moveTo(-s + 1, s - 8); c.lineTo(s - 8, -s + 1); c.moveTo(-s + 8, s - 1); c.lineTo(s - 1, -s + 8); c.stroke(); c.restore();
      for (const x of [-s + 3.5, s - 3.5]) for (const y of [-s + 3.5, s - 3.5]) rivet(c, x, y, 1); } },
    barrel: { pad: 2, paint(c, p) { const x = p.w / 2, y = p.h / 2;
      c.fillStyle = grad(c, -x, 0, x, 0, [[0, '#5e1d18'], [.22, '#c2412f'], [.45, '#e0614a'], [.75, '#a5321f'], [1, '#4f1713']]); c.strokeStyle = OUTLINE; c.lineWidth = 1.2; c.beginPath(); c.roundRect(-x, -y, p.w, p.h, 4); c.fill(); c.stroke();
      for (const ry of [-y + 3, -y * .36, y * .36, y - 3]) { c.fillStyle = grad(c, -x, 0, x, 0, [[0, '#3f1310'], [.4, '#f08a72'], [1, '#3f1310']]); c.fillRect(-x - .8, ry - 1.6, p.w + 1.6, 3.2); c.strokeStyle = '#2a0c0a'; c.lineWidth = .5; c.strokeRect(-x - .8, ry - 1.6, p.w + 1.6, 3.2); }
      // flammable diamond
      c.save(); c.translate(0, 0); c.rotate(Math.PI / 4); c.fillStyle = '#f0c24a'; c.strokeStyle = '#2a0c0a'; c.lineWidth = .8; c.beginPath(); c.rect(-7.5, -7.5, 15, 15); c.fill(); c.stroke(); c.restore();
      c.fillStyle = '#2a0c0a'; c.beginPath(); c.moveTo(0, -6); c.bezierCurveTo(5, -1, 4, 5, 0, 6); c.bezierCurveTo(-4, 5, -5, 0, -2, -2); c.bezierCurveTo(-1.5, 0, 0, 0, 0, -6); c.fill();
      c.fillStyle = '#ffffff22'; c.fillRect(-x * .55, -y + 4, 3, p.h - 8); } },
    metal: { pad: 1, paint(c, p) { const x = p.w / 2, y = p.h / 2;   // an I-beam seen from the side: bright flanges, a recessed web
      c.strokeStyle = OUTLINE; c.lineWidth = 1; c.fillStyle = grad(c, 0, -y, 0, y, [[0, '#55626a'], [.5, '#3c474e'], [1, '#2f383e']]); c.fillRect(-x, -y, p.w, p.h);
      c.fillStyle = steel(c, -y, -y + 5); c.fillRect(-x, -y, p.w, 4.5); c.fillStyle = steel(c, y - 4.5, y + 3); c.fillRect(-x, y - 4.5, p.w, 4.5); c.strokeRect(-x, -y, p.w, p.h);
      c.strokeStyle = '#1d2529'; c.lineWidth = .6; c.beginPath(); c.moveTo(-x, -y + 4.5); c.lineTo(x, -y + 4.5); c.moveTo(-x, y - 4.5); c.lineTo(x, y - 4.5); c.stroke();
      for (let bx = -x + 10; bx < x - 4; bx += 26) { rivet(c, bx, 0, 1.3); }
      c.globalAlpha = .35; for (let i = 0; i < 9; i++) { c.fillStyle = '#8a4a2a'; const rx = -x + hash(i) * p.w; c.fillRect(rx, -y + 4.5, 1 + hash(i + 3) * 2, 2 + hash(i + 7) * 6); } c.globalAlpha = 1; } },
    plank: { pad: 1, paint(c, p) { const x = p.w / 2, y = p.h / 2; c.fillStyle = grad(c, 0, -y, 0, y, [[0, '#caa672'], [.5, '#b08a55'], [1, '#8a6a3c']]); c.strokeStyle = OUTLINE; c.lineWidth = 1; c.beginPath(); c.roundRect(-x, -y, p.w, p.h, 1.5); c.fill(); c.stroke();
      grain(c, -x, -y, p.w, p.h, 4); for (const [kx, ky] of [[-x * .45, 0], [x * .3, -1]]) { c.strokeStyle = '#5d4526'; c.lineWidth = .6; for (const r of [1, 2.2, 3.4]) { c.beginPath(); c.ellipse(kx, ky, r * 1.6, r * .8, 0, 0, 7); c.stroke(); } }
      c.fillStyle = '#7a5a30'; c.fillRect(-x, -y, 2, p.h); c.fillRect(x - 2, -y, 2, p.h); for (const nx of [-x + 8, x - 8]) rivet(c, nx, 0, .9); } },
    ball: { pad: 1, paint(c, p) { const r = p.r; c.fillStyle = radial(c, -r * .35, -r * .4, r * .1, r * 1.25, [[0, '#f2a08c'], [.45, '#cf4a3a'], [1, '#6e1d18']]); c.strokeStyle = OUTLINE; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); c.stroke();
      c.save(); c.beginPath(); c.arc(0, 0, r - .6, 0, 7); c.clip(); c.strokeStyle = '#f7e9d0'; c.lineWidth = 2.2; c.beginPath(); c.arc(0, -r * 1.35, r * 1.5, .62, 2.52); c.stroke(); c.beginPath(); c.arc(0, r * 1.35, r * 1.5, 3.76, 5.66); c.stroke(); c.restore();
      c.fillStyle = '#ffffff55'; c.beginPath(); c.ellipse(-r * .38, -r * .45, r * .22, r * .13, -.6, 0, 7); c.fill(); } },
    brick: { pad: 1, paint(c, p) { const x = p.w / 2, y = p.h / 2; c.fillStyle = grad(c, 0, -y, 0, y, [[0, '#b9bdb6'], [.6, '#9a9f98'], [1, '#777c76']]); c.strokeStyle = OUTLINE; c.lineWidth = 1; poly(c, [[-x + 1, -y], [x - 2, -y], [x, -y + 2], [x, y - 1], [x - 1, y], [-x + 3, y], [-x, y - 3], [-x, -y + 1]]); c.fill(); c.stroke();
      for (const cx of [-x * .48, x * .48]) { c.fillStyle = grad(c, 0, -y * .55, 0, y * .55, [[0, '#4d524e'], [1, '#6c716c']]); c.beginPath(); c.roundRect(cx - x * .3, -y * .52, x * .6, y * 1.04, 2); c.fill(); c.strokeStyle = '#5a5f5a'; c.lineWidth = .6; c.stroke(); }
      for (let i = 0; i < 46; i++) { c.fillStyle = hash(i) > .5 ? '#ffffff2e' : '#0000002e'; c.fillRect(-x + hash(i + 1) * p.w, -y + hash(i + 2) * p.h, 1, 1); } } },
    glass: { pad: 1, paint(c, p) { const x = p.w / 2, y = p.h / 2; c.fillStyle = grad(c, -x, -y, x, y, [[0, '#d7f3f355'], [.5, '#9fd0d63a'], [1, '#c4ecec55']]); c.strokeStyle = '#e4fbf8cc'; c.lineWidth = .9; c.fillRect(-x, -y, p.w, p.h); c.strokeRect(-x, -y, p.w, p.h);
      c.fillStyle = '#7fb9bd88'; c.fillRect(-x, -y, 1.6, p.h); c.fillRect(x - 1.6, -y, 1.6, p.h); c.strokeStyle = '#ffffffaa'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-x + 3, y * .55); c.lineTo(x - 3, y * .2); c.moveTo(-x + 3, -y * .25); c.lineTo(x - 3, -y * .6); c.stroke(); } },
    bomb: { pad: 8, state: p => p.fuse !== undefined ? 'lit' : '', paint(c, p) { const r = p.r;    // a cast-iron shell with a timer strapped across it
      c.fillStyle = radial(c, -r * .35, -r * .4, r * .1, r * 1.3, [[0, '#7c868a'], [.4, '#343c40'], [1, '#0f1416']]); c.strokeStyle = OUTLINE; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); c.stroke();
      c.fillStyle = steel(c, -r - 6, -r + 2); c.beginPath(); c.roundRect(-5, -r - 5, 10, 7, 1.5); c.fill(); c.stroke();
      c.strokeStyle = p.fuse !== undefined ? '#ffd38a' : '#8d7a55'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(0, -r - 5); c.quadraticCurveTo(7, -r - 13, 14, -r - 7); c.stroke();
      c.fillStyle = '#1a2023'; c.strokeStyle = '#596469'; c.lineWidth = .7; c.beginPath(); c.roundRect(-r * .72, -5.5, r * 1.44, 11, 1.5); c.fill(); c.stroke(); c.fillStyle = '#ffffff33'; c.beginPath(); c.ellipse(-r * .4, -r * .5, r * .2, r * .11, -.6, 0, 7); c.fill(); },
      live(c, p) { c.fillStyle = p.fuse !== undefined ? '#ff5a3c' : '#5d2a22'; c.font = 'bold 9px ui-monospace, Menlo, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(p.fuse !== undefined ? Math.max(0, p.fuse).toFixed(1) : '0.0', 0, .5); if (p.fuse !== undefined && Math.floor(p.fuse * 6) % 2) { c.fillStyle = '#ffdf9a'; c.beginPath(); c.arc(14, -p.r - 7, 2, 0, 7); c.fill(); } } },
    wheel: { pad: 1, state: p => p.active ? 'on' : '', paint(c, p) { const r = p.r;
      c.fillStyle = radial(c, 0, 0, r * .6, r, [[0, '#2b3033'], [.7, '#1b1f21'], [1, '#0d1011']]); c.strokeStyle = OUTLINE; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); c.stroke();
      c.strokeStyle = '#3a4145'; c.lineWidth = 1.3; for (let i = 0; i < 22; i++) { const a = i / 22 * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(a) * (r - 4.5), Math.sin(a) * (r - 4.5)); c.lineTo(Math.cos(a + .1) * (r - .6), Math.sin(a + .1) * (r - .6)); c.stroke(); }
      c.fillStyle = radial(c, -r * .2, -r * .25, 1, r * .7, [[0, '#dfe6e8'], [.5, '#97a3a8'], [1, '#56626a']]); c.beginPath(); c.arc(0, 0, r * .64, 0, 7); c.fill(); c.strokeStyle = '#2a3236'; c.lineWidth = .8; c.stroke();
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; c.fillStyle = '#20272a'; c.beginPath(); c.ellipse(Math.cos(a) * r * .38, Math.sin(a) * r * .38, r * .13, r * .09, a, 0, 7); c.fill(); rivet(c, Math.cos(a + .63) * r * .2, Math.sin(a + .63) * r * .2, 1); }
      c.fillStyle = p.active ? '#f0c55e' : '#3b4549'; c.strokeStyle = '#1b2124'; c.beginPath(); c.arc(0, 0, r * .11, 0, 7); c.fill(); c.stroke(); } },
    thruster: { pad: 4, state: p => p.active ? 'on' : '', paint(c, p) { const x = p.w / 2, y = p.h / 2;
      c.strokeStyle = OUTLINE; c.lineWidth = 1; c.fillStyle = grad(c, -x, 0, x, 0, [[0, '#4b565c'], [.3, '#c4cdd0'], [.6, '#8f9aa0'], [1, '#3a444a']]); c.beginPath(); c.roundRect(-x * .78, -y, p.w * .78, p.h * .56, 3); c.fill(); c.stroke();
      c.fillStyle = '#c9a23a'; c.fillRect(-x * .78, -y * .55, p.w * .78, 3); c.fillStyle = '#1d2327'; for (let i = 0; i < 5; i++) c.fillRect(-x * .78 + i * 5, -y * .55, 2.5, 3);
      c.fillStyle = grad(c, -x, 0, x, 0, [[0, '#2f383d'], [.35, '#7d888d'], [1, '#262d31']]); poly(c, [[-x * .42, y * .1], [x * .42, y * .1], [x * .5, y * .34], [-x * .5, y * .34]]); c.fill(); c.stroke();
      c.fillStyle = grad(c, -x, 0, x, 0, [[0, '#23292d'], [.3, '#8c979c'], [.55, '#566168'], [1, '#1c2225']]); poly(c, [[-x * .5, y * .34], [x * .5, y * .34], [x * 1.06, y], [-x * 1.06, y]]); c.fill(); c.stroke();
      c.strokeStyle = '#1c2225'; c.lineWidth = .6; for (const t of [.5, .7, .88]) { c.beginPath(); c.moveTo(-x * (.5 + .56 * (t - .34) / .66), y * t); c.lineTo(x * (.5 + .56 * (t - .34) / .66), y * t); c.stroke(); }
      c.strokeStyle = '#b3673a'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x * .78, -y * .3); c.bezierCurveTo(x * 1.25, -y * .2, x * 1.2, y * .25, x * .46, y * .22); c.stroke();
      c.fillStyle = p.active ? '#ffb347' : '#2a1a12'; c.beginPath(); c.ellipse(0, y - .5, x * .9, 1.6, 0, 0, 7); c.fill(); },
      live(c, p, time) { if (!p.active) return; const y = p.h / 2, len = 26 + Math.sin(time * 70) * 6 + Math.sin(time * 31) * 4; c.globalCompositeOperation = 'lighter';
        for (const [w, l, colour] of [[p.w * .5, len, 'rgba(255,120,30,.55)'], [p.w * .3, len * .7, 'rgba(255,220,140,.8)'], [p.w * .13, len * .45, 'rgba(255,255,255,.9)']]) { c.fillStyle = colour; c.beginPath(); c.moveTo(-w, y); c.quadraticCurveTo(-w * .5, y + l * .6, 0, y + l); c.quadraticCurveTo(w * .5, y + l * .6, w, y); c.fill(); } c.globalCompositeOperation = 'source-over'; } },
    battery: { pad: 5, state: p => p.active ? 'on' : '', paint(c, p) { const x = p.w / 2, y = p.h / 2;
      c.strokeStyle = OUTLINE; c.lineWidth = 1; c.fillStyle = grad(c, -x, 0, x, 0, [[0, '#15191c'], [.3, '#3b444a'], [1, '#101417']]); c.beginPath(); c.roundRect(-x, -y + 4, p.w, p.h - 4, 3); c.fill(); c.stroke();
      c.fillStyle = grad(c, 0, -y + 4, 0, -y + 12, [[0, '#d4a82c'], [1, '#9a7516']]); c.fillRect(-x, -y + 4, p.w, 9); c.strokeRect(-x, -y + 4, p.w, 9);
      for (const [tx, colour] of [[-x * .5, '#c0392b'], [x * .5, '#22282c']]) { c.fillStyle = steel(c, -y - 3, -y + 5); c.fillRect(tx - 3.5, -y - 2, 7, 6.5); c.strokeRect(tx - 3.5, -y - 2, 7, 6.5); c.fillStyle = colour; c.fillRect(tx - 3.5, -y + 2.5, 7, 2); }
      c.fillStyle = '#e9edef'; c.font = 'bold 6px Arial'; c.textAlign = 'center'; c.fillText('+', -x * .5, -y + 11.5); c.fillText('−', x * .5, -y + 11.5);
      c.fillStyle = '#0d1113'; c.beginPath(); c.roundRect(-x + 4, -y + 17, p.w - 8, 19, 2); c.fill(); c.fillStyle = p.active ? '#ffd65a' : '#8f9aa0'; poly(c, [[2, -y + 19], [-5, -y + 28], [-.5, -y + 28], [-2.5, -y + 35], [5, -y + 25.5], [.5, -y + 25.5]]); c.fill();
      for (let i = 0; i < 4; i++) { c.fillStyle = p.active ? '#7fe08a' : (i < 3 ? '#4f7f57' : '#2a3236'); c.fillRect(-x + 5 + i * 5.8, y - 7, 4.2, 3); } },
      // Switched on, an arc stands between the terminals: it bows upward, writhes, and flares with each pulse the battery sends out (three a second).
      live(ctx, p, time) { if (!p.active || p.pulseAt === undefined) return; const since = time - p.pulseAt; if (since > .22) return; /* a short burst with each discharge, and nothing between them */ const x = p.w / 2, y = p.h / 2, tick = Math.floor(time * 30), pulse = 1 - since / .22, power = .45 + .55 * pulse * pulse, n = 7; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); for (let i = 0; i <= n; i++) { const k = i / n, px = -x * .5 + x * k, py = -y - 2 - Math.sin(k * Math.PI) * (5 + 3 * pulse) + (i && i < n ? (hash(tick + i * 3.7) - .5) * 4.5 : 0); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.strokeStyle = `rgba(110,190,255,${.35 * power})`; ctx.lineWidth = 4; ctx.stroke(); ctx.strokeStyle = `rgba(240,250,255,${power})`; ctx.lineWidth = 1.1; ctx.stroke();
        for (const tx of [-x * .5, x * .5]) { ctx.fillStyle = `rgba(190,230,255,${.7 * power})`; ctx.beginPath(); ctx.arc(tx, -y - 2, 1.6 + pulse, 0, 7); ctx.fill(); } ctx.restore(); } },
    // Generator: a heavy cabinet with cooling fins, a dial and two coil towers. Running, the towers arc across the top and the vents glow.
    generator: { pad: 8, state: p => p.active ? 'on' : '', paint(c, p) { const x = p.w / 2, y = p.h / 2;
      c.strokeStyle = OUTLINE; c.lineWidth = 1;
      c.fillStyle = grad(c, 0, -y, 0, y, [[0, '#7d8890'], [.35, '#525d66'], [1, '#2a3238']]); c.beginPath(); c.roundRect(-x, -y + 9, p.w, p.h - 9, 3); c.fill(); c.stroke();
      c.fillStyle = grad(c, 0, -y + 9, 0, -y + 16, [[0, '#9aa5ab'], [1, '#5d686f']]); c.fillRect(-x, -y + 9, p.w, 7); c.strokeRect(-x, -y + 9, p.w, 7);   // the top plate
      for (const tx of [-x * .55, x * .55]) { c.fillStyle = steel(c, -y - 2, -y + 9); c.fillRect(tx - 3, -y + 2, 6, 9); c.strokeRect(tx - 3, -y + 2, 6, 9);   // coil towers
        c.fillStyle = p.active ? '#cfeeff' : '#8e999f'; c.beginPath(); c.arc(tx, -y + 1, 4.2, 0, 7); c.fill(); c.stroke(); }
      c.fillStyle = '#121719'; c.beginPath(); c.roundRect(-x + 5, -y + 21, p.w * .42, p.h - 32, 2); c.fill();                                              // vent slots
      for (let i = 0; i < 5; i++) { c.fillStyle = p.active ? `rgba(255,${170 - i * 14},70,.9)` : '#2c343a'; c.fillRect(-x + 7, -y + 24 + i * 5.2, p.w * .42 - 4, 2.6); }
      c.fillStyle = '#1b2226'; c.beginPath(); c.arc(x * .42, -y + 28, 8, 0, 7); c.fill(); c.stroke();                                                      // the dial
      c.strokeStyle = p.active ? '#ff6a4a' : '#8e999f'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x * .42, -y + 28); const a = p.active ? .9 : -2.2; c.lineTo(x * .42 + Math.cos(a) * 6, -y + 28 + Math.sin(a) * 6); c.stroke();
      c.strokeStyle = OUTLINE; c.lineWidth = 1; c.fillStyle = '#39434a'; for (let i = 0; i < 4; i++) { c.fillRect(x * .18 + i * 6, y - 15, 4, 11); c.strokeRect(x * .18 + i * 6, y - 15, 4, 11); }   // fins
      c.fillStyle = '#c9a227'; c.fillRect(-x + 4, y - 6, p.w - 8, 3); c.strokeRect(-x + 4, y - 6, p.w - 8, 3); },
      // Running: the towers arc across the top, three strands rebuilt every frame, and each discharge flares.
      live(ctx, p, time) { if (!p.active) return; const x = p.w / 2, y = p.h / 2, tick = Math.floor(time * 60), since = time - (p.pulseAt ?? -9), flare = since < .1 ? 1 - since / .1 : 0;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (let s = 0; s < 3; s++) { const n = 9; ctx.beginPath();
          for (let i = 0; i <= n; i++) { const k = i / n, px = -x * .55 + x * 1.1 * k, py = -y + 1 - Math.sin(k * Math.PI) * (7 + 5 * flare) + (i && i < n ? (hash(tick + i * 5.3 + s * 21) - .5) * (7 + 5 * flare) : 0); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
          ctx.strokeStyle = `rgba(120,200,255,${.16 + .22 * flare})`; ctx.lineWidth = 5; ctx.stroke(); ctx.strokeStyle = `rgba(245,252,255,${.55 + .45 * flare})`; ctx.lineWidth = 1.2; ctx.stroke(); }
        for (const tx of [-x * .55, x * .55]) { ctx.fillStyle = `rgba(200,235,255,${.55 + .45 * flare})`; ctx.beginPath(); ctx.arc(tx, -y + 1, 3 + 2 * flare, 0, 7); ctx.fill(); }
        ctx.restore(); } },
    platform: { pad: 1, paint(c, p) { const x = p.w / 2, y = p.h / 2; c.strokeStyle = OUTLINE; c.lineWidth = 1; c.fillStyle = steel(c, -y, y); c.fillRect(-x, -y, p.w, p.h); c.strokeRect(-x, -y, p.w, p.h);
      c.save(); c.beginPath(); c.rect(-x, y - 6, p.w, 6); c.clip(); c.fillStyle = '#d9b23a'; c.fillRect(-x, y - 6, p.w, 6); c.fillStyle = '#1b2023'; for (let sx = -x - 8; sx < x; sx += 14) { poly(c, [[sx, y], [sx + 7, y], [sx + 13, y - 6], [sx + 6, y - 6]]); c.fill(); } c.restore();
      c.strokeStyle = '#1d2529'; c.lineWidth = .6; c.beginPath(); c.moveTo(-x, y - 6); c.lineTo(x, y - 6); c.stroke(); for (let rx = -x + 8; rx < x; rx += 20) rivet(c, rx, -y + 4.5, 1.1); c.fillStyle = '#ffffff30'; c.fillRect(-x, -y, p.w, 1.4); } },
    gun: { pad: 7, scale: .5, paint(c) {   // drawn on a 48 x 18 grid and scaled to the item's 24 x 9: about 20 cm against a 214 px body
      c.lineJoin = 'round'; c.lineWidth = .8; c.strokeStyle = '#0e1316';
      // grip: raked back, stippled panel, magazine baseplate
      c.fillStyle = grad(c, -26, 0, -6, 0, [[0, '#1c2023'], [.55, '#2e3438'], [1, '#202528']]); poly(c, [[-21, 1], [-5, 1], [-7.5, 9], [-9.5, 22], [-11, 25], [-24.5, 25.5], [-26, 22.5], [-23.5, 9]]); c.fill(); c.stroke();
      c.save(); poly(c, [[-20.5, 6], [-9, 6], [-11.5, 21], [-23.5, 21]]); c.clip(); c.fillStyle = '#0f131588'; for (let y = 6; y < 22; y += 2.2) for (let x = -25 + (Math.round(y / 2.2) % 2) * 1.1; x < -8; x += 2.2) c.fillRect(x, y, 1, 1); c.restore();
      poly(c, [[-25, 23.5], [-10.5, 23], [-11, 25], [-24.5, 25.5], [-26, 24.5]]); c.fillStyle = '#3d4549'; c.fill(); c.stroke();
      // trigger guard and trigger
      c.strokeStyle = '#15191c'; c.lineWidth = 1.7; c.beginPath(); c.moveTo(-6, 2.5); c.lineTo(-7, 8); c.quadraticCurveTo(-6.5, 12.5, -1, 12.5); c.lineTo(5, 12.5); c.quadraticCurveTo(9.5, 12, 9.5, 7); c.lineTo(9.5, 2.5); c.stroke();
      c.lineWidth = 1.3; c.strokeStyle = '#5c666b'; c.beginPath(); c.moveTo(1.5, 3); c.quadraticCurveTo(-.5, 6.5, 2.2, 9.6); c.stroke();
      // frame with dust cover, rail slots and pins
      c.lineWidth = .8; c.strokeStyle = '#0e1316'; poly(c, [[-23, -1.5], [23, -1.5], [23, 1.2], [21.5, 3.2], [-21, 3.2], [-25.5, 1.5], [-26.5, -.5]]); c.fillStyle = '#262b2f'; c.fill(); c.stroke();
      c.fillStyle = '#0d1113'; for (const x of [12, 15.2, 18.4]) c.fillRect(x, 1.2, 1.5, 2); c.fillStyle = '#596268'; c.beginPath(); c.arc(4.5, .9, 1, 0, 7); c.fill(); c.beginPath(); c.arc(-9, .9, .8, 0, 7); c.fill();
      // slide: blued steel with a top highlight, rear serrations, ejection port and sights
      c.fillStyle = grad(c, 0, -9.5, 0, -1.5, [[0, '#69747b'], [.18, '#454e55'], [.75, '#2b3238'], [1, '#1d2226']]); poly(c, [[-24.5, -1.5], [-25.5, -7.5], [-23.5, -9.3], [22.2, -9.3], [24, -8], [24, -1.5]]); c.fill(); c.stroke();
      c.strokeStyle = '#ffffff26'; c.lineWidth = .7; c.beginPath(); c.moveTo(-23, -8.6); c.lineTo(22, -8.6); c.stroke();
      c.strokeStyle = '#11161a'; c.lineWidth = .9; for (let x = -22.5; x < -13; x += 1.9) { c.beginPath(); c.moveTo(x + 1.1, -8); c.lineTo(x, -2.6); c.stroke(); }
      c.fillStyle = '#0c1012'; c.beginPath(); c.roundRect(-3, -8.4, 12.5, 3.6, .8); c.fill(); c.fillStyle = '#8d979c'; c.fillRect(-2.2, -7.7, 10.8, .9);
      c.fillStyle = '#14181b'; c.fillRect(19.2, -11.2, 2.6, 2); c.fillRect(-23.2, -11.4, 4.2, 2.2); c.fillStyle = '#d9dccb'; c.fillRect(20, -10.8, 1, 1); c.fillRect(-22.6, -10.9, .9, .9); c.fillRect(-20.5, -10.9, .9, .9);
      c.fillStyle = '#0a0d0f'; c.fillRect(24, -7.4, 1.4, 4.4); c.fillStyle = '#7f8a90'; c.fillRect(24, -6.6, .7, 2.8); } },
    sword: { pad: 14, state: p => p.bloody && !p.noGore ? 'bloody' : '', paint(c, p) { c.lineJoin = 'round'; c.lineWidth = .7; c.strokeStyle = '#1b2226'; const point = -50, shoulder = 22, blade = [[0, point], [-3.1, point + 13], [-4.4, shoulder], [4.4, shoulder], [3.1, point + 13]];
      poly(c, [[0, point], [-3.1, point + 13], [-4.4, shoulder], [0, shoulder]]); c.fillStyle = '#eef2f1'; c.fill(); poly(c, [[0, point], [3.1, point + 13], [4.4, shoulder], [0, shoulder]]); c.fillStyle = '#9aa7ac'; c.fill();
      poly(c, blade); c.fillStyle = grad(c, 0, point, 0, shoulder, [[0, '#ffffff00'], [.35, '#ffffff55'], [.5, '#ffffff00'], [.8, '#ffffff30'], [1, '#ffffff00']]); c.fill(); c.stroke();
      c.strokeStyle = '#6f7c82'; c.lineWidth = 1.3; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, point + 20); c.lineTo(0, shoulder - 3); c.stroke(); c.strokeStyle = '#f8fbfa'; c.lineWidth = .5; c.beginPath(); c.moveTo(-.9, point + 21); c.lineTo(-.9, shoulder - 4); c.stroke(); c.lineCap = 'butt';
      if (p.bloody && !p.noGore) { c.save(); poly(c, blade); c.clip(); c.fillStyle = grad(c, 0, point, 0, shoulder, [[0, '#7c1f26e6'], [.45, '#7c1f26aa'], [.7, '#7c1f2600']]); c.fillRect(-6, point, 12, 72); c.fillStyle = '#5a151b'; for (const [x, y, r] of [[-1.5, -12, 1.3], [1.8, -2, 1], [-.6, 6, .9]]) { c.beginPath(); c.ellipse(x, y, r, r * 2.2, 0, 0, 7); c.fill(); } c.restore(); }
      c.strokeStyle = '#1b2226'; c.lineWidth = .7; c.fillStyle = '#5f6b70'; c.fillRect(-4.4, shoulder, 8.8, 3);
      c.beginPath(); c.moveTo(-17, 24.2); c.quadraticCurveTo(-19.5, 27, -17, 30); c.lineTo(-6, 29.2); c.lineTo(6, 29.2); c.lineTo(17, 30); c.quadraticCurveTo(19.5, 27, 17, 24.2); c.lineTo(6, 25.2); c.lineTo(-6, 25.2); c.closePath(); c.fillStyle = grad(c, 0, 24, 0, 30, [[0, '#e6c777'], [.5, '#b08a3c'], [1, '#6e5322']]); c.fill(); c.stroke(); c.fillStyle = '#f3dc9a88'; c.fillRect(-15, 25, 30, .8);
      c.beginPath(); c.roundRect(-3.5, 29.2, 7, 15.5, 1.2); c.fillStyle = grad(c, -3.6, 0, 3.6, 0, [[0, '#2a1c14'], [.45, '#5b3d29'], [1, '#23170f']]); c.fill(); c.stroke();
      c.save(); c.beginPath(); c.rect(-3.5, 29.2, 7, 15.5); c.clip(); c.strokeStyle = '#1509058c'; c.lineWidth = 1; for (let y = 28; y < 48; y += 3) { c.beginPath(); c.moveTo(-4, y + 2.4); c.lineTo(4, y); c.stroke(); } c.restore();
      c.strokeStyle = '#1b2226'; c.lineWidth = .7; c.beginPath(); c.arc(0, 47, 4.3, 0, 7); c.fillStyle = radial(c, -1.2, 45.5, .5, 4.6, [[0, '#f1d78c'], [.6, '#a9843a'], [1, '#5f471c']]); c.fill(); c.stroke(); } }
  };

  function sprite(kind, p) {
    const painter = painters[kind], key = kind + '|' + (painter.state ? painter.state(p) : ''); let canvas = cache.get(key); if (canvas) return canvas;
    const w = p.w || p.r * 2, h = p.h || p.r * 2, pad = painter.pad; canvas = document.createElement('canvas'); canvas.width = Math.ceil((w + pad * 2) * SCALE); canvas.height = Math.ceil((h + pad * 2) * SCALE);
    const c = canvas.getContext('2d'); c.setTransform(SCALE, 0, 0, SCALE, canvas.width / 2, canvas.height / 2); if (painter.scale) c.scale(painter.scale, painter.scale); painter.paint(c, p); cache.set(key, canvas); return canvas;
  }
  root.ItemArt = {
    has: kind => kind in painters,
    // Draw an item at the origin of the current transform. p needs w/h or r, plus whatever the painter's state reads.
    draw(ctx, kind, p, time = 0) { const canvas = sprite(kind, p); ctx.drawImage(canvas, -canvas.width / SCALE / 2, -canvas.height / SCALE / 2, canvas.width / SCALE, canvas.height / SCALE); painters[kind].live?.(ctx, p, time); },
    register(kind, painter) { painters[kind] = painter; cache.clear(); },
    helpers: { poly, grad, radial, steel, grain, rivet, hash, OUTLINE }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* Sandbox Lab — item art: Firearms. Every gun lies along +x with its muzzle at the right, which is where the engine fires from. The physics box is w x h round the receiver and barrel; grips, magazines, scopes and bipods hang outside it (pad). */
(function (root) {
  'use strict';
  const { poly, grad, rivet } = root.ItemArt.helpers, INK = '#0e1316';
  const steel = (c, y0, y1) => grad(c, 0, y0, 0, y1, [[0, '#6d787e'], [.2, '#454e54'], [.7, '#2a3035'], [1, '#191d20']]);
  const polymer = (c, y0, y1) => grad(c, 0, y0, 0, y1, [[0, '#3a4145'], [.4, '#23282b'], [1, '#121517']]);
  const walnut = (c, y0, y1) => grad(c, 0, y0, 0, y1, [[0, '#a8713d'], [.45, '#7a4a22'], [1, '#4a2a11']]);
  const ink = c => { c.strokeStyle = INK; c.lineWidth = .7; c.lineJoin = 'round'; };
  const box = (c, x, y, w, h, fill, r = 1) => { c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill(); c.stroke(); };
  const shine = (c, x0, x1, y) => { c.strokeStyle = '#ffffff2e'; c.lineWidth = .6; c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); ink(c); };

  // The parts most long guns share. All x are in item space (butt at -w/2, muzzle at +w/2); bore is the barrel's centre line.
  const barrel = (c, x0, x1, bore, t, tip) => { box(c, x0, bore - t / 2, x1 - x0, t, steel(c, bore - t / 2, bore + t / 2), .4); if (tip) box(c, x1 - tip, bore - t / 2 - .9, tip, t + 1.8, '#14181b', .6); c.fillStyle = '#05070899'; c.fillRect(x1 - .8, bore - t / 4, .8, t / 2); };
  const grip = (c, x, y, h, fill, rake = 3) => { poly(c, [[x, y], [x + 6.5, y], [x + 6.5 - rake, y + h], [x - 1 - rake, y + h + .6], [x - 2.2 - rake, y + h - 2]]); c.fillStyle = fill; c.fill(); c.stroke(); };
  const guard = (c, x, y, w = 9, d = 5.5) => { c.strokeStyle = '#15191c'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + d - 2); c.quadraticCurveTo(x, y + d, x + 2, y + d); c.lineTo(x + w, y + d); c.lineTo(x + w + 1, y); c.stroke(); c.strokeStyle = '#6a757b'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + w * .45, y + .5); c.quadraticCurveTo(x + w * .3, y + d * .5, x + w * .5, y + d - 1.2); c.stroke(); ink(c); };
  const mag = (c, x, y, w, h, lean, fill, curve = 0) => { c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.quadraticCurveTo(x + w + lean * .5 + curve, y + h * .5, x + w + lean, y + h); c.lineTo(x + lean, y + h + .8); c.quadraticCurveTo(x + lean * .5 + curve, y + h * .5, x, y); c.closePath(); c.fillStyle = fill; c.fill(); c.stroke(); c.strokeStyle = '#ffffff1c'; c.lineWidth = .5; for (const k of [.3, .6]) { c.beginPath(); c.moveTo(x + lean * k + curve * .8 + 1, y + h * k); c.lineTo(x + w + lean * k + curve * .8 - 1, y + h * k); c.stroke(); } ink(c); };
  const rail = (c, x0, x1, y) => { box(c, x0, y - 1.6, x1 - x0, 1.6, '#1a1f22', .2); c.fillStyle = '#05070899'; for (let x = x0 + 1; x < x1 - 1; x += 2.4) c.fillRect(x, y - 1.6, 1, .9); };
  const scope = (c, x0, x1, y, r = 2.4) => { box(c, x0 + 4, y - r * 1.5, x1 - x0 - 8, r * 1.5, '#15191c', r * .7); box(c, x0, y - r * 2, 7, r * 2.2, '#1b2023', 1.2); box(c, x1 - 9, y - r * 2.1, 9, r * 2.4, '#1b2023', 1.2); box(c, (x0 + x1) / 2 - 2, y - r * 2.5, 4, r * 1.2, '#2a3034', .8); c.fillStyle = '#7fb6d255'; c.fillRect(x1 - 1.2, y - r * 1.8, 1.2, r * 1.8); c.fillStyle = '#15191c'; c.fillRect(x0 + 9, y, 2.2, 2); c.fillRect(x1 - 14, y, 2.2, 2); shine(c, x0 + 5, x1 - 10, y - r * 1.35); };
  const bipod = (c, x, y, len) => { c.strokeStyle = '#1a1f22'; c.lineWidth = 1.6; c.lineCap = 'round'; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + s * 3.5 + 6, y + len); c.stroke(); } c.lineCap = 'butt'; ink(c); };
  const vents = (c, x0, x1, y, n, w = 3.4, h = 1.3) => { c.fillStyle = '#05070899'; for (let i = 0; i < n; i++) { const x = x0 + (x1 - x0) * (i + .5) / n - w / 2; c.beginPath(); c.roundRect(x, y, w, h, .6); c.fill(); } };
  const port = (c, x, y, w = 7) => { c.fillStyle = '#0a0d0f'; c.beginPath(); c.roundRect(x, y, w, 2.2, .6); c.fill(); c.fillStyle = '#9a8a5a'; c.fillRect(x + .8, y + .5, w - 1.6, .7); };

  const painters = {
    revolver: { pad: 8, paint(c, p) { const x = p.w / 2, y = p.h / 2; ink(c);      // .357: long barrel with an underlug, fluted cylinder, exposed hammer, wooden grip
      grip(c, -x + 1.5, 0, y + 7, walnut(c, 0, y + 7), 3.5); barrel(c, -1, x, -y + 2.6, 3, 0); box(c, -1, -y + 4, x - 3, 2, steel(c, -y + 4, -y + 6), .5); c.fillStyle = '#15191c'; c.fillRect(x - 3, -y - .4, 1.6, 1.6);
      poly(c, [[-x + 1, -y + 1], [1, -y + 1], [1, y - 2], [-5, y - 1], [-x + 1, 1]]); c.fillStyle = steel(c, -y, y); c.fill(); c.stroke(); box(c, -8, -y + 1.6, 8.6, p.h - 3.4, grad(c, 0, -y + 1, 0, y - 2, [[0, '#8a959b'], [.5, '#4a545a'], [1, '#262c30']]), 1.4); c.strokeStyle = '#0e131677'; for (const k of [.3, .62]) { c.beginPath(); c.moveTo(-7.4, -y + 1.6 + (p.h - 3.4) * k); c.lineTo(0, -y + 1.6 + (p.h - 3.4) * k); c.stroke(); } ink(c);
      poly(c, [[-x + 1, -y + 1], [-x - 1.6, -y - 1.2], [-x + .2, -y - 2], [-x + 3.4, -y + 1]]); c.fillStyle = '#2a3034'; c.fill(); c.stroke(); guard(c, -6, y - 2, 7, 4.6); shine(c, 0, x - 1, -y + 1.6); } },
    smg: { pad: 12, paint(c, p) { const x = p.w / 2, y = p.h / 2; ink(c);                 // 9 mm submachine gun: short, boxy receiver, stick magazine ahead of the grip, folding wire stock
      c.strokeStyle = '#2a3034'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-x + 12, -y + 3); c.lineTo(-x + 1, -y + 3); c.lineTo(-x + 1, y - 1); c.lineTo(-x + 12, y - 4); c.stroke(); ink(c);
      barrel(c, 8, x, -y + 5, 2.6, 5); box(c, -x + 11, -y + 1, x + 1, p.h - 5, steel(c, -y + 1, y - 4), 1.4); box(c, 4, -y + 2.6, 13, p.h - 7.4, polymer(c, -y + 2, y - 4), 1.2); vents(c, 5, 16, -y + 5.6, 3, 2.4);
      port(c, -6, -y + 3, 6); rail(c, -x + 13, 6, -y + 1); mag(c, -3, y - 4, 5.4, 15, -1, '#1b2023'); grip(c, -x + 14, y - 4, 10, polymer(c, y - 4, y + 6)); guard(c, -x + 21, y - 4, 6.5, 4.8); shine(c, -x + 12, 8, -y + 2); } },
    rifle: { pad: 14, paint(c, p) { const x = p.w / 2, y = p.h / 2; ink(c);               // 5.56 assault rifle: carry-height rail, slotted handguard, curved 30-round magazine, adjustable stock
      poly(c, [[-x, -y + 4], [-x + 20, -y + 4.5], [-x + 22, -y + 8], [-x + 20, y - 3], [-x + 5, y], [-x, y - .5]]); c.fillStyle = polymer(c, -y + 4, y); c.fill(); c.stroke(); c.fillStyle = '#05070866'; c.fillRect(-x + 3, -y + 7, 10, 1.4);
      barrel(c, 22, x, -y + 6.6, 2.4, 6.5); box(c, -5, -y + 3, 31, p.h - 7.5, polymer(c, -y + 3, y - 4), 1.6); vents(c, -3, 25, -y + 5, 5, 3.6, 1.2); vents(c, -3, 25, -y + 8.6, 5, 3.6, 1.2);
      box(c, -x + 20, -y + 3, x - 25 + 2, p.h - 6, steel(c, -y + 3, y - 3), 1.2); port(c, -14, -y + 5.5); rivet(c, -22, y - 5.5, .8); rivet(c, -9, y - 5.5, .8); rail(c, -x + 21, 26, -y + 3); box(c, 22, -y - .5, 2.2, 4, '#15191c', .4); box(c, -x + 23, -y - .2, 3, 3.4, '#15191c', .4);
      mag(c, -15, y - 3, 7, 14, 3.2, '#22282b', 1.4); grip(c, -x + 23, y - 3, 10.5, polymer(c, y - 3, y + 8)); guard(c, -x + 30, y - 3, 8, 5); shine(c, -x + 21, 24, -y + 3.8); } },
    ak: { pad: 15, paint(c, p) { const x = p.w / 2, y = p.h / 2; ink(c);                  // 7.62x39: wooden furniture, gas tube over the barrel, the long banana magazine
      poly(c, [[-x, -y + 6], [-x + 24, -y + 4.5], [-x + 24, y - 4], [-x + 3, y + 1], [-x, y]]); c.fillStyle = walnut(c, -y + 4, y + 1); c.fill(); c.stroke();
      barrel(c, 14, x, -y + 8, 2.4, 4); box(c, 8, -y + 3.4, 24, 2.6, steel(c, -y + 3, -y + 6), 1); box(c, x - 14, -y + 2.6, 2.4, 7, '#15191c', .4); poly(c, [[x - 13.5, -y - 1.5], [x - 12, -y - 1.5], [x - 12, -y + 3], [x - 13.5, -y + 3]]); c.fillStyle = '#15191c'; c.fill();
      box(c, 2, -y + 5.8, 22, p.h - 11, walnut(c, -y + 6, y - 5), 1.6); vents(c, 5, 22, -y + 8, 2, 5, 1.2);
      poly(c, [[-x + 23, -y + 3], [4, -y + 3], [4, y - 4], [-x + 23, y - 4]]); c.fillStyle = steel(c, -y + 3, y - 4); c.fill(); c.stroke(); c.strokeStyle = '#0e131688'; c.beginPath(); c.moveTo(-x + 24, -y + 6.4); c.lineTo(3, -y + 6.4); c.stroke(); ink(c); port(c, -14, -y + 7.2, 8); box(c, -18, -y + 1.6, 5, 1.8, '#15191c', .4);
      mag(c, -12, y - 4, 7.5, 17, 7, grad(c, 0, y - 4, 0, y + 14, [[0, '#3a4145'], [1, '#191d20']]), 2.6); grip(c, -x + 25, y - 4, 10, walnut(c, y - 4, y + 7)); guard(c, -x + 32, y - 4, 8.5, 5); shine(c, -x + 24, 3, -y + 3.8); } },
    shotgun: { pad: 8, paint(c, p) { const x = p.w / 2, y = p.h / 2; ink(c);              // 12-gauge pump: long barrel over a tube magazine, ribbed wooden fore-end, wooden stock
      poly(c, [[-x, -y + 3], [-x + 30, -y + 3.5], [-x + 34, y - 1.5], [-x + 22, y + 1], [-x + 3, y + 3.5], [-x, y + 3]]); c.fillStyle = walnut(c, -y + 3, y + 3); c.fill(); c.stroke();
      barrel(c, -8, x, -y + 3.4, 3, 0); barrel(c, -8, x - 12, -y + 7.6, 3, 0); box(c, x - 14, -y + 1.6, 2, 8, '#15191c', .4); c.fillStyle = '#c9b26a'; c.beginPath(); c.arc(x - 2, -y + 1.2, .9, 0, 7); c.fill();
      box(c, 6, -y + 5.4, 27, 6, walnut(c, -y + 5, -y + 11), 2.4); c.strokeStyle = '#2a170899'; for (let rx = 9; rx < 32; rx += 2.6) { c.beginPath(); c.moveTo(rx, -y + 6.2); c.lineTo(rx, -y + 10.6); c.stroke(); } ink(c);
      box(c, -x + 30, -y + 1.2, x - 38 + 2, p.h - 2, steel(c, -y + 1, y - 1), 1.4); port(c, -14, -y + 4, 9); guard(c, -x + 31, y - 1, 8, 4.6); shine(c, -x + 31, x - 2, -y + 2.2); } },
    hunting: { pad: 9, paint(c, p) { const x = p.w / 2, y = p.h / 2; ink(c);              // .308 bolt action: one-piece walnut stock, bolt handle, a modest scope
      poly(c, [[-x, -y + 4], [-x + 26, -y + 5], [-x + 34, -y + 4.2], [22, -y + 5], [24, y - 3.4], [-x + 40, y - 1], [-x + 30, y + 1.5], [-x + 24, y - 2.5], [-x + 4, y + 3], [-x, y + 2.4]]); c.fillStyle = walnut(c, -y + 4, y + 3); c.fill(); c.stroke(); box(c, -x, -y + 4, 2.2, p.h - 1.8, '#1b1210', .6);
      barrel(c, 0, x, -y + 4.6, 2.4, 0); box(c, -x + 33, -y + 3, 28, 4, steel(c, -y + 3, -y + 7), 1.4); c.strokeStyle = '#8a959b'; c.lineWidth = 1.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(-x + 38, -y + 6); c.lineTo(-x + 36, y); c.stroke(); c.lineCap = 'butt'; c.fillStyle = '#aab5ba'; c.beginPath(); c.arc(-x + 36, y, 1.4, 0, 7); c.fill(); ink(c);
      guard(c, -x + 42, y - 2.4, 7.5, 4.2); scope(c, -x + 36, 8, -y + 2.6, 2); c.fillStyle = '#15191c'; c.fillRect(x - 2.4, -y + 1.6, 1.4, 2); } },
    sniper: { pad: 16, paint(c, p) { const x = p.w / 2, y = p.h / 2; ink(c);              // .50 anti-materiel rifle: fluted heavy barrel, slab muzzle brake, big scope, bipod, box magazine
      poly(c, [[-x, -y + 3], [-x + 8, -y + 3], [-x + 10, -y + 6], [-x + 32, -y + 6], [-x + 32, y - 3], [-x + 16, y - 3], [-x + 12, y + 1], [-x, y + 1]]); c.fillStyle = polymer(c, -y + 3, y + 1); c.fill(); c.stroke(); box(c, -x + 3, -y + 1.4, 12, 2.6, '#2a3034', 1.2);
      barrel(c, 20, x, -y + 9, 3.6, 0); c.strokeStyle = '#0e131666'; for (const dy of [-.9, .9]) { c.beginPath(); c.moveTo(30, -y + 9 + dy); c.lineTo(x - 14, -y + 9 + dy); c.stroke(); } ink(c); box(c, x - 12, -y + 5.4, 12, 7.2, '#15191c', 1); c.fillStyle = '#05070899'; for (const bx of [x - 10.4, x - 6.6, x - 2.8]) c.fillRect(bx, -y + 6.6, 1.8, 4.8);
      box(c, -x + 30, -y + 4.6, 66, p.h - 8.6, steel(c, -y + 4, y - 4), 1.6); box(c, 6, -y + 6, 18, p.h - 11, polymer(c, -y + 6, y - 5), 1.4); port(c, -24, -y + 7, 10); rail(c, -x + 32, 22, -y + 4.6);
      mag(c, -22, y - 4, 12, 9, 0, '#1b2023'); grip(c, -x + 36, y - 4, 10.5, polymer(c, y - 4, y + 7)); guard(c, -x + 43, y - 4, 8, 5); scope(c, -x + 38, 10, -y + 3, 3); bipod(c, 34, -y + 11, 17); shine(c, -x + 31, 20, -y + 5.4); } },
    lmg: { pad: 17, paint(c, p) { const x = p.w / 2, y = p.h / 2; ink(c);                 // 7.62 belt-fed machine gun: ammunition box under the feed tray, carry handle, perforated barrel shroud, bipod
      poly(c, [[-x, -y + 5], [-x + 22, -y + 6], [-x + 26, y - 4], [-x + 12, y - 2], [-x + 7, y + 3], [-x, y + 3]]); c.fillStyle = polymer(c, -y + 5, y + 3); c.fill(); c.stroke();
      barrel(c, 18, x, -y + 9, 3.2, 7); box(c, 8, -y + 6, 38, 6.2, '#22282b', 1.4); vents(c, 10, 44, -y + 7, 7, 2.6, 1.3); vents(c, 10, 44, -y + 9.8, 7, 2.6, 1.3);
      box(c, -x + 24, -y + 4, 50, p.h - 8, steel(c, -y + 4, y - 4), 1.6); box(c, -x + 28, -y + 1.6, 26, 3, '#2a3034', 1); c.strokeStyle = '#1a1f22'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-4, -y + 4); c.quadraticCurveTo(4, -y - 4, 14, -y + 5); c.stroke(); ink(c);
      box(c, -24, y - 4, 22, 14, grad(c, 0, y - 4, 0, y + 10, [[0, '#4a5546'], [1, '#2a3228']]), 1.4); c.strokeStyle = '#0e131655'; c.strokeRect(-21.5, y - 1.5, 17, 9); ink(c); c.fillStyle = '#c9a24a'; for (let bx = -22; bx < -4; bx += 2.6) c.fillRect(bx, y - 6.4, 1.6, 2.8);
      grip(c, -x + 30, y - 4, 10.5, polymer(c, y - 4, y + 7)); guard(c, -x + 37, y - 4, 8, 5); bipod(c, 44, -y + 12, 17); shine(c, -x + 25, 16, -y + 4.8); } },
    minigun: { pad: 12, state: p => p.cool > 0 ? 'hot' : '', paint(c, p) { const x = p.w / 2, y = p.h / 2; ink(c);   // six rotating barrels in two clamps, motor housing, twin spade grips, feed chute
      for (const [dy, t] of [[-7.5, 2.2], [-3.6, 2.8], [.6, 3], [4.8, 2.8], [8.6, 2.2]]) barrel(c, -2, x, dy, t, 0); for (const cx of [16, x - 9]) box(c, cx, -11.5, 4.4, 23, steel(c, -11, 11), 1.6); box(c, x - 3, -10.5, 3, 21, '#15191c', 1);
      if (p.cool > 0) { c.fillStyle = '#ff9a4a33'; c.fillRect(x - 22, -10, 22, 20); }
      box(c, -x + 14, -y + 1, x - 12, p.h - 2, steel(c, -y + 1, y - 1), 3); box(c, -x + 22, -y + 4, 22, p.h - 8, polymer(c, -y + 4, y - 4), 2); rivet(c, -x + 26, -y + 7, .9); rivet(c, -x + 40, y - 7, .9);
      c.strokeStyle = '#1a1f22'; c.lineWidth = 2.4; c.lineCap = 'round'; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(-x + 14, s * 7); c.lineTo(-x + 3, s * 9); c.lineTo(-x + 3, s * 3); c.stroke(); } c.lineCap = 'butt'; ink(c);
      c.beginPath(); c.moveTo(-10, y - 1); c.quadraticCurveTo(-14, y + 8, -26, y + 10); c.lineTo(-30, y + 5); c.quadraticCurveTo(-21, y + 4, -18, y - 1); c.closePath(); c.fillStyle = '#4a5546'; c.fill(); c.stroke(); shine(c, -x + 16, 0, -y + 2); } },
    crossbow: { pad: 6, state: p => p.cool > 0 ? 'loosed' : '', paint(c, p) { const x = p.w / 2, y = p.h / 2, loosed = p.cool > 0; ink(c);   // seen from above-and-side: stock along x, the prod (bow) across it near the front, string drawn back to the latch - or forward, just after a shot
      poly(c, [[-x, -3], [-x + 18, -3.4], [-x + 24, -2.4], [x - 6, -2.2], [x - 6, 2.2], [-x + 24, 2.4], [-x + 20, 6], [-x + 4, 6.5], [-x, 5]]); c.fillStyle = walnut(c, -4, 7); c.fill(); c.stroke(); box(c, -x + 22, -1, x * 2 - 30, 1.4, '#15191c', .4);
      c.strokeStyle = '#6a757b'; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(x - 22, -y + 1); c.quadraticCurveTo(x - 4, -y * .5, x - 8, 0); c.quadraticCurveTo(x - 4, y * .5, x - 22, y - 1); c.stroke(); c.lineCap = 'butt';
      c.strokeStyle = '#d9d4c0'; c.lineWidth = .7; const sx = loosed ? x - 16 : -x + 30; c.beginPath(); c.moveTo(x - 22, -y + 1); c.lineTo(sx, 0); c.lineTo(x - 22, y - 1); c.stroke(); ink(c);
      if (!loosed) { c.fillStyle = '#8b6b45'; c.fillRect(-x + 30, -.8, x * 2 - 34, 1.6); poly(c, [[x, 0], [x - 5, -2], [x - 4, 0], [x - 5, 2]]); c.fillStyle = '#c5cfd2'; c.fill(); c.stroke(); c.fillStyle = '#b8342c'; c.fillRect(-x + 30, -2, 5, 1.2); c.fillRect(-x + 30, .8, 5, 1.2); }
      box(c, x - 9, -2.6, 3, 5.2, '#15191c', .6); guard(c, -x + 24, 2.4, 7, 4.4); } }
  };
  for (const kind in painters) root.ItemArt.register(kind, painters[kind]);
})(typeof globalThis !== 'undefined' ? globalThis : this);

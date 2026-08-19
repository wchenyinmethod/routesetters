/* ROUTESETTERS - character-render.js
 * Draws the climber as an anatomical figure rather than a stick man: shaded
 * limb volumes with a consistent light direction, tapered torso with rib/ab
 * definition, articulated fingers that actually close around a hold, climbing
 * shoes, harness and chalk bag, sweat, strain and chalk dust.
 */
(function (RS) {
  'use strict';

  var clamp = RS.clamp, lerp = RS.lerp;

  /* Light comes from the upper left of the wall. */
  var LX = -0.52, LY = -0.85;

  /* ---------------------------------------------------------- skin grain map */

  var GRAIN = null;
  function grain(ctx) {
    if (GRAIN) return GRAIN;
    var c = document.createElement('canvas');
    c.width = c.height = 96;
    var g = c.getContext('2d');
    var img = g.createImageData(96, 96);
    var r = new RS.Rng(9182);
    for (var i = 0; i < 96 * 96; i++) {
      var v = 128 + (r.next() - 0.5) * 46;
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    GRAIN = ctx.createPattern(c, 'repeat');
    return GRAIN;
  }

  /* --------------------------------------------------------------- primitives */

  /* A limb segment: rounded, cross-lit, with a soft crease at the thin end. */
  function limb(ctx, ax, ay, bx, by, ra, rb, skin, deep, opts) {
    opts = opts || {};
    var dx = bx - ax, dy = by - ay, d = RS.len(dx, dy);
    if (d < 0.001) d = 0.001;
    var nx = -dy / d, ny = dx / d;
    /* gradient runs across the limb, offset toward the light */
    var g = ctx.createLinearGradient(
      ax + nx * ra * 1.15, ay + ny * ra * 1.15,
      ax - nx * ra * 1.15, ay - ny * ra * 1.15
    );
    var lit = (nx * LX + ny * LY) > 0;
    var c0 = lit ? RS.shade(skin, 1.30) : RS.shade(deep, 0.86);
    var c1 = lit ? skin : RS.shade(skin, 0.80);
    var c2 = lit ? RS.shade(deep, 0.90) : RS.shade(skin, 1.24);
    g.addColorStop(0, c0);
    g.addColorStop(0.36, c1);
    g.addColorStop(0.72, RS.mixHex(c1, c2, 0.55));
    g.addColorStop(1, c2);

    RS.capsulePath(ctx, ax, ay, bx, by, ra, rb);
    ctx.fillStyle = g;
    ctx.fill();

    /* rim light on the lit edge */
    ctx.save();
    RS.capsulePath(ctx, ax, ay, bx, by, ra, rb);
    ctx.clip();
    var rg = ctx.createLinearGradient(
      ax + nx * (lit ? ra : -ra), ay + ny * (lit ? ra : -ra),
      ax + nx * (lit ? ra : -ra) * 0.35, ay + ny * (lit ? ra : -ra) * 0.35
    );
    rg.addColorStop(0, RS.rgba(RS.shade(skin, 1.55), 0.55));
    rg.addColorStop(1, RS.rgba(skin, 0));
    ctx.fillStyle = rg;
    RS.capsulePath(ctx, ax, ay, bx, by, ra, rb);
    ctx.fill();

    /* muscle contour: a soft highlight along the belly of the segment */
    if (opts.muscle) {
      var mo = (lit ? 1 : -1) * ra * 0.22;
      ctx.strokeStyle = RS.rgba(RS.shade(skin, 1.42), 0.30 + 0.25 * (opts.flex || 0));
      ctx.lineWidth = Math.max(1, ra * 0.42);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ax + dx * 0.26 + nx * mo, ay + dy * 0.26 + ny * mo);
      ctx.quadraticCurveTo(
        ax + dx * 0.5 + nx * mo * 1.7, ay + dy * 0.5 + ny * mo * 1.7,
        ax + dx * 0.76 + nx * mo, ay + dy * 0.76 + ny * mo
      );
      ctx.stroke();
    }
    /* occlusion crease at the joint end */
    if (opts.crease) {
      var cg = ctx.createRadialGradient(bx, by, rb * 0.15, bx, by, rb * 1.5);
      cg.addColorStop(0, RS.rgba(deep, 0.45));
      cg.addColorStop(1, RS.rgba(deep, 0));
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(bx, by, rb * 1.6, 0, RS.TAU); ctx.fill();
    }
    ctx.restore();
  }

  function tracelimb(ctx, ax, ay, bx, by, ra, rb) {
    RS.capsulePath(ctx, ax, ay, bx, by, ra, rb);
  }

  /* -------------------------------------------------------------------- hand */

  function hand(ctx, hx, hy, fromX, fromY, curl, skin, deep, sc, chalk) {
    var dx = hx - fromX, dy = hy - fromY, d = RS.len(dx, dy) || 1;
    var ang = Math.atan2(dy, dx);
    var pr = 4.6 * sc;

    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ang);

    /* palm / back of hand */
    var pg = ctx.createLinearGradient(0, -pr, 0, pr);
    pg.addColorStop(0, RS.shade(skin, 1.24));
    pg.addColorStop(0.55, skin);
    pg.addColorStop(1, RS.shade(deep, 0.95));
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.ellipse(-pr * 0.15, 0, pr * 1.12, pr * 0.92, 0, 0, RS.TAU);
    ctx.fill();

    /* four fingers, curling into the hold */
    var i;
    for (i = 0; i < 4; i++) {
      var spread = (i - 1.5) * 0.30;
      var baseA = spread * (1 - curl * 0.45);
      var bx = Math.cos(baseA) * pr * 0.95, by = Math.sin(baseA) * pr * 0.95;
      var seg1 = pr * 0.80, seg2 = pr * 0.60;
      var a1 = baseA + curl * 1.15;
      var mx = bx + Math.cos(a1) * seg1, my = by + Math.sin(a1) * seg1;
      var a2 = a1 + curl * 1.45;
      var tx = mx + Math.cos(a2) * seg2, ty = my + Math.sin(a2) * seg2;
      var fr = pr * (0.30 - i * 0.016);
      limb(ctx, bx, by, mx, my, fr, fr * 0.92, skin, deep, {});
      limb(ctx, mx, my, tx, ty, fr * 0.92, fr * 0.74, skin, deep, {});
      /* nail glint */
      ctx.fillStyle = RS.rgba('#ffffff', 0.22);
      ctx.beginPath(); ctx.arc(tx, ty, fr * 0.34, 0, RS.TAU); ctx.fill();
    }
    /* thumb, opposed */
    var ta = -1.25 + curl * 0.85;
    var tbx = Math.cos(ta) * pr * 0.6, tby = Math.sin(ta) * pr * 0.6;
    var ttx = tbx + Math.cos(ta + 0.9 + curl * 0.8) * pr * 0.95;
    var tty = tby + Math.sin(ta + 0.9 + curl * 0.8) * pr * 0.95;
    limb(ctx, tbx, tby, ttx, tty, pr * 0.34, pr * 0.26, skin, deep, {});

    /* tendon shading across the back of the hand when loaded */
    if (curl > 0.4) {
      ctx.strokeStyle = RS.rgba(deep, 0.28 * curl);
      ctx.lineWidth = 0.7;
      for (i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-pr * 0.6, (i - 1) * pr * 0.42);
        ctx.lineTo(pr * 0.7, (i - 1) * pr * 0.30);
        ctx.stroke();
      }
    }
    /* chalk on the fingers */
    if (chalk > 0.02) {
      ctx.fillStyle = RS.rgba('#f4f1ea', 0.22 * chalk);
      ctx.beginPath();
      ctx.ellipse(pr * 0.9, 0, pr * 0.9, pr * 0.8, 0, 0, RS.TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* -------------------------------------------------------------------- shoe */

  function shoe(ctx, fx, fy, fromX, fromY, prof, sc) {
    var dx = fx - fromX, dy = fy - fromY;
    var ang = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(ang - Math.PI / 2);
    var w = 5.4 * sc, h = 9.5 * sc;

    /* upper */
    var g = ctx.createLinearGradient(-w, 0, w, 0);
    g.addColorStop(0, RS.shade(prof.shoe, 1.22));
    g.addColorStop(0.5, prof.shoe);
    g.addColorStop(1, RS.shade(prof.shoe, 0.68));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w * 0.85, -h * 0.35);
    ctx.quadraticCurveTo(-w * 1.05, h * 0.45, -w * 0.25, h * 0.72);
    ctx.quadraticCurveTo(w * 0.35, h * 0.86, w * 0.86, h * 0.30);
    ctx.quadraticCurveTo(w * 1.0, -h * 0.2, w * 0.5, -h * 0.42);
    ctx.closePath();
    ctx.fill();

    /* downturned rubber toe + sole edge */
    ctx.fillStyle = '#1a1c1f';
    ctx.beginPath();
    ctx.moveTo(-w * 0.30, h * 0.70);
    ctx.quadraticCurveTo(w * 0.45, h * 0.92, w * 0.90, h * 0.26);
    ctx.quadraticCurveTo(w * 0.55, h * 0.42, -w * 0.20, h * 0.50);
    ctx.closePath();
    ctx.fill();
    /* velcro strap */
    ctx.fillStyle = RS.rgba('#000000', 0.35);
    ctx.fillRect(-w * 0.8, -h * 0.1, w * 1.6, h * 0.16);
    ctx.restore();
  }

  /* -------------------------------------------------------------------- head */

  function head(ctx, cl, hp, ang, dt) {
    var prof = cl.profile, sc = cl.scale;
    var f = cl.facingT;
    var r = 8.6 * sc;
    ctx.save();
    ctx.translate(hp.x, hp.y);
    ctx.rotate(ang);
    ctx.scale(f < 0 ? -1 : 1, 1);
    var af = Math.abs(f);

    /* neck */
    limb(ctx, 0, r * 0.85, 0, r * 1.5, r * 0.42, r * 0.48, prof.skin, prof.skinDeep, {});

    /* skull + jaw silhouette */
    var g = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.2, 0, 0, r * 1.45);
    g.addColorStop(0, RS.shade(prof.skin, 1.28));
    g.addColorStop(0.6, prof.skin);
    g.addColorStop(1, RS.shade(prof.skinDeep, 0.98));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-r * 0.92, -r * 0.15);
    ctx.quadraticCurveTo(-r * 0.95, -r * 1.02, 0, -r * 1.06);
    ctx.quadraticCurveTo(r * 0.86 * af + r * 0.1, -r * 1.0, r * 0.90 * af, -r * 0.10);
    ctx.quadraticCurveTo(r * 0.86 * af, r * 0.62, r * 0.28 * af, r * 0.92);   // jaw
    ctx.quadraticCurveTo(-r * 0.3, r * 1.02, -r * 0.84, r * 0.42);
    ctx.closePath();
    ctx.fill();

    /* ear */
    ctx.fillStyle = RS.shade(prof.skin, 0.92);
    ctx.beginPath();
    ctx.ellipse(-r * 0.42, r * 0.05, r * 0.20, r * 0.30, 0.2, 0, RS.TAU);
    ctx.fill();

    /* brow shadow */
    ctx.fillStyle = RS.rgba(prof.skinDeep, 0.34);
    ctx.beginPath();
    ctx.ellipse(r * 0.30 * af, -r * 0.30, r * 0.52, r * 0.16, -0.12, 0, RS.TAU);
    ctx.fill();

    /* eye - squints under strain */
    var squint = clamp(cl.effort * 0.9 + cl.sweat * 0.35, 0, 0.85);
    var eh = r * 0.17 * (1 - squint);
    if (af > 0.12) {
      ctx.fillStyle = '#f3ede4';
      ctx.beginPath();
      ctx.ellipse(r * 0.42 * af, -r * 0.14, r * 0.20 * af, Math.max(0.5, eh), 0, 0, RS.TAU);
      ctx.fill();
      ctx.fillStyle = '#2b2118';
      ctx.beginPath();
      ctx.arc(r * 0.47 * af, -r * 0.14, Math.min(r * 0.10, Math.max(0.4, eh)), 0, RS.TAU);
      ctx.fill();
    }
    /* eyebrow */
    ctx.strokeStyle = RS.shade(prof.hair, 0.9);
    ctx.lineWidth = r * 0.13;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(r * 0.20 * af, -r * 0.38 - squint * r * 0.05);
    ctx.lineTo(r * 0.62 * af, -r * 0.30 + squint * r * 0.08);
    ctx.stroke();

    /* nose profile */
    ctx.fillStyle = RS.shade(prof.skin, 1.06);
    ctx.beginPath();
    ctx.moveTo(r * 0.80 * af, -r * 0.16);
    ctx.quadraticCurveTo(r * 1.02 * af, r * 0.04, r * 0.78 * af, r * 0.18);
    ctx.closePath();
    ctx.fill();

    /* mouth - opens when you're working hard */
    var open = clamp(cl.effort * 1.1 + cl.sweat * 0.4, 0, 1);
    ctx.fillStyle = RS.rgba('#5b2a26', 0.75);
    ctx.beginPath();
    ctx.ellipse(r * 0.55 * af, r * 0.46, r * 0.17, r * (0.05 + 0.14 * open), 0, 0, RS.TAU);
    ctx.fill();

    /* hair */
    ctx.fillStyle = prof.hair;
    var hs = prof.hairStyle;
    ctx.beginPath();
    if (hs === 'bun') {
      ctx.moveTo(-r * 0.95, -r * 0.10);
      ctx.quadraticCurveTo(-r * 1.02, -r * 1.20, 0, -r * 1.22);
      ctx.quadraticCurveTo(r * 0.92 * af, -r * 1.18, r * 0.86 * af, -r * 0.40);
      ctx.quadraticCurveTo(r * 0.4, -r * 0.78, -r * 0.3, -r * 0.72);
      ctx.quadraticCurveTo(-r * 0.85, -r * 0.60, -r * 0.95, -r * 0.10);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(-r * 0.92, -r * 0.62, r * 0.42, 0, RS.TAU); ctx.fill();
    } else if (hs === 'pony') {
      ctx.moveTo(-r * 0.95, 0);
      ctx.quadraticCurveTo(-r * 1.0, -r * 1.2, 0, -r * 1.22);
      ctx.quadraticCurveTo(r * 0.9 * af, -r * 1.15, r * 0.84 * af, -r * 0.44);
      ctx.quadraticCurveTo(r * 0.3, -r * 0.8, -r * 0.4, -r * 0.7);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.85, -r * 0.5);
      ctx.quadraticCurveTo(-r * 1.9, -r * 0.1, -r * 1.5, r * 0.95);
      ctx.quadraticCurveTo(-r * 1.0, r * 0.35, -r * 0.7, -r * 0.15);
      ctx.closePath(); ctx.fill();
    } else if (hs === 'long') {
      ctx.moveTo(-r * 1.0, r * 1.25);
      ctx.quadraticCurveTo(-r * 1.25, -r * 1.0, 0, -r * 1.24);
      ctx.quadraticCurveTo(r * 0.92 * af, -r * 1.16, r * 0.84 * af, -r * 0.40);
      ctx.quadraticCurveTo(r * 0.3, -r * 0.82, -r * 0.45, -r * 0.66);
      ctx.quadraticCurveTo(-r * 0.55, r * 0.5, -r * 0.35, r * 1.35);
      ctx.closePath(); ctx.fill();
    } else if (hs === 'fade') {
      ctx.moveTo(-r * 0.92, -r * 0.22);
      ctx.quadraticCurveTo(-r * 0.98, -r * 1.06, 0, -r * 1.10);
      ctx.quadraticCurveTo(r * 0.9 * af, -r * 1.04, r * 0.86 * af, -r * 0.34);
      ctx.quadraticCurveTo(r * 0.35, -r * 0.66, -r * 0.35, -r * 0.62);
      ctx.closePath(); ctx.fill();
    } else if (hs === 'cap') {
      ctx.fillStyle = RS.shade(prof.top, 0.8);
      ctx.moveTo(-r * 0.95, -r * 0.34);
      ctx.quadraticCurveTo(-r * 1.0, -r * 1.24, 0, -r * 1.26);
      ctx.quadraticCurveTo(r * 0.95 * af, -r * 1.2, r * 0.92 * af, -r * 0.40);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(r * 0.7 * af, -r * 0.44);
      ctx.lineTo(r * 1.55 * af, -r * 0.30);
      ctx.lineTo(r * 1.5 * af, -r * 0.10);
      ctx.lineTo(r * 0.7 * af, -r * 0.20);
      ctx.closePath(); ctx.fill();
    } else { /* short */
      ctx.moveTo(-r * 0.95, -r * 0.16);
      ctx.quadraticCurveTo(-r * 1.02, -r * 1.14, 0, -r * 1.17);
      ctx.quadraticCurveTo(r * 0.92 * af, -r * 1.10, r * 0.88 * af, -r * 0.34);
      ctx.quadraticCurveTo(r * 0.4, -r * 0.74, -r * 0.35, -r * 0.68);
      ctx.closePath(); ctx.fill();
    }
    /* hair sheen */
    ctx.strokeStyle = RS.rgba(RS.shade(prof.hair, 1.9), 0.25);
    ctx.lineWidth = r * 0.14;
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, -r * 0.95);
    ctx.quadraticCurveTo(r * 0.2, -r * 1.12, r * 0.6 * af, -r * 0.75);
    ctx.stroke();

    /* sweat beads */
    if (cl.sweat > 0.3) {
      ctx.fillStyle = RS.rgba('#cfe9f5', 0.55 * cl.sweat);
      for (var i = 0; i < 3; i++) {
        var yy = -r * 0.4 + ((cl.breath * 26 + i * 17) % (r * 1.8));
        ctx.beginPath();
        ctx.ellipse(r * (0.72 - i * 0.12) * af, yy, r * 0.07, r * 0.13, 0, 0, RS.TAU);
        ctx.fill();
      }
    }
    /* chalk smudge on the cheek */
    ctx.fillStyle = RS.rgba('#f2eee6', 0.13);
    ctx.beginPath();
    ctx.ellipse(r * 0.35 * af, r * 0.35, r * 0.30, r * 0.14, 0.4, 0, RS.TAU);
    ctx.fill();

    ctx.restore();
  }

  /* ------------------------------------------------------------------- torso */

  function torso(ctx, cl, sh, hip, dt) {
    var prof = cl.profile, sc = cl.scale;
    var b = prof.build;
    var breathe = 1 + Math.sin(cl.breath * (2.6 + cl.effort * 4)) * (0.012 + cl.effort * 0.03);

    var shw = 9.2 * sc * b * breathe;
    var hpw = 7.0 * sc * b;
    var lx = sh.L, rx = sh.R, hl = hip.L, hr = hip.R;

    /* bare skin torso first (shows at the waist and shoulders) */
    var g = ctx.createLinearGradient(lx.x, lx.y, rx.x, rx.y);
    var flip = cl.facingT >= 0;
    g.addColorStop(0, RS.shade(flip ? prof.skinDeep : prof.skin, flip ? 1.0 : 1.26));
    g.addColorStop(0.45, prof.skin);
    g.addColorStop(1, RS.shade(flip ? prof.skin : prof.skinDeep, flip ? 1.22 : 1.0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(lx.x, lx.y);
    ctx.quadraticCurveTo(
      (lx.x + hl.x) * 0.5 - (rx.x - lx.x) * 0.10, (lx.y + hl.y) * 0.5,
      hl.x, hl.y);
    ctx.lineTo(hr.x, hr.y);
    ctx.quadraticCurveTo(
      (rx.x + hr.x) * 0.5 + (rx.x - lx.x) * 0.10, (rx.y + hr.y) * 0.5,
      rx.x, rx.y);
    ctx.closePath();
    ctx.fill();

    /* deltoid caps */
    limb(ctx, lx.x, lx.y, lx.x, lx.y, shw * 0.42, shw * 0.42, prof.skin, prof.skinDeep, {});
    limb(ctx, rx.x, rx.y, rx.x, rx.y, shw * 0.42, shw * 0.42, prof.skin, prof.skinDeep, {});

    /* ab / oblique definition, strongest under strain */
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(lx.x, lx.y); ctx.lineTo(hl.x, hl.y); ctx.lineTo(hr.x, hr.y); ctx.lineTo(rx.x, rx.y);
    ctx.closePath(); ctx.clip();
    var mid = { x: (lx.x + rx.x) * 0.5, y: (lx.y + rx.y) * 0.5 };
    var lo = { x: (hl.x + hr.x) * 0.5, y: (hl.y + hr.y) * 0.5 };
    ctx.strokeStyle = RS.rgba(prof.skinDeep, 0.30 + cl.effort * 0.28);
    ctx.lineWidth = 1.1 * sc;
    ctx.beginPath();
    ctx.moveTo(mid.x, mid.y); ctx.lineTo(lo.x, lo.y);
    ctx.stroke();
    for (var i = 1; i <= 3; i++) {
      var t = i / 4;
      var px = lerp(mid.x, lo.x, t), py = lerp(mid.y, lo.y, t);
      var w = shw * (0.55 - t * 0.18);
      ctx.beginPath();
      ctx.moveTo(px - w, py); ctx.lineTo(px + w, py);
      ctx.stroke();
    }
    ctx.restore();

    /* tank top / tee over the chest */
    var tg = ctx.createLinearGradient(lx.x, lx.y, rx.x, rx.y);
    tg.addColorStop(0, RS.shade(prof.top, flip ? 0.72 : 1.20));
    tg.addColorStop(0.5, prof.top);
    tg.addColorStop(1, RS.shade(prof.top, flip ? 1.20 : 0.72));
    ctx.fillStyle = tg;
    var wl = { x: lerp(lx.x, hl.x, 0.72), y: lerp(lx.y, hl.y, 0.72) };
    var wr = { x: lerp(rx.x, hr.x, 0.72), y: lerp(rx.y, hr.y, 0.72) };
    ctx.beginPath();
    ctx.moveTo(lx.x + (rx.x - lx.x) * 0.10, lx.y + (rx.y - lx.y) * 0.10);
    ctx.quadraticCurveTo(mid.x, mid.y + (lo.y - mid.y) * 0.10, rx.x - (rx.x - lx.x) * 0.10, rx.y - (rx.y - lx.y) * 0.10);
    ctx.lineTo(wr.x, wr.y);
    ctx.quadraticCurveTo((wl.x + wr.x) * 0.5, (wl.y + wr.y) * 0.5 + 2 * sc, wl.x, wl.y);
    ctx.closePath();
    ctx.fill();

    /* fabric folds */
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(lx.x, lx.y); ctx.lineTo(rx.x, rx.y); ctx.lineTo(wr.x, wr.y); ctx.lineTo(wl.x, wl.y);
    ctx.closePath(); ctx.clip();
    ctx.strokeStyle = RS.rgba(RS.shade(prof.top, 0.6), 0.45);
    ctx.lineWidth = 1;
    for (i = 0; i < 3; i++) {
      var tt = 0.25 + i * 0.25;
      var ax = lerp(lx.x, wl.x, tt), ay = lerp(lx.y, wl.y, tt);
      var bx = lerp(rx.x, wr.x, tt + 0.06), by = lerp(rx.y, wr.y, tt + 0.06);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo((ax + bx) * 0.5, (ay + by) * 0.5 + 3, bx, by);
      ctx.stroke();
    }
    ctx.restore();

    /* shorts */
    var bg = ctx.createLinearGradient(hl.x, hl.y, hr.x, hr.y);
    bg.addColorStop(0, RS.shade(prof.bottom, flip ? 0.74 : 1.22));
    bg.addColorStop(0.5, prof.bottom);
    bg.addColorStop(1, RS.shade(prof.bottom, flip ? 1.22 : 0.74));
    ctx.fillStyle = bg;
    var kneeL = cl.kneeL, kneeR = cl.kneeR;
    ctx.beginPath();
    ctx.moveTo(hl.x, hl.y - 2 * sc);
    ctx.lineTo(hr.x, hr.y - 2 * sc);
    ctx.quadraticCurveTo(lerp(hr.x, kneeR.x, 0.4), lerp(hr.y, kneeR.y, 0.4), lerp(hr.x, kneeR.x, 0.46), lerp(hr.y, kneeR.y, 0.46));
    ctx.lineTo(lerp(hl.x, kneeL.x, 0.46), lerp(hl.y, kneeL.y, 0.46));
    ctx.quadraticCurveTo(lerp(hl.x, kneeL.x, 0.4), lerp(hl.y, kneeL.y, 0.4), hl.x, hl.y - 2 * sc);
    ctx.closePath();
    ctx.fill();
  }

  /* -------------------------------------------------------------- harness kit */

  function harness(ctx, cl, hip, dt) {
    var sc = cl.scale;
    var st = cl._rs;
    var ax = (hip.L.x + hip.R.x) * 0.5, ay = (hip.L.y + hip.R.y) * 0.5;

    /* waist belt */
    ctx.strokeStyle = '#2f3b48';
    ctx.lineWidth = 3.0 * sc;
    ctx.beginPath();
    ctx.moveTo(hip.L.x, hip.L.y - 1 * sc);
    ctx.quadraticCurveTo(ax, ay + 1.5 * sc, hip.R.x, hip.R.y - 1 * sc);
    ctx.stroke();
    ctx.strokeStyle = RS.rgba('#8fa2b5', 0.7);
    ctx.lineWidth = 0.8 * sc;
    ctx.stroke();

    /* chalk bag on a swinging tether */
    var tx = ax - cl.facingT * 8 * sc, ty = ay + 4 * sc;
    st.bag.vx += (tx - st.bag.x) * 60 * dt;
    st.bag.vy += ((ty + 13 * sc) - st.bag.y) * 60 * dt + 240 * dt;
    st.bag.vx *= 0.90; st.bag.vy *= 0.90;
    st.bag.x += st.bag.vx * dt; st.bag.y += st.bag.vy * dt;

    ctx.strokeStyle = '#3a4450';
    ctx.lineWidth = 1.2 * sc;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(st.bag.x, st.bag.y - 4 * sc); ctx.stroke();

    var bw = 5.0 * sc, bh = 6.0 * sc;
    var bgg = ctx.createLinearGradient(st.bag.x - bw, 0, st.bag.x + bw, 0);
    bgg.addColorStop(0, '#6d5a45');
    bgg.addColorStop(0.5, '#8a7358');
    bgg.addColorStop(1, '#5a4a39');
    ctx.fillStyle = bgg;
    RS.roundRect(ctx, st.bag.x - bw, st.bag.y - bh * 0.5, bw * 2, bh, 2 * sc);
    ctx.fill();
    ctx.fillStyle = RS.rgba('#f3efe6', 0.55);
    ctx.fillRect(st.bag.x - bw * 0.8, st.bag.y - bh * 0.5, bw * 1.6, 1.4 * sc);

    /* a couple of gear loops with quickdraws, because why not */
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 1.1 * sc;
    for (var i = 0; i < 2; i++) {
      var gx = ax + (i === 0 ? -1 : 1) * 4 * sc + cl.facingT * 5 * sc;
      ctx.beginPath();
      ctx.moveTo(gx, ay + 2 * sc);
      ctx.lineTo(gx + Math.sin(cl.breath * 2 + i) * 1.5, ay + 9 * sc);
      ctx.stroke();
    }
  }

  /* ------------------------------------------------------------------ public */

  RS.drawClimber = function (ctx, cl, dt, opts) {
    opts = opts || {};
    var prof = cl.profile, sc = cl.scale;
    if (!cl._rs) {
      cl._rs = { bag: { x: cl.pelvis.x, y: cl.pelvis.y + 14, vx: 0, vy: 0 } };
    }

    var shL = cl.shoulderPos('L'), shR = cl.shoulderPos('R');
    var dx = cl.chest.x - cl.pelvis.x, dy = cl.chest.y - cl.pelvis.y;
    var d = RS.len(dx, dy) || 1;
    var nx = -dy / d, ny = dx / d;
    var hipW = 6.6 * sc * prof.build;
    var hip = {
      L: { x: cl.pelvis.x - nx * hipW, y: cl.pelvis.y - ny * hipW },
      R: { x: cl.pelvis.x + nx * hipW, y: cl.pelvis.y + ny * hipW }
    };
    var sh = { L: shL, R: shR };
    var torsoAngle = Math.atan2(dy, dx) + Math.PI / 2;

    /* hand curl targets */
    var k;
    for (k in cl.limbs) {
      var L = cl.limbs[k];
      var want = L.hold ? 1 : (L.wantGrip ? 0.55 : 0.12);
      if (cl.stun > 0 || cl.pumped > 0) want = 0.05;
      L.curl = RS.approach(L.curl, want, 14, dt);
    }

    /* ---- ambient occlusion blob against the wall ---- */
    ctx.save();
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(cl.chest.x + 5, cl.chest.y + 8, 26 * sc, 34 * sc, torsoAngle, 0, RS.TAU);
    ctx.fill();
    ctx.filter = 'none';
    ctx.restore();

    /* Draw far side first so the near limbs overlap correctly. */
    var nearIsR = cl.facingT >= 0;
    var far = nearIsR ? 'L' : 'R';
    var near = nearIsR ? 'R' : 'L';

    var arm = function (side, shade) {
      var el = side === 'L' ? cl.elbowL : cl.elbowR;
      var hd = side === 'L' ? cl.handL : cl.handR;
      var s = side === 'L' ? shL : shR;
      var lb = cl.limbs['hand' + side];
      var skin = shade ? RS.shade(prof.skin, 0.80) : prof.skin;
      var deep = shade ? RS.shade(prof.skinDeep, 0.82) : prof.skinDeep;
      var flex = lb.hold ? 1 : 0.2;
      limb(ctx, s.x, s.y, el.x, el.y, 4.6 * sc * prof.build, 3.7 * sc, skin, deep, { muscle: true, crease: true, flex: flex });
      limb(ctx, el.x, el.y, hd.x, hd.y, 3.7 * sc, 2.9 * sc, skin, deep, { muscle: true, crease: true, flex: flex });
      hand(ctx, hd.x, hd.y, el.x, el.y, lb.curl, skin, deep, sc, 0.5 + lb.curl * 0.5);
    };

    var leg = function (side, shade) {
      var kn = side === 'L' ? cl.kneeL : cl.kneeR;
      var ft = side === 'L' ? cl.footL : cl.footR;
      var hp = side === 'L' ? hip.L : hip.R;
      var skin = shade ? RS.shade(prof.skin, 0.80) : prof.skin;
      var deep = shade ? RS.shade(prof.skinDeep, 0.82) : prof.skinDeep;
      limb(ctx, hp.x, hp.y, kn.x, kn.y, 5.6 * sc * prof.build, 4.2 * sc, skin, deep, { muscle: true, crease: true, flex: 0.6 });
      limb(ctx, kn.x, kn.y, ft.x, ft.y, 4.0 * sc, 2.9 * sc, skin, deep, { muscle: true, crease: true, flex: 0.5 });
      shoe(ctx, ft.x, ft.y, kn.x, kn.y, prof, sc);
    };

    leg(far, true);
    arm(far, true);
    torso(ctx, cl, sh, hip, dt);
    harness(ctx, cl, hip, dt);
    leg(near, false);
    head(ctx, cl, cl.head, RS.normAngle(torsoAngle) * 0.35, dt);
    arm(near, false);

    /* ---- skin grain over the whole figure ---- */
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    tracelimb(ctx, shL.x, shL.y, cl.elbowL.x, cl.elbowL.y, 5 * sc, 4 * sc);
    tracelimb(ctx, cl.elbowL.x, cl.elbowL.y, cl.handL.x, cl.handL.y, 4 * sc, 3 * sc);
    tracelimb(ctx, shR.x, shR.y, cl.elbowR.x, cl.elbowR.y, 5 * sc, 4 * sc);
    tracelimb(ctx, cl.elbowR.x, cl.elbowR.y, cl.handR.x, cl.handR.y, 4 * sc, 3 * sc);
    tracelimb(ctx, hip.L.x, hip.L.y, cl.kneeL.x, cl.kneeL.y, 6 * sc, 4.4 * sc);
    tracelimb(ctx, hip.R.x, hip.R.y, cl.kneeR.x, cl.kneeR.y, 6 * sc, 4.4 * sc);
    tracelimb(ctx, cl.chest.x, cl.chest.y, cl.pelvis.x, cl.pelvis.y, 10 * sc, 8 * sc);
    ctx.clip();
    ctx.fillStyle = grain(ctx);
    ctx.fillRect(cl.chest.x - 90, cl.chest.y - 90, 180, 200);
    ctx.restore();

    /* ---- strain veins / flush when pumped ---- */
    if (cl.stamina < 34) {
      var pump = 1 - cl.stamina / 34;
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.16 * pump;
      ctx.fillStyle = '#d0402e';
      for (var a = 0; a < 2; a++) {
        var ee = a === 0 ? cl.elbowL : cl.elbowR;
        ctx.beginPath(); ctx.arc(ee.x, ee.y, 8 * sc, 0, RS.TAU); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(cl.head.x, cl.head.y, 9 * sc, 0, RS.TAU); ctx.fill();
      ctx.restore();
    }

    /* ---- chalk dust ---- */
    for (var i = 0; i < cl.chalkPuffs.length; i++) {
      var c = cl.chalkPuffs[i];
      var lifeT = c.t / c.life;
      ctx.globalAlpha = (1 - lifeT) * 0.5;
      ctx.fillStyle = '#f6f3ec';
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r * (1 + lifeT * 1.9), 0, RS.TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* ---- slip flash ---- */
    if (cl.slipFx > 0) {
      ctx.strokeStyle = RS.rgba('#ff5a3c', cl.slipFx * 0.7);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cl.chest.x, cl.chest.y, 30 + (1 - cl.slipFx) * 26, 0, RS.TAU);
      ctx.stroke();
    }

    /* ---- name tag in party mode ---- */
    if (opts.tag) {
      ctx.save();
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      var w = ctx.measureText(opts.tag).width + 12;
      var ty = cl.head.y - 26 * sc;
      ctx.fillStyle = RS.rgba('#0b0f14', 0.62);
      RS.roundRect(ctx, cl.head.x - w / 2, ty - 11, w, 16, 5);
      ctx.fill();
      ctx.fillStyle = opts.tagColor || '#e8eef5';
      ctx.fillText(opts.tag, cl.head.x, ty + 1);
      ctx.restore();
    }
  };

  /* Small portrait used by menus and the scoreboard. */
  RS.drawPortrait = function (ctx, prof, x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    var g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.2, 0, 0, r * 1.3);
    g.addColorStop(0, RS.shade(prof.skin, 1.22));
    g.addColorStop(1, RS.shade(prof.skinDeep, 0.98));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.82, r * 0.96, 0, 0, RS.TAU); ctx.fill();
    ctx.fillStyle = prof.hair;
    ctx.beginPath();
    ctx.moveTo(-r * 0.84, -r * 0.1);
    ctx.quadraticCurveTo(0, -r * 1.5, r * 0.84, -r * 0.1);
    ctx.quadraticCurveTo(0, -r * 0.55, -r * 0.84, -r * 0.1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2b2118';
    ctx.beginPath(); ctx.arc(-r * 0.26, -r * 0.08, r * 0.09, 0, RS.TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.26, -r * 0.08, r * 0.09, 0, RS.TAU); ctx.fill();
    ctx.fillStyle = prof.top;
    ctx.beginPath();
    ctx.moveTo(-r * 0.9, r * 1.3); ctx.lineTo(-r * 0.55, r * 0.7);
    ctx.lineTo(r * 0.55, r * 0.7); ctx.lineTo(r * 0.9, r * 1.3);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  };

})(window.RS);

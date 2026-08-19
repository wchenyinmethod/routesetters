/* ROUTESETTERS - scene-render.js
 * Draws the wall, terrain, holds, force zones, props and the top anchor.
 * Zone particles are computed procedurally from (time, index) so there is no
 * particle state to keep in sync with the simulation.
 */
(function (RS) {
  'use strict';

  var clamp = RS.clamp, lerp = RS.lerp;

  /* ------------------------------------------------------------------ themes */

  RS.THEMES = {
    granite: {
      skyTop: '#1b2a3a', skyBot: '#5f7d92', ridge: '#243444',
      rock: '#5d6670', rockDark: '#343c45', rockLight: '#7d8794',
      crack: '#242a31', accent: '#8fa3b8', haze: '#93b2c6'
    },
    sandstone: {
      skyTop: '#2d1f2b', skyBot: '#c98a5a', ridge: '#4a3040',
      rock: '#a9663d', rockDark: '#66381f', rockLight: '#cf9163',
      crack: '#472213', accent: '#e8b98a', haze: '#e2a878'
    },
    gym: {
      skyTop: '#171b22', skyBot: '#2a323d', ridge: '#1d2229',
      rock: '#c9bda6', rockDark: '#8d8271', rockLight: '#e6dcc6',
      crack: '#7a7060', accent: '#f2ead6', haze: '#3a4250'
    },
    alpine: {
      skyTop: '#0e1a2b', skyBot: '#8fb6cf', ridge: '#1a2b3d',
      rock: '#6b7480', rockDark: '#3a4250', rockLight: '#9aa5b2',
      crack: '#2a3038', accent: '#cfe3f0', haze: '#cfe3f0'
    },
    night: {
      skyTop: '#05070d', skyBot: '#1b2436', ridge: '#0a0f18',
      rock: '#333c48', rockDark: '#1c222b', rockLight: '#4b5765',
      crack: '#14181f', accent: '#6d8ba8', haze: '#243044'
    }
  };

  /* --------------------------------------------------------- rock texture tile */

  var TILE_CACHE = {};
  function rockTile(ctx, themeKey) {
    if (TILE_CACHE[themeKey]) return TILE_CACHE[themeKey];
    var T = RS.THEMES[themeKey] || RS.THEMES.granite;
    var S = 256;
    var c = document.createElement('canvas');
    c.width = c.height = S;
    var g = c.getContext('2d');
    var r = new RS.Rng(themeKey.length * 7717 + 13);

    g.fillStyle = T.rock;
    g.fillRect(0, 0, S, S);

    /* mottled patches */
    var i;
    for (i = 0; i < 420; i++) {
      var x = r.next() * S, y = r.next() * S, rad = r.range(6, 42);
      var lit = r.next() > 0.5;
      g.fillStyle = RS.rgba(lit ? T.rockLight : T.rockDark, r.range(0.04, 0.16));
      g.beginPath(); g.ellipse(x, y, rad, rad * r.range(0.5, 1), r.next() * 6.28, 0, 6.28); g.fill();
    }
    /* cracks */
    g.strokeStyle = RS.rgba(T.crack, 0.55);
    for (i = 0; i < 22; i++) {
      var px = r.next() * S, py = r.next() * S;
      g.lineWidth = r.range(0.5, 2.1);
      g.beginPath();
      g.moveTo(px, py);
      for (var k = 0; k < 7; k++) {
        px += r.range(-26, 26); py += r.range(-26, 26);
        g.lineTo(px, py);
      }
      g.stroke();
    }
    /* grain speckle */
    var img = g.getImageData(0, 0, S, S);
    for (i = 0; i < img.data.length; i += 4) {
      var n = (r.next() - 0.5) * 26;
      img.data[i] = clamp(img.data[i] + n, 0, 255);
      img.data[i + 1] = clamp(img.data[i + 1] + n, 0, 255);
      img.data[i + 2] = clamp(img.data[i + 2] + n, 0, 255);
    }
    g.putImageData(img, 0, 0);

    TILE_CACHE[themeKey] = ctx.createPattern(c, 'repeat');
    return TILE_CACHE[themeKey];
  }

  /* ------------------------------------------------------------------- sky */

  RS.drawSky = function (ctx, cam, vw, vh, themeKey, t) {
    var T = RS.THEMES[themeKey] || RS.THEMES.granite;
    var g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, T.skyTop);
    g.addColorStop(1, T.skyBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);

    /* height haze: the higher the camera, the more washed out the horizon */
    var alt = clamp(1 - (cam.y / 2600), 0, 1);

    /* stars for the night theme */
    if (themeKey === 'night') {
      for (var s = 0; s < 90; s++) {
        var sx = ((s * 887) % 1000) / 1000 * vw;
        var sy = ((s * 613) % 1000) / 1000 * vh * 0.7;
        var tw = 0.35 + 0.35 * Math.sin(t * 2 + s);
        ctx.fillStyle = RS.rgba('#dfe9f5', tw * 0.7);
        ctx.fillRect(sx, sy - cam.y * 0.02, 1.4, 1.4);
      }
    }

    /* parallax ridge lines */
    var layers = [
      { p: 0.06, h: 0.30, a: 0.55, amp: 60, f: 0.0016 },
      { p: 0.13, h: 0.44, a: 0.75, amp: 90, f: 0.0011 },
      { p: 0.22, h: 0.60, a: 1.00, amp: 130, f: 0.0007 }
    ];
    for (var L = 0; L < layers.length; L++) {
      var ly = layers[L];
      ctx.fillStyle = RS.rgba(RS.mixHex(T.ridge, T.haze, (1 - ly.a) * 0.55), 0.55 + ly.a * 0.4);
      ctx.beginPath();
      var baseY = vh * ly.h + cam.y * ly.p;
      ctx.moveTo(0, vh);
      for (var x = 0; x <= vw; x += 12) {
        var wx = (x + cam.x * ly.p) * ly.f;
        var yy = baseY - (RS.fbm1(wx * 6, 4) * ly.amp + Math.sin(wx * 9) * ly.amp * 0.3);
        ctx.lineTo(x, yy);
      }
      ctx.lineTo(vw, vh);
      ctx.closePath();
      ctx.fill();
    }

    /* drifting cloud band */
    ctx.globalAlpha = 0.16 + alt * 0.2;
    ctx.fillStyle = T.haze;
    for (var c = 0; c < 5; c++) {
      var cy = vh * 0.22 + c * 44 + cam.y * 0.05;
      var cx = ((t * (6 + c * 3) + c * 380) % (vw + 500)) - 250;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 190 - c * 18, 22 - c * 2, 0, 0, RS.TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  /* ------------------------------------------------------------- wall + rock */

  RS.drawWall = function (ctx, world, cam, vw, vh) {
    var T = RS.THEMES[world.theme] || RS.THEMES.granite;
    var b = world.bounds;

    /* the face itself */
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x, b.y, b.w, b.h);
    ctx.clip();

    ctx.fillStyle = rockTile(ctx, world.theme);
    ctx.fillRect(b.x, b.y, b.w, b.h);

    /* vertical lighting: brighter on the left where the light comes from */
    var lg = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
    lg.addColorStop(0, RS.rgba(T.rockLight, 0.30));
    lg.addColorStop(0.45, RS.rgba(T.rock, 0));
    lg.addColorStop(1, RS.rgba(T.rockDark, 0.42));
    ctx.fillStyle = lg;
    ctx.fillRect(b.x, b.y, b.w, b.h);

    /* big geological strata so height reads clearly as you climb */
    ctx.globalAlpha = 0.20;
    for (var sy = b.y; sy < b.y + b.h; sy += 190) {
      var wobble = RS.fbm1(sy * 0.004, 3) * 26;
      ctx.strokeStyle = T.crack;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (var x = b.x; x <= b.x + b.w; x += 16) {
        var y = sy + wobble + RS.fbm1(x * 0.01 + sy, 3) * 16;
        if (x === b.x) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    /* edge falloff so the wall feels like it has depth at the sides */
    var eg = ctx.createLinearGradient(b.x, 0, b.x + 70, 0);
    eg.addColorStop(0, RS.rgba(T.rockDark, 0.7));
    eg.addColorStop(1, RS.rgba(T.rockDark, 0));
    ctx.fillStyle = eg;
    ctx.fillRect(b.x, b.y, 70, b.h);
    var eg2 = ctx.createLinearGradient(b.x + b.w, 0, b.x + b.w - 70, 0);
    eg2.addColorStop(0, RS.rgba(T.rockDark, 0.8));
    eg2.addColorStop(1, RS.rgba(T.rockDark, 0));
    ctx.fillStyle = eg2;
    ctx.fillRect(b.x + b.w - 70, b.y, 70, b.h);

    ctx.restore();

    /* height ruler up the left margin */
    ctx.save();
    ctx.font = '600 10px ui-monospace, monospace';
    ctx.textAlign = 'right';
    for (var m = 0; m < world.height / 42; m += 5) {
      var yy = world.start.y - m * 42;
      if (yy < b.y - 40 || yy > b.y + b.h + 40) continue;
      ctx.strokeStyle = RS.rgba(T.accent, 0.22);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(b.x - 6, yy); ctx.lineTo(b.x - 1, yy); ctx.stroke();
      if (m % 10 === 0 && m > 0) {
        ctx.fillStyle = RS.rgba(T.accent, 0.55);
        ctx.fillText(m + 'm', b.x - 9, yy + 3);
      }
    }
    ctx.restore();
  };

  /* --------------------------------------------------------------- terrain */

  RS.drawTerrain = function (ctx, world) {
    var T = RS.THEMES[world.theme] || RS.THEMES.granite;
    for (var i = 0; i < world.terrain.length; i++) {
      var s = world.terrain[i];
      if (s.dead || s.tag && s.tag.indexOf('hold:') === 0) continue;   // holds draw themselves
      drawShape(ctx, s, T);
    }
  };

  function drawShape(ctx, s, T) {
    var fillA, fillB, edge;
    if (s.mat === 'metal') { fillA = '#b9bfc7'; fillB = '#5e6670'; edge = '#3a4048'; }
    else if (s.mat === 'ply') { fillA = '#d9c79c'; fillB = '#93815a'; edge = '#5d5138'; }
    else if (s.mat === 'pad') { fillA = '#5fc6d8'; fillB = '#2d7e91'; edge = '#1d5261'; }
    else if (s.mat === 'ice') { fillA = '#dff2fb'; fillB = '#8fc3dc'; edge = '#5f93ad'; }
    else { fillA = T.rockLight; fillB = T.rockDark; edge = T.crack; }

    ctx.save();
    var bnd = RS.shapeBounds(s);

    /* drop shadow onto the wall */
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = '#000';
    pathShape(ctx, s, 5, 7);
    ctx.fill();
    ctx.globalAlpha = 1;

    var g = ctx.createLinearGradient(bnd.x, bnd.y, bnd.x + bnd.w * 0.4, bnd.y + bnd.h);
    g.addColorStop(0, fillA);
    g.addColorStop(0.55, RS.mixHex(fillA, fillB, 0.55));
    g.addColorStop(1, fillB);
    ctx.fillStyle = g;
    pathShape(ctx, s, 0, 0);
    ctx.fill();

    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    /* top highlight so ledges read as standable */
    ctx.strokeStyle = RS.rgba('#ffffff', 0.32);
    ctx.lineWidth = 1.6;
    if (s.type === 'capsule') {
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1 - s.r + 1);
      ctx.lineTo(s.x2, s.y2 - s.r + 1);
      ctx.stroke();
    } else if (s.type === 'rect') {
      ctx.beginPath(); ctx.moveTo(s.x + 2, s.y + 1); ctx.lineTo(s.x + s.w - 2, s.y + 1); ctx.stroke();
    }

    /* crash pads get stripes */
    if (s.mat === 'pad') {
      ctx.strokeStyle = RS.rgba('#0d3742', 0.35);
      ctx.lineWidth = 3;
      for (var x = bnd.x + 8; x < bnd.x + bnd.w; x += 14) {
        ctx.beginPath(); ctx.moveTo(x, bnd.y + 2); ctx.lineTo(x - 6, bnd.y + bnd.h - 2); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function pathShape(ctx, s, ox, oy) {
    ox = ox || 0; oy = oy || 0;
    ctx.beginPath();
    switch (s.type) {
      case 'rect': RS.roundRect(ctx, s.x + ox, s.y + oy, s.w, s.h, 3); break;
      case 'circle': ctx.arc(s.x + ox, s.y + oy, s.r, 0, RS.TAU); break;
      case 'capsule': RS.capsulePath(ctx, s.x1 + ox, s.y1 + oy, s.x2 + ox, s.y2 + oy, s.r, s.r); break;
      case 'poly':
        for (var i = 0; i < s.pts.length; i++) {
          if (i === 0) ctx.moveTo(s.pts[i].x + ox, s.pts[i].y + oy);
          else ctx.lineTo(s.pts[i].x + ox, s.pts[i].y + oy);
        }
        ctx.closePath();
        break;
    }
  }
  RS.pathShape = pathShape;

  /* ----------------------------------------------------------------- holds */

  RS.drawHold = function (ctx, h, t, opts) {
    opts = opts || {};
    if (h.dead && !opts.ghost) return;
    var T = RS.HOLD_TYPES[h.type] || RS.HOLD_TYPES.jug;
    var pal = T.palette;
    var r = h.r;
    var shake = h.wobble > 0 ? Math.sin(t * 90) * h.wobble * 2.2 : 0;
    var x = h.x + shake, y = h.y;

    ctx.save();
    if (opts.ghost) ctx.globalAlpha = 0.55;

    /* motion path hint */
    if (h.motion && !opts.ghost) {
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = RS.rgba('#ffd166', 0.45);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      var m = h.motion;
      if (m.kind === 'oscillate') { ctx.moveTo(h.baseX - m.amp, h.baseY); ctx.lineTo(h.baseX + m.amp, h.baseY); }
      else if (m.kind === 'elevator') { ctx.moveTo(h.baseX, h.baseY - m.amp); ctx.lineTo(h.baseX, h.baseY + m.amp); }
      else if (m.kind === 'cam') { ctx.arc(m.cx, m.cy, m.radius, 0, RS.TAU); }
      else if (m.kind === 'conveyor' && h.segment) { ctx.moveTo(h.segment.x1, h.segment.y1); ctx.lineTo(h.segment.x2, h.segment.y2); }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    /* contact shadow */
    ctx.globalAlpha *= 1;
    ctx.fillStyle = RS.rgba('#000000', 0.34);
    ctx.beginPath();
    ctx.ellipse(x + 3.5, y + 5, r * 1.02, r * 0.86, 0, 0, RS.TAU);
    ctx.fill();

    ctx.translate(x, y);
    var rot = 0;
    if (T.directional || h.type === 'spring' || h.type === 'rail') rot = h.angle;
    ctx.rotate(rot);

    var g = ctx.createRadialGradient(-r * 0.34, -r * 0.42, r * 0.12, 0, 0, r * 1.25);
    g.addColorStop(0, pal[2]);
    g.addColorStop(0.5, pal[0]);
    g.addColorStop(1, pal[1]);
    ctx.fillStyle = g;

    var shape = T.shape || 'jug';
    ctx.beginPath();
    switch (shape) {
      case 'jug':
        ctx.moveTo(-r, r * 0.55);
        ctx.quadraticCurveTo(-r * 1.06, -r * 0.62, -r * 0.15, -r * 0.95);
        ctx.quadraticCurveTo(r * 0.95, -r * 0.78, r * 0.98, r * 0.2);
        ctx.quadraticCurveTo(r * 0.6, r * 0.85, -r, r * 0.55);
        ctx.closePath();
        break;
      case 'crimp':
        RS.roundRect(ctx, -r, -r * 0.55, r * 2, r * 1.1, r * 0.3);
        break;
      case 'sloper':
        ctx.arc(0, r * 0.12, r * 0.98, Math.PI * 1.02, Math.PI * 1.98);
        ctx.closePath();
        break;
      case 'pinch':
        ctx.moveTo(-r * 0.5, r * 0.9);
        ctx.lineTo(-r * 0.85, -r * 0.5);
        ctx.quadraticCurveTo(0, -r * 1.15, r * 0.85, -r * 0.5);
        ctx.lineTo(r * 0.5, r * 0.9);
        ctx.closePath();
        break;
      case 'pocket':
        ctx.arc(0, 0, r, 0, RS.TAU);
        break;
      case 'undercling':
        ctx.moveTo(-r, -r * 0.6);
        ctx.quadraticCurveTo(0, r * 1.15, r, -r * 0.6);
        ctx.quadraticCurveTo(0, -r * 0.15, -r, -r * 0.6);
        ctx.closePath();
        break;
      case 'sidepull':
        ctx.moveTo(-r * 0.35, -r);
        ctx.quadraticCurveTo(r * 0.95, -r * 0.5, r * 0.85, r * 0.15);
        ctx.quadraticCurveTo(r * 0.5, r, -r * 0.35, r * 0.85);
        ctx.quadraticCurveTo(-r * 0.9, 0, -r * 0.35, -r);
        ctx.closePath();
        break;
      case 'chip':
        ctx.moveTo(-r, r * 0.4);
        ctx.lineTo(-r * 0.6, -r * 0.5);
        ctx.lineTo(r * 0.7, -r * 0.35);
        ctx.lineTo(r, r * 0.45);
        ctx.closePath();
        break;
      case 'volume':
        ctx.moveTo(-r, r * 0.55);
        ctx.lineTo(r * 0.15, -r * 0.7);
        ctx.lineTo(r, r * 0.55);
        ctx.closePath();
        break;
      case 'ledge':
        RS.roundRect(ctx, -r, -r * 0.28, r * 2, r * 0.6, 3);
        break;
      case 'rail':
        RS.roundRect(ctx, -r * 1.2, -r * 0.34, r * 2.4, r * 0.68, r * 0.3);
        break;
      case 'crumble':
        ctx.moveTo(-r, r * 0.5);
        for (var ci = 0; ci < 7; ci++) {
          var a = Math.PI + ci / 6 * Math.PI;
          var rr = r * (0.78 + 0.28 * RS.noise1(h.seed + ci * 3.3));
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr + r * 0.1);
        }
        ctx.closePath();
        break;
      case 'ice':
        for (var k = 0; k < 6; k++) {
          var aa = k / 6 * RS.TAU - 0.4;
          var rr2 = r * (k % 2 ? 0.62 : 1.0);
          if (k === 0) ctx.moveTo(Math.cos(aa) * rr2, Math.sin(aa) * rr2);
          else ctx.lineTo(Math.cos(aa) * rr2, Math.sin(aa) * rr2);
        }
        ctx.closePath();
        break;
      case 'resin':
        ctx.arc(0, 0, r, 0, RS.TAU);
        break;
      case 'magnet':
        ctx.arc(0, 0, r * 0.9, 0, RS.TAU);
        break;
      case 'spring':
        RS.roundRect(ctx, -r * 0.8, -r * 0.8, r * 1.6, r * 1.6, r * 0.35);
        break;
      case 'partybox':
        for (var pi = 0; pi < 10; pi++) {
          var pa = pi / 10 * RS.TAU - Math.PI / 2;
          var pr = pi % 2 ? r * 0.55 : r;
          if (pi === 0) ctx.moveTo(Math.cos(pa) * pr, Math.sin(pa) * pr);
          else ctx.lineTo(Math.cos(pa) * pr, Math.sin(pa) * pr);
        }
        ctx.closePath();
        break;
      case 'knot':
        ctx.arc(0, 0, r * 0.85, 0, RS.TAU);
        break;
      case 'trolley':
        RS.roundRect(ctx, -r * 0.7, -r * 0.9, r * 1.4, r * 1.5, 3);
        break;
      default:
        ctx.arc(0, 0, r, 0, RS.TAU);
    }
    ctx.fill();

    /* edge */
    ctx.strokeStyle = RS.rgba(RS.shade(pal[1], 0.7), 0.9);
    ctx.lineWidth = 1.1;
    ctx.stroke();

    /* specular */
    ctx.fillStyle = RS.rgba('#ffffff', 0.30);
    ctx.beginPath();
    ctx.ellipse(-r * 0.32, -r * 0.42, r * 0.30, r * 0.18, -0.5, 0, RS.TAU);
    ctx.fill();

    /* texture speckle (resin holds are glossy so they get none) */
    if (shape !== 'resin' && shape !== 'ice' && shape !== 'trolley') {
      ctx.fillStyle = RS.rgba('#000000', 0.13);
      for (var s2 = 0; s2 < 8; s2++) {
        var sa = RS.noise1(h.seed + s2 * 7.7) * RS.TAU;
        var sr = Math.abs(RS.noise1(h.seed + s2 * 3.1)) * r * 0.7;
        ctx.beginPath();
        ctx.arc(Math.cos(sa) * sr, Math.sin(sa) * sr, r * 0.06, 0, RS.TAU);
        ctx.fill();
      }
    }

    /* mounting bolt */
    if (shape !== 'knot' && shape !== 'trolley' && shape !== 'ledge' && shape !== 'volume') {
      ctx.fillStyle = RS.rgba('#20262c', 0.75);
      ctx.beginPath(); ctx.arc(0, 0, Math.max(1.6, r * 0.16), 0, RS.TAU); ctx.fill();
      ctx.fillStyle = RS.rgba('#cfd6de', 0.5);
      ctx.beginPath(); ctx.arc(-0.5, -0.5, Math.max(0.8, r * 0.08), 0, RS.TAU); ctx.fill();
    }

    /* directional arrow */
    if (T.directional || h.type === 'spring') {
      ctx.strokeStyle = RS.rgba('#ffe9a8', 0.85);
      ctx.lineWidth = 1.6;
      var ax = h.type === 'spring' ? 0 : r * 1.5;
      var ay = h.type === 'spring' ? -r * 1.7 : 0;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(ax, ay); ctx.stroke();
      ctx.beginPath();
      if (h.type === 'spring') { ctx.moveTo(-3, ay + 4); ctx.lineTo(0, ay); ctx.lineTo(3, ay + 4); }
      else { ctx.moveTo(ax - 4, -3); ctx.lineTo(ax, 0); ctx.lineTo(ax - 4, 3); }
      ctx.stroke();
    }

    /* undercling gets a hint of which way to come at it */
    if (h.type === 'undercling') {
      ctx.strokeStyle = RS.rgba('#ffe9a8', 0.5);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(0, r * 1.9); ctx.lineTo(0, r * 0.9);
      ctx.moveTo(-3, r * 1.3); ctx.lineTo(0, r * 0.9); ctx.lineTo(3, r * 1.3);
      ctx.stroke();
    }

    ctx.rotate(-rot);

    /* --- state overlays --- */

    if (h.greased > 0.02) {
      ctx.globalAlpha = 0.55 * h.greased;
      var og = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.15);
      og.addColorStop(0, 'rgba(120,220,140,0.55)');
      og.addColorStop(1, 'rgba(40,90,60,0.1)');
      ctx.fillStyle = og;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.15, 0, RS.TAU); ctx.fill();
      /* drip */
      ctx.fillStyle = 'rgba(150,230,160,0.6)';
      var dy = ((t * 26) % (r * 2.6));
      ctx.beginPath(); ctx.ellipse(r * 0.3, r * 0.6 + dy, 1.6, 3.2, 0, 0, RS.TAU); ctx.fill();
      ctx.globalAlpha = opts.ghost ? 0.55 : 1;
    }

    if (h.chalked > 0.02) {
      ctx.globalAlpha = 0.42 * h.chalked;
      ctx.fillStyle = '#f6f3ec';
      ctx.beginPath(); ctx.arc(0, 0, r * 1.10, 0, RS.TAU); ctx.fill();
      ctx.globalAlpha = opts.ghost ? 0.55 : 1;
      /* dusty fringe */
      ctx.strokeStyle = RS.rgba('#ffffff', 0.30 * h.chalked);
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.2, 0, RS.TAU); ctx.stroke();
    }

    if (h.wear > 0 && h.breakAfter) {
      var frac = clamp(h.wear / h.breakAfter, 0, 1);
      ctx.strokeStyle = RS.rgba('#ff4b3a', 0.35 + frac * 0.5);
      ctx.lineWidth = 1.1;
      for (var cr = 0; cr < 3; cr++) {
        var ca = cr * 2.1 + h.seed;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ca) * r * frac, Math.sin(ca) * r * frac);
        ctx.stroke();
      }
    }

    if (h.magnet) {
      ctx.strokeStyle = RS.rgba('#ff8fa0', 0.22 + 0.16 * Math.sin(t * 3));
      ctx.lineWidth = 1;
      for (var mr = 1; mr <= 2; mr++) {
        ctx.beginPath(); ctx.arc(0, 0, r + mr * 13 + Math.sin(t * 2 + mr) * 2, 0, RS.TAU); ctx.stroke();
      }
    }

    if (h.bonus) {
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 4);
      ctx.strokeStyle = '#ffe680';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, RS.TAU); ctx.stroke();
      ctx.globalAlpha = opts.ghost ? 0.55 : 1;
      /* sparkles */
      for (var sp = 0; sp < 5; sp++) {
        var spa = t * 1.5 + sp * 1.25;
        var spr = r * 1.8 + Math.sin(t * 3 + sp) * 4;
        ctx.fillStyle = RS.rgba('#fff6c0', 0.8);
        ctx.beginPath();
        ctx.arc(Math.cos(spa) * spr, Math.sin(spa) * spr, 1.6, 0, RS.TAU);
        ctx.fill();
      }
    }

    if (h.rest) {
      ctx.fillStyle = RS.rgba('#8ff0a8', 0.55);
      ctx.font = '700 9px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('REST', 0, -r - 5);
    }

    /* freshly placed this round */
    if (opts.fresh) {
      ctx.strokeStyle = RS.rgba('#7fd4ff', 0.45 + 0.3 * Math.sin(t * 5));
      ctx.lineWidth = 1.6;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, RS.TAU); ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  };

  RS.drawHolds = function (ctx, world, t, freshRound) {
    for (var i = 0; i < world.holds.length; i++) {
      var h = world.holds[i];
      RS.drawHold(ctx, h, t, { fresh: freshRound !== undefined && h.round === freshRound });
    }
  };

  /* ------------------------------------------------------------------ zones */

  RS.drawZonesBack = function (ctx, world, t) {
    for (var i = 0; i < world.zones.length; i++) {
      var z = world.zones[i];
      if (z.dead || z.visual === 'fog') continue;
      drawZone(ctx, z, t);
    }
  };

  /* Fog draws above the climber so it actually hides things. */
  RS.drawZonesFront = function (ctx, world, t) {
    for (var i = 0; i < world.zones.length; i++) {
      var z = world.zones[i];
      if (z.dead || z.visual !== 'fog') continue;
      drawZone(ctx, z, t);
    }
  };

  function zoneClip(ctx, z) {
    ctx.beginPath();
    if (z.shape === 'circle') ctx.arc(z.x, z.y, z.r, 0, RS.TAU);
    else {
      ctx.save();
      ctx.translate(z.x, z.y); ctx.rotate(z.angle || 0);
      ctx.rect(-z.w / 2, -z.h / 2, z.w, z.h);
      ctx.restore();
    }
  }

  function drawZone(ctx, z, t) {
    ctx.save();
    switch (z.visual) {

      case 'wind': {
        var g = RS.zoneGust(z, t) / (z.gustAmp || 1);
        zoneClip(ctx, z); ctx.clip();
        var dir = z.dir || 0;
        ctx.strokeStyle = RS.rgba('#cfe6f5', 0.10 + g * 0.30);
        ctx.lineWidth = 1.4;
        for (var i = 0; i < 26; i++) {
          var seed = i * 37.7;
          var py = z.y - z.h / 2 + ((i * 71) % z.h);
          var travel = ((t * (140 + (i % 5) * 60) + seed * 9) % (z.w + 140)) - 70;
          var sx = z.x - z.w / 2 + travel;
          var lenL = 22 + (i % 4) * 12 + g * 26;
          ctx.beginPath();
          ctx.moveTo(sx, py);
          ctx.lineTo(sx + Math.cos(dir) * lenL, py + Math.sin(dir) * lenL);
          ctx.stroke();
        }
        /* boundary */
        ctx.restore(); ctx.save();
        zoneClip(ctx, z);
        ctx.strokeStyle = RS.rgba('#9fd2ee', 0.20 + g * 0.25);
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.setLineDash([]);
        /* direction badge */
        ctx.fillStyle = RS.rgba('#cfe6f5', 0.5);
        ctx.save();
        ctx.translate(z.x, z.y - z.h / 2 + 12);
        ctx.rotate(dir);
        ctx.beginPath(); ctx.moveTo(-9, -4); ctx.lineTo(9, 0); ctx.lineTo(-9, 4); ctx.closePath(); ctx.fill();
        ctx.restore();
        break;
      }

      case 'updraft': {
        zoneClip(ctx, z); ctx.clip();
        var ug = ctx.createLinearGradient(0, z.y + z.h / 2, 0, z.y - z.h / 2);
        ug.addColorStop(0, 'rgba(160,230,255,0.20)');
        ug.addColorStop(1, 'rgba(160,230,255,0.02)');
        ctx.fillStyle = ug;
        ctx.fillRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h);
        ctx.strokeStyle = 'rgba(200,245,255,0.4)';
        ctx.lineWidth = 1.3;
        for (var u = 0; u < 22; u++) {
          var ux = z.x - z.w / 2 + ((u * 53) % z.w);
          var uy = z.y + z.h / 2 - ((t * (260 + (u % 4) * 90) + u * 61) % z.h);
          ctx.beginPath();
          ctx.moveTo(ux, uy);
          ctx.lineTo(ux + Math.sin(uy * 0.06 + u) * 4, uy - 20);
          ctx.stroke();
        }
        break;
      }

      case 'water': {
        zoneClip(ctx, z); ctx.clip();
        ctx.fillStyle = 'rgba(150,205,235,0.24)';
        ctx.fillRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h);
        ctx.strokeStyle = 'rgba(225,245,255,0.55)';
        ctx.lineWidth = 1.5;
        for (var w = 0; w < 30; w++) {
          var wx = z.x - z.w / 2 + ((w * 41) % z.w);
          var wy = z.y - z.h / 2 + ((t * 900 + w * 133) % z.h);
          ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx, wy + 26); ctx.stroke();
        }
        /* splash at the base */
        ctx.fillStyle = 'rgba(230,248,255,0.5)';
        for (var sp = 0; sp < 12; sp++) {
          var t2 = ((t * 2.2 + sp * 0.31) % 1);
          var sx2 = z.x + (sp - 6) * 8 * (0.4 + t2);
          var sy2 = z.y + z.h / 2 - 6 - Math.sin(t2 * Math.PI) * 18;
          ctx.beginPath(); ctx.arc(sx2, sy2, 1.8, 0, RS.TAU); ctx.fill();
        }
        break;
      }

      case 'ice': {
        zoneClip(ctx, z); ctx.clip();
        var ig = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
        ig.addColorStop(0, 'rgba(215,242,255,0.42)');
        ig.addColorStop(0.75, 'rgba(160,215,240,0.26)');
        ig.addColorStop(1, 'rgba(160,215,240,0)');
        ctx.fillStyle = ig;
        ctx.fillRect(z.x - z.r, z.y - z.r, z.r * 2, z.r * 2);
        ctx.strokeStyle = 'rgba(240,252,255,0.5)';
        ctx.lineWidth = 1;
        for (var c2 = 0; c2 < 16; c2++) {
          var ca = RS.noise1(c2 * 5.1) * RS.TAU;
          var cr = Math.abs(RS.noise1(c2 * 2.7)) * z.r * 0.9;
          var cx = z.x + Math.cos(ca) * cr, cy = z.y + Math.sin(ca) * cr;
          for (var arm = 0; arm < 3; arm++) {
            var aa = arm / 3 * Math.PI + c2;
            ctx.beginPath();
            ctx.moveTo(cx - Math.cos(aa) * 5, cy - Math.sin(aa) * 5);
            ctx.lineTo(cx + Math.cos(aa) * 5, cy + Math.sin(aa) * 5);
            ctx.stroke();
          }
        }
        break;
      }

      case 'tar': {
        zoneClip(ctx, z); ctx.clip();
        var tg = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
        tg.addColorStop(0, 'rgba(18,14,12,0.78)');
        tg.addColorStop(0.8, 'rgba(28,22,18,0.55)');
        tg.addColorStop(1, 'rgba(28,22,18,0)');
        ctx.fillStyle = tg;
        ctx.fillRect(z.x - z.r, z.y - z.r, z.r * 2, z.r * 2);
        ctx.fillStyle = 'rgba(80,66,52,0.5)';
        for (var bl = 0; bl < 9; bl++) {
          var ba = bl * 0.7 + t * 0.3;
          var br = z.r * (0.25 + 0.5 * Math.abs(RS.noise1(bl * 3.3)));
          ctx.beginPath();
          ctx.arc(z.x + Math.cos(ba) * br, z.y + Math.sin(ba) * br,
            4 + 3 * Math.sin(t * 2 + bl), 0, RS.TAU);
          ctx.fill();
        }
        break;
      }

      case 'lowgrav': {
        zoneClip(ctx, z); ctx.clip();
        var lg2 = ctx.createRadialGradient(z.x, z.y, z.r * 0.1, z.x, z.y, z.r);
        lg2.addColorStop(0, 'rgba(180,140,255,0.10)');
        lg2.addColorStop(0.8, 'rgba(150,110,240,0.22)');
        lg2.addColorStop(1, 'rgba(150,110,240,0)');
        ctx.fillStyle = lg2;
        ctx.fillRect(z.x - z.r, z.y - z.r, z.r * 2, z.r * 2);
        for (var mo = 0; mo < 18; mo++) {
          var ma = mo * 1.1;
          var mr = (mo % 6) / 6 * z.r;
          var my = z.y + Math.sin(ma) * mr - ((t * 22 + mo * 13) % (z.r * 2)) + z.r;
          ctx.fillStyle = RS.rgba('#d9c4ff', 0.6);
          ctx.beginPath(); ctx.arc(z.x + Math.cos(ma) * mr, my, 1.6, 0, RS.TAU); ctx.fill();
        }
        ctx.restore(); ctx.save();
        zoneClip(ctx, z);
        ctx.strokeStyle = 'rgba(200,170,255,0.35)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        break;
      }

      case 'heavygrav': {
        zoneClip(ctx, z); ctx.clip();
        var hg = ctx.createRadialGradient(z.x, z.y, z.r * 0.1, z.x, z.y, z.r);
        hg.addColorStop(0, 'rgba(120,20,20,0.06)');
        hg.addColorStop(0.75, 'rgba(90,10,10,0.30)');
        hg.addColorStop(1, 'rgba(90,10,10,0)');
        ctx.fillStyle = hg;
        ctx.fillRect(z.x - z.r, z.y - z.r, z.r * 2, z.r * 2);
        ctx.strokeStyle = 'rgba(255,120,110,0.25)';
        ctx.lineWidth = 1.2;
        for (var hv = 0; hv < 14; hv++) {
          var hx = z.x - z.r + ((hv * 47) % (z.r * 2));
          var hy2 = z.y - z.r + ((t * 320 + hv * 97) % (z.r * 2));
          ctx.beginPath(); ctx.moveTo(hx, hy2); ctx.lineTo(hx, hy2 + 16); ctx.stroke();
        }
        break;
      }

      case 'jet': {
        var jg = RS.zoneGust(z, t) / (z.gustAmp || 1);
        if (jg > 0.02) {
          zoneClip(ctx, z); ctx.clip();
          ctx.save();
          ctx.translate(z.x, z.y); ctx.rotate(z.angle || 0);
          var grad = ctx.createLinearGradient(-z.w / 2, 0, z.w / 2, 0);
          grad.addColorStop(0, RS.rgba('#ffffff', 0.55 * jg));
          grad.addColorStop(1, RS.rgba('#bfe4ff', 0));
          ctx.fillStyle = grad;
          ctx.fillRect(-z.w / 2, -z.h / 2, z.w, z.h);
          ctx.restore();
        }
        ctx.restore(); ctx.save();
        zoneClip(ctx, z);
        ctx.strokeStyle = RS.rgba('#9fd2ee', 0.14 + jg * 0.4);
        ctx.setLineDash([5, 7]);
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.setLineDash([]);
        break;
      }

      case 'fog': {
        zoneClip(ctx, z); ctx.clip();
        for (var f = 0; f < 9; f++) {
          var fa = f * 0.85 + (z.phase || 0);
          var fr = z.r * (0.28 + (f % 4) * 0.16);
          var fx = z.x + Math.cos(fa + t * 0.16) * z.r * 0.42;
          var fy = z.y + Math.sin(fa * 1.3 + t * 0.12) * z.r * 0.34;
          var fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
          fg.addColorStop(0, 'rgba(226,235,244,0.62)');
          fg.addColorStop(1, 'rgba(226,235,244,0)');
          ctx.fillStyle = fg;
          ctx.beginPath(); ctx.arc(fx, fy, fr, 0, RS.TAU); ctx.fill();
        }
        break;
      }
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------------ props */

  RS.drawProps = function (ctx, world, t) {
    for (var i = 0; i < world.props.length; i++) {
      var p = world.props[i];
      if (p.dead) continue;
      switch (p.kind) {

        case 'rope': {
          var pts = p.rope.pts;
          var isVine = p.style === 'vine';
          /* anchor plate */
          ctx.fillStyle = '#4a525c';
          ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, RS.TAU); ctx.fill();
          ctx.fillStyle = '#c9d1da';
          ctx.beginPath(); ctx.arc(p.x, p.y, 2.4, 0, RS.TAU); ctx.fill();

          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          /* shadow pass */
          ctx.strokeStyle = 'rgba(0,0,0,0.28)';
          ctx.lineWidth = isVine ? 6 : 5;
          ctx.beginPath();
          for (var k = 0; k < pts.length; k++) {
            if (k === 0) ctx.moveTo(pts[k].x + 3, pts[k].y + 4); else ctx.lineTo(pts[k].x + 3, pts[k].y + 4);
          }
          ctx.stroke();
          /* body */
          ctx.strokeStyle = isVine ? '#4c6b31' : '#b8763c';
          ctx.lineWidth = isVine ? 5 : 4;
          ctx.beginPath();
          for (k = 0; k < pts.length; k++) {
            if (k === 0) ctx.moveTo(pts[k].x, pts[k].y); else ctx.lineTo(pts[k].x, pts[k].y);
          }
          ctx.stroke();
          /* highlight strand */
          ctx.strokeStyle = isVine ? 'rgba(160,205,110,0.55)' : 'rgba(255,215,160,0.5)';
          ctx.lineWidth = 1.3;
          ctx.stroke();
          /* vine leaves */
          if (isVine) {
            for (k = 2; k < pts.length; k += 3) {
              ctx.fillStyle = '#6f9440';
              ctx.save();
              ctx.translate(pts[k].x, pts[k].y);
              ctx.rotate(Math.sin(k + t) * 0.5 + (k % 2 ? 0.8 : -0.8));
              ctx.beginPath(); ctx.ellipse(6, 0, 7, 3, 0, 0, RS.TAU); ctx.fill();
              ctx.restore();
            }
          }
          break;
        }

        case 'zipline': {
          /* cable with a little sag */
          ctx.strokeStyle = 'rgba(0,0,0,0.3)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(p.x1 + 2, p.y1 + 3);
          ctx.quadraticCurveTo((p.x1 + p.x2) / 2 + 2, (p.y1 + p.y2) / 2 + 15, p.x2 + 2, p.y2 + 3);
          ctx.stroke();
          ctx.strokeStyle = '#aeb6c0';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x1, p.y1);
          ctx.quadraticCurveTo((p.x1 + p.x2) / 2, (p.y1 + p.y2) / 2 + 12, p.x2, p.y2);
          ctx.stroke();
          /* end anchors */
          [[p.x1, p.y1], [p.x2, p.y2]].forEach(function (a) {
            ctx.fillStyle = '#3f4650';
            ctx.beginPath(); ctx.arc(a[0], a[1], 6, 0, RS.TAU); ctx.fill();
            ctx.fillStyle = '#d3dae2';
            ctx.beginPath(); ctx.arc(a[0], a[1], 2.2, 0, RS.TAU); ctx.fill();
          });
          break;
        }

        case 'track': {
          ctx.strokeStyle = 'rgba(180,190,200,0.5)';
          ctx.lineWidth = 3;
          ctx.setLineDash([8, 6]);
          ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
          ctx.setLineDash([]);
          break;
        }

        case 'rockfall': {
          var shake = (p.shake || 0) * Math.sin(t * 60) * 2;
          /* the loose block above */
          ctx.save();
          ctx.translate(p.x + shake, p.y);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath(); ctx.moveTo(-24, 2); ctx.lineTo(24, 2); ctx.lineTo(16, 18); ctx.lineTo(-16, 18); ctx.closePath(); ctx.fill();
          var rg = ctx.createLinearGradient(0, -14, 0, 16);
          rg.addColorStop(0, '#7a8290'); rg.addColorStop(1, '#3c434c');
          ctx.fillStyle = rg;
          ctx.beginPath(); ctx.moveTo(-26, -14); ctx.lineTo(26, -14); ctx.lineTo(18, 14); ctx.lineTo(-18, 14); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#22272d'; ctx.lineWidth = 1.2; ctx.stroke();
          /* countdown pips */
          var frac = clamp(p.t / p.interval, 0, 1);
          ctx.fillStyle = RS.rgba('#ff6b52', 0.5 + frac * 0.5);
          ctx.fillRect(-20, -20, 40 * frac, 3);
          ctx.restore();
          /* boulders */
          for (var b = 0; b < p.boulders.length; b++) {
            var bo = p.boulders[b];
            drawBoulder(ctx, bo.pt.x, bo.pt.y, bo.pt.r, bo.spin);
          }
          break;
        }

        case 'saw': {
          ctx.strokeStyle = 'rgba(140,150,162,0.45)';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 5]);
          ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
          ctx.setLineDash([]);
          ctx.save();
          ctx.translate(p.cx || p.x1, p.cy || p.y1);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath(); ctx.arc(3, 4, p.r, 0, RS.TAU); ctx.fill();
          ctx.rotate(p.spin || 0);
          ctx.fillStyle = '#c6ccd4';
          ctx.beginPath();
          for (var tooth = 0; tooth < 14; tooth++) {
            var ta = tooth / 14 * RS.TAU;
            var tr = tooth % 2 ? p.r * 0.74 : p.r;
            if (tooth === 0) ctx.moveTo(Math.cos(ta) * tr, Math.sin(ta) * tr);
            else ctx.lineTo(Math.cos(ta) * tr, Math.sin(ta) * tr);
          }
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#71797f'; ctx.lineWidth = 1; ctx.stroke();
          ctx.fillStyle = '#41474e';
          ctx.beginPath(); ctx.arc(0, 0, p.r * 0.32, 0, RS.TAU); ctx.fill();
          ctx.restore();
          break;
        }

        case 'beam': {
          var s = p.shape;
          ctx.save();
          /* hub */
          ctx.fillStyle = '#2f353c';
          ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, RS.TAU); ctx.fill();
          var bg2 = ctx.createLinearGradient(s.x1, s.y1 - 8, s.x2, s.y2 + 8);
          bg2.addColorStop(0, '#9aa3ad'); bg2.addColorStop(1, '#4d545c');
          ctx.strokeStyle = 'rgba(0,0,0,0.3)';
          ctx.lineWidth = s.r * 2 + 2;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(s.x1 + 3, s.y1 + 4); ctx.lineTo(s.x2 + 3, s.y2 + 4); ctx.stroke();
          ctx.strokeStyle = bg2;
          ctx.lineWidth = s.r * 2;
          ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
          /* hazard chevrons */
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.angle || 0);
          ctx.fillStyle = 'rgba(240,200,50,0.85)';
          for (var ch = 1; ch < 6; ch++) ctx.fillRect(ch * 18, -s.r + 2, 7, s.r * 2 - 4);
          ctx.restore();
          ctx.fillStyle = '#c9d1da';
          ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, RS.TAU); ctx.fill();
          ctx.restore();
          break;
        }

        case 'beartrap': {
          var open = 1 - clamp(p.snap, 0, 1);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.fillStyle = 'rgba(0,0,0,0.32)';
          ctx.beginPath(); ctx.ellipse(2, 5, p.r, p.r * 0.4, 0, 0, RS.TAU); ctx.fill();
          /* base plate */
          ctx.fillStyle = '#4a4f56';
          RS.roundRect(ctx, -p.r * 0.7, -2, p.r * 1.4, 7, 2); ctx.fill();
          /* jaws */
          ctx.strokeStyle = '#b6bcc4';
          ctx.lineWidth = 2.4;
          for (var side = -1; side <= 1; side += 2) {
            ctx.save();
            ctx.scale(side, 1);
            ctx.rotate(-open * 1.05);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            for (var tth = 0; tth <= 5; tth++) {
              var tx2 = tth / 5 * p.r;
              ctx.lineTo(tx2, -6 - (tth % 2 ? 5 : 0));
              ctx.lineTo(tx2 + p.r / 10, -6);
            }
            ctx.stroke();
            ctx.restore();
          }
          ctx.restore();
          break;
        }

        case 'checkpoint': {
          ctx.save();
          ctx.translate(p.x, p.y);
          /* bolt hanger */
          ctx.fillStyle = '#8f979f';
          ctx.beginPath(); ctx.arc(0, -14, 5, 0, RS.TAU); ctx.fill();
          ctx.fillStyle = '#2d3238';
          ctx.beginPath(); ctx.arc(0, -14, 2, 0, RS.TAU); ctx.fill();
          /* quickdraw: two carabiners on a sling */
          ctx.strokeStyle = p.lit ? '#63c26a' : '#c9a227';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(Math.sin(t * 1.2) * 3, 12); ctx.stroke();
          ctx.strokeStyle = '#dfe4ea';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, -8, 4, 0.4, Math.PI * 1.8); ctx.stroke();
          ctx.beginPath(); ctx.arc(Math.sin(t * 1.2) * 3, 14, 4.5, -0.6, Math.PI * 1.4); ctx.stroke();
          if (p.glow) {
            ctx.strokeStyle = RS.rgba('#63c26a', p.glow * 0.5);
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, p.r * (1.1 - p.glow * 0.3), 0, RS.TAU); ctx.stroke();
          }
          if (p.lit) {
            ctx.fillStyle = 'rgba(99,194,106,0.85)';
            ctx.font = '700 9px ui-sans-serif, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('CLIPPED', 0, -22);
          }
          ctx.restore();
          break;
        }

        case 'chalkstash': {
          ctx.save();
          ctx.translate(p.x, p.y);
          var ready = p.cd <= 0;
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath(); ctx.ellipse(2, 12, 15, 4, 0, 0, RS.TAU); ctx.fill();
          ctx.fillStyle = ready ? '#8a7358' : '#5d5245';
          RS.roundRect(ctx, -12, -4, 24, 15, 3); ctx.fill();
          ctx.fillStyle = ready ? '#f4f1ea' : '#9a968d';
          ctx.beginPath(); ctx.ellipse(0, -4, 11, 4, 0, 0, RS.TAU); ctx.fill();
          if (ready) {
            ctx.fillStyle = 'rgba(246,243,236,' + (0.25 + 0.2 * Math.sin(t * 3)) + ')';
            ctx.beginPath(); ctx.arc(0, -10, 9 + Math.sin(t * 3) * 2, 0, RS.TAU); ctx.fill();
          } else {
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '700 9px ui-monospace, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(Math.ceil(p.cd) + 's', 0, -10);
          }
          ctx.restore();
          break;
        }

        case 'fan': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.fillStyle = '#3b424b';
          ctx.beginPath(); ctx.arc(0, 0, 26, 0, RS.TAU); ctx.fill();
          ctx.fillStyle = '#22272d';
          ctx.beginPath(); ctx.arc(0, 0, 22, 0, RS.TAU); ctx.fill();
          ctx.rotate(p.spin || 0);
          ctx.fillStyle = '#8e97a2';
          for (var bl2 = 0; bl2 < 4; bl2++) {
            ctx.rotate(RS.TAU / 4);
            ctx.beginPath();
            ctx.ellipse(11, 0, 10, 4.5, 0.5, 0, RS.TAU);
            ctx.fill();
          }
          ctx.fillStyle = '#c9d1da';
          ctx.beginPath(); ctx.arc(0, 0, 4, 0, RS.TAU); ctx.fill();
          ctx.restore();
          break;
        }

        case 'spout': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.fillStyle = '#48505a';
          RS.roundRect(ctx, -26, -10, 52, 20, 5); ctx.fill();
          ctx.fillStyle = '#2b3138';
          RS.roundRect(ctx, -18, 6, 36, 8, 3); ctx.fill();
          ctx.restore();
          break;
        }

        case 'nozzle': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          ctx.fillStyle = '#3d444c';
          RS.roundRect(ctx, -16, -9, 26, 18, 4); ctx.fill();
          ctx.fillStyle = '#6d7681';
          ctx.beginPath();
          ctx.moveTo(8, -7); ctx.lineTo(20, -4); ctx.lineTo(20, 4); ctx.lineTo(8, 7);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#c9a227';
          ctx.fillRect(-13, -6, 4, 12);
          ctx.restore();
          break;
        }

        case 'pad':
          /* terrain draws the pad itself */
          break;
      }
    }
  };

  function drawBoulder(ctx, x, y, r, spin) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.arc(3, 4, r, 0, RS.TAU); ctx.fill();
    ctx.rotate(spin || 0);
    var g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.15, 0, 0, r * 1.2);
    g.addColorStop(0, '#8d95a1');
    g.addColorStop(1, '#3a4149');
    ctx.fillStyle = g;
    ctx.beginPath();
    for (var i = 0; i < 8; i++) {
      var a = i / 8 * RS.TAU;
      var rr = r * (0.82 + 0.24 * RS.noise1(i * 4.3 + r));
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#232830'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }

  /* ------------------------------------------------------------ start/finish */

  RS.drawStartFinish = function (ctx, world, t) {
    /* start pad */
    var s = world.start;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    RS.roundRect(ctx, s.x - 44, s.y + 44, 88, 6, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(s.x - 46, s.y + 44); ctx.lineTo(s.x + 46, s.y + 44); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '700 10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('START', s.x, s.y + 62);
    ctx.restore();

    /* finish: an anchor with a bell */
    var f = world.finish;
    if (!f) return;
    ctx.save();
    ctx.translate(f.x, f.y);

    /* glow */
    var gg = ctx.createRadialGradient(0, 0, 0, 0, 0, f.r * 1.6);
    gg.addColorStop(0, 'rgba(255,225,130,0.22)');
    gg.addColorStop(1, 'rgba(255,225,130,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(0, 0, f.r * 1.6, 0, RS.TAU); ctx.fill();

    /* two bolts and chain */
    ctx.strokeStyle = '#9aa2ac';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-18, -14); ctx.quadraticCurveTo(0, 2, 18, -14);
    ctx.stroke();
    for (var b = -1; b <= 1; b += 2) {
      ctx.fillStyle = '#616974';
      ctx.beginPath(); ctx.arc(b * 18, -14, 6, 0, RS.TAU); ctx.fill();
      ctx.fillStyle = '#cdd4dc';
      ctx.beginPath(); ctx.arc(b * 18, -14, 2.4, 0, RS.TAU); ctx.fill();
    }

    /* bell, swinging gently */
    var sw = Math.sin(t * 1.4) * 0.09;
    ctx.save();
    ctx.translate(0, -2);
    ctx.rotate(sw);
    var bg = ctx.createLinearGradient(-12, 0, 12, 0);
    bg.addColorStop(0, '#f6d78a');
    bg.addColorStop(0.45, '#d9a83c');
    bg.addColorStop(1, '#9c7420');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(-13, 16);
    ctx.quadraticCurveTo(-13, -8, 0, -12);
    ctx.quadraticCurveTo(13, -8, 13, 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#b8891f';
    RS.roundRect(ctx, -15, 15, 30, 5, 2); ctx.fill();
    ctx.fillStyle = '#7d5c14';
    ctx.beginPath(); ctx.arc(0, 22, 3.4, 0, RS.TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.ellipse(-6, 0, 2.5, 8, 0.2, 0, RS.TAU); ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(255,236,170,0.9)';
    ctx.font = '700 11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TOP OUT', 0, -30);
    ctx.restore();
  };

})(window.RS);

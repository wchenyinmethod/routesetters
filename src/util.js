/* ROUTESETTERS - util.js
 * Math, RNG, geometry and misc helpers. Everything hangs off the global RS namespace
 * so the game runs from file:// with no build step and no module loader.
 */
(function (root) {
  'use strict';

  var RS = root.RS = root.RS || {};

  /* ---------------------------------------------------------------- scalars */

  RS.TAU = Math.PI * 2;

  RS.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  RS.lerp = function (a, b, t) { return a + (b - a) * t; };
  RS.inverseLerp = function (a, b, v) { return b === a ? 0 : (v - a) / (b - a); };
  RS.remap = function (v, a, b, c, d) { return RS.lerp(c, d, RS.clamp(RS.inverseLerp(a, b, v), 0, 1)); };
  RS.sign = function (v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); };

  RS.smoothstep = function (t) { t = RS.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  RS.easeOutCubic = function (t) { t = RS.clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); };
  RS.easeInCubic = function (t) { t = RS.clamp(t, 0, 1); return t * t * t; };
  RS.easeOutElastic = function (t) {
    if (t <= 0) return 0; if (t >= 1) return 1;
    var c = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c) + 1;
  };

  /* Frame-rate independent exponential approach. */
  RS.approach = function (cur, target, rate, dt) {
    return target + (cur - target) * Math.exp(-rate * dt);
  };

  RS.angleLerp = function (a, b, t) {
    var d = ((b - a + Math.PI) % RS.TAU + RS.TAU) % RS.TAU - Math.PI;
    return a + d * t;
  };

  RS.normAngle = function (a) {
    return ((a + Math.PI) % RS.TAU + RS.TAU) % RS.TAU - Math.PI;
  };

  /* ---------------------------------------------------------------- vectors */

  RS.dist = function (ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); };
  RS.dist2 = function (ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
  RS.len = function (x, y) { return Math.sqrt(x * x + y * y); };

  /* Closest point on segment ab to p. Returns {x,y,t}. */
  RS.closestOnSegment = function (px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var l2 = dx * dx + dy * dy;
    if (l2 < 1e-9) return { x: ax, y: ay, t: 0 };
    var t = RS.clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
    return { x: ax + dx * t, y: ay + dy * t, t: t };
  };

  RS.pointInRect = function (px, py, x, y, w, h) {
    return px >= x && px <= x + w && py >= y && py <= y + h;
  };

  /* Point inside a rectangle rotated about its centre. */
  RS.pointInRotRect = function (px, py, cx, cy, w, h, angle) {
    var c = Math.cos(-angle), s = Math.sin(-angle);
    var dx = px - cx, dy = py - cy;
    var lx = dx * c - dy * s, ly = dx * s + dy * c;
    return Math.abs(lx) <= w * 0.5 && Math.abs(ly) <= h * 0.5;
  };

  RS.pointInCircle = function (px, py, cx, cy, r) {
    return RS.dist2(px, py, cx, cy) <= r * r;
  };

  /* Convex polygon containment, pts = [{x,y}, ...] wound either way. */
  RS.pointInConvex = function (px, py, pts) {
    var sign = 0;
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      var cross = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
      if (Math.abs(cross) < 1e-9) continue;
      var s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
    return true;
  };

  RS.rectsOverlap = function (a, b) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
  };

  /* ------------------------------------------------------------------- rng */

  /* Deterministic PRNG so a match seed reproduces the same card draws. */
  RS.Rng = function (seed) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  };
  RS.Rng.prototype.next = function () {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    var t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  RS.Rng.prototype.range = function (a, b) { return a + this.next() * (b - a); };
  RS.Rng.prototype.int = function (a, b) { return Math.floor(this.range(a, b + 1 - 1e-9)); };
  RS.Rng.prototype.pick = function (arr) { return arr[this.int(0, arr.length - 1)]; };
  RS.Rng.prototype.chance = function (p) { return this.next() < p; };
  RS.Rng.prototype.shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = this.int(0, i);
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  /* Weighted pick. items: [{weight:n, ...}] */
  RS.Rng.prototype.weighted = function (items, weightKey) {
    weightKey = weightKey || 'weight';
    var total = 0, i;
    for (i = 0; i < items.length; i++) total += (items[i][weightKey] || 1);
    var r = this.next() * total;
    for (i = 0; i < items.length; i++) {
      r -= (items[i][weightKey] || 1);
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  };

  /* A global convenience rng for cosmetic randomness (particles etc). */
  RS.rng = new RS.Rng(1337);
  RS.rand = function (a, b) { if (a === undefined) return RS.rng.next(); if (b === undefined) { b = a; a = 0; } return RS.rng.range(a, b); };
  RS.randInt = function (a, b) { return RS.rng.int(a, b); };
  RS.pick = function (a) { return RS.rng.pick(a); };

  /* --------------------------------------------------------------- 1d noise */

  /* Cheap value noise, used for rock texture and wind gusts. */
  var NOISE = (function () {
    var n = 1024, t = new Float32Array(n), r = new RS.Rng(0xBADC0DE);
    for (var i = 0; i < n; i++) t[i] = r.next() * 2 - 1;
    return { n: n, t: t };
  })();

  RS.noise1 = function (x) {
    var i = Math.floor(x), f = x - i;
    var a = NOISE.t[((i % NOISE.n) + NOISE.n) % NOISE.n];
    var b = NOISE.t[(((i + 1) % NOISE.n) + NOISE.n) % NOISE.n];
    var u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  };

  RS.fbm1 = function (x, oct) {
    oct = oct || 3;
    var sum = 0, amp = 0.5, freq = 1;
    for (var i = 0; i < oct; i++) { sum += RS.noise1(x * freq) * amp; freq *= 2.03; amp *= 0.5; }
    return sum;
  };

  RS.noise2 = function (x, y) {
    return RS.noise1(x * 1.0 + y * 57.3) * 0.5 + RS.noise1(y * 1.13 - x * 31.7) * 0.5;
  };

  /* ---------------------------------------------------------------- colours */

  /* Parse '#rrggbb' -> [r,g,b] */
  RS.hexRgb = function (hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  RS.rgbHex = function (r, g, b) {
    var f = function (v) { var s = RS.clamp(Math.round(v), 0, 255).toString(16); return s.length < 2 ? '0' + s : s; };
    return '#' + f(r) + f(g) + f(b);
  };

  /* Multiply lightness. amt > 1 lightens, < 1 darkens. */
  RS.shade = function (hex, amt) {
    var c = RS.hexRgb(hex);
    if (amt >= 1) {
      var t = amt - 1;
      return RS.rgbHex(c[0] + (255 - c[0]) * t, c[1] + (255 - c[1]) * t, c[2] + (255 - c[2]) * t);
    }
    return RS.rgbHex(c[0] * amt, c[1] * amt, c[2] * amt);
  };

  RS.mixHex = function (a, b, t) {
    var x = RS.hexRgb(a), y = RS.hexRgb(b);
    return RS.rgbHex(RS.lerp(x[0], y[0], t), RS.lerp(x[1], y[1], t), RS.lerp(x[2], y[2], t));
  };

  RS.rgba = function (hex, a) {
    var c = RS.hexRgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  };

  /* ------------------------------------------------------------------ misc */

  var _id = 0;
  RS.uid = function (prefix) { _id++; return (prefix || 'e') + _id; };

  RS.formatTime = function (sec) {
    if (sec === null || sec === undefined || !isFinite(sec)) return '--:--';
    sec = Math.max(0, sec);
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60), cs = Math.floor((sec * 100) % 100);
    var p = function (v, n) { var t = '' + v; while (t.length < n) t = '0' + t; return t; };
    return p(m, 2) + ':' + p(s, 2) + '.' + p(cs, 2);
  };

  RS.metres = function (px) { return (px / 42).toFixed(1); };

  /* Shallow-ish clone good enough for level/hold data. */
  RS.deepCopy = function (o) {
    if (o === null || typeof o !== 'object') return o;
    if (Array.isArray(o)) { var a = new Array(o.length); for (var i = 0; i < o.length; i++) a[i] = RS.deepCopy(o[i]); return a; }
    var r = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = RS.deepCopy(o[k]);
    return r;
  };

  RS.storage = {
    get: function (key, fallback) {
      try {
        var v = root.localStorage.getItem('routesetters.' + key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set: function (key, val) {
      try { root.localStorage.setItem('routesetters.' + key, JSON.stringify(val)); } catch (e) { /* private mode */ }
    }
  };

  /* Rounded rect path helper (older browsers lack ctx.roundRect). */
  RS.roundRect = function (ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) * 0.5, Math.abs(h) * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  /* ------------------------------------------------------------------- ik */

  /* Analytic two-bone IK in 2D, law of cosines. Given a root (shoulder/hip)
   * reaching toward a target, returns where the mid joint (elbow/knee) and the
   * end effector belong.
   *
   * `pole` is what makes it look human. Both bend directions are mathematically
   * valid, and a solver without a pole hint will cheerfully pick the one no
   * person would ever use - elbows inverted, knees bending backwards. We solve
   * both and keep whichever puts the mid joint nearer the pole point.
   *
   * Targets beyond reach are clamped to the reachable annulus rather than
   * failing, so the limb simply extends toward them.
   */
  RS.solveTwoBone = function (ax, ay, tx, ty, d1, d2, poleX, poleY, out) {
    out = out || {};
    var rawX = tx - ax, rawY = ty - ay;
    var raw = Math.sqrt(rawX * rawX + rawY * rawY);

    var dx = rawX, dy = rawY, h = raw;
    var minR = Math.abs(d1 - d2) + 0.01;
    var maxR = d1 + d2 - 0.01;
    if (h < 1e-6) { dx = 0; dy = minR; h = minR; }
    else {
      var want = RS.clamp(h, minR, maxR);
      if (want !== h) { dx = dx / h * want; dy = dy / h * want; h = want; }
    }

    var base = Math.atan2(dy, dx);
    /* angle at the root between the line to the target and the first bone */
    var A = Math.acos(RS.clamp((d1 * d1 + h * h - d2 * d2) / (2 * d1 * h), -1, 1));
    /* interior angle at the mid joint */
    var B = Math.acos(RS.clamp((d1 * d1 + d2 * d2 - h * h) / (2 * d1 * d2), -1, 1));

    var bestS = 1, bestMx = 0, bestMy = 0, bestD = Infinity;
    for (var s = -1; s <= 1; s += 2) {
      var a1 = base + A * s;
      var mx = ax + Math.cos(a1) * d1;
      var my = ay + Math.sin(a1) * d1;
      var pd = (mx - poleX) * (mx - poleX) + (my - poleY) * (my - poleY);
      if (pd < bestD) { bestD = pd; bestS = s; bestMx = mx; bestMy = my; }
    }
    /* Bone 2 turns back AGAINST the rotation bone 1 took at the root. Adding
       instead of subtracting keeps the bone lengths right but sends the hand
       nowhere near the target. */
    var a2 = (base + A * bestS) - (Math.PI - B) * bestS;
    out.midX = bestMx;
    out.midY = bestMy;
    out.endX = bestMx + Math.cos(a2) * d2;
    out.endY = bestMy + Math.sin(a2) * d2;
    out.overExtended = raw > maxR;
    return out;
  };

  /* Capsule path from a->b with radius r. */
  RS.capsulePath = function (ctx, ax, ay, bx, by, ra, rb) {
    if (rb === undefined) rb = ra;
    var dx = bx - ax, dy = by - ay, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-6) { ctx.beginPath(); ctx.arc(ax, ay, ra, 0, RS.TAU); return; }
    var nx = -dy / d, ny = dx / d;
    var a = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.arc(ax, ay, ra, a + Math.PI / 2, a - Math.PI / 2);
    ctx.lineTo(bx + nx * -rb, by + ny * -rb);
    ctx.arc(bx, by, rb, a - Math.PI / 2, a + Math.PI / 2);
    ctx.closePath();
  };

})(typeof window !== 'undefined' ? window : this);

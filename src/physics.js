/* ROUTESETTERS - physics.js
 * Verlet particle solver with distance constraints, static terrain collision
 * and data-driven force zones. Everything (climber ragdoll, ropes, boulders)
 * lives in one solver so cross-entity constraints (grabbing a rope) are free.
 */
(function (RS) {
  'use strict';

  var clamp = RS.clamp;

  /* ------------------------------------------------------------------ point */

  function Point(x, y, opts) {
    opts = opts || {};
    this.x = x; this.y = y;
    this.px = x; this.py = y;
    this.fx = 0; this.fy = 0;          // accumulated force for this step
    this.r = opts.r !== undefined ? opts.r : 4;
    this.invMass = opts.invMass !== undefined ? opts.invMass : 1;
    this.damping = opts.damping !== undefined ? opts.damping : 0.994;
    this.friction = opts.friction !== undefined ? opts.friction : 0.55;
    this.gravScale = opts.gravScale !== undefined ? opts.gravScale : 1;
    this.pinned = !!opts.pinned;
    this.collide = opts.collide !== undefined ? opts.collide : true;
    this.tag = opts.tag || '';
    this.owner = opts.owner || null;
    this.grounded = false;             // touched solid this step
    this.groundNx = 0; this.groundNy = 0;
    this.lastMat = null;               // material of last surface touched
    /* per-step zone accumulators, read by gameplay code */
    this.zoneSlick = 1;
    this.zoneWet = 0;
    this.zoneStamina = 1;
    this.zoneFog = 0;
  }

  Point.prototype.vx = function () { return this.x - this.px; };
  Point.prototype.vy = function () { return this.y - this.py; };
  Point.prototype.speed = function () { return RS.len(this.x - this.px, this.y - this.py); };

  Point.prototype.addForce = function (fx, fy) { this.fx += fx; this.fy += fy; };

  /* Apply an instantaneous velocity change (px per step). */
  Point.prototype.addImpulse = function (ix, iy) { this.px -= ix; this.py -= iy; };

  Point.prototype.setPos = function (x, y, keepVel) {
    if (keepVel) { var vx = this.x - this.px, vy = this.y - this.py; this.x = x; this.y = y; this.px = x - vx; this.py = y - vy; }
    else { this.x = this.px = x; this.y = this.py = y; }
  };

  RS.Point = Point;

  /* ------------------------------------------------------------- constraint */

  /* kind: 'dist' (exact), 'max' (rope, only pulls), 'min' (strut, only pushes) */
  function Constraint(a, b, len, stiff, kind) {
    this.a = a; this.b = b;
    this.len = len !== undefined ? len : RS.dist(a.x, a.y, b.x, b.y);
    this.stiff = stiff !== undefined ? stiff : 1;
    this.kind = kind || 'dist';
    this.dead = false;
    this.load = 0;      // correction magnitude on the most recent iteration
    this.peakLoad = 0;  // max over iterations since last reset; grip slip metric
  }

  Constraint.prototype.solve = function () {
    var a = this.a, b = this.b;
    var dx = b.x - a.x, dy = b.y - a.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-7) return;
    var diff = d - this.len;
    if (this.kind === 'max' && diff <= 0) { this.load = 0; return; }
    if (this.kind === 'min' && diff >= 0) { this.load = 0; return; }
    this.load = Math.abs(diff);
    if (this.load > this.peakLoad) this.peakLoad = this.load;
    var wsum = a.invMass + b.invMass;
    if (wsum < 1e-7) return;
    var scale = (diff / d) * this.stiff;
    var ax = dx * scale * (a.invMass / wsum);
    var ay = dy * scale * (a.invMass / wsum);
    var bx = dx * scale * (b.invMass / wsum);
    var by = dy * scale * (b.invMass / wsum);
    if (!a.pinned) { a.x += ax; a.y += ay; }
    if (!b.pinned) { b.x -= bx; b.y -= by; }
  };

  RS.Constraint = Constraint;

  /* ------------------------------------------------------------- materials */

  RS.MATERIALS = {
    rock:    { friction: 0.60, restitution: 0.03 },
    granite: { friction: 0.68, restitution: 0.02 },
    ply:     { friction: 0.52, restitution: 0.05 },
    ice:     { friction: 0.03, restitution: 0.02 },
    metal:   { friction: 0.30, restitution: 0.10 },
    pad:     { friction: 0.80, restitution: 1.30 },   // crash pad launches you
    tar:     { friction: 0.95, restitution: 0.00 }
  };

  /* ------------------------------------------------------- terrain shapes
   * Static collision geometry. Supported types:
   *   {type:'rect',   x,y,w,h}
   *   {type:'circle', x,y,r}
   *   {type:'capsule',x1,y1,x2,y2,r}         (ledges, angled slabs, prows)
   *   {type:'poly',   pts:[{x,y}...]}        (convex only)
   * Optional on every shape: mat (material key), oneWay (false), tag.
   */

  function resolveRect(p, s) {
    var r = p.r;
    var minX = s.x - r, maxX = s.x + s.w + r;
    var minY = s.y - r, maxY = s.y + s.h + r;
    if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) return null;
    /* Distance to each expanded face; push out of the nearest. */
    var dl = p.x - minX, dr = maxX - p.x, dt = p.y - minY, db = maxY - p.y;
    var m = Math.min(dl, dr, dt, db);
    if (m === dt) return { nx: 0, ny: -1, pen: dt };
    if (m === db) return { nx: 0, ny: 1, pen: db };
    if (m === dl) return { nx: -1, ny: 0, pen: dl };
    return { nx: 1, ny: 0, pen: dr };
  }

  function resolveCircle(p, s) {
    var dx = p.x - s.x, dy = p.y - s.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    var rr = s.r + p.r;
    if (d > rr) return null;
    if (d < 1e-6) return { nx: 0, ny: -1, pen: rr };
    return { nx: dx / d, ny: dy / d, pen: rr - d };
  }

  function resolveCapsule(p, s) {
    var c = RS.closestOnSegment(p.x, p.y, s.x1, s.y1, s.x2, s.y2);
    var dx = p.x - c.x, dy = p.y - c.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    var rr = s.r + p.r;
    if (d > rr) return null;
    if (d < 1e-6) return { nx: 0, ny: -1, pen: rr };
    return { nx: dx / d, ny: dy / d, pen: rr - d };
  }

  function resolvePoly(p, s) {
    /* Minimum translation out of a convex polygon, treating p as a circle. */
    var pts = s.pts, n = pts.length;
    var bestPen = Infinity, bnx = 0, bny = 0, i;
    var inside = true;
    for (i = 0; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % n];
      var ex = b.x - a.x, ey = b.y - a.y;
      var el = Math.sqrt(ex * ex + ey * ey);
      if (el < 1e-6) continue;
      /* outward normal assuming clockwise winding in screen space */
      var nx = ey / el, ny = -ex / el;
      var d = (p.x - a.x) * nx + (p.y - a.y) * ny;
      if (d > p.r) return null;             // separating axis found
      if (d > 0) inside = false;
      var pen = p.r - d;
      if (pen < bestPen) { bestPen = pen; bnx = nx; bny = ny; }
    }
    if (!isFinite(bestPen)) return null;
    if (!inside) {
      /* Near an edge or vertex: use closest feature for a smoother normal. */
      var best = null, bd = Infinity;
      for (i = 0; i < n; i++) {
        var q = RS.closestOnSegment(p.x, p.y, pts[i].x, pts[i].y, pts[(i + 1) % n].x, pts[(i + 1) % n].y);
        var dd = RS.dist2(p.x, p.y, q.x, q.y);
        if (dd < bd) { bd = dd; best = q; }
      }
      var ddx = p.x - best.x, ddy = p.y - best.y, dl = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dl > p.r) return null;
      if (dl > 1e-6) return { nx: ddx / dl, ny: ddy / dl, pen: p.r - dl };
    }
    return { nx: bnx, ny: bny, pen: bestPen };
  }

  function resolveShape(p, s) {
    switch (s.type) {
      case 'rect': return resolveRect(p, s);
      case 'circle': return resolveCircle(p, s);
      case 'capsule': return resolveCapsule(p, s);
      case 'poly': return resolvePoly(p, s);
    }
    return null;
  }

  RS.resolveShape = resolveShape;

  RS.shapeBounds = function (s) {
    switch (s.type) {
      case 'rect': return { x: s.x, y: s.y, w: s.w, h: s.h };
      case 'circle': return { x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 };
      case 'capsule': {
        var x0 = Math.min(s.x1, s.x2) - s.r, y0 = Math.min(s.y1, s.y2) - s.r;
        return { x: x0, y: y0, w: Math.abs(s.x2 - s.x1) + s.r * 2, h: Math.abs(s.y2 - s.y1) + s.r * 2 };
      }
      case 'poly': {
        var mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
        for (var i = 0; i < s.pts.length; i++) {
          mnx = Math.min(mnx, s.pts[i].x); mny = Math.min(mny, s.pts[i].y);
          mxx = Math.max(mxx, s.pts[i].x); mxy = Math.max(mxy, s.pts[i].y);
        }
        return { x: mnx, y: mny, w: mxx - mnx, h: mxy - mny };
      }
    }
    return { x: 0, y: 0, w: 0, h: 0 };
  };

  /* ------------------------------------------------------------------ zones
   * Force / effect volumes. Generic data fields so components stay declarative:
   *   shape: 'rect' (rotatable) | 'circle'
   *   gravMul, fx, fy         constant acceleration
   *   gustAmp, gustFreq, gustDir, gustPhase, gustDuty   pulsing acceleration
   *   drag                    extra velocity damping (0..1, subtracted)
   *   slick                   grip multiplier for holds/hands inside
   *   wet                     1 = wets hands
   *   staminaMul              stamina drain multiplier
   *   fog                     0..1 visual occlusion
   */

  RS.zoneContains = function (z, x, y) {
    if (z.shape === 'circle') return RS.pointInCircle(x, y, z.x, z.y, z.r);
    return RS.pointInRotRect(x, y, z.x, z.y, z.w, z.h, z.angle || 0);
  };

  RS.zoneGust = function (z, t) {
    if (!z.gustAmp) return 0;
    var freq = z.gustFreq || 0.7;
    var s = Math.sin((t * freq + (z.gustPhase || 0)) * RS.TAU);
    if (z.gustDuty !== undefined) {
      /* Duty-cycled blast: off, then a hard pulse. */
      var ph = ((t * freq + (z.gustPhase || 0)) % 1 + 1) % 1;
      return ph < z.gustDuty ? z.gustAmp * RS.smoothstep(Math.min(1, ph / (z.gustDuty * 0.35))) : 0;
    }
    /* Turbulent gust: base + oscillation + noise. */
    var n = RS.fbm1(t * 1.7 + (z.gustPhase || 0) * 13, 3);
    return z.gustAmp * (0.55 + 0.35 * s + 0.30 * n);
  };

  /* ----------------------------------------------------------------- solver */

  function Solver() {
    this.points = [];
    this.constraints = [];
    this.gravity = 1750;
    this.iterations = 8;
    this.world = null;      // {terrain:[], zones:[]}
    this.time = 0;
    this.airDrag = 0.0;
  }

  Solver.prototype.reset = function () {
    this.points.length = 0;
    this.constraints.length = 0;
    this.time = 0;
  };

  Solver.prototype.add = function (p) { this.points.push(p); return p; };

  Solver.prototype.addConstraint = function (c) { this.constraints.push(c); return c; };

  Solver.prototype.removeConstraint = function (c) {
    var i = this.constraints.indexOf(c);
    if (i >= 0) this.constraints.splice(i, 1);
  };

  Solver.prototype.removePoint = function (p) {
    var i = this.points.indexOf(p);
    if (i >= 0) this.points.splice(i, 1);
    this.constraints = this.constraints.filter(function (c) { return c.a !== p && c.b !== p; });
  };

  /* Remove every point/constraint belonging to an owner. */
  Solver.prototype.removeOwner = function (owner) {
    this.points = this.points.filter(function (p) { return p.owner !== owner; });
    this.constraints = this.constraints.filter(function (c) {
      return c.a.owner !== owner && c.b.owner !== owner && !c.dead;
    });
  };

  Solver.prototype.applyZones = function (p) {
    var zones = this.world && this.world.zones;
    p.zoneSlick = 1; p.zoneWet = 0; p.zoneStamina = 1; p.zoneFog = 0;
    var gravMul = 1, fx = 0, fy = 0, drag = 0;
    if (zones) {
      for (var i = 0; i < zones.length; i++) {
        var z = zones[i];
        if (z.dead || !RS.zoneContains(z, p.x, p.y)) continue;
        if (z.gravMul !== undefined) gravMul *= z.gravMul;
        if (z.fx) fx += z.fx;
        if (z.fy) fy += z.fy;
        if (z.gustAmp) {
          var g = RS.zoneGust(z, this.time);
          var a = z.gustDir || 0;
          fx += Math.cos(a) * g;
          fy += Math.sin(a) * g;
        }
        if (z.drag) drag = Math.max(drag, z.drag);
        if (z.slick !== undefined) p.zoneSlick = Math.min(p.zoneSlick, z.slick);
        if (z.wet) p.zoneWet = Math.max(p.zoneWet, z.wet);
        if (z.staminaMul !== undefined) p.zoneStamina = Math.max(p.zoneStamina, z.staminaMul);
        if (z.fog) p.zoneFog = Math.max(p.zoneFog, z.fog);
      }
    }
    p._gravMul = gravMul;
    p._zfx = fx; p._zfy = fy;
    p._drag = drag;
  };

  Solver.prototype.integrate = function (dt) {
    var g = this.gravity;
    for (var i = 0; i < this.points.length; i++) {
      var p = this.points[i];
      if (p.pinned) { p.px = p.x; p.py = p.y; p.fx = 0; p.fy = 0; continue; }
      this.applyZones(p);
      var ax = p.fx + p._zfx;
      var ay = p.fy + p._zfy + g * p.gravScale * p._gravMul;
      var vx = p.x - p.px, vy = p.y - p.py;
      var d = p.damping * (1 - p._drag);
      p.px = p.x; p.py = p.y;
      p.x += vx * d + ax * dt * dt;
      p.y += vy * d + ay * dt * dt;
      p.fx = 0; p.fy = 0;
      p.grounded = false;
      p.groundNx = 0; p.groundNy = 0;
    }
  };

  Solver.prototype.solveConstraints = function () {
    var it = this.iterations;
    for (var k = 0; k < it; k++) {
      for (var i = 0; i < this.constraints.length; i++) {
        var c = this.constraints[i];
        if (!c.dead) c.solve();
      }
    }
  };

  Solver.prototype.collide = function () {
    var terrain = this.world && this.world.terrain;
    if (!terrain) return;
    for (var i = 0; i < this.points.length; i++) {
      var p = this.points[i];
      if (p.pinned || !p.collide) continue;
      for (var j = 0; j < terrain.length; j++) {
        var s = terrain[j];
        if (s.dead) continue;
        var hit = resolveShape(p, s);
        if (!hit) continue;

        var mat = RS.MATERIALS[s.mat] || RS.MATERIALS.rock;
        var fric = mat.friction * (s.slickMul !== undefined ? s.slickMul : 1);
        if (p.zoneSlick < 1) fric *= p.zoneSlick;

        /* positional correction */
        p.x += hit.nx * hit.pen;
        p.y += hit.ny * hit.pen;

        /* split velocity into normal + tangent, damp both */
        var vx = p.x - p.px, vy = p.y - p.py;
        var vn = vx * hit.nx + vy * hit.ny;
        var tx = -hit.ny, ty = hit.nx;
        var vt = vx * tx + vy * ty;

        var rest = mat.restitution;
        if (rest > 1) {
          /* bouncy pad: only launch on meaningful impact */
          if (vn < -0.6) vn = -vn * (rest - 0.25);
          else vn = 0;
        } else {
          vn = vn < 0 ? -vn * rest : vn;
        }
        vt *= (1 - clamp(fric, 0, 1));

        var nvx = hit.nx * vn + tx * vt;
        var nvy = hit.ny * vn + ty * vt;
        p.px = p.x - nvx;
        p.py = p.y - nvy;

        p.grounded = true;
        p.groundNx = hit.nx; p.groundNy = hit.ny;
        p.lastMat = s.mat || 'rock';
        p.lastShape = s;
      }
    }
  };

  /* Fixed-timestep step. Call once per simulation tick. */
  Solver.prototype.step = function (dt) {
    this.time += dt;
    this.integrate(dt);
    this.solveConstraints();
    this.collide();
    /* One extra light constraint pass after collision keeps limbs from
       stretching when a hand is pinned and the body slams a ledge. */
    for (var i = 0; i < this.constraints.length; i++) {
      var c = this.constraints[i];
      if (!c.dead) c.solve();
    }
  };

  RS.Solver = Solver;

  /* -------------------------------------------------------------- rope body
   * Used by pendulum ropes, vines and the sandbag pulley. The tip is exposed
   * as a grabbable dynamic hold by the component that owns it.
   */

  function Rope(solver, ax, ay, segLen, count, opts) {
    opts = opts || {};
    this.solver = solver;
    this.pts = [];
    this.owner = opts.owner || RS.uid('rope');
    this.stiff = opts.stiff !== undefined ? opts.stiff : 1;
    for (var i = 0; i < count; i++) {
      var p = new Point(ax + (opts.dx || 0) * i, ay + segLen * i, {
        r: 2.5,
        invMass: i === 0 ? 0 : (opts.mass ? 1 / opts.mass : 1),
        pinned: i === 0,
        damping: opts.damping !== undefined ? opts.damping : 0.992,
        collide: opts.collide !== undefined ? opts.collide : false,
        owner: this.owner,
        tag: 'rope'
      });
      this.pts.push(p);
      solver.add(p);
      if (i > 0) solver.addConstraint(new Constraint(this.pts[i - 1], p, segLen, this.stiff, 'dist'));
    }
    /* Slight bend resistance so vines hang naturally instead of folding. */
    if (opts.bend) {
      for (var k = 0; k + 2 < this.pts.length; k++) {
        solver.addConstraint(new Constraint(this.pts[k], this.pts[k + 2], segLen * 1.94, opts.bend, 'min'));
      }
    }
    this.tip = this.pts[this.pts.length - 1];
  }

  Rope.prototype.destroy = function () { this.solver.removeOwner(this.owner); };

  RS.Rope = Rope;

})(window.RS);

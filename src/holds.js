/* ROUTESETTERS - holds.js
 * Hold type registry + the grip model. A "hold" is anything a hand or foot can
 * latch onto. Holds may be static, driven by a motion modifier, or bound to a
 * dynamic physics point (rope tip, zipline trolley).
 */
(function (RS) {
  'use strict';

  var clamp = RS.clamp;

  /* Base template. Every field can be overridden per hold type.
   *   grip     0..1.6  latch quality; scales max load before slipping
   *   drain    stamina units per second while weighted
   *   reach    extra grab radius on top of the hold radius
   *   aim      0 = omnidirectional, otherwise required approach as radians
   *            with `arc` tolerance
   */
  var BASE = {
    grip: 1.0,
    drain: 1.2,
    reach: 12,
    r: 12,
    feet: true,           // can feet use it
    hands: true,
    aim: null,
    arc: Math.PI,
    solid: false,         // also contributes static terrain (volumes, ledges)
    rest: 0,              // stamina regen per second while weighted
    breakAfter: 0,        // seconds of load before it snaps off
    decay: 0,             // grip lost per second while weighted
    releaseDelay: 0,      // sticky: seconds before you can let go
    magnet: 0,            // extra pull radius on hands
    bonus: false,
    springPower: 0,
    palette: ['#4a5560', '#33404b', '#6d7b88'],
    label: 'Hold'
  };

  var TYPES = {};

  function def(id, o) {
    var t = {};
    for (var k in BASE) t[k] = BASE[k];
    for (var j in o) t[j] = o[j];
    t.id = id;
    TYPES[id] = t;
    return t;
  }

  /* ---------------------------------------------------------- hold catalogue */

  def('jug', {
    label: 'Jug', r: 12, grip: 1.15, drain: 0.55, reach: 18,
    palette: ['#4b7fc4', '#2f5c96', '#7ea9dd'], shape: 'jug'
  });

  def('crimp', {
    label: 'Crimp', r: 7, grip: 0.56, drain: 3.4, reach: 10,
    palette: ['#c0563f', '#8e3928', '#e08a72'], shape: 'crimp'
  });

  def('sloper', {
    /* Calibrated against measured demand: a straight-armed hang sits at ~0.47 and
       a full lock-off at ~0.62, so 0.58 puts the sloper cleanly between them.
       It held a lock-off by 0.6% at 0.62, which is not a design, it is a
       coincidence. */
    label: 'Sloper', r: 15, grip: 0.58, drain: 2.1, reach: 17,
    palette: ['#8f7bb5', '#67548c', '#b5a4d3'], shape: 'sloper',
    swingSensitive: 1.9   // slips fast if you're swinging
  });

  def('pinch', {
    label: 'Pinch', r: 10, grip: 0.82, drain: 1.8, reach: 11,
    palette: ['#4fa07a', '#2f7355', '#83c8a8'], shape: 'pinch'
  });

  def('pocket', {
    label: 'Two-Finger Pocket', r: 9, grip: 0.70, drain: 2.7, reach: 10,
    palette: ['#c9a24a', '#9c7a2c', '#e6cd88'], shape: 'pocket'
  });

  def('undercling', {
    label: 'Undercling', r: 12, grip: 1.0, drain: 2.0, reach: 15,
    aim: Math.PI / 2, arc: 1.15,     // hand must come from below
    palette: ['#c2705a', '#95503f', '#e0a08c'], shape: 'undercling'
  });

  def('sidepull', {
    label: 'Sidepull', r: 11, grip: 0.95, drain: 2.0, reach: 14,
    aim: 0, arc: 1.0, directional: true,
    palette: ['#5e93a8', '#3d6b7d', '#96c2d3'], shape: 'sidepull'
  });

  def('footchip', {
    label: 'Foot Chip', r: 7, grip: 0.9, drain: 0.4, reach: 9,
    hands: false,
    palette: ['#7b8794', '#59636e', '#a7b1bc'], shape: 'chip'
  });

  def('volume', {
    label: 'Volume', r: 22, grip: 1.0, drain: 0.7, reach: 14, solid: true,
    palette: ['#d8d2c4', '#a9a294', '#f0ece1'], shape: 'volume'
  });

  def('restledge', {
    label: 'Rest Ledge', r: 20, grip: 1.2, drain: 0.0, reach: 16, solid: true,
    rest: 22,
    palette: ['#9aa58c', '#6f7a63', '#c3ccb6'], shape: 'ledge'
  });

  def('rail', {
    label: 'Bolt-On Rail', r: 9, grip: 1.0, drain: 1.1, reach: 12,
    segment: true,
    palette: ['#8a8f98', '#616770', '#b9bec6'], shape: 'rail'
  });

  def('crumble', {
    label: 'Crumbling Hold', r: 13, grip: 1.05, drain: 1.0, reach: 15,
    breakAfter: 1.35,
    palette: ['#a08966', '#786248', '#c8b391'], shape: 'crumble'
  });

  def('ice', {
    /* Usable with your feet on something, marginal without. */
    label: 'Ice Hold', r: 12, grip: 0.46, drain: 2.4, reach: 14,
    decay: 0.30,
    palette: ['#9fd5e8', '#6fa9c4', '#d6f0fa'], shape: 'ice'
  });

  def('resin', {
    label: 'Resin Hold', r: 12, grip: 1.5, drain: 1.4, reach: 15,
    releaseDelay: 0.65,
    palette: ['#c98b3a', '#9a6524', '#e8b872'], shape: 'resin'
  });

  def('magnet', {
    label: 'Magnet Hold', r: 11, grip: 0.95, drain: 1.5, reach: 15,
    magnet: 52,
    palette: ['#b0424f', '#822d38', '#d97e88'], shape: 'magnet'
  });

  def('spring', {
    label: 'Spring Hold', r: 13, grip: 1.05, drain: 1.3, reach: 15,
    springPower: 13.5,
    palette: ['#6c8f3d', '#4d692a', '#9dbd6f'], shape: 'spring'
  });

  def('partybox', {
    label: 'Party Box', r: 14, grip: 1.1, drain: 0.8, reach: 18,
    bonus: true,
    palette: ['#e8c33a', '#b8931f', '#fff0a0'], shape: 'partybox'
  });

  def('vinegrip', {   // rope/vine tip, bound to a dynamic point
    label: 'Vine', r: 10, grip: 1.0, drain: 1.6, reach: 15,
    palette: ['#5c7a3a', '#41582a', '#8aa863'], shape: 'knot', feet: false
  });

  def('trolley', {    // zipline handle
    label: 'Trolley', r: 12, grip: 1.2, drain: 1.0, reach: 15,
    palette: ['#c7cbd1', '#8f959d', '#eef1f4'], shape: 'trolley', feet: false
  });

  def('anchor', {     // the top-out bell mount, always generous
    label: 'Anchor', r: 15, grip: 1.4, drain: 0.3, reach: 20,
    palette: ['#e0dcc8', '#aaa693', '#f6f3e6'], shape: 'jug'
  });

  RS.HOLD_TYPES = TYPES;

  /* --------------------------------------------------------------- creation */

  var _hid = 0;

  RS.makeHold = function (typeId, x, y, opts) {
    var t = TYPES[typeId] || TYPES.jug;
    opts = opts || {};
    _hid++;
    var h = {
      hid: 'h' + _hid,
      type: typeId,
      x: x, y: y,
      baseX: x, baseY: y,
      r: opts.r !== undefined ? opts.r : t.r,
      angle: opts.angle !== undefined ? opts.angle : 0,
      grip: opts.grip !== undefined ? opts.grip : t.grip,
      drain: opts.drain !== undefined ? opts.drain : t.drain,
      reach: opts.reach !== undefined ? opts.reach : t.reach,
      hands: opts.hands !== undefined ? opts.hands : t.hands,
      feet: opts.feet !== undefined ? opts.feet : t.feet,
      solid: opts.solid !== undefined ? opts.solid : t.solid,
      rest: opts.rest !== undefined ? opts.rest : t.rest,
      breakAfter: t.breakAfter,
      decay: t.decay,
      releaseDelay: t.releaseDelay,
      magnet: opts.magnet !== undefined ? opts.magnet : t.magnet,
      bonus: t.bonus,
      springPower: t.springPower,
      swingSensitive: t.swingSensitive || 1,

      /* runtime state */
      greased: 0,        // 0..1 grip penalty from grease / water / verglas
      chalked: 0,        // 0..1 bonus
      wear: 0,           // accumulated load time for breakable holds
      wobble: 0,         // visual feedback when nearly slipping
      dead: false,
      motion: null,      // set by motion components
      dynamic: null,     // bound physics point
      segment: null,     // {x1,y1,x2,y2} for rails / ziplines
      protected: !!opts.protected,   // start/finish holds cannot be modified
      placedBy: opts.placedBy !== undefined ? opts.placedBy : -1,
      tint: opts.tint || null,
      seed: RS.rand(1000)
    };
    if (opts.segment) { h.segment = opts.segment; }
    return h;
  };

  /* Terrain shape contributed by a solid hold, so you can stand on volumes. */
  RS.holdTerrain = function (h) {
    var t = TYPES[h.type];
    if (h.type === 'restledge') {
      return { type: 'capsule', x1: h.x - h.r, y1: h.y, x2: h.x + h.r, y2: h.y, r: 5, mat: 'ply', tag: 'hold:' + h.hid };
    }
    if (h.type === 'volume') {
      return { type: 'poly', mat: 'ply', tag: 'hold:' + h.hid, pts: [
        { x: h.x - h.r, y: h.y + h.r * 0.55 },
        { x: h.x + h.r * 0.15, y: h.y - h.r * 0.7 },
        { x: h.x + h.r, y: h.y + h.r * 0.55 }
      ] };
    }
    return { type: 'circle', x: h.x, y: h.y, r: h.r * 0.8, mat: t && t.mat ? t.mat : 'ply', tag: 'hold:' + h.hid };
  };

  /* ------------------------------------------------------------- grip model */

  /* Effective grip quality right now, accounting for grease, chalk, decay,
   * verglas zones and directionality. Returns 0 when the hold is unusable.
   */
  RS.holdQuality = function (h, limb, ctx) {
    if (h.dead) return 0;
    if (limb === 'hand' && !h.hands) return 0;
    if (limb === 'foot' && !h.feet) return 0;

    var q = h.grip;
    q *= (1 - h.greased * 0.62);
    q *= (1 + h.chalked * 0.38);
    if (ctx && ctx.slick !== undefined) q *= ctx.slick;
    if (ctx && ctx.wet) q *= 0.55;
    if (h.decay && h.wear > 0) q *= Math.max(0.18, 1 - h.decay * h.wear);
    return Math.max(0, q);
  };

  /* Directional gate: can this hand approach angle actually use the hold?
   * approach = angle from hold toward the hand (i.e. which side the hand is on).
   */
  RS.holdAimOk = function (h, hx, hy) {
    var t = TYPES[h.type];
    if (!t || t.aim === null || t.aim === undefined) return 1;
    var want = t.aim + (t.directional ? h.angle : 0);
    var have = Math.atan2(hy - h.y, hx - h.x);
    var d = Math.abs(RS.normAngle(have - want));
    if (d > t.arc) return 0;
    /* Full strength dead-on, tapering toward the edge of the arc. */
    return RS.lerp(0.45, 1, 1 - d / t.arc);
  };

  /* How much load a hold can take before a limb slips off it, expressed in the
   * same abstract units as RS.gripDemand below. Roughly: 0.4 is desperate,
   * 1.0 is a solid jug, 1.5 will not let go of you.
   *
   * Deliberately NOT derived from solver correction distances - a latched limb
   * is heavy on purpose, so how far it drifts says more about its mass than
   * about how hard you are pulling on it.
   */
  RS.holdCapacity = function (h, q, bodySpeed) {
    var cap = q;
    /* slopers do not care how good you are, they care whether you are still */
    if (h.swingSensitive > 1) cap -= bodySpeed * 0.05 * h.swingSensitive;
    return Math.max(0.04, cap);
  };

  /* How hard a limb is being asked to work, in the same units as holdCapacity.
   *
   * Body weight plus momentum is the bulk of it. The `lockoff` term matters and
   * its sign is easy to get wrong: a BENT arm is the strenuous position, which is
   * exactly why climbers hang straight-armed to rest. So pulling yourself up
   * loads the hold harder than dangling off it, and getting your feet on or
   * matching both hands is what buys that back.
   */
  RS.gripDemand = function (opts) {
    var d = 0.46 + opts.bodySpeed * 0.30;
    d *= (1 + clamp(opts.lockoff, 0, 1) * 0.42);
    if (opts.feet > 0) d *= 0.72;
    if (opts.hands > 1) d *= 0.72;
    d *= (1 + opts.wet * 0.5);
    if (opts.gravMul && opts.gravMul !== 1) d *= (0.55 + 0.45 * opts.gravMul);
    return d;
  };

  /* Update per-frame hold behaviour: motion paths, wear, dynamic binding. */
  RS.updateHold = function (h, dt, t) {
    if (h.dead) return;

    if (h.dynamic) {
      h.x = h.dynamic.x;
      h.y = h.dynamic.y;
    } else if (h.motion) {
      var m = h.motion;
      switch (m.kind) {
        case 'oscillate':
          h.x = h.baseX + Math.sin(t * m.speed + m.phase) * m.amp;
          h.y = h.baseY;
          break;
        case 'elevator':
          h.y = h.baseY + Math.sin(t * m.speed + m.phase) * m.amp;
          h.x = h.baseX;
          break;
        case 'cam': {
          var a = t * m.speed + m.phase;
          h.x = m.cx + Math.cos(a) * m.radius;
          h.y = m.cy + Math.sin(a) * m.radius;
          h.angle = a + Math.PI;
          break;
        }
        case 'conveyor': {
          var s = h.segment;
          var u = ((t * m.speed + m.phase) % 1 + 1) % 1;
          if (m.pingpong) u = u < 0.5 ? u * 2 : (1 - u) * 2;
          h.x = RS.lerp(s.x1, s.x2, u);
          h.y = RS.lerp(s.y1, s.y2, u);
          break;
        }
      }
    }

    if (h.wobble > 0) h.wobble = Math.max(0, h.wobble - dt * 3);

    /* Breakables snap once their wear budget is spent. */
    if (h.breakAfter && h.wear >= h.breakAfter) {
      h.dead = true;
      h.brokeAt = t;
    }
  };

  /* Wear/decay accumulation while a limb is weighting the hold. */
  RS.loadHold = function (h, dt, loadFrac) {
    if (h.breakAfter) h.wear += dt * (0.5 + loadFrac);
    else if (h.decay) h.wear += dt;
  };

  /* Search for the best grabbable hold near a point. */
  RS.findHold = function (holds, x, y, limb, ctx) {
    var best = null, bestScore = -1;
    for (var i = 0; i < holds.length; i++) {
      var h = holds[i];
      if (h.dead) continue;
      var q = RS.holdQuality(h, limb, ctx);
      if (q <= 0) continue;
      var reach = h.r + h.reach + (limb === 'hand' ? h.magnet : 0);
      var d = RS.dist(x, y, h.x, h.y);
      if (d > reach) continue;
      var aim = limb === 'hand' ? RS.holdAimOk(h, x, y) : 1;
      if (aim <= 0) continue;
      /* Prefer close, high quality, well-aimed holds. */
      var score = q * aim * (1.6 - d / (reach + 1));
      if (h.magnet) score += 0.35;
      if (score > bestScore) { bestScore = score; best = h; }
    }
    return best;
  };

  /* Nearest hold to a world point regardless of grabability — used by the
   * routebuilder's "pick a hold" placement modes.
   */
  RS.pickHold = function (holds, x, y, maxDist, filter) {
    var best = null, bd = maxDist === undefined ? 40 : maxDist;
    for (var i = 0; i < holds.length; i++) {
      var h = holds[i];
      if (h.dead) continue;
      if (filter && !filter(h)) continue;
      var d = RS.dist(x, y, h.x, h.y) - h.r;
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  };

})(window.RS);

/* ROUTESETTERS - climber.js
 * The climber: a verlet ragdoll driven the way A Difficult Game About Climbing
 * drives it. The mouse aims both arms; LMB grips with the left hand, RMB with
 * the right. Once a hand is latched, moving the mouse ABOVE that hold contracts
 * the arm and pulls you up. Everything else (swing, momentum, ugly falls) is
 * whatever the physics decides.
 */
(function (RS) {
  'use strict';

  var clamp = RS.clamp;

  var DIM = {
    torso: 27,
    neck: 15,
    upperArm: 21,
    foreArm: 21,
    thigh: 24,
    shin: 24
  };
  var REACH = DIM.upperArm + DIM.foreArm - 1;

  /* Player cosmetics. Each looks like a different real person. */
  RS.PROFILES = [
    { name: 'Mara',  skin: '#c98f6b', skinDeep: '#8d5b3f', hair: '#2b1d16', hairStyle: 'bun',
      top: '#c8455c', bottom: '#2f3540', shoe: '#e8e3d6', build: 1.00, height: 1.00 },
    { name: 'Deniz', skin: '#8a5a3b', skinDeep: '#5a3421', hair: '#171310', hairStyle: 'short',
      top: '#2e7d9e', bottom: '#3b3f47', shoe: '#22262c', build: 1.10, height: 1.04 },
    { name: 'Kaisa', skin: '#eec7a8', skinDeep: '#b98a68', hair: '#b8823c', hairStyle: 'pony',
      top: '#e0e2e6', bottom: '#5b5f4a', shoe: '#c2452f', build: 0.93, height: 0.97 },
    { name: 'Obi',   skin: '#6b4226', skinDeep: '#412614', hair: '#14100d', hairStyle: 'fade',
      top: '#f0b429', bottom: '#26303a', shoe: '#f2efe6', build: 1.16, height: 1.07 },
    { name: 'Yuki',  skin: '#e8c39c', skinDeep: '#b08659', hair: '#241a15', hairStyle: 'long',
      top: '#6c4f9e', bottom: '#2b2b30', shoe: '#3d7a52', build: 0.90, height: 0.94 },
    { name: 'Rune',  skin: '#d9a37c', skinDeep: '#9d6a47', hair: '#5e3f2a', hairStyle: 'cap',
      top: '#37474f', bottom: '#7a6a52', shoe: '#d8d2c4', build: 1.05, height: 1.02 }
  ];

  function Climber(game, opts) {
    opts = opts || {};
    this.game = game;
    this.solver = game.solver;
    this.world = game.world;
    this.profile = opts.profile || RS.PROFILES[0];
    this.playerIndex = opts.playerIndex !== undefined ? opts.playerIndex : 0;
    this.owner = RS.uid('climber');
    this.scale = this.profile.height || 1;

    /* --- state --- */
    this.stamina = 100;
    this.staminaMax = 100;
    this.pumped = 0;          // >0 = forced open-handed, cannot grip
    this.stun = 0;            // knocked about by a hazard
    this.wet = 0;
    this.tar = 0;
    this.facing = 1;
    this.facingT = 1;
    this.effort = 0;          // 0..1 render cue: strain
    this.breath = RS.rand(10);
    this.chalkPuffs = [];
    this.sweat = 0;
    this.jumpCd = 0;
    this.slipFx = 0;
    this.dynoCount = 0;    // read by the tutorial to confirm you tried one

    this.topped = false;
    this.toppedAt = null;
    this.bonusTouched = false;
    this.highY = 0;
    this.startY = 0;
    this.falls = 0;
    this.checkpoint = null;
    this.deaths = 0;
    this.trailTimer = 0;

    this.build(opts.x || 0, opts.y || 0);
  }

  Climber.prototype.build = function (x, y) {
    var s = this.solver, sc = this.scale, o = this.owner;
    var P = function (px, py, r, mass, tag, extra) {
      var op = { r: r, invMass: 1 / mass, owner: o, tag: tag, damping: 0.9955 };
      if (extra) for (var k in extra) op[k] = extra[k];
      return s.add(new RS.Point(px, py, op));
    };

    this.pelvis = P(x, y, 8 * sc, 2.3, 'pelvis');
    this.chest = P(x, y - DIM.torso * sc, 9.5 * sc, 2.8, 'chest');
    this.head = P(x, y - (DIM.torso + DIM.neck) * sc, 9 * sc, 1.1, 'head');

    this.elbowL = P(x - 8, y - 20 * sc, 4.5 * sc, 0.55, 'elbow');
    this.handL = P(x - 14, y - 6 * sc, 5.0 * sc, 0.6, 'hand');
    this.elbowR = P(x + 8, y - 20 * sc, 4.5 * sc, 0.55, 'elbow');
    this.handR = P(x + 14, y - 6 * sc, 5.0 * sc, 0.6, 'hand');

    this.kneeL = P(x - 5, y + 22 * sc, 5.2 * sc, 0.8, 'knee');
    this.footL = P(x - 5, y + 44 * sc, 5.5 * sc, 0.85, 'foot');
    this.kneeR = P(x + 5, y + 22 * sc, 5.2 * sc, 0.8, 'knee');
    this.footR = P(x + 5, y + 44 * sc, 5.5 * sc, 0.85, 'foot');

    this.points = [this.pelvis, this.chest, this.head, this.elbowL, this.handL,
      this.elbowR, this.handR, this.kneeL, this.footL, this.kneeR, this.footR];

    var C = function (a, b, len, stiff, kind) {
      return s.addConstraint(new RS.Constraint(a, b, len * sc, stiff, kind));
    };

    /* skeleton */
    C(this.pelvis, this.chest, DIM.torso, 1);
    C(this.chest, this.head, DIM.neck, 1);
    C(this.chest, this.elbowL, DIM.upperArm, 1);
    C(this.elbowL, this.handL, DIM.foreArm, 1);
    C(this.chest, this.elbowR, DIM.upperArm, 1);
    C(this.elbowR, this.handR, DIM.foreArm, 1);
    C(this.pelvis, this.kneeL, DIM.thigh, 1);
    C(this.kneeL, this.footL, DIM.shin, 1);
    C(this.pelvis, this.kneeR, DIM.thigh, 1);
    C(this.kneeR, this.footR, DIM.shin, 1);

    /* posture: keeps the spine from folding and joints from hyper-flexing */
    C(this.pelvis, this.head, DIM.torso + DIM.neck - 3, 0.55, 'min');
    C(this.chest, this.kneeL, 30, 0.35, 'min');
    C(this.chest, this.kneeR, 30, 0.35, 'min');
    C(this.kneeL, this.kneeR, 15, 0.25, 'min');
    C(this.footL, this.footR, 12, 0.15, 'min');
    C(this.chest, this.handL, 15, 0.5, 'min');
    C(this.chest, this.handR, 15, 0.5, 'min');
    C(this.pelvis, this.footL, DIM.thigh + DIM.shin, 0.9, 'max');
    C(this.pelvis, this.footR, DIM.thigh + DIM.shin, 0.9, 'max');

    /* the winch constraints: contracting these is how you pull up */
    this.pullL = C(this.chest, this.handL, REACH, 0.26, 'max');
    this.pullR = C(this.chest, this.handR, REACH, 0.26, 'max');
    /* leg extension for dynos */
    this.legL = C(this.pelvis, this.footL, DIM.thigh + DIM.shin - 6, 0.0, 'min');
    this.legR = C(this.pelvis, this.footR, DIM.thigh + DIM.shin - 6, 0.0, 'min');

    /* limb latch bookkeeping */
    var self = this;
    var mkLimb = function (point, kind, sideKey) {
      return {
        point: point, kind: kind, side: sideKey,
        hold: null, con: null, settle: 0,
        /* A latched limb is braced against the wall, so it gets much heavier.
           Otherwise the winch constraint just yanks the light hand toward the
           chest instead of hauling the body up to the hand. */
        freeMass: point.invMass,
        heldMass: kind === 'hand' ? 1 / 26 : 1 / 7,
        anchor: s.add(new RS.Point(point.x, point.y, { r: 1, invMass: 0, pinned: true, collide: false, owner: o, tag: 'anchor' })),
        slip: 0, held: 0, curl: 0, wantGrip: false, cooldown: 0, releaseLock: 0,
        offX: 0, offY: 0
      };
    };
    this.limbs = {
      handL: mkLimb(this.handL, 'hand', 'L'),
      handR: mkLimb(this.handR, 'hand', 'R'),
      footL: mkLimb(this.footL, 'foot', 'L'),
      footR: mkLimb(this.footR, 'foot', 'R')
    };
    this.hands = [this.limbs.handL, this.limbs.handR];
    this.feet = [this.limbs.footL, this.limbs.footR];

    this.startY = y;
    this.highY = y;
    this.spawnX = x; this.spawnY = y;
  };

  Climber.prototype.destroy = function () {
    this.solver.removeOwner(this.owner);
  };

  /* ------------------------------------------------------------ positioning */

  Climber.prototype.teleport = function (x, y) {
    var dx = x - this.pelvis.x, dy = y - this.pelvis.y;
    this.releaseAll(true);
    for (var i = 0; i < this.points.length; i++) {
      var p = this.points[i];
      p.setPos(p.x + dx, p.y + dy, false);
    }
    for (var k in this.limbs) {
      var L = this.limbs[k];
      L.anchor.setPos(L.point.x, L.point.y, false);
    }
  };

  Climber.prototype.respawn = function () {
    var cp = this.checkpoint || { x: this.spawnX, y: this.spawnY };
    this.teleport(cp.x, cp.y);
    this.stamina = Math.max(this.stamina, 55);
    this.pumped = 0;
    this.stun = 0.35;
    this.wet = 0;
    this.deaths++;
  };

  /* --------------------------------------------------------------- gripping */

  Climber.prototype.limbCtx = function (L) {
    return { slick: L.point.zoneSlick, wet: this.wet > 0.35 || L.point.zoneWet > 0 };
  };

  /* Grabbing snaps the hand onto the hold, so bound how far it may travel:
     enough to be forgiving about a committed lunge, not enough to look like
     teleporting. Measured from the HAND, not the chest - a move deliberately
     puts the next hold beyond static chest reach, that is what a move is. */
  Climber.prototype.snapOk = function (L, hold) {
    var envelope = hold.r + hold.reach + (hold.magnet || 0) + 12;
    return RS.dist(L.point.x, L.point.y, hold.x, hold.y) <= envelope;
  };

  /* Which hold does the player mean when they close this hand?
   *
   * Resolved by INTENT, not proximity: of everything the hand can physically
   * snap to, take whatever is closest to the cursor. Ranking by proximity to the
   * hand instead makes dense routes unplayable, because the hold you are already
   * hanging from is always the nearest thing to your own hand.
   */
  Climber.prototype.pickGrab = function (L, other, input) {
    var holds = this.world.holds;
    var ctxq = this.limbCtx(L);
    var aimed = null, aimedScore = Infinity;
    var near = null, nearScore = Infinity;
    var cursorOnAHold = false;

    for (var i = 0; i < holds.length; i++) {
      var h = holds[i];
      if (h.dead) continue;
      if (RS.holdQuality(h, 'hand', ctxq) <= 0) continue;
      if (RS.holdAimOk(h, L.point.x, L.point.y) <= 0) continue;
      /* matching both hands is fine on something big, never on a crimp */
      if (other.hold === h && h.r < 14) continue;
      var penalty = other.hold === h ? 30 : 0;   // prefer a fresh hold
      var reachable = this.snapOk(L, h);

      var dCursor = RS.dist(input.mx, input.my, h.x, h.y);
      if (dCursor <= h.r + h.reach + (h.magnet || 0)) {
        cursorOnAHold = true;
        if (reachable && dCursor + penalty < aimedScore) {
          aimedScore = dCursor + penalty; aimed = h;
        }
      }
      if (reachable) {
        var dHand = RS.dist(L.point.x, L.point.y, h.x, h.y) + penalty;
        if (dHand < nearScore) { nearScore = dHand; near = h; }
      }
    }

    /* What you are pointing at wins. */
    if (aimed) return aimed;
    /* If you ARE pointing at a hold but cannot reach it yet, grab nothing and
       keep reaching - otherwise closing your hand snaps you onto whatever
       happens to be beside your body and the move you aimed for never happens. */
    if (cursorOnAHold) return null;
    /* Pointing at blank wall: take whatever is under the hand. */
    return near;
  };

  Climber.prototype.latch = function (L, hold) {
    if (L.hold === hold) return true;
    if (L.kind === 'hand' && !this.snapOk(L, hold)) return false;
    this.release(L, false);
    L.hold = hold;
    L.held = 0;
    L.slip = 0;
    L.releaseLock = hold.releaseDelay || 0;
    L.offX = 0; L.offY = 0;
    L.point.invMass = L.heldMass;
    /* Grabbing moves the hand ONTO the hold, keeping its momentum. Without this
       the grip constraint has to close the whole reach gap on its first solve,
       which registers as an enormous load and spits you straight back off. */
    L.point.setPos(hold.x, hold.y, true);
    /* and a beat of grace so the settling correction is not read as slipping */
    L.settle = 0.09;

    if (hold.dynamic) {
      /* Two-way: your weight actually swings the rope. */
      L.con = this.solver.addConstraint(new RS.Constraint(L.point, hold.dynamic, 4, 0.9, 'dist'));
    } else {
      L.anchor.setPos(hold.x, hold.y, false);
      L.con = this.solver.addConstraint(new RS.Constraint(L.point, L.anchor, 1.0, 1, 'dist'));
    }
    if (hold.bonus) this.bonusTouched = true;
    if (L.kind === 'hand') {
      this.puff(L.point.x, L.point.y, 5);
      this.game.sfx && this.game.sfx('grip', hold);
    }
    return true;
  };

  Climber.prototype.release = function (L, launch) {
    if (!L.hold) return;
    var h = L.hold;
    if (L.con) { this.solver.removeConstraint(L.con); L.con = null; }
    L.hold = null;
    L.slip = 0;
    L.cooldown = 0.06;
    L.point.invMass = L.freeMass;

    /* Spring holds fling you off along their aim when you let go. */
    if (launch && h.springPower && L.kind === 'hand') {
      var a = h.angle - Math.PI / 2;
      var pw = h.springPower;
      L.point.addImpulse(Math.cos(a) * pw, Math.sin(a) * pw);
      this.chest.addImpulse(Math.cos(a) * pw * 0.85, Math.sin(a) * pw * 0.85);
      this.pelvis.addImpulse(Math.cos(a) * pw * 0.55, Math.sin(a) * pw * 0.55);
      this.puff(h.x, h.y, 14);
      this.game.sfx && this.game.sfx('spring', h);
    }
  };

  Climber.prototype.releaseAll = function (silent) {
    for (var k in this.limbs) this.release(this.limbs[k], false);
    if (!silent) this.slipFx = 1;
  };

  Climber.prototype.gripCount = function () {
    var n = 0;
    for (var i = 0; i < this.hands.length; i++) if (this.hands[i].hold) n++;
    return n;
  };

  Climber.prototype.footCount = function () {
    var n = 0;
    for (var i = 0; i < this.feet.length; i++) if (this.feet[i].hold || this.feet[i].point.grounded) n++;
    return n;
  };

  Climber.prototype.knockOff = function (ix, iy, stun) {
    this.releaseAll();
    this.stun = Math.max(this.stun, stun || 0.7);
    this.chest.addImpulse(ix, iy);
    this.pelvis.addImpulse(ix * 0.7, iy * 0.7);
    this.head.addImpulse(ix * 1.1, iy * 1.1);
    this.game.sfx && this.game.sfx('hit');
  };

  Climber.prototype.puff = function (x, y, n) {
    for (var i = 0; i < n; i++) {
      this.chalkPuffs.push({
        x: x + RS.rand(-4, 4), y: y + RS.rand(-4, 4),
        vx: RS.rand(-18, 18), vy: RS.rand(-26, 4),
        life: RS.rand(0.35, 0.95), t: 0, r: RS.rand(1.4, 3.6)
      });
    }
    if (this.chalkPuffs.length > 160) this.chalkPuffs.splice(0, this.chalkPuffs.length - 160);
  };

  /* ------------------------------------------------------------------ update
   * input: {mx, my, left, right, jump}  (mx/my in world space)
   */
  Climber.prototype.update = function (dt, input, active) {
    var i, L, h;
    var t = this.solver.time;
    var holds = this.world.holds;

    this.breath += dt;
    if (this.stun > 0) this.stun -= dt;
    if (this.pumped > 0) {
      this.pumped -= dt;
      if (this.pumped <= 0) this.stamina = Math.max(this.stamina, 26);
    }
    if (this.jumpCd > 0) this.jumpCd -= dt;
    if (this.slipFx > 0) this.slipFx -= dt * 2.5;

    var limp = this.stun > 0 || this.pumped > 0 || !active;

    /* ---- environment sampling ---- */
    var wetSrc = Math.max(this.handL.zoneWet, this.handR.zoneWet, this.chest.zoneWet);
    if (wetSrc > 0) this.wet = Math.min(1, this.wet + dt * 2.4 * wetSrc);
    else this.wet = Math.max(0, this.wet - dt * 0.30);
    this.tar = Math.max(this.chest.zoneStamina, this.pelvis.zoneStamina);

    /* ---- facing ---- */
    if (!limp) {
      var want = input.mx > this.chest.x ? 1 : -1;
      if (Math.abs(input.mx - this.chest.x) > 6) this.facing = want;
    }
    this.facingT = RS.approach(this.facingT, this.facing, 9, dt);

    /* ---- hand intent ---- */
    var wantL = !limp && input.left;
    var wantR = !limp && input.right;
    this.limbs.handL.wantGrip = wantL;
    this.limbs.handR.wantGrip = wantR;

    for (i = 0; i < this.hands.length; i++) {
      L = this.hands[i];
      if (L.cooldown > 0) L.cooldown -= dt;
      if (L.releaseLock > 0) L.releaseLock -= dt;

      if (L.settle > 0) L.settle -= dt;

      var shoulder = this.shoulderPos(L.side);
      /* Both arms reach toward the cursor; the off hand sits slightly aside so
         they don't perfectly overlap. */
      var spread = (L.side === 'L' ? -1 : 1) * (L.wantGrip ? 0 : 7);
      var tx = input.mx + spread, ty = input.my;
      var dx = tx - shoulder.x, dy = ty - shoulder.y;
      var d = RS.len(dx, dy) || 1;
      var maxR = REACH * this.scale;
      if (d > maxR) { tx = shoulder.x + dx / d * maxR; ty = shoulder.y + dy / d * maxR; }
      L.targetX = tx; L.targetY = ty;

      if (L.hold) {
        h = L.hold;
        var q = RS.holdQuality(h, 'hand', this.limbCtx(L));
        var aim = RS.holdAimOk(h, L.point.x, L.point.y);
        var swing = L.point.speed();

        /* let go? */
        var stillWant = L.wantGrip && !limp;
        if (!stillWant && L.releaseLock <= 0) {
          this.release(L, true);
        } else if (q <= 0.02 || aim <= 0 || h.dead) {
          this.release(L, false);
          this.slipFx = 1;
        } else {
          /* keep the anchor glued to the (possibly moving) hold */
          if (!h.dynamic) L.anchor.setPos(h.x + L.offX, h.y + L.offY, true);

          if (L.con) L.con.peakLoad = 0;
          var bodySpeed = this.chest.speed();
          var span = RS.dist(this.chest.x, this.chest.y, L.point.x, L.point.y) / (REACH * this.scale);
          var demand = RS.gripDemand({
            lockoff: 1 - span,
            bodySpeed: bodySpeed,
            feet: this.footCount(),
            hands: this.gripCount(),
            wet: this.wet,
            gravMul: L.point._gravMul || 1
          });
          var capacity = RS.holdCapacity(h, q * aim, bodySpeed);

          var over = L.settle > 0 ? 0 : demand / capacity;
          if (over > 1) {
            L.slip += dt * (over - 1) * 1.6;
            h.wobble = 1;
            /* the hand creeps down the hold as it goes */
            L.offY += dt * Math.min(26, (over - 1) * 22);
            if (L.slip > 0.30) { this.release(L, false); this.slipFx = 1; this.game.sfx && this.game.sfx('slip'); }
          } else {
            L.slip = Math.max(0, L.slip - dt * 1.6);
          }

          if (L.hold) {
            L.held += dt;
            RS.loadHold(h, dt, clamp(over, 0, 1.5));
            /* stamina */
            var drain = h.drain * (this.tar > 1 ? this.tar : 1);
            drain *= (1 + this.wet * 0.6);
            drain *= (this.footCount() > 0 ? 0.55 : 1.0);
            drain *= (this.gripCount() > 1 ? 0.72 : 1.0);
            this.stamina -= drain * dt;
            if (h.rest) this.stamina += h.rest * dt;
            this.effort = Math.max(this.effort, clamp(over * 0.8 + drain * 0.1, 0, 1));
          }
        }
      } else if (L.wantGrip && L.cooldown <= 0) {
        h = this.pickGrab(L, this.hands[1 - i], input);
        if (h) this.latch(L, h);
      }
    }

    /* ---- arm actuation ---- */
    for (i = 0; i < this.hands.length; i++) {
      L = this.hands[i];
      var pull = L.side === 'L' ? this.pullL : this.pullR;
      if (L.hold && !limp) {
        /* Mouse above the hold = contract the arm and pull up.
           Mouse below = pay out and hang long. */
        /* Cursor above the hold means pull up - as the tutorial says, and near
           enough regardless of HOW far above. A gradual ramp is worse than it
           sounds: aiming at the next hold would only half-contract the arm, so
           the body sinks exactly when you need the reach. */
        var rel = (L.hold.y - input.my) / 22;
        var amount = clamp(rel, -0.25, 1);
        /* At the top of a real pull-up your hand is level with your chest. That
           is what buys the reach for the next move: the shoulder comes up to the
           hold, so the free arm spans nearly its whole length above it. Leaving
           the chest well below the hold caps a move at ~25px, which is less than
           half of what this body ought to manage. */
        var lenTarget = RS.lerp(REACH * this.scale, 4 * this.scale, clamp(amount, 0, 1));
        if (amount < 0) lenTarget = REACH * this.scale;
        pull.len = RS.approach(pull.len, lenTarget, 11, dt);
        pull.stiff = 0.48;
        /* Core pull: haul the whole torso toward the hold, not just the chest,
           or the hips hang back and the shoulder never actually rises. */
        var ax = L.point.x - this.chest.x, ay = L.point.y - this.chest.y;
        var al = RS.len(ax, ay) || 1;
        var f = 1500 * clamp(amount, 0, 1);
        this.chest.addForce(ax / al * f, ay / al * f);
        var px = L.point.x - this.pelvis.x, py = L.point.y - this.pelvis.y;
        var pl = RS.len(px, py) || 1;
        this.pelvis.addForce(px / pl * f * 0.45, py / pl * f * 0.45);
      } else {
        pull.len = RS.approach(pull.len, REACH * this.scale, 8, dt);
        pull.stiff = 0.06;
        if (!limp) {
          /* Free arm tracks the cursor. Damped, or the hand orbits the target
             instead of settling on it and you cannot hit a small hold. */
          var fx = (L.targetX - L.point.x), fy = (L.targetY - L.point.y);
          var fl = RS.len(fx, fy);
          var mag = Math.min(fl * 46, 2400);
          if (fl > 0.01) {
            var hvx = L.point.x - L.point.px, hvy = L.point.y - L.point.py;
            L.point.addForce(
              fx / fl * mag - hvx * 640,
              fy / fl * mag - hvy * 640 - 420
            );
          }
        }
      }
    }

    /* ---- elbows want to hang below the shoulder->hand line ---- */
    this.jointBias(this.chest, this.handL, this.elbowL, 1, 620);
    this.jointBias(this.chest, this.handR, this.elbowR, 1, 620);
    /* ---- knees lead forward ---- */
    this.jointBias(this.pelvis, this.footL, this.kneeL, this.facingT, 340);
    this.jointBias(this.pelvis, this.footR, this.kneeR, this.facingT, 340);

    /* ---- head stays upright-ish and looks where you aim ---- */
    if (!limp) {
      var hx = this.chest.x + this.facingT * 3, hy = this.chest.y - DIM.neck * this.scale;
      this.head.addForce((hx - this.head.x) * 26, (hy - this.head.y) * 26 - 300);
    }

    /* ---- feet: automatic smearing / standing ---- */
    this.updateFeet(dt, input, limp);

    /* ---- dyno ---- */
    if (input.jump && !limp && this.jumpCd <= 0 && (this.footCount() > 0) && this.stamina > 12) {
      this.dyno();
    }

    /* ---- stamina bookkeeping ---- */
    var gripping = this.gripCount() > 0;
    if (!gripping) {
      var standing = this.footCount() >= 1 && this.chest.speed() < 1.2;
      this.stamina += (standing ? 26 : 5.5) * dt;
    }
    this.stamina = clamp(this.stamina, 0, this.staminaMax);
    if (this.stamina <= 0.01 && this.pumped <= 0) {
      this.pumped = 1.35;
      this.releaseAll();
      this.game.sfx && this.game.sfx('pump');
    }
    this.effort = RS.approach(this.effort, gripping ? 0.35 : 0, 3.2, dt);

    /* ---- sweat & chalk ---- */
    this.sweat = clamp(1 - this.stamina / this.staminaMax, 0, 1);
    if (gripping && RS.rand() < dt * 2.2 * this.sweat) {
      var hh = this.hands[RS.randInt(0, 1)];
      if (hh.hold) this.puff(hh.point.x, hh.point.y, 1);
    }
    for (i = this.chalkPuffs.length - 1; i >= 0; i--) {
      var c = this.chalkPuffs[i];
      c.t += dt;
      if (c.t >= c.life) { this.chalkPuffs.splice(i, 1); continue; }
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.vy += 24 * dt; c.vx *= 0.97; c.vy *= 0.98;
    }

    /* ---- progress ---- */
    if (this.chest.y < this.highY) this.highY = this.chest.y;

    var fin = this.world.finish;
    if (fin && !this.topped) {
      if (RS.dist(this.chest.x, this.chest.y, fin.x, fin.y) < (fin.r || 34) ||
          RS.dist(this.head.x, this.head.y, fin.x, fin.y) < (fin.r || 34)) {
        this.topped = true;
        this.toppedAt = this.game.runTime;
        this.puff(this.head.x, this.head.y, 26);
        this.game.sfx && this.game.sfx('top');
      }
    }

    /* ---- out of bounds ---- */
    if (this.pelvis.y > this.world.height + 260) this.respawn();
  };

  /* Push a mid-joint off the line between its neighbours so limbs bend like
     limbs instead of snapping through themselves. */
  Climber.prototype.jointBias = function (a, b, mid, dirSign, strength) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var d = RS.len(dx, dy);
    if (d < 4) return;
    var nx = -dy / d, ny = dx / d;
    /* choose the perpendicular that points "down" for arms, "forward" for legs */
    if (dirSign === 1) { if (ny < 0) { nx = -nx; ny = -ny; } }
    else { if (nx * dirSign < 0) { nx = -nx; ny = -ny; } }
    var mx = (a.x + b.x) * 0.5 + nx * 9, my = (a.y + b.y) * 0.5 + ny * 9;
    mid.addForce((mx - mid.x) * strength * 0.06, (my - mid.y) * strength * 0.06);
  };

  Climber.prototype.shoulderPos = function (side) {
    var dx = this.chest.x - this.pelvis.x, dy = this.chest.y - this.pelvis.y;
    var d = RS.len(dx, dy) || 1;
    var nx = -dy / d, ny = dx / d;
    var off = (side === 'L' ? -1 : 1) * 7.5 * this.scale * this.facingT;
    return { x: this.chest.x + nx * off, y: this.chest.y + ny * off };
  };

  Climber.prototype.updateFeet = function (dt, input, limp) {
    var holds = this.world.holds;
    for (var i = 0; i < this.feet.length; i++) {
      var L = this.feet[i];
      if (L.cooldown > 0) L.cooldown -= dt;
      var p = L.point;

      if (L.hold) {
        var h = L.hold;
        var q = RS.holdQuality(h, 'foot', this.limbCtx(L));
        if (L.con) L.con.peakLoad = 0;
        /* Feet are far stickier than hands - they only lose a foothold when the
           leg runs out of length, the hold dies, or it is genuinely too slick. */
        var legSpan = RS.dist(p.x, p.y, this.pelvis.x, this.pelvis.y);
        var footDemand = RS.gripDemand({
          lockoff: 0,          // a flexed leg is strong; feet are not the weak link
          bodySpeed: this.pelvis.speed(), feet: 2, hands: 2, wet: 0,
          gravMul: p._gravMul || 1
        });
        var overstretch = legSpan > (DIM.thigh + DIM.shin + 4) * this.scale;
        if (h.dead || q <= 0.02 || footDemand > q * 1.5 || overstretch || limp) {
          this.release(L, false);
        } else {
          if (!h.dynamic) L.anchor.setPos(h.x, h.y, true);
          if (h.rest) this.stamina += h.rest * 0.5 * dt;
          RS.loadHold(h, dt, 0.4);
        }
      } else if (!limp && L.cooldown <= 0) {
        /* Feet find their own placements when they're near one and calm. */
        if (p.speed() < 2.4) {
          var f = RS.findHold(holds, p.x, p.y, 'foot', this.limbCtx(L));
          if (f && RS.dist(p.x, p.y, f.x, f.y) < f.r + f.reach * 0.8) this.latch(L, f);
        }
      }

      /* Free legs look for a foothold to high-step onto rather than dangling
         fully extended. This is most of what feet are for: standing up on a
         higher chip raises the whole body and buys reach for the next move. */
      if (!limp && !L.hold) {
        var side = (L.side === 'L' ? -1 : 1);
        var legLen = (DIM.thigh + DIM.shin) * this.scale;
        var tx = this.pelvis.x + side * 6 * this.scale + this.facingT * 5;
        var ty = this.pelvis.y + (legLen - 4);

        /* Highest foothold that is still below the hips and inside leg range. */
        var step = null;
        for (var k = 0; k < holds.length; k++) {
          var fh = holds[k];
          if (fh.dead || !fh.feet) continue;
          if (fh.y < this.pelvis.y + 10) continue;                 // not above the hips
          if (RS.dist(this.pelvis.x, this.pelvis.y, fh.x, fh.y) > legLen - 2) continue;
          if (this.feet[1 - i].hold === fh) continue;               // other foot has it
          if (!step || fh.y < step.y) step = fh;
        }
        if (step) { tx = step.x; ty = step.y; }
        p.addForce((tx - p.x) * 11, (ty - p.y) * 9);
      }
    }
  };


  /* Explosive leg extension. Lets you dyno between distant holds. */
  Climber.prototype.dyno = function () {
    this.jumpCd = 0.55;
    this.dynoCount++;
    this.stamina -= 9;
    var self = this;
    var power = 0;
    for (var i = 0; i < this.feet.length; i++) {
      var L = this.feet[i], p = L.point;
      if (L.hold || p.grounded) {
        var dx = this.pelvis.x - p.x, dy = this.pelvis.y - p.y;
        var d = RS.len(dx, dy) || 1;
        var imp = 7.2;
        this.pelvis.addImpulse(dx / d * imp, dy / d * imp);
        this.chest.addImpulse(dx / d * imp * 0.75, dy / d * imp * 0.75);
        power++;
        /* feet let go as you extend */
        this.release(L, false);
        L.cooldown = 0.24;
      }
    }
    if (power) {
      this.puff(this.footL.x, this.footL.y + 6, 6);
      this.game.sfx && this.game.sfx('dyno');
    }
  };

  /* Height climbed, in metres, relative to the start line. */
  Climber.prototype.heightM = function () {
    return Math.max(0, (this.startY - this.highY) / 42);
  };

  Climber.prototype.currentHeightM = function () {
    return Math.max(0, (this.startY - this.chest.y) / 42);
  };

  RS.Climber = Climber;
  RS.CLIMBER_DIM = DIM;
  RS.CLIMBER_REACH = REACH;

})(window.RS);

/* ROUTESETTERS - game.js
 * Game loop, camera, input, mode/phase state machine and the routebuilder
 * placement interaction.
 */
(function (RS) {
  'use strict';

  var clamp = RS.clamp;
  var FIXED = 1 / 120;

  function Game(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(2, window.devicePixelRatio || 1);

    this.solver = new RS.Solver();
    this.world = null;
    this.climber = null;

    this.mode = 'menu';          // menu | story | party | freebuild
    this.phase = 'idle';         // idle | run | build | score | complete
    this.paused = false;

    this.match = null;
    this.storyLevel = null;
    this.storyPlayer = { name: 'You', profile: RS.PROFILES[0] };

    this.runTime = 0;
    this.runLimit = Infinity;
    this.accum = 0;
    this.last = 0;
    this.frame = 0;
    this.wallTime = 0;

    this.cam = { x: 330, y: -200, zoom: 1, tx: 330, ty: -200, shake: 0, free: false };
    this.input = {
      sx: 0, sy: 0, mx: 0, my: 0, left: false, right: false, jump: false,
      wheel: 0, panning: false, lastSx: 0, lastSy: 0,
      /* Until the first mouse move we have no idea where the cursor is. Aiming
         at the default (0,0) means aiming at the world origin, which is off the
         bottom-left of the wall, and both arms haul the climber over sideways. */
      aimed: false
    };
    this.placement = null;
    this.toasts = [];
    this.muted = RS.storage.get('muted', false);
    this.showHelp = RS.storage.get('showHelp', true);

    this.progress = RS.storage.get('progress', { unlocked: 1, best: {} });

    this.ui = new RS.UI(this);
    this.audio = null;

    this.bindInput();
    this.resize();
    var self = this;
    window.addEventListener('resize', function () { self.resize(); });
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  /* ------------------------------------------------------------------ canvas */

  /* Re-checked every frame: a canvas can boot at 0x0 (hidden tab, deferred
     layout) and there is no resize event to recover from that. */
  Game.prototype.resize = function () {
    var c = this.canvas;
    var w = Math.max(1, c.clientWidth || window.innerWidth || 1);
    var h = Math.max(1, c.clientHeight || window.innerHeight || 1);
    if (w === this.vw && h === this.vh) return false;
    this.vw = w; this.vh = h;
    c.width = Math.round(w * this.dpr);
    c.height = Math.round(h * this.dpr);
    return true;
  };

  /* ------------------------------------------------------------------- input */

  Game.prototype.screenToWorld = function (sx, sy) {
    var z = this.cam.zoom;
    return {
      x: (sx - this.vw / 2) / z + this.cam.x,
      y: (sy - this.vh / 2) / z + this.cam.y
    };
  };

  Game.prototype.bindInput = function () {
    var self = this, c = this.canvas;

    var setMouse = function (e) {
      var r = c.getBoundingClientRect();
      self.input.sx = e.clientX - r.left;
      self.input.sy = e.clientY - r.top;
      var w = self.screenToWorld(self.input.sx, self.input.sy);
      self.input.mx = w.x; self.input.my = w.y;
      self.input.aimed = true;
    };

    c.addEventListener('mousemove', function (e) {
      var px = self.input.sx, py = self.input.sy;
      setMouse(e);
      if (self.input.panning && self.cam.free) {
        self.cam.tx -= (self.input.sx - px) / self.cam.zoom;
        self.cam.ty -= (self.input.sy - py) / self.cam.zoom;
      }
    });

    c.addEventListener('mousedown', function (e) {
      setMouse(e);
      if (self.audio === null) self.initAudio();
      if (e.button === 0) {
        if (self.phase === 'build' && self.placement) { self.placementClick(); e.preventDefault(); return; }
        if (self.phase === 'build') { self.input.panning = true; return; }
        self.input.left = true;
      } else if (e.button === 2) {
        if (self.phase === 'build') {
          if (self.placement) self.placementBack();
          else self.input.panning = true;
          e.preventDefault();
          return;
        }
        self.input.right = true;
      } else if (e.button === 1) {
        self.input.panning = true;
        e.preventDefault();
      }
    });

    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) { self.input.left = false; self.input.panning = false; }
      if (e.button === 2) { self.input.right = false; self.input.panning = false; }
      if (e.button === 1) self.input.panning = false;
    });

    c.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    c.addEventListener('wheel', function (e) {
      if (self.cam.free) {
        self.cam.ty += e.deltaY * 0.85;
        e.preventDefault();
      }
    }, { passive: false });

    /* touch: one finger = left hand, two fingers = both hands */
    c.addEventListener('touchstart', function (e) {
      var r = c.getBoundingClientRect();
      var t = e.touches[0];
      self.input.sx = t.clientX - r.left;
      self.input.sy = t.clientY - r.top;
      var w = self.screenToWorld(self.input.sx, self.input.sy);
      self.input.mx = w.x; self.input.my = w.y;
      self.input.aimed = true;
      if (self.phase === 'build' && self.placement) { self.placementClick(); }
      else { self.input.left = true; self.input.right = e.touches.length > 1; }
      e.preventDefault();
    }, { passive: false });
    c.addEventListener('touchmove', function (e) {
      var r = c.getBoundingClientRect();
      var t = e.touches[0];
      self.input.sx = t.clientX - r.left;
      self.input.sy = t.clientY - r.top;
      var w = self.screenToWorld(self.input.sx, self.input.sy);
      self.input.mx = w.x; self.input.my = w.y;
      self.input.aimed = true;
      self.input.right = e.touches.length > 1;
      e.preventDefault();
    }, { passive: false });
    c.addEventListener('touchend', function () {
      self.input.left = false; self.input.right = false;
    });

    window.addEventListener('keydown', function (e) {
      var k = e.key.toLowerCase();
      if (k === ' ') { self.input.jump = true; e.preventDefault(); }
      if (k === 'q') self.input.left = true;
      if (k === 'e') self.input.right = true;
      if (k === 'r' && self.phase === 'run') self.restartRun();
      if (k === 'escape') self.togglePause();
      if (k === 'm') { self.muted = !self.muted; RS.storage.set('muted', self.muted); self.toast(self.muted ? 'Muted' : 'Sound on'); }
      if (self.phase === 'build') {
        if (k === '1' || k === '2' || k === '3') self.ui.pickHandIndex(parseInt(k, 10) - 1);
        if (k === 'x') self.ui.skipBuild();
        if (k === 'backspace') { if (self.placement) self.placementBack(); e.preventDefault(); }
        if (k === 'w' || k === 'arrowup') self.cam.ty -= 90;
        if (k === 's' || k === 'arrowdown') self.cam.ty += 90;
        if (k === 'a' || k === 'arrowleft') self.cam.tx -= 90;
        if (k === 'd' || k === 'arrowright') self.cam.tx += 90;
      }
    });
    window.addEventListener('keyup', function (e) {
      var k = e.key.toLowerCase();
      if (k === ' ') self.input.jump = false;
      if (k === 'q') self.input.left = false;
      if (k === 'e') self.input.right = false;
    });
  };

  /* ------------------------------------------------------------------- audio
   * Tiny synth. Real audio files would need a build step and a server.
   */
  Game.prototype.initAudio = function () {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      this.audio = new AC();
    } catch (e) { this.audio = false; }
  };

  Game.prototype.sfx = function (kind, hold) {
    if (this.muted || !this.audio) return;
    var a = this.audio, t = a.currentTime;
    var o = a.createOscillator(), g = a.createGain();
    o.connect(g); g.connect(a.destination);
    var f = 440, dur = 0.07, vol = 0.06, type = 'triangle';
    switch (kind) {
      case 'grip': f = hold && hold.grip < 0.7 ? 240 : 340; dur = 0.05; vol = 0.045; type = 'square'; break;
      case 'slip': f = 150; dur = 0.16; vol = 0.07; type = 'sawtooth'; break;
      case 'pump': f = 110; dur = 0.35; vol = 0.08; type = 'sawtooth'; break;
      case 'dyno': f = 520; dur = 0.09; vol = 0.05; break;
      case 'spring': f = 700; dur = 0.13; vol = 0.07; break;
      case 'hit': f = 90; dur = 0.2; vol = 0.10; type = 'square'; break;
      case 'top': f = 660; dur = 0.5; vol = 0.09; break;
      case 'place': f = 500; dur = 0.06; vol = 0.05; break;
      case 'deny': f = 170; dur = 0.1; vol = 0.06; type = 'square'; break;
    }
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (kind === 'top') {
      o.frequency.setValueAtTime(523, t);
      o.frequency.setValueAtTime(659, t + 0.14);
      o.frequency.setValueAtTime(784, t + 0.28);
    } else if (kind === 'slip' || kind === 'pump') {
      o.frequency.exponentialRampToValueAtTime(Math.max(40, f * 0.4), t + dur);
    }
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.02);
  };

  /* ------------------------------------------------------------------ helpers */

  Game.prototype.toast = function (msg) {
    this.toasts.push({ msg: msg, t: 0, life: 2.0 });
    if (this.toasts.length > 5) this.toasts.shift();
  };

  Game.prototype.shake = function (n) {
    this.cam.shake = Math.max(this.cam.shake, n);
  };

  Game.prototype.togglePause = function () {
    if (this.mode === 'menu') return;
    if (this.placement) { this.cancelPlacement(); return; }
    this.paused = !this.paused;
    this.ui.showPause(this.paused);
  };

  /* -------------------------------------------------------------- mode setup */

  Game.prototype.startTutorial = function () {
    this.mode = 'tutorial';
    this.storyLevel = RS.TUTORIAL_LEVEL;
    this.storyIndex = -1;
    this.solver.reset();
    RS.buildWorld(this, RS.TUTORIAL_LEVEL);
    this.spawnClimber(this.storyPlayer);
    this.tutorial = new RS.Tutorial(this);
    this.phase = 'run';
    this.runTime = 0;
    this.runLimit = Infinity;
    this.cam.free = false;
    this.paused = false;
    this.match = null;
    this.ui.showScreen(null);
  };

  Game.prototype.startStory = function (levelIndex) {
    this.mode = 'story';
    this.tutorial = null;
    this.storyIndex = levelIndex;
    this.storyLevel = RS.STORY_LEVELS[levelIndex];
    this.solver.reset();
    RS.buildWorld(this, this.storyLevel);
    this.spawnClimber(this.storyPlayer);
    this.phase = 'run';
    this.runTime = 0;
    this.runLimit = Infinity;
    this.cam.free = false;
    this.paused = false;
    this.ui.showScreen(null);
    this.ui.setLevelBanner(this.storyLevel);
    this.match = null;
  };

  Game.prototype.startParty = function (wallIndex, players, target) {
    this.mode = 'party';
    this.tutorial = null;
    this.solver.reset();
    RS.buildWorld(this, RS.PARTY_WALLS[wallIndex]);
    this.match = new RS.Match(this, {
      wall: RS.PARTY_WALLS[wallIndex],
      players: players,
      target: target
    });
    this.climber = null;
    this.ui.showScreen(null);
    this.beginBuildPhase();
    this.paused = false;
  };

  Game.prototype.startFreeBuild = function (wallIndex) {
    this.mode = 'freebuild';
    this.tutorial = null;
    this.solver.reset();
    var def = wallIndex < RS.PARTY_WALLS.length
      ? RS.PARTY_WALLS[wallIndex]
      : RS.STORY_LEVELS[wallIndex - RS.PARTY_WALLS.length];
    RS.buildWorld(this, def);
    this.match = null;
    this.climber = null;
    this.freeHand = null;
    this.beginBuildPhase();
    this.ui.showScreen(null);
    this.paused = false;
  };

  Game.prototype.spawnClimber = function (playerInfo) {
    if (this.climber) this.climber.destroy();
    var prof = playerInfo && playerInfo.profile ? playerInfo.profile : RS.PROFILES[0];
    this.climber = new RS.Climber(this, {
      x: this.world.start.x,
      y: this.world.start.y,
      profile: prof,
      playerIndex: playerInfo && playerInfo.index !== undefined ? playerInfo.index : 0
    });
    this.climberInfo = playerInfo;
    if (!this.input.aimed) {
      this.input.mx = this.climber.chest.x;
      this.input.my = this.climber.chest.y - 26;
    }
    this.cam.free = false;
    this.cam.x = this.cam.tx = this.world.start.x;
    this.cam.y = this.cam.ty = this.world.start.y - 60;
  };

  Game.prototype.restartRun = function () {
    if (!this.climber) return;
    this.climber.destroy();
    this.spawnClimber(this.climberInfo);
    this.runTime = 0;
    this.toast('Restarted');
  };

  /* ------------------------------------------------------------- build phase */

  Game.prototype.beginBuildPhase = function () {
    this.phase = 'build';
    this.cam.free = true;
    this.placement = null;
    if (this.climber) { this.climber.destroy(); this.climber = null; }
    if (this.match) {
      this.match.beginRound();
      this.cam.tx = this.world.start.x;
      this.cam.ty = this.world.start.y - 200;
      this.toast('Round ' + this.match.round + ' - set your change');
    } else {
      this.cam.tx = this.world.start.x;
      this.cam.ty = this.world.start.y - 200;
    }
    this.ui.syncBuild();
  };

  Game.prototype.beginPlacement = function (card) {
    this.placement = { card: card, stage: 0, sel: {}, msg: '', ok: false };
    this.updateSel();
  };

  Game.prototype.cancelPlacement = function () {
    this.placement = null;
    this.ui.syncBuild();
  };

  Game.prototype.placementBack = function () {
    var pl = this.placement;
    if (!pl) return;
    if (pl.stage > 0) { pl.stage--; if (pl.stage === 0) { pl.sel.hold = null; pl.sel.hold2 = null; } }
    else this.cancelPlacement();
  };

  /* Keep the live selection in step with the cursor for the current stage. */
  Game.prototype.updateSel = function () {
    var pl = this.placement;
    if (!pl) return;
    var card = pl.card, sel = pl.sel;
    var mx = this.input.mx, my = this.input.my;
    var holds = this.world.holds;
    var notProtected = function (h) { return !h.protected && !h.dynamic; };

    switch (card.mode) {
      case 'point':
        sel.x = mx; sel.y = my;
        break;
      case 'pointAngle':
        if (pl.stage === 0) { sel.x = mx; sel.y = my; sel.angle = 0; }
        else sel.angle = Math.atan2(my - sel.y, mx - sel.x);
        break;
      case 'segment':
        if (pl.stage === 0) { sel.x = mx; sel.y = my; sel.x2 = mx; sel.y2 = my; }
        else { sel.x2 = mx; sel.y2 = my; }
        break;
      case 'hold':
        sel.hold = RS.pickHold(holds, mx, my, 34, notProtected);
        if (sel.hold) { sel.x = sel.hold.x; sel.y = sel.hold.y; }
        break;
      case 'holdAngle':
        if (pl.stage === 0) {
          sel.hold = RS.pickHold(holds, mx, my, 34, notProtected);
          if (sel.hold) { sel.x = sel.hold.x; sel.y = sel.hold.y; }
        } else {
          sel.angle = Math.atan2(my - sel.hold.y, mx - sel.hold.x);
          sel.x = sel.hold.x; sel.y = sel.hold.y;
        }
        break;
      case 'holdMove':
        if (pl.stage === 0) {
          sel.hold = RS.pickHold(holds, mx, my, 34, notProtected);
          sel.placed = false;
          if (sel.hold) { sel.x = sel.hold.x; sel.y = sel.hold.y; }
        } else {
          sel.placed = true;
          var d = RS.dist(sel.hold.baseX, sel.hold.baseY, mx, my);
          if (d > card.moveRadius) {
            var a = Math.atan2(my - sel.hold.baseY, mx - sel.hold.baseX);
            sel.x = sel.hold.baseX + Math.cos(a) * card.moveRadius;
            sel.y = sel.hold.baseY + Math.sin(a) * card.moveRadius;
          } else { sel.x = mx; sel.y = my; }
        }
        break;
      case 'twoHolds':
        if (pl.stage === 0) {
          sel.hold = RS.pickHold(holds, mx, my, 34, notProtected);
          sel.hold2 = null;
        } else {
          var self2 = sel.hold;
          sel.hold2 = RS.pickHold(holds, mx, my, 34, function (h) { return notProtected(h) && h !== self2; });
        }
        if (sel.hold) { sel.x = sel.hold.x; sel.y = sel.hold.y; }
        break;
    }

    var ctx = { playerIndex: this.match ? (this.match.currentBuilder() || { index: 0 }).index : 0, round: this.match ? this.match.round : 1 };
    var res = RS.checkPlacement(this.world, card, sel, ctx);
    pl.ok = res === true;
    pl.msg = res === true ? '' : res;
    pl.ctx = ctx;
  };

  Game.prototype.placementClick = function () {
    var pl = this.placement;
    if (!pl) return;
    var card = pl.card;
    var stages = { point: 1, pointAngle: 2, segment: 2, hold: 1, holdAngle: 2, holdMove: 2, twoHolds: 2 };
    var need = stages[card.mode] || 1;

    /* first click of a multi-stage placement only needs the target to exist */
    if (pl.stage < need - 1) {
      var firstOk = true;
      if (card.mode === 'hold' || card.mode === 'holdAngle' || card.mode === 'holdMove' || card.mode === 'twoHolds') {
        firstOk = !!pl.sel.hold;
      } else if (card.mode === 'point' || card.mode === 'pointAngle' || card.mode === 'segment') {
        firstOk = pl.ok || pl.msg === 'Too short' || pl.msg === 'Now pick a second hold' || pl.msg === 'Needs a slope to run down';
      }
      if (!firstOk) { this.sfx('deny'); this.toast(pl.msg || 'Pick a target'); return; }
      pl.stage++;
      this.updateSel();
      return;
    }

    this.updateSel();
    if (!pl.ok) { this.sfx('deny'); this.toast(pl.msg || 'Cannot place that there'); return; }

    if (this.match) {
      var r = this.match.commitCard(card, pl.sel);
      if (r !== true) { this.sfx('deny'); this.toast(r); return; }
    } else {
      /* free build: no turn order, just place it */
      RS.applyCard(this, card, pl.sel, { playerIndex: 0, round: 1 });
    }
    this.sfx('place');
    this.placement = null;
    if (this.match && this.match.phase === 'climb') {
      this.cam.free = false;
    }
    this.ui.syncBuild();
  };

  /* ------------------------------------------------------------------- update */

  Game.prototype.update = function (dt) {
    this.wallTime += dt;

    if (this.phase === 'build') {
      if (this.placement) this.updateSel();
      /* edge-nudge panning while placing */
      if (this.placement) {
        var m = 70;
        if (this.input.sy < m) this.cam.ty -= (m - this.input.sy) * 3.2 * dt;
        if (this.input.sy > this.vh - m) this.cam.ty += (this.input.sy - (this.vh - m)) * 3.2 * dt;
        if (this.input.sx < m) this.cam.tx -= (m - this.input.sx) * 3.2 * dt;
        if (this.input.sx > this.vw - m) this.cam.tx += (this.input.sx - (this.vw - m)) * 3.2 * dt;
      }
      /* the world still ticks so moving holds and hazards animate while you set */
      var steps = 0;
      this.accum += dt;
      while (this.accum >= FIXED && steps < 4) { this.solver.step(FIXED); this.accum -= FIXED; steps++; }
      RS.updateProps(this, dt, this.solver.time);
    } else if (this.phase === 'run' && this.climber) {
      this.runTime += dt;
      /* Neutral aim until the player moves the mouse, so the climber stands
         still instead of reaching for the corner of the world. */
      if (!this.input.aimed) {
        this.input.mx = this.climber.chest.x;
        this.input.my = this.climber.chest.y - 26;
      }
      var st = 0;
      this.accum += dt;
      while (this.accum >= FIXED && st < 5) {
        this.climber.update(FIXED, this.input, true);
        this.solver.step(FIXED);
        this.accum -= FIXED;
        st++;
      }
      RS.updateProps(this, dt, this.solver.time);
      if (this.tutorial) this.tutorial.update(dt);
      this.checkRunEnd();
    } else {
      this.accum = 0;
    }

    this.updateCamera(dt);

    for (var i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].t += dt;
      if (this.toasts[i].t > this.toasts[i].life) this.toasts.splice(i, 1);
    }
    this.ui.sync();
  };

  Game.prototype.checkRunEnd = function () {
    var cl = this.climber;
    if (this.mode === 'tutorial') {
      if (this.tutorial && this.tutorial.finished && this.phase === 'run') {
        this.phase = 'complete';
        RS.storage.set('tutorialDone', true);
        this.ui.showTutorialComplete(this.runTime);
      }
      return;
    }
    if (this.mode === 'story') {
      if (cl.topped && this.phase === 'run') {
        this.phase = 'complete';
        var best = this.progress.best[this.storyLevel.id];
        if (!best || this.runTime < best) this.progress.best[this.storyLevel.id] = this.runTime;
        if (this.progress.unlocked < this.storyIndex + 2) this.progress.unlocked = this.storyIndex + 2;
        RS.storage.set('progress', this.progress);
        this.ui.showLevelComplete(this.storyLevel, this.runTime, cl);
      }
      return;
    }
    if (this.mode === 'party' && this.match) {
      if (cl.topped) { this.endPartyRun('topped'); return; }
      if (this.runTime >= this.runLimit) { this.endPartyRun('time'); return; }
      return;
    }
    if (this.mode === 'freebuild' && cl.topped && this.phase === 'run') {
      this.phase = 'complete';
      this.ui.showFreeComplete(this.runTime, cl);
    }
  };

  Game.prototype.endPartyRun = function (reason) {
    var self = this;
    this.phase = 'between';
    var msg = reason === 'topped' ? 'Topped out!' : 'Out of time';
    this.toast(msg);
    setTimeout(function () {
      var m = self.match;
      m.endRun(reason);
      if (m.phase === 'score' || m.phase === 'won') {
        self.cam.free = true;
        self.ui.showRoundResults(m);
      }
    }, reason === 'topped' ? 1400 : 800);
  };

  Game.prototype.nextRound = function () {
    if (!this.match) return;
    if (this.match.phase === 'won') { this.ui.showMatchWinner(this.match); return; }
    this.beginBuildPhase();
    this.ui.showScreen(null);
  };

  /* ------------------------------------------------------------------ camera */

  Game.prototype.updateCamera = function (dt) {
    var cam = this.cam;
    var b = this.world ? this.world.bounds : null;

    /* fit the wall width, then a bit of headroom */
    var zw = this.vw / 780;
    var zh = this.vh / 620;
    cam.zoom = clamp(Math.min(zw, zh) * 1.18, 0.62, 1.7);

    if (!cam.free && this.climber) {
      var cl = this.climber;
      var lead = (cl.chest.y - cl.chest.py) * 6;
      cam.tx = cl.chest.x * 0.72 + cl.head.x * 0.28;
      cam.ty = cl.chest.y - 40 + clamp(lead, -70, 70);
    }

    if (b) {
      var halfW = this.vw / 2 / cam.zoom;
      var halfH = this.vh / 2 / cam.zoom;
      var minX = b.x + halfW, maxX = b.x + b.w - halfW;
      cam.tx = minX > maxX ? b.x + b.w / 2 : clamp(cam.tx, minX, maxX);
      cam.ty = clamp(cam.ty, b.y + halfH * 0.55, b.y + b.h - halfH);
    }

    var rate = cam.free ? 14 : 9;
    cam.x = RS.approach(cam.x, cam.tx, rate, dt);
    cam.y = RS.approach(cam.y, cam.ty, rate, dt);
    /* NaN in the camera is unrecoverable and breaks every draw call, so snap
       back to the target rather than smearing it across the next frame. */
    if (!isFinite(cam.x)) cam.x = cam.tx;
    if (!isFinite(cam.y)) cam.y = cam.ty;

    if (cam.shake > 0) cam.shake = Math.max(0, cam.shake - dt * 26);
  };

  /* ------------------------------------------------------------------ render */

  Game.prototype.render = function (dt) {
    var ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.vw, this.vh);

    if (!this.world) {
      RS.drawSky(ctx, { x: 0, y: -600 }, this.vw, this.vh, 'alpine', this.wallTime);
      return;
    }

    var cam = this.cam;
    RS.drawSky(ctx, cam, this.vw, this.vh, this.world.theme, this.wallTime);

    var shx = cam.shake ? (Math.random() - 0.5) * cam.shake : 0;
    var shy = cam.shake ? (Math.random() - 0.5) * cam.shake : 0;

    ctx.save();
    ctx.translate(this.vw / 2 + shx, this.vh / 2 + shy);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    var t = this.wallTime;
    RS.drawWall(ctx, this.world, cam, this.vw, this.vh);
    RS.drawZonesBack(ctx, this.world, t);
    RS.drawTerrain(ctx, this.world);
    RS.drawProps(ctx, this.world, t);
    RS.drawHolds(ctx, this.world, t, this.match ? this.match.round : undefined);
    RS.drawStartFinish(ctx, this.world, t);

    if (this.climber) {
      var tag = null, tagColor = null;
      if (this.mode === 'party' && this.climberInfo) {
        tag = this.climberInfo.name;
        tagColor = this.climberInfo.color;
      }
      RS.drawClimber(ctx, this.climber, dt, { tag: tag, tagColor: tagColor });
    }

    RS.drawZonesFront(ctx, this.world, t);

    if (this.phase === 'build') this.renderPlacement(ctx, t);
    if (this.tutorial) this.renderTutorialFocus(ctx, t);

    ctx.restore();

    this.renderOverlay(ctx, dt);
  };

  /* Ghost preview of whatever the player is about to bolt on. */
  Game.prototype.renderPlacement = function (ctx, t) {
    var pl = this.placement;
    if (!pl) return;
    var card = pl.card, sel = pl.sel;

    ctx.save();

    /* target highlight for modifier cards */
    if (sel.hold) {
      ctx.strokeStyle = pl.ok ? 'rgba(120,220,140,0.9)' : 'rgba(255,120,100,0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(sel.hold.x, sel.hold.y, sel.hold.r + 9, 0, RS.TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (sel.hold2) {
      ctx.strokeStyle = 'rgba(120,200,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sel.hold2.x, sel.hold2.y, sel.hold2.r + 9, 0, RS.TAU); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sel.hold.x, sel.hold.y); ctx.lineTo(sel.hold2.x, sel.hold2.y);
      ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);
    }

    /* move radius ring */
    if (card.mode === 'holdMove' && sel.hold) {
      ctx.strokeStyle = 'rgba(255,220,120,0.35)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(sel.hold.baseX, sel.hold.baseY, card.moveRadius, 0, RS.TAU); ctx.stroke();
      ctx.setLineDash([]);
      if (pl.stage > 0) {
        ctx.globalAlpha = 0.6;
        RS.drawHold(ctx, {
          hid: 'ghost', type: sel.hold.type, x: sel.x, y: sel.y, baseX: sel.x, baseY: sel.y,
          r: sel.hold.r, angle: sel.hold.angle, greased: sel.hold.greased, chalked: sel.hold.chalked,
          wear: 0, wobble: 0, seed: sel.hold.seed, magnet: sel.hold.magnet, bonus: sel.hold.bonus,
          rest: sel.hold.rest, dead: false, motion: null
        }, t, { ghost: true });
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(sel.hold.baseX, sel.hold.baseY); ctx.lineTo(sel.x, sel.y);
        ctx.stroke(); ctx.setLineDash([]);
      }
    }

    /* rotation dial */
    if ((card.mode === 'pointAngle' || card.mode === 'holdAngle') && pl.stage > 0) {
      ctx.strokeStyle = 'rgba(255,230,150,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sel.x, sel.y);
      ctx.lineTo(sel.x + Math.cos(sel.angle) * 52, sel.y + Math.sin(sel.angle) * 52);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sel.x, sel.y, 52, 0, RS.TAU);
      ctx.strokeStyle = 'rgba(255,230,150,0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    /* segment rubber band */
    if (card.mode === 'segment' && pl.stage > 0) {
      ctx.strokeStyle = pl.ok ? 'rgba(150,235,170,0.85)' : 'rgba(255,130,110,0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.moveTo(sel.x, sel.y); ctx.lineTo(sel.x2, sel.y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '600 11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(Math.round(RS.dist(sel.x, sel.y, sel.x2, sel.y2)) + 'px',
        (sel.x + sel.x2) / 2, (sel.y + sel.y2) / 2 - 8);
    }

    /* ghost entities from the card itself */
    if (card.make && sel.x !== undefined) {
      var out = RS.previewCard(this.world, card, sel, pl.ctx);
      ctx.globalAlpha = pl.ok ? 0.68 : 0.35;
      var i;
      for (i = 0; i < out.terrain.length; i++) {
        ctx.save();
        ctx.strokeStyle = pl.ok ? 'rgba(180,230,255,0.9)' : 'rgba(255,140,120,0.9)';
        ctx.fillStyle = 'rgba(200,220,240,0.30)';
        ctx.lineWidth = 1.6;
        RS.pathShape(ctx, out.terrain[i], 0, 0);
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      for (i = 0; i < out.zones.length; i++) {
        var z = out.zones[i];
        ctx.save();
        ctx.strokeStyle = pl.ok ? 'rgba(150,220,255,0.85)' : 'rgba(255,140,120,0.85)';
        ctx.fillStyle = 'rgba(120,200,255,0.10)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        if (z.shape === 'circle') ctx.arc(z.x, z.y, z.r, 0, RS.TAU);
        else {
          ctx.translate(z.x, z.y); ctx.rotate(z.angle || 0);
          ctx.rect(-z.w / 2, -z.h / 2, z.w, z.h);
        }
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      for (i = 0; i < out.props.length; i++) {
        var p = out.props[i];
        ctx.save();
        ctx.strokeStyle = 'rgba(255,235,170,0.85)';
        ctx.fillStyle = 'rgba(255,235,170,0.22)';
        ctx.lineWidth = 1.6;
        if (p.x1 !== undefined) {
          ctx.setLineDash([6, 5]);
          ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
          ctx.setLineDash([]);
        }
        if (p.x !== undefined) {
          ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, RS.TAU); ctx.fill(); ctx.stroke();
          if (p.kind === 'rope') {
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x, p.y + (p.segs || 9) * (p.segLen || 15));
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
        ctx.restore();
      }
      for (i = 0; i < out.holds.length; i++) {
        RS.drawHold(ctx, out.holds[i], t, { ghost: true });
      }
      ctx.globalAlpha = 1;
    }

    /* crosshair + reason */
    var cx = sel.x !== undefined ? sel.x : this.input.mx;
    var cy = sel.y !== undefined ? sel.y : this.input.my;
    ctx.strokeStyle = pl.ok ? 'rgba(150,235,170,0.7)' : 'rgba(255,130,110,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy); ctx.lineTo(cx - 4, cy);
    ctx.moveTo(cx + 4, cy); ctx.lineTo(cx + 12, cy);
    ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy - 4);
    ctx.moveTo(cx, cy + 4); ctx.lineTo(cx, cy + 12);
    ctx.stroke();

    if (pl.msg) {
      ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      var w = ctx.measureText(pl.msg).width + 16;
      ctx.fillStyle = 'rgba(30,10,10,0.82)';
      RS.roundRect(ctx, cx - w / 2, cy + 20, w, 20, 6);
      ctx.fill();
      ctx.fillStyle = '#ffb3a3';
      ctx.fillText(pl.msg, cx, cy + 34);
    }

    ctx.restore();
  };

  /* Pulsing ring around whatever the current tutorial step is talking about. */
  Game.prototype.renderTutorialFocus = function (ctx, t) {
    var p = this.tutorial.focusPoint();
    if (!p) return;
    var pulse = 0.5 + 0.5 * Math.sin(t * 3.4);
    ctx.save();
    ctx.strokeStyle = RS.rgba('#ffd166', 0.35 + pulse * 0.45);
    ctx.lineWidth = 2.2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 26 + pulse * 7, 0, RS.TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = RS.rgba('#ffd166', 0.18);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 40 + pulse * 10, 0, RS.TAU);
    ctx.stroke();
    ctx.restore();
  };

  /* Screen-space extras: toasts, timer ring, minimap, run banner. */
  Game.prototype.renderOverlay = function (ctx, dt) {
    var i;

    /* fog vignette when the climber is inside a fog bank */
    if (this.climber) {
      var fog = Math.max(this.climber.chest.zoneFog, this.climber.head.zoneFog);
      if (fog > 0.01) {
        var fg = ctx.createRadialGradient(this.vw / 2, this.vh / 2, this.vh * 0.12,
          this.vw / 2, this.vh / 2, this.vh * 0.75);
        fg.addColorStop(0, 'rgba(226,235,244,0)');
        fg.addColorStop(1, 'rgba(226,235,244,' + (0.72 * fog) + ')');
        ctx.fillStyle = fg;
        ctx.fillRect(0, 0, this.vw, this.vh);
      }
      /* red edges when you are about to be pumped */
      if (this.climber.stamina < 30) {
        var p = 1 - this.climber.stamina / 30;
        var vg = ctx.createRadialGradient(this.vw / 2, this.vh / 2, this.vh * 0.28,
          this.vw / 2, this.vh / 2, this.vh * 0.8);
        vg.addColorStop(0, 'rgba(160,20,20,0)');
        vg.addColorStop(1, 'rgba(160,20,20,' + (0.42 * p) + ')');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, this.vw, this.vh);
      }
    }

    /* build-mode minimap down the right edge */
    if (this.phase === 'build' && this.world) this.renderMinimap(ctx);

    /* toasts */
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif';
    for (i = 0; i < this.toasts.length; i++) {
      var t2 = this.toasts[i];
      var a = t2.t < 0.2 ? t2.t / 0.2 : clamp((t2.life - t2.t) / 0.5, 0, 1);
      var y = this.vh - 118 - i * 26;
      var w = ctx.measureText(t2.msg).width + 26;
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = 'rgba(10,14,20,0.78)';
      RS.roundRect(ctx, this.vw / 2 - w / 2, y - 15, w, 24, 8);
      ctx.fill();
      ctx.fillStyle = '#e8eef5';
      ctx.fillText(t2.msg, this.vw / 2, y + 2);
    }
    ctx.restore();
  };

  Game.prototype.renderMinimap = function (ctx) {
    var b = this.world.bounds;
    var mw = 16, mh = Math.min(this.vh - 200, 420);
    var mx = this.vw - 34, my = (this.vh - mh) / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(8,12,18,0.6)';
    RS.roundRect(ctx, mx, my, mw, mh, 8);
    ctx.fill();

    var toMap = function (wy) { return my + (wy - b.y) / b.h * mh; };

    /* holds as pips */
    for (var i = 0; i < this.world.holds.length; i++) {
      var h = this.world.holds[i];
      if (h.dead) continue;
      var T = RS.HOLD_TYPES[h.type];
      ctx.fillStyle = RS.rgba(T.palette[0], 0.8);
      var hx = mx + 3 + (h.x - b.x) / b.w * (mw - 6);
      ctx.fillRect(hx - 1, toMap(h.y) - 1, 2, 2);
    }
    /* zones as bands */
    for (i = 0; i < this.world.zones.length; i++) {
      var z = this.world.zones[i];
      var zh = z.shape === 'circle' ? z.r * 2 : z.h;
      ctx.fillStyle = 'rgba(120,200,255,0.22)';
      ctx.fillRect(mx + 1, toMap(z.y - zh / 2), mw - 2, Math.max(2, zh / b.h * mh));
    }
    /* finish + start */
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(mx, toMap(this.world.finish.y) - 1.5, mw, 3);
    ctx.fillStyle = '#8fd6a0';
    ctx.fillRect(mx, toMap(this.world.start.y) - 1.5, mw, 3);

    /* camera window */
    var halfH = this.vh / 2 / this.cam.zoom;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.4;
    RS.roundRect(ctx, mx - 2, toMap(this.cam.y - halfH), mw + 4, Math.max(6, (halfH * 2) / b.h * mh), 3);
    ctx.stroke();
    ctx.restore();
  };

  /* -------------------------------------------------------------------- loop */

  Game.prototype.loop = function (now) {
    requestAnimationFrame(this.loop);
    if (!this.last) this.last = now;
    /* Clamp both ends. An out-of-order or backwards frame timestamp (tab
       switches, clock adjustments) would otherwise give a negative dt, and
       RS.approach turns that into exp(+large) = Infinity, which poisons the
       camera with NaN permanently and takes the renderer down with it. */
    var dt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    this.frame++;
    this.resize();

    if (!this.paused) this.update(dt);
    this.render(this.paused ? 0 : dt);
  };

  RS.Game = Game;

})(window.RS);

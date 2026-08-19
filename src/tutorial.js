/* ROUTESETTERS - tutorial.js
 * A purpose-built wall plus an ordered list of steps that each verify the player
 * actually did the thing before moving on. Hold spacing is inside the measured
 * comfortable reach envelope (<= 40px) so no step can be physically blocked, and
 * every step exposes a skip after a while so nobody gets stuck regardless.
 */
(function (RS) {
  'use strict';

  var W = 660, CX = 330;

  /* ------------------------------------------------------------------- wall */

  var HEIGHT = 640;

  /* Hand holds, bottom to top, roughly 28-32px apart. The section labels line up
     with the steps below. */
  var LADDER = [
    /* warm-up: plain jugs, starting directly above the left starting jug */
    ['jug', 292, -80], ['jug', 318, -106], ['jug', 292, -134], ['jug', 318, -160],
    /* a shelf to stand on and shake out */
    ['restledge', 330, -192],
    /* crimps: the grip bar visibly drops */
    ['crimp', 352, -220], ['crimp', 326, -248], ['crimp', 300, -274],
    /* second shelf, so the bar visibly recovers */
    ['restledge', 326, -302],
    /* a sloper: holds you still, spits you off swinging */
    ['sloper', 350, -330], ['jug', 324, -358], ['jug', 298, -384],
    /* one committing move at the top of the comfortable band */
    ['jug', 326, -412],
    /* run to the top */
    ['jug', 352, -440], ['jug', 326, -466], ['jug', 300, -492],
    ['jug', 326, -520], ['jug', 330, -548]
  ];

  var FEET = [
    ['footchip', 320, -56], ['footchip', 292, -84], ['footchip', 322, -110],
    ['footchip', 294, -138], ['footchip', 322, -166],
    ['footchip', 300, -200], ['footchip', 326, -226], ['footchip', 300, -252],
    ['footchip', 326, -280], ['footchip', 300, -308], ['footchip', 326, -336],
    ['footchip', 300, -364], ['footchip', 326, -390], ['footchip', 300, -418],
    ['footchip', 326, -446], ['footchip', 300, -472], ['footchip', 326, -500],
    ['footchip', 300, -526]
  ];

  var TUTORIAL = {
    id: 'tutorial',
    name: 'Learning the Ropes',
    subtitle: 'Nine steps. Nothing here can kill you.',
    theme: 'gym',
    grade: 'intro',
    height: HEIGHT,
    par: 200,
    tutorial: true,
    holds: LADDER.concat(FEET),
    zones: [],
    props: [
      { kind: 'checkpoint', x: CX, y: -300, r: 46 }
    ],
    bounds: { x: 0, y: -HEIGHT - 40, w: W, h: HEIGHT + 460 },
    start: { x: CX, y: -14 },
    finish: { x: CX, y: -HEIGHT + 58, r: 40 },
    terrain: [
      { type: 'rect', x: -300, y: 0, w: W + 600, h: 420, mat: 'rock' },
      { type: 'capsule', x1: CX - 58, y1: 44, x2: CX + 58, y2: 44, r: 8, mat: 'rock' },
      { type: 'capsule', x1: CX - 76, y1: -HEIGHT + 96, x2: CX + 76, y2: -HEIGHT + 96, r: 10, mat: 'granite' }
    ]
  };

  RS.TUTORIAL_LEVEL = TUTORIAL;

  /* ------------------------------------------------------------------ steps
   * check(g, cl, st) -> true when satisfied. st.t is seconds on this step.
   * dwell            -> informational, auto-advances after N seconds.
   * focus            -> world point to draw an attention ring around.
   */
  var STEPS = [
    {
      id: 'grip',
      title: 'Close your left hand',
      text: 'The mouse is where you are reaching. Hold the <b>left mouse button</b> to close your left hand. There are two jugs right in front of you.',
      focus: function (g) { return { x: 292, y: -48 }; },
      check: function (g, cl) { return !!cl.limbs.handL.hold; }
    },
    {
      id: 'pullup',
      title: 'Now pull up on it',
      text: 'Keep the button held and move the mouse <b>above</b> that hold. The arm contracts and hauls your body up. Move the mouse <b>below</b> it and the arm pays out so you hang long and rest.',
      enter: function (g, cl, st) { st.baseY = cl.chest.y; },
      check: function (g, cl, st) { return cl.chest.y < st.baseY - 20; }
    },
    {
      id: 'reach',
      title: 'Reach with the other hand',
      text: 'Aim at the next hold up and hold the <b>right mouse button</b>. Your hand travels to whatever you are pointing at, so point carefully.',
      focus: function (g) { return { x: 292, y: -80 }; },
      check: function (g, cl) {
        var h = cl.limbs.handR.hold;
        return !!h && h.y < -70;
      }
    },
    {
      id: 'swap',
      title: 'Let the low hand go and repeat',
      text: 'That is the whole game: latch, pull the mouse up, throw the free hand at the next hold, release the low one. Climb up to the flat shelf.',
      focus: function (g) { return { x: 330, y: -192 }; },
      check: function (g, cl) { return cl.chest.y < -182; }
    },
    {
      id: 'feet',
      title: 'Your feet do their own thing',
      text: 'Look down. Your feet find those small chips and high-step onto them by themselves, and that is most of where your reach comes from. Standing on something halves how fast your arms tire.',
      dwell: 7,
      check: function (g, cl, st) { return st.t > 2.5 && cl.footCount() > 0; }
    },
    {
      id: 'crimps',
      title: 'Mind the grip bar',
      text: 'The small red edges above are <b>crimps</b>. Watch the GRIP bar top-left as you hang on them. At zero your hands open whether you like it or not. Climb past them to the next shelf.',
      focus: function (g) { return { x: 326, y: -248 }; },
      check: function (g, cl) { return cl.chest.y < -292; }
    },
    {
      id: 'rest',
      title: 'Shelves give it back',
      text: 'Stand on a shelf and your grip refills fast. You also just clipped a quickdraw, so a fall now puts you back here instead of on the floor.',
      dwell: 6,
      check: function (g, cl, st) { return st.t > 3; }
    },
    {
      id: 'sloper',
      title: 'The purple blob is a sloper',
      text: 'Slopers hold you when you are <b>still</b> and spit you off the moment you swing. Kill the swing, then move. Getting your feet on helps a lot.',
      focus: function (g) { return { x: 350, y: -330 }; },
      check: function (g, cl) { return cl.chest.y < -376; }
    },
    {
      id: 'dyno',
      title: 'Kick off your feet',
      text: 'Press <b>space</b> to explode off your feet for a dyno. Use it for gaps you cannot reach statically. Try one now.',
      check: function (g, cl) { return cl.dynoCount > 0; }
    },
    {
      id: 'top',
      title: 'Ring the bell',
      text: 'Climb to the anchor at the top. If you fall you just slide down and start again from your clip, so there is nothing to lose. <b>R</b> restarts, <b>Esc</b> pauses.',
      focus: function (g) { return g.world.finish; },
      check: function (g, cl) { return cl.topped; }
    }
  ];

  RS.TUTORIAL_STEPS = STEPS;

  /* --------------------------------------------------------------- controller */

  function Tutorial(game) {
    this.game = game;
    this.index = 0;
    this.st = { t: 0 };
    this.doneFlash = 0;
    this.finished = false;
    this.enterStep();
  }

  Tutorial.prototype.step = function () { return STEPS[this.index] || null; };

  Tutorial.prototype.enterStep = function () {
    this.st = { t: 0 };
    var s = this.step();
    if (s && s.enter && this.game.climber) s.enter(this.game, this.game.climber, this.st);
  };

  Tutorial.prototype.advance = function () {
    if (this.index >= STEPS.length - 1) {
      this.finished = true;
      this.index = STEPS.length;
      RS.storage.set('tutorialDone', true);
      return;
    }
    this.index++;
    this.doneFlash = 0;
    this.enterStep();
  };

  Tutorial.prototype.update = function (dt) {
    if (this.finished) return;
    var s = this.step();
    if (!s) return;
    this.st.t += dt;
    var cl = this.game.climber;
    if (!cl) return;

    if (this.doneFlash > 0) {
      this.doneFlash -= dt;
      if (this.doneFlash <= 0) this.advance();
      return;
    }

    var satisfied = false;
    try {
      if (s.check) satisfied = !!s.check(this.game, cl, this.st);
      else if (s.dwell) satisfied = this.st.t >= s.dwell;
    } catch (e) { satisfied = false; }
    /* informational steps also time out on their own */
    if (!satisfied && s.dwell && this.st.t >= s.dwell) satisfied = true;

    if (satisfied) {
      this.doneFlash = 0.85;
      this.game.sfx && this.game.sfx('place');
    }
  };

  /* Steps expose a skip once they have been on screen a while, so a player who
     cannot make one particular move is never hard-stuck. */
  Tutorial.prototype.canSkipStep = function () {
    return !this.finished && this.st.t > 20;
  };

  Tutorial.prototype.progress = function () {
    return { index: Math.min(this.index, STEPS.length), total: STEPS.length };
  };

  /* Attention ring for the current step. */
  Tutorial.prototype.focusPoint = function () {
    var s = this.step();
    if (!s || !s.focus) return null;
    try { return s.focus(this.game); } catch (e) { return null; }
  };

  RS.Tutorial = Tutorial;

})(window.RS);

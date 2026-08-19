/* ROUTESETTERS - party.js
 * Ultimate Chicken Horse in a climbing gym. Local hotseat: everybody sets one
 * change to the route, then everybody tries to climb the thing they just ruined.
 * Points for topping out, more if you're the only one who managed it.
 */
(function (RS) {
  'use strict';

  var TARGET_DEFAULT = 8;
  var CLIMB_SECONDS = 75;

  function Match(game, opts) {
    this.game = game;
    this.wallDef = opts.wall;
    this.target = opts.target || TARGET_DEFAULT;
    this.climbSeconds = opts.climbSeconds || CLIMB_SECONDS;
    this.rng = new RS.Rng(opts.seed || (Date.now() & 0x7fffffff));
    this.cardsPerHand = opts.cardsPerHand || 3;

    this.players = opts.players.map(function (p, i) {
      return {
        index: i,
        name: p.name,
        profile: p.profile,
        color: p.color,
        score: 0,
        used: {},              // card id -> count, for per-match limits
        placed: 0,
        /* per-round */
        topped: false,
        time: null,
        high: 0,
        box: false,
        deaths: 0,
        lastGain: 0,
        lastReasons: []
      };
    });

    this.round = 0;
    this.phase = 'intro';
    this.firstBuilder = 0;
    this.buildQueue = [];
    this.buildIndex = 0;
    this.hand = [];
    this.climbQueue = [];
    this.climbIndex = 0;
    this.snapshot = null;
    this.log = [];
    this.winner = null;
    this.lastRoundSummary = null;
  }

  /* ------------------------------------------------------------------- build */

  Match.prototype.beginRound = function () {
    this.round++;
    this.phase = 'build';
    var i;
    for (i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      p.topped = false; p.time = null; p.high = 0; p.box = false;
      p.deaths = 0; p.lastGain = 0; p.lastReasons = [];
    }
    /* build order rotates each round so nobody is always last to place */
    this.buildQueue = [];
    for (i = 0; i < this.players.length; i++) {
      this.buildQueue.push((this.firstBuilder + i) % this.players.length);
    }
    this.buildIndex = 0;
    this.dealHand();
  };

  Match.prototype.currentBuilder = function () {
    if (this.buildIndex >= this.buildQueue.length) return null;
    return this.players[this.buildQueue[this.buildIndex]];
  };

  /* Would this card do anything useful on the wall as it stands? */
  Match.prototype.canOffer = function (card, player) {
    if (card.limit) {
      var total = 0;
      for (var i = 0; i < this.players.length; i++) total += (this.players[i].used[card.id] || 0);
      if (total >= card.limit) return false;
    }
    var world = this.game.world;
    var needsHold = card.mode === 'hold' || card.mode === 'holdAngle' ||
                    card.mode === 'holdMove' || card.mode === 'twoHolds';
    if (needsHold) {
      var n = 0, directional = 0, movable = 0, still = 0;
      for (var h = 0; h < world.holds.length; h++) {
        var hd = world.holds[h];
        if (hd.dead || hd.protected || hd.dynamic) continue;
        n++;
        var t = RS.HOLD_TYPES[hd.type];
        if (t.directional || hd.springPower) directional++;
        if (!hd.motion) still++;
      }
      if (n < (card.mode === 'twoHolds' ? 2 : 1)) return false;
      if (card.id === 'reaim' && directional < 1) return false;
      if ((card.id === 'metronome' || card.id === 'elevator' || card.id === 'spincam') && still < 1) return false;
    }
    return true;
  };

  Match.prototype.dealHand = function () {
    var player = this.currentBuilder();
    if (!player) { this.hand = []; return; }
    var pool = RS.CARDS.filter(function (c) { return this.canOffer(c, player); }, this);
    var hand = [];
    var guard = 0;
    while (hand.length < this.cardsPerHand && guard++ < 400) {
      var c = this.rng.weighted(pool);
      if (hand.indexOf(c) === -1) hand.push(c);
      if (hand.length >= pool.length) break;
    }
    /* Keep a hand from being all-cruelty or all-kindness; swap one for variety. */
    this.hand = hand;
    this.handRerolled = false;
  };

  Match.prototype.commitCard = function (card, sel) {
    var player = this.currentBuilder();
    if (!player) return false;
    var ctx = { playerIndex: player.index, round: this.round, match: this };
    var ok = RS.checkPlacement(this.game.world, card, sel, ctx);
    if (ok !== true) return ok;

    var rec = RS.applyCard(this.game, card, sel, ctx);
    rec.round = this.round;
    rec.playerName = player.name;
    this.log.push(rec);
    player.used[card.id] = (player.used[card.id] || 0) + 1;
    player.placed++;

    this.buildIndex++;
    if (this.buildIndex >= this.buildQueue.length) this.beginClimbPhase();
    else this.dealHand();
    return true;
  };

  /* Skipping is allowed - sometimes every card in your hand helps your rivals. */
  Match.prototype.skipCard = function () {
    this.buildIndex++;
    if (this.buildIndex >= this.buildQueue.length) this.beginClimbPhase();
    else this.dealHand();
  };

  /* ------------------------------------------------------------------- climb */

  Match.prototype.beginClimbPhase = function () {
    this.phase = 'climb';
    this.snapshot = RS.snapshotWorld(this.game.world);
    this.climbQueue = [];
    for (var i = 0; i < this.players.length; i++) {
      this.climbQueue.push((this.firstBuilder + i) % this.players.length);
    }
    this.climbIndex = 0;
    this.startRun();
  };

  Match.prototype.currentClimber = function () {
    if (this.climbIndex >= this.climbQueue.length) return null;
    return this.players[this.climbQueue[this.climbIndex]];
  };

  Match.prototype.startRun = function () {
    var p = this.currentClimber();
    if (!p) return;
    RS.restoreWorld(this.game, this.game.world, this.snapshot);
    this.game.spawnClimber(p);
    this.game.runTime = 0;
    this.game.runLimit = this.climbSeconds;
    this.game.phase = 'run';
    this.game.toast(p.name + ' up');
  };

  Match.prototype.endRun = function (reason) {
    var p = this.currentClimber();
    var cl = this.game.climber;
    if (p && cl) {
      p.topped = cl.topped;
      p.time = cl.topped ? cl.toppedAt : null;
      p.high = cl.heightM();
      p.box = cl.bonusTouched;
      p.deaths = cl.deaths;
      p.reason = reason;
    }
    this.climbIndex++;
    if (this.climbIndex >= this.climbQueue.length) this.scoreRound();
    else this.startRun();
  };

  /* ------------------------------------------------------------------- score */

  Match.prototype.scoreRound = function () {
    this.phase = 'score';
    this.game.phase = 'score';
    var i, p;
    var toppers = this.players.filter(function (q) { return q.topped; });

    /* fastest send */
    var fastest = null;
    for (i = 0; i < toppers.length; i++) {
      if (fastest === null || toppers[i].time < fastest.time) fastest = toppers[i];
    }
    /* high point when nobody sent */
    var highest = null;
    if (toppers.length === 0) {
      for (i = 0; i < this.players.length; i++) {
        p = this.players[i];
        if (highest === null || p.high > highest.high) highest = p;
      }
      if (highest && highest.high < 0.6) highest = null;   // nobody really moved
    }

    for (i = 0; i < this.players.length; i++) {
      p = this.players[i];
      var gain = 0;
      var why = [];
      if (p.topped) { gain += 1; why.push(['Topped out', 1]); }
      if (p.topped && toppers.length === 1) { gain += 2; why.push(['Only one to top', 2]); }
      if (p.topped && toppers.length > 1 && p === fastest) { gain += 1; why.push(['Fastest send', 1]); }
      if (p.box) { gain += 1; why.push(['Party box', 1]); }
      if (highest && p === highest) { gain += 1; why.push(['High point', 1]); }
      p.score += gain;
      p.lastGain = gain;
      p.lastReasons = why;
    }

    /* headline for the round */
    if (toppers.length === 0) {
      this.lastRoundSummary = highest
        ? 'Nobody topped out. ' + highest.name + ' got highest.'
        : 'Nobody got anywhere. Maybe ease off with the bear traps.';
    } else if (toppers.length === 1) {
      this.lastRoundSummary = toppers[0].name + ' was the only one to top out. Three points.';
    } else if (toppers.length === this.players.length) {
      this.lastRoundSummary = 'Everyone topped out. The route is too soft.';
    } else {
      this.lastRoundSummary = toppers.length + ' climbers topped out.';
    }

    /* win check: at or past target and clear of everyone else */
    var sorted = this.players.slice().sort(function (a, b) { return b.score - a.score; });
    if (sorted[0].score >= this.target &&
        (sorted.length < 2 || sorted[0].score > sorted[1].score)) {
      this.winner = sorted[0];
      this.phase = 'won';
    }
    this.firstBuilder = (this.firstBuilder + 1) % this.players.length;
  };

  Match.prototype.standings = function () {
    return this.players.slice().sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return b.high - a.high;
    });
  };

  RS.Match = Match;

  /* Colours for the player chips. */
  RS.PLAYER_COLORS = ['#e0564f', '#3f9be0', '#63c26a', '#e0b93f', '#a875e0', '#4bc9c0'];

})(window.RS);

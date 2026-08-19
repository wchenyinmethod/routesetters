/* ROUTESETTERS - ui.js
 * DOM overlay: menus, the routebuilder card hand, HUD and scoreboards.
 * Canvas draws the world; HTML draws everything you read.
 */
(function (RS) {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function UI(game) {
    this.game = game;
    this.screen = 'title';
    this.cache = {};
    this.partyConfig = {
      players: 2,
      wall: 0,
      target: 8,
      picks: [0, 1, 2, 3]
    };
    this.build();
    this.renderTitle();
    this.showScreen('title');
  }

  /* --------------------------------------------------------------- structure */

  /* First run gets nudged toward the tutorial; afterwards it is just an option. */
  UI.prototype.renderTitle = function () {
    var done = RS.storage.get('tutorialDone', false);
    var b = $('#btn-tutorial');
    b.classList.toggle('primary', !done);
    b.textContent = done ? 'Tutorial' : 'Start here: tutorial';
    $('#btn-party').classList.toggle('primary', !!done);
  };

  UI.prototype.build = function () {
    var self = this, g = this.game;

    this.hud = $('#hud');
    this.buildbar = $('#buildbar');
    this.scorestrip = $('#scorestrip');
    this.screens = $('#screens');
    this.coach = $('#coach');

    /* ---- title ---- */
    $('#btn-tutorial').onclick = function () { g.startTutorial(); };
    $('#btn-story').onclick = function () { self.showScreen('story'); self.renderStory(); };
    $('#btn-party').onclick = function () { self.showScreen('party'); self.renderParty(); };
    $('#btn-free').onclick = function () { self.showScreen('free'); self.renderFree(); };
    $('#btn-how').onclick = function () { self.showScreen('help'); };
    $('#btn-cards').onclick = function () { self.showScreen('deck'); self.renderDeck(); };

    $$('[data-back]').forEach(function (b) {
      b.onclick = function () { self.showScreen(b.getAttribute('data-back')); };
    });

    /* ---- tutorial ---- */
    $('#btn-tut-skip-step').onclick = function () { if (g.tutorial) g.tutorial.advance(); };
    $('#btn-tut-quit').onclick = function () {
      RS.storage.set('tutorialDone', true);
      g.tutorial = null;
      g.mode = 'menu'; g.phase = 'idle';
      if (g.climber) { g.climber.destroy(); g.climber = null; }
      g.world = null; g.solver.reset();
      self.showScreen('title'); self.renderTitle();
    };
    $('#btn-tut-done-story').onclick = function () { self.showScreen('story'); self.renderStory(); };
    $('#btn-tut-done-party').onclick = function () { self.showScreen('party'); self.renderParty(); };

    /* ---- pause ---- */
    $('#btn-resume').onclick = function () { g.togglePause(); };
    $('#btn-restart').onclick = function () { g.paused = false; self.showScreen(null); g.restartRun(); };
    $('#btn-quit').onclick = function () {
      g.paused = false; g.mode = 'menu'; g.phase = 'idle'; g.match = null;
      if (g.climber) { g.climber.destroy(); g.climber = null; }
      g.world = null; g.solver.reset();
      g.tutorial = null;
      self.renderTitle();
      self.showScreen('title');
    };

    /* ---- level complete ---- */
    $('#btn-next-level').onclick = function () {
      var next = g.storyIndex + 1;
      if (next < RS.STORY_LEVELS.length) { g.startStory(next); }
      else { self.showScreen('story'); self.renderStory(); }
    };
    $('#btn-retry-level').onclick = function () { g.startStory(g.storyIndex); };
    $('#btn-level-menu').onclick = function () { self.showScreen('story'); self.renderStory(); };

    /* ---- round results ---- */
    $('#btn-next-round').onclick = function () { g.nextRound(); };

    /* ---- winner ---- */
    $('#btn-winner-menu').onclick = function () {
      g.mode = 'menu'; g.match = null; g.world = null; g.solver.reset();
      if (g.climber) { g.climber.destroy(); g.climber = null; }
      self.showScreen('title');
    };

    /* ---- free build ---- */
    $('#btn-free-climb').onclick = function () {
      g.phase = 'run';
      g.cam.free = false;
      g.placement = null;
      g.spawnClimber({ name: 'You', profile: g.storyPlayer.profile });
      g.runTime = 0;
      g.runLimit = Infinity;
      self.syncBuild();
    };
    $('#btn-free-build').onclick = function () {
      g.phase = 'build';
      g.cam.free = true;
      if (g.climber) { g.climber.destroy(); g.climber = null; }
      self.syncBuild();
    };
    $('#btn-free-again').onclick = function () { self.showScreen(null); $('#btn-free-build').click(); };

    /* ---- build bar ---- */
    $('#btn-skip').onclick = function () { self.skipBuild(); };
    $('#btn-cancel-place').onclick = function () { g.cancelPlacement(); };

    this.handHost = $('#hand');
  };

  UI.prototype.showScreen = function (id) {
    this.screen = id;
    $$('#screens > section').forEach(function (s) {
      s.classList.toggle('on', s.getAttribute('data-screen') === id);
    });
    this.screens.classList.toggle('on', !!id);
  };

  UI.prototype.showPause = function (on) {
    if (on) this.showScreen('pause');
    else this.showScreen(null);
  };

  /* ------------------------------------------------------------ story select */

  UI.prototype.renderStory = function () {
    var self = this, g = this.game;
    var host = $('#story-list');
    host.innerHTML = '';
    RS.STORY_LEVELS.forEach(function (lv, i) {
      var locked = i + 1 > g.progress.unlocked;
      var best = g.progress.best[lv.id];
      var card = el('button', 'levelcard' + (locked ? ' locked' : ''));
      card.innerHTML =
        '<div class="lv-top"><span class="lv-num">' + (i + 1) + '</span>' +
        '<span class="lv-grade">' + lv.grade + '</span></div>' +
        '<div class="lv-name">' + lv.name + '</div>' +
        '<div class="lv-sub">' + lv.subtitle + '</div>' +
        '<div class="lv-meta">' +
          '<span>' + Math.round(lv.height / 42) + 'm</span>' +
          '<span>' + (best ? 'best ' + RS.formatTime(best) : 'unclimbed') + '</span>' +
        '</div>' +
        (locked ? '<div class="lv-lock">Top out route ' + i + ' to unlock</div>' : '');
      card.disabled = locked;
      card.onclick = function () { if (!locked) g.startStory(i); };
      host.appendChild(card);
    });

    /* character picker */
    var pick = $('#story-char');
    pick.innerHTML = '';
    RS.PROFILES.forEach(function (p, i) {
      var b = el('button', 'charchip' + (g.storyPlayer.profile === p ? ' on' : ''));
      var cv = el('canvas', 'charcv');
      cv.width = 68; cv.height = 68;
      RS.drawPortrait(cv.getContext('2d'), p, 34, 30, 20);
      b.appendChild(cv);
      b.appendChild(el('span', 'charname', p.name));
      b.onclick = function () { g.storyPlayer.profile = p; self.renderStory(); };
      pick.appendChild(b);
    });
  };

  /* ------------------------------------------------------------ party setup */

  UI.prototype.renderParty = function () {
    var self = this, g = this.game, cfg = this.partyConfig;

    var countHost = $('#party-count');
    countHost.innerHTML = '';
    [2, 3, 4].forEach(function (n) {
      var b = el('button', 'pill' + (cfg.players === n ? ' on' : ''), n + ' players');
      b.onclick = function () { cfg.players = n; self.renderParty(); };
      countHost.appendChild(b);
    });

    var targetHost = $('#party-target');
    targetHost.innerHTML = '';
    [5, 8, 12].forEach(function (n) {
      var b = el('button', 'pill' + (cfg.target === n ? ' on' : ''),
        n + ' pts' + (n === 5 ? ' (short)' : n === 12 ? ' (long)' : ''));
      b.onclick = function () { cfg.target = n; self.renderParty(); };
      targetHost.appendChild(b);
    });

    var wallHost = $('#party-walls');
    wallHost.innerHTML = '';
    RS.PARTY_WALLS.forEach(function (w, i) {
      var b = el('button', 'wallcard' + (cfg.wall === i ? ' on' : ''));
      b.innerHTML = '<div class="lv-name">' + w.name + '</div>' +
                    '<div class="lv-sub">' + w.subtitle + '</div>' +
                    '<div class="lv-meta"><span>' + Math.round(w.height / 42) + 'm</span>' +
                    '<span>' + w.theme + '</span></div>';
      b.onclick = function () { cfg.wall = i; self.renderParty(); };
      wallHost.appendChild(b);
    });

    var seatHost = $('#party-seats');
    seatHost.innerHTML = '';
    for (var i = 0; i < cfg.players; i++) {
      (function (i) {
        var seat = el('div', 'seat');
        seat.style.borderColor = RS.PLAYER_COLORS[i];
        var prof = RS.PROFILES[cfg.picks[i] % RS.PROFILES.length];
        var cv = el('canvas', 'charcv big');
        cv.width = 84; cv.height = 84;
        RS.drawPortrait(cv.getContext('2d'), prof, 42, 38, 25);
        seat.appendChild(cv);
        var nameIn = el('input', 'seatname');
        nameIn.value = prof.name;
        nameIn.maxLength = 10;
        seat.appendChild(nameIn);
        var cyc = el('button', 'mini', 'change climber');
        cyc.onclick = function () {
          cfg.picks[i] = (cfg.picks[i] + 1) % RS.PROFILES.length;
          self.renderParty();
        };
        seat.appendChild(cyc);
        seat.appendChild(el('div', 'seatlabel', 'Player ' + (i + 1)));
        seatHost.appendChild(seat);
      })(i);
    }

    $('#btn-party-start').onclick = function () {
      var names = $$('#party-seats .seatname').map(function (n) { return n.value.trim(); });
      var players = [];
      for (var i = 0; i < cfg.players; i++) {
        players.push({
          name: names[i] || ('P' + (i + 1)),
          profile: RS.PROFILES[cfg.picks[i] % RS.PROFILES.length],
          color: RS.PLAYER_COLORS[i]
        });
      }
      g.startParty(cfg.wall, players, cfg.target);
    };
  };

  /* -------------------------------------------------------------- free build */

  UI.prototype.renderFree = function () {
    var g = this.game;
    var host = $('#free-list');
    host.innerHTML = '';
    var all = RS.PARTY_WALLS.concat(RS.STORY_LEVELS);
    all.forEach(function (w, i) {
      var b = el('button', 'wallcard');
      b.innerHTML = '<div class="lv-name">' + w.name + '</div>' +
                    '<div class="lv-sub">' + (w.subtitle || '') + '</div>' +
                    '<div class="lv-meta"><span>' + Math.round(w.height / 42) + 'm</span>' +
                    '<span>' + w.theme + '</span></div>';
      b.onclick = function () { g.startFreeBuild(i); };
      host.appendChild(b);
    });
  };

  /* -------------------------------------------------------------- deck browser */

  UI.prototype.renderDeck = function () {
    var host = $('#deck-list');
    host.innerHTML = '';
    var byCat = {};
    RS.CARDS.forEach(function (c) {
      (byCat[c.cat] = byCat[c.cat] || []).push(c);
    });
    $('#deck-count').textContent = RS.CARDS.length + ' cards';
    Object.keys(byCat).forEach(function (cat) {
      var meta = RS.CARD_CATS[cat];
      var group = el('div', 'deckgroup');
      var h = el('h3', 'deckhead', meta.label);
      h.style.color = meta.color;
      group.appendChild(h);
      var grid = el('div', 'deckgrid');
      byCat[cat].forEach(function (c) {
        var d = el('div', 'deckcard');
        d.style.setProperty('--cc', meta.color);
        d.innerHTML =
          '<div class="dc-top"><span class="dc-glyph">' + c.glyph + '</span>' +
          '<span class="dc-name">' + c.name + '</span></div>' +
          '<div class="dc-desc">' + c.desc + '</div>' +
          '<div class="dc-foot"><span class="dc-rar r-' + (c.rarity || 'common') + '">' +
          (c.rarity || 'common') + '</span><span class="dc-mode">' + modeLabel(c) + '</span></div>';
        grid.appendChild(d);
      });
      group.appendChild(grid);
      host.appendChild(group);
    });
  };

  function modeLabel(c) {
    switch (c.mode) {
      case 'point': return 'click to place';
      case 'pointAngle': return 'place, then aim';
      case 'segment': return 'drag a line';
      case 'hold': return 'pick a hold';
      case 'holdAngle': return 'pick a hold, then aim';
      case 'holdMove': return 'pick a hold, then move it';
      case 'twoHolds': return 'pick two holds';
    }
    return '';
  }

  /* -------------------------------------------------------------- build phase */

  UI.prototype.syncBuild = function () {
    var g = this.game, m = g.match;
    var on = g.phase === 'build';
    this.buildbar.classList.toggle('on', on);
    if (!on) { this.handHost.innerHTML = ''; this.lastHandKey = null; return; }

    var self = this;
    var isFree = g.mode === 'freebuild';
    $('#free-controls').classList.toggle('on', isFree);
    $('#btn-skip').style.display = isFree ? 'none' : '';

    if (isFree) {
      $('#build-who').textContent = 'Free build';
      $('#build-round').textContent = 'place anything you like';
      var key = 'free';
      if (this.lastHandKey !== key) {
        this.lastHandKey = key;
        this.renderHand(RS.CARDS, null);
      }
      this.renderPlacementBar();
      return;
    }

    if (!m) return;
    var p = m.currentBuilder();
    if (!p) return;
    $('#build-who').textContent = p.name + ' sets the route';
    $('#build-who').style.color = p.color;
    $('#build-round').textContent = 'Round ' + m.round + '  -  builder ' +
      (m.buildIndex + 1) + ' of ' + m.buildQueue.length + '  -  first to ' + m.target + ' wins';

    var hk = m.round + ':' + m.buildIndex + ':' + m.hand.map(function (c) { return c.id; }).join(',');
    if (this.lastHandKey !== hk) {
      this.lastHandKey = hk;
      this.renderHand(m.hand, p);
    }
    this.renderPlacementBar();
  };

  UI.prototype.renderHand = function (cards, player) {
    var self = this, g = this.game;
    this.handHost.innerHTML = '';
    this.handCards = cards;
    var browse = cards.length > 12;
    this.handHost.classList.toggle('browse', browse);

    cards.forEach(function (c, i) {
      var meta = RS.CARD_CATS[c.cat];
      var b = el('button', 'card');
      b.style.setProperty('--cc', meta.color);
      b.innerHTML =
        '<div class="c-cat">' + meta.label + '</div>' +
        '<div class="c-glyph">' + c.glyph + '</div>' +
        '<div class="c-name">' + c.name + '</div>' +
        '<div class="c-desc">' + c.desc + '</div>' +
        '<div class="c-foot"><span class="c-mode">' + modeLabel(c) + '</span>' +
        (browse ? '' : '<span class="c-key">' + (i + 1) + '</span>') + '</div>';
      b.onclick = function () {
        g.beginPlacement(c);
        $$('#hand .card').forEach(function (x) { x.classList.remove('sel'); });
        b.classList.add('sel');
        self.renderPlacementBar();
      };
      self.handHost.appendChild(b);
    });
  };

  UI.prototype.renderPlacementBar = function () {
    var g = this.game, pl = g.placement;
    var bar = $('#placebar');
    bar.classList.toggle('on', !!pl);
    if (!pl) return;
    var stageText;
    switch (pl.card.mode) {
      case 'point': stageText = 'Click where you want it'; break;
      case 'pointAngle': stageText = pl.stage === 0 ? 'Click to position it' : 'Move to aim, click to confirm'; break;
      case 'segment': stageText = pl.stage === 0 ? 'Click the first end' : 'Click the other end'; break;
      case 'hold': stageText = 'Click the hold you want to change'; break;
      case 'holdAngle': stageText = pl.stage === 0 ? 'Click a directional hold' : 'Move to aim, click to confirm'; break;
      case 'holdMove': stageText = pl.stage === 0 ? 'Click the hold to move' : 'Click its new home'; break;
      case 'twoHolds': stageText = pl.stage === 0 ? 'Click the first hold' : 'Click the second hold'; break;
      default: stageText = 'Click to place';
    }
    $('#place-name').textContent = pl.card.name;
    $('#place-stage').textContent = stageText;
    $('#place-warn').textContent = pl.msg || '';
    $('#place-warn').classList.toggle('on', !!pl.msg);
  };

  UI.prototype.pickHandIndex = function (i) {
    var cards = this.handCards;
    if (!cards || !cards[i]) return;
    var btns = $$('#hand .card');
    if (btns[i]) btns[i].click();
  };

  UI.prototype.skipBuild = function () {
    var g = this.game;
    if (g.mode === 'freebuild') return;
    if (!g.match || g.phase !== 'build') return;
    g.placement = null;
    g.toast((g.match.currentBuilder() || {}).name + ' passed');
    g.match.skipCard();
    if (g.match.phase === 'climb') this.buildbar.classList.remove('on');
    this.syncBuild();
  };

  /* ---------------------------------------------------------------- tutorial */

  UI.prototype.syncTutorial = function () {
    var g = this.game, c = this.cache;
    var t = g.tutorial;
    var on = !!t && !t.finished && g.phase === 'run';
    if (this.coach.classList.contains('on') !== on) this.coach.classList.toggle('on', on);
    if (!on) return;

    var s = t.step();
    if (!s) return;
    var key = s.id + ':' + (t.doneFlash > 0 ? 'done' : 'live') + ':' + t.index;
    if (c.coach !== key) {
      c.coach = key;
      var p = t.progress();
      $('#coach-step').textContent = 'Step ' + (p.index + 1) + ' of ' + p.total;
      $('#coach-title').textContent = s.title;
      $('#coach-text').innerHTML = s.text;
      $('#coach-fill').style.width = (p.index / p.total * 100).toFixed(0) + '%';
      this.coach.classList.toggle('done', t.doneFlash > 0);
    }
    var canSkip = t.canSkipStep();
    if (c.coachSkip !== canSkip) {
      c.coachSkip = canSkip;
      $('#btn-tut-skip-step').classList.toggle('on', canSkip);
    }
  };

  UI.prototype.showTutorialComplete = function (time) {
    $('#tut-done-time').textContent = RS.formatTime(time);
    this.showScreen('tutdone');
  };

  /* --------------------------------------------------------------------- HUD */

  UI.prototype.sync = function () {
    var g = this.game, c = this.cache;
    this.syncTutorial();
    var showHud = (g.phase === 'run' || g.phase === 'between') && g.climber;
    if (this.hud.classList.contains('on') !== showHud) this.hud.classList.toggle('on', showHud);

    if (showHud) {
      var cl = g.climber;
      var sp = Math.round(cl.stamina);
      if (c.stam !== sp) {
        c.stam = sp;
        $('#stam-fill').style.width = (cl.stamina / cl.staminaMax * 100).toFixed(1) + '%';
        $('#stam-fill').classList.toggle('low', cl.stamina < 32);
        $('#stam-val').textContent = sp;
      }
      var hm = cl.currentHeightM().toFixed(1);
      if (c.h !== hm) { c.h = hm; $('#hud-height').textContent = hm + 'm'; }
      var top = (g.world.height / 42).toFixed(0);
      if (c.top !== top) { c.top = top; $('#hud-top').textContent = '/ ' + top + 'm'; }

      var timeText;
      if (g.runLimit === Infinity) timeText = RS.formatTime(g.runTime);
      else timeText = Math.max(0, Math.ceil(g.runLimit - g.runTime)) + 's';
      if (c.time !== timeText) { c.time = timeText; $('#hud-time').textContent = timeText; }
      $('#hud-time').classList.toggle('urgent', g.runLimit !== Infinity && (g.runLimit - g.runTime) < 12);

      var who = g.climberInfo ? g.climberInfo.name : 'You';
      if (c.who !== who) {
        c.who = who;
        $('#hud-who').textContent = who;
        $('#hud-who').style.color = (g.climberInfo && g.climberInfo.color) || '#e8eef5';
      }
      var wet = cl.wet > 0.2, pumped = cl.pumped > 0;
      var flags = (wet ? 'w' : '') + (pumped ? 'p' : '');
      if (c.flags !== flags) {
        c.flags = flags;
        $('#flag-wet').classList.toggle('on', wet);
        $('#flag-pump').classList.toggle('on', pumped);
      }
      var gripL = cl.limbs.handL.hold ? 'on' : (cl.limbs.handL.wantGrip ? 'try' : '');
      var gripR = cl.limbs.handR.hold ? 'on' : (cl.limbs.handR.wantGrip ? 'try' : '');
      if (c.gl !== gripL) { c.gl = gripL; $('#grip-l').className = 'grip ' + gripL; }
      if (c.gr !== gripR) { c.gr = gripR; $('#grip-r').className = 'grip ' + gripR; }
    }

    /* party standings strip */
    var showStrip = g.mode === 'party' && g.match && g.phase !== 'idle';
    if (this.scorestrip.classList.contains('on') !== showStrip) this.scorestrip.classList.toggle('on', showStrip);
    if (showStrip) {
      var m = g.match;
      var key = m.players.map(function (p) { return p.score + (p.topped ? 't' : ''); }).join('|') +
        ':' + m.phase + ':' + m.climbIndex;
      if (c.strip !== key) {
        c.strip = key;
        var host = $('#strip-list');
        host.innerHTML = '';
        m.players.forEach(function (p) {
          var d = el('div', 'chip');
          var active = (m.phase === 'climb' && m.currentClimber() === p) ||
                       (m.phase === 'build' && m.currentBuilder() === p);
          if (active) d.classList.add('active');
          d.style.borderColor = p.color;
          d.innerHTML = '<span class="chip-name">' + p.name + '</span>' +
            '<span class="chip-score">' + p.score + '</span>' +
            (p.topped ? '<span class="chip-top">TOP</span>' : '');
          host.appendChild(d);
        });
        $('#strip-target').textContent = 'first to ' + m.target;
      }
    }
  };

  UI.prototype.setLevelBanner = function (lv) {
    var b = $('#banner');
    b.innerHTML = '<div class="bn-name">' + lv.name + '</div>' +
      '<div class="bn-sub">' + lv.subtitle + '</div>' +
      (lv.tips ? '<ul class="bn-tips"><li>' + lv.tips.join('</li><li>') + '</li></ul>' : '');
    b.classList.add('on');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(function () { b.classList.remove('on'); }, 7000);
  };

  /* ---------------------------------------------------------------- results */

  UI.prototype.showLevelComplete = function (lv, time, cl) {
    var g = this.game;
    var best = g.progress.best[lv.id];
    $('#complete-title').textContent = 'Topped out';
    $('#complete-sub').textContent = lv.name;
    var stars = time <= lv.par * 0.75 ? 3 : (time <= lv.par ? 2 : 1);
    $('#complete-stats').innerHTML =
      '<div class="statrow"><span>Time</span><b>' + RS.formatTime(time) + '</b></div>' +
      '<div class="statrow"><span>Par</span><b>' + RS.formatTime(lv.par) + '</b></div>' +
      '<div class="statrow"><span>Best</span><b>' + RS.formatTime(best) + '</b></div>' +
      '<div class="statrow"><span>Falls to a clip</span><b>' + cl.deaths + '</b></div>' +
      '<div class="stars">' + '★'.repeat(stars) + '☆'.repeat(3 - stars) + '</div>';
    $('#btn-next-level').textContent = g.storyIndex + 1 < RS.STORY_LEVELS.length ? 'Next route' : 'Back to routes';
    this.showScreen('complete');
  };

  UI.prototype.showFreeComplete = function (time, cl) {
    $('#free-done-time').textContent = RS.formatTime(time);
    this.showScreen('freedone');
  };

  UI.prototype.showRoundResults = function (m) {
    $('#round-title').textContent = 'Round ' + m.round;
    $('#round-sub').textContent = m.lastRoundSummary || '';
    var host = $('#round-rows');
    host.innerHTML = '';
    m.standings().forEach(function (p) {
      var row = el('div', 'roundrow');
      row.style.borderLeftColor = p.color;
      var why = p.lastReasons.length
        ? p.lastReasons.map(function (r) { return r[0] + ' +' + r[1]; }).join(' · ')
        : (p.topped ? '' : 'no points');
      row.innerHTML =
        '<div class="rr-name">' + p.name + '</div>' +
        '<div class="rr-why">' + why + '</div>' +
        '<div class="rr-high">' + p.high.toFixed(1) + 'm' + (p.topped ? ' · ' + RS.formatTime(p.time) : '') + '</div>' +
        '<div class="rr-gain">' + (p.lastGain > 0 ? '+' + p.lastGain : '0') + '</div>' +
        '<div class="rr-score">' + p.score + '</div>';
      host.appendChild(row);
    });
    $('#btn-next-round').textContent = m.phase === 'won' ? 'See the winner' : 'Next round';
    this.showScreen('round');
  };

  UI.prototype.showMatchWinner = function (m) {
    var w = m.winner;
    $('#winner-name').textContent = w.name + ' wins';
    $('#winner-name').style.color = w.color;
    $('#winner-sub').textContent = w.score + ' points in ' + m.round + ' rounds';
    var cv = $('#winner-portrait');
    cv.width = 160; cv.height = 160;
    RS.drawPortrait(cv.getContext('2d'), w.profile, 80, 72, 46);
    var host = $('#winner-rows');
    host.innerHTML = '';
    m.standings().forEach(function (p, i) {
      var row = el('div', 'roundrow');
      row.style.borderLeftColor = p.color;
      row.innerHTML = '<div class="rr-name">' + (i + 1) + '. ' + p.name + '</div>' +
        '<div class="rr-why">' + p.placed + ' changes set</div>' +
        '<div class="rr-score">' + p.score + '</div>';
      host.appendChild(row);
    });
    this.showScreen('winner');
  };

  RS.UI = UI;

})(window.RS);

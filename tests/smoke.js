/* Headless smoke test for Routesetters: no canvas, just simulation + card logic. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

const sandbox = {};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.console = console;
sandbox.Math = Math;
sandbox.Date = Date;
sandbox.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] === undefined ? null : this._d[k]; },
  setItem(k, v) { this._d[k] = String(v); }
};
sandbox.document = {
  createElement() {
    return {
      width: 0, height: 0,
      getContext() {
        return {
          createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          putImageData() {}, fillRect() {}, beginPath() {}, ellipse() {}, fill() {},
          stroke() {}, moveTo() {}, lineTo() {}, arc() {}, createPattern: () => ({})
        };
      }
    };
  }
};
sandbox.requestAnimationFrame = () => 0;
sandbox.addEventListener = () => {};

const ctx = vm.createContext(sandbox);

const files = ['util', 'physics', 'holds', 'climber', 'components', 'levels', 'party'];
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, 'src', f + '.js'), 'utf8');
  vm.runInContext(src, ctx, { filename: f + '.js' });
}

const RS = sandbox.RS;
let fails = 0;
const fail = (m) => { console.log('  FAIL: ' + m); fails++; };
const ok = (m) => console.log('  ok: ' + m);

console.log('\n=== registry ===');
console.log('  cards: ' + RS.CARDS.length);
console.log('  hold types: ' + Object.keys(RS.HOLD_TYPES).length);
console.log('  story levels: ' + RS.STORY_LEVELS.length);
console.log('  party walls: ' + RS.PARTY_WALLS.length);
if (RS.CARDS.length < 30) fail('fewer than 30 cards');

/* ---- fake game shell ---- */
const toasts = [];
function makeGame() {
  const g = {
    solver: new RS.Solver(),
    world: null, climber: null, runTime: 0,
    shake() {}, toast(m) { toasts.push(m); }, sfx() {}
  };
  return g;
}

console.log('\n=== build every story level ===');
for (let i = 0; i < RS.STORY_LEVELS.length; i++) {
  const g = makeGame();
  try {
    const w = RS.buildWorld(g, RS.STORY_LEVELS[i]);
    let bad = w.holds.filter(h => !isFinite(h.x) || !isFinite(h.y)).length;
    if (bad) fail(RS.STORY_LEVELS[i].id + ': ' + bad + ' holds with NaN position');
    else ok(RS.STORY_LEVELS[i].name + ' - ' + w.holds.length + ' holds, ' +
      w.terrain.length + ' terrain, ' + w.zones.length + ' zones, ' + w.props.length + ' props');
  } catch (e) { fail(RS.STORY_LEVELS[i].id + ' build threw: ' + e.message + '\n' + e.stack); }
}

console.log('\n=== simulate a climber (level 1, 12 seconds) ===');
{
  const g = makeGame();
  RS.buildWorld(g, RS.STORY_LEVELS[0]);
  const cl = new RS.Climber(g, {
    x: g.world.start.x, y: g.world.start.y, profile: RS.PROFILES[0], playerIndex: 0
  });
  g.climber = cl;
  const FIXED = 1 / 120;
  let latched = 0, released = 0, prevGrip = 0;
  /* crude autoclimber: aim at the nearest hold above, alternate hands */
  for (let step = 0; step < 12 * 120; step++) {
    const t = step * FIXED;
    let target = null, bestD = 1e9;
    for (const h of g.world.holds) {
      if (h.dead || !h.hands) continue;
      if (h.y > cl.chest.y - 8) continue;
      const d = RS.dist(cl.chest.x, cl.chest.y, h.x, h.y);
      if (d < bestD) { bestD = d; target = h; }
    }
    const phase = Math.floor(t * 1.2) % 2;
    const input = {
      mx: target ? target.x : cl.chest.x,
      my: target ? target.y - 6 : cl.chest.y - 40,
      left: phase === 0 || cl.limbs.handL.hold !== null,
      right: phase === 1 || cl.limbs.handR.hold !== null,
      jump: false
    };
    cl.update(FIXED, input, true);
    g.solver.step(FIXED);
    RS.updateProps(g, FIXED, g.solver.time);
    const gc = cl.gripCount();
    if (gc > prevGrip) latched++;
    if (gc < prevGrip) released++;
    prevGrip = gc;
    for (const p of cl.points) {
      if (!isFinite(p.x) || !isFinite(p.y)) { fail('NaN in ragdoll at step ' + step + ' tag=' + p.tag); step = 1e9; break; }
    }
  }
  ok('latches: ' + latched + ', releases: ' + released);
  ok('stamina left: ' + cl.stamina.toFixed(1));
  ok('height climbed: ' + cl.heightM().toFixed(2) + 'm');
  if (latched === 0) fail('climber never gripped anything');
  if (cl.heightM() < 0.4) fail('climber made no upward progress (' + cl.heightM().toFixed(2) + 'm)');
}

console.log('\n=== place all ' + RS.CARDS.length + ' cards ===');
{
  const g = makeGame();
  RS.buildWorld(g, RS.PARTY_WALLS[0]);
  /* seed a directional hold and a still hold so every mode has a legal target */
  const sp = RS.makeHold('sidepull', 300, -500, {});
  g.world.holds.push(sp);
  const sp2 = RS.makeHold('jug', 360, -520, {});
  g.world.holds.push(sp2);

  const notProt = (h) => !h.protected && !h.dynamic && !h.dead;
  let placed = 0, rejected = [];

  for (const card of RS.CARDS) {
    const sel = {};
    const targets = g.world.holds.filter(notProt);
    const px = 330, py = -420;
    switch (card.mode) {
      case 'point': sel.x = px; sel.y = py; break;
      case 'pointAngle': sel.x = px; sel.y = py; sel.angle = 0.4; break;
      case 'segment': {
        let len = Math.max(card.minLen ? card.minLen + 12 : 120, 120);
        if (card.maxLen) len = Math.min(len, card.maxLen - 6);
        sel.x = px - len * 0.4; sel.y = py;
        sel.x2 = px + len * 0.4; sel.y2 = py - len * 0.55;
        break;
      }
      case 'hold': {
        let t = targets.find(h => {
          if (card.id === 'reaim') return RS.HOLD_TYPES[h.type].directional || h.springPower;
          if (card.id === 'metronome' || card.id === 'elevator' || card.id === 'spincam') return !h.motion;
          if (card.id === 'grease') return h.greased < 0.9;
          if (card.id === 'chalk') return h.chalked < 0.9;
          if (card.id === 'sandbag') return !h.sandbagged;
          return true;
        });
        sel.hold = t; if (t) { sel.x = t.x; sel.y = t.y; }
        break;
      }
      case 'holdAngle': {
        const t = targets.find(h => RS.HOLD_TYPES[h.type].directional || h.springPower);
        sel.hold = t; sel.angle = 1.1; if (t) { sel.x = t.x; sel.y = t.y; }
        break;
      }
      case 'holdMove': {
        const t = targets[0];
        sel.hold = t; sel.placed = true;
        sel.x = t.baseX + 40; sel.y = t.baseY - 40;
        break;
      }
      case 'twoHolds': {
        sel.hold = targets[0]; sel.hold2 = targets[1];
        sel.x = targets[0].x; sel.y = targets[0].y;
        break;
      }
    }
    const cctx = { playerIndex: 0, round: 1 };
    const check = RS.checkPlacement(g.world, card, sel, cctx);
    if (check !== true) { rejected.push(card.id + ' -> ' + check); continue; }
    try {
      /* preview must not throw either */
      if (card.make) RS.previewCard(g.world, card, sel, cctx);
      RS.applyCard(g, card, sel, cctx);
      placed++;
    } catch (e) {
      fail('card "' + card.id + '" threw on apply: ' + e.message + '\n' + e.stack);
    }
  }
  ok('placed ' + placed + '/' + RS.CARDS.length + ' cards without error');
  if (rejected.length) console.log('  rejected by validation (test-harness targeting): \n    ' + rejected.join('\n    '));

  console.log('\n=== simulate 10s with everything placed ===');
  const cl = new RS.Climber(g, { x: g.world.start.x, y: g.world.start.y, profile: RS.PROFILES[1] });
  g.climber = cl;
  const FIXED = 1 / 120;
  let nan = false;
  for (let step = 0; step < 10 * 120; step++) {
    const input = { mx: cl.chest.x + Math.sin(step / 60) * 40, my: cl.chest.y - 40, left: step % 240 < 140, right: step % 240 > 90, jump: step % 400 === 0 };
    cl.update(FIXED, input, true);
    g.solver.step(FIXED);
    RS.updateProps(g, FIXED, g.solver.time);
    for (const p of g.solver.points) {
      if (!isFinite(p.x) || !isFinite(p.y)) { fail('NaN in solver point tag=' + p.tag + ' at step ' + step); nan = true; break; }
    }
    if (nan) break;
  }
  if (!nan) ok('stable: ' + g.solver.points.length + ' points, ' + g.solver.constraints.length + ' constraints, ' +
    g.world.holds.length + ' holds, ' + g.world.props.length + ' props');
  ok('toasts fired: ' + JSON.stringify(toasts.slice(0, 6)));

  console.log('\n=== snapshot / restore ===');
  const snap = RS.snapshotWorld(g.world);
  g.world.holds[5].dead = true;
  g.world.holds[6].greased = 1;
  RS.restoreWorld(g, g.world, snap);
  if (g.world.holds[5].dead) fail('restore did not revive a broken hold');
  else ok('restore reverted hold state');
}

console.log('\n=== party match: 3 players, full round ===');
{
  const g = makeGame();
  g.spawnClimber = function (p) {
    if (this.climber) this.climber.destroy();
    this.climber = new RS.Climber(this, {
      x: this.world.start.x, y: this.world.start.y, profile: p.profile, playerIndex: p.index
    });
    this.climberInfo = p;
  };
  g.phase = 'idle';
  RS.buildWorld(g, RS.PARTY_WALLS[1]);
  const m = new RS.Match(g, {
    wall: RS.PARTY_WALLS[1],
    players: [
      { name: 'A', profile: RS.PROFILES[0], color: '#f00' },
      { name: 'B', profile: RS.PROFILES[1], color: '#0f0' },
      { name: 'C', profile: RS.PROFILES[2], color: '#00f' }
    ],
    target: 5, seed: 42
  });
  g.match = m;
  m.beginRound();
  if (m.hand.length !== 3) fail('hand is ' + m.hand.length + ' cards, expected 3');
  else ok('dealt ' + m.hand.map(c => c.name).join(', '));

  /* each builder passes except the first, who places a jug */
  let guard = 0;
  while (m.phase === 'build' && guard++ < 10) {
    const b = m.currentBuilder();
    const card = m.hand.find(c => c.mode === 'point') || null;
    if (card) {
      const r = m.commitCard(card, { x: 330, y: -430 - guard * 30 });
      if (r !== true) { m.skipCard(); }
    } else m.skipCard();
  }
  ok('after build phase: ' + m.phase + ', log entries: ' + m.log.length);
  if (m.phase !== 'climb') fail('did not advance to climb phase');

  /* fake three runs: player B tops out */
  for (let i = 0; i < 3; i++) {
    const p = m.currentClimber();
    if (!p) break;
    g.climber.topped = (p.name === 'B');
    g.climber.toppedAt = 20;
    g.climber.highY = g.world.start.y - (p.name === 'B' ? 1200 : 300);
    g.climber.bonusTouched = false;
    m.endRun(g.climber.topped ? 'topped' : 'time');
  }
  ok('after climbs: phase=' + m.phase + ' | ' + m.players.map(p => p.name + '=' + p.score).join(' '));
  const b = m.players.find(p => p.name === 'B');
  if (b.score !== 3) fail('solo topper should score 3, got ' + b.score);
  else ok('scoring correct: solo top = 3 points');
  ok('summary: ' + m.lastRoundSummary);
}

console.log('\n' + (fails === 0 ? '=== ALL CHECKS PASSED ===' : '=== ' + fails + ' FAILURE(S) ==='));
process.exit(fails === 0 ? 0 : 1);

/* The one bug a climbing game must never ship: a route that cannot be topped out.
 *
 * Story routes are procedurally laid out, so this asserts the post-condition
 * rather than trusting the generator: from the starting jugs there must be a
 * chain of reachable moves all the way to the bell. Reachable means within the
 * measured comfortable envelope (<= 42px), allowing sideways and slightly
 * downward moves, because climbing is not monotonic.
 *
 * Party walls are exempt - their big gaps are the whole design, and the players
 * fill them in with cards.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const s = {}; s.window = s; s.console = console;
s.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] === undefined ? null : this._d[k]; },
  setItem(k, v) { this._d[k] = String(v); }
};
s.document = { createElement: () => ({ getContext: () => ({}) }) };
const c = vm.createContext(s);
for (const f of ['util', 'physics', 'holds', 'climber', 'components', 'levels', 'tutorial', 'party'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', f + '.js'), 'utf8'), c, { filename: f + '.js' });
const RS = s.RS;

const STEP = 42;

function analyse(def) {
  const g = {
    solver: new RS.Solver(), world: null, climber: null, runTime: 0,
    shake() {}, toast() {}, sfx() {}
  };
  RS.buildWorld(g, def);
  const hands = g.world.holds.filter(h => h.hands && !h.dead);
  const seed = hands.filter(h => h.y > def.start.y - 60);
  const seen = new Set(seed), queue = seed.slice();
  while (queue.length) {
    const cur = queue.shift();
    for (const h of hands) {
      if (seen.has(h)) continue;
      if (h.y >= cur.y + 18) continue;                 // may traverse, not plummet
      if (RS.dist(cur.x, cur.y, h.x, h.y) > STEP) continue;
      seen.add(h); queue.push(h);
    }
  }
  const fin = g.world.finish;
  let highest = Infinity;
  seen.forEach(h => { highest = Math.min(highest, h.y); });
  return {
    onChain: seen.size,
    total: hands.length,
    highest: highest,
    bell: fin.y,
    canTopOut: Array.from(seen).some(h => RS.dist(h.x, h.y, fin.x, fin.y) < (fin.r || 38) + 14),
    bridged: g.world.bridged || 0,
    holds: g.world.holds.length,
    startHasHold: seed.length > 0
  };
}

let fails = 0;
function chk(name, ok, extra) {
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (extra ? '  (' + extra + ')' : ''));
  if (!ok) fails++;
}

console.log('\nEvery non-party route must have a climbable chain to the bell:\n');

const levels = [['Tutorial', RS.TUTORIAL_LEVEL]].concat(RS.STORY_LEVELS.map(d => [d.name, d]));
for (const row of levels) {
  const name = row[0], def = row[1];
  const r = analyse(def);
  chk(name.padEnd(18) + ' tops out',
    r.canTopOut,
    r.onChain + '/' + r.total + ' holds on chain, ' + r.bridged + ' bridges, ' + r.holds + ' holds total');
  chk(name.padEnd(18) + ' has holds off the deck', r.startHasHold);
  /* Bridging is a safety net, not a crutch: if a route needs a lot of them the
     generator's spacing has drifted out of the reachable band. */
  chk(name.padEnd(18) + ' needs few bridges (<=12)', r.bridged <= 12, r.bridged + ' bridges');
}

/* Party walls must NOT be auto-bridged - the gaps are the game. */
console.log('\nParty walls keep their gaps:\n');
for (const def of RS.PARTY_WALLS) {
  const g = {
    solver: new RS.Solver(), world: null, climber: null, runTime: 0,
    shake() {}, toast() {}, sfx() {}
  };
  RS.buildWorld(g, def);
  chk(def.name.padEnd(18) + ' was not bridged', !g.world.bridged,
    (g.world.bridged || 0) + ' bridges');
}

/* ------------------------------------------------------------------ spawning
 * Regression guard. The climber used to spawn with its legs buried in the ground
 * (the start shelf sat below the ground surface); the collision ejection launched
 * the ragdoll and it settled completely upside down with nothing in arm's reach.
 * Every level must now put you on your feet, upright and able to grab at once.
 */
console.log('\nSpawn posture and responsiveness:\n');
{
  const F = 1 / 120;
  const spawn = (def) => {
    const g = {
      solver: new RS.Solver(), world: null, climber: null, runTime: 0,
      shake() {}, toast() {}, sfx() {}
    };
    RS.buildWorld(g, def);
    g.climber = new RS.Climber(g, { x: def.start.x, y: def.start.y, profile: RS.PROFILES[0] });
    return g;
  };

  const levels = [['Tutorial', RS.TUTORIAL_LEVEL]]
    .concat(RS.STORY_LEVELS.map(d => [d.name, d]))
    .concat(RS.PARTY_WALLS.map(d => [d.name, d]));

  for (const row of levels) {
    const name = row[0], def = row[1];
    const g = spawn(def), cl = g.climber;

    let worst = 0;
    for (const p of cl.points) {
      if (!p.collide) continue;
      for (const t of g.world.terrain) {
        const hit = RS.resolveShape(p, t);
        if (hit && hit.pen > worst) worst = hit.pen;
      }
    }
    chk(name.padEnd(18) + ' spawns clear of terrain', worst < 1, worst.toFixed(1) + 'px embedded');

    for (let i = 0; i < 300; i++) {
      cl.update(F, { mx: cl.chest.x, my: cl.chest.y - 20, left: false, right: false, jump: false }, true);
      g.solver.step(F);
      RS.updateProps(g, F, g.solver.time);
    }
    const upright = cl.head.y < cl.chest.y && cl.chest.y < cl.pelvis.y;
    const tilt = Math.abs(Math.atan2(cl.chest.x - cl.pelvis.x, -(cl.chest.y - cl.pelvis.y)) * 180 / Math.PI);
    chk(name.padEnd(18) + ' settles upright', upright && tilt < 35,
      upright ? 'tilt ' + tilt.toFixed(0) + 'deg' : 'INVERTED');
    chk(name.padEnd(18) + ' has its feet down', cl.footCount() > 0);

    const jugs = g.world.holds.filter(h => h.protected && h.type === 'jug');
    if (jugs.length) {
      jugs.sort((a, b) => RS.dist(cl.chest.x, cl.chest.y, a.x, a.y) - RS.dist(cl.chest.x, cl.chest.y, b.x, b.y));
      const j = jugs[0];
      let frames = -1;
      for (let i = 0; i < 240; i++) {
        cl.update(F, { mx: j.x, my: j.y, left: true, right: false, jump: false }, true);
        g.solver.step(F);
        RS.updateProps(g, F, g.solver.time);
        if (cl.limbs.handL.hold) { frames = i; break; }
      }
      chk(name.padEnd(18) + ' grabs within 500ms', frames >= 0 && frames < 60,
        frames < 0 ? 'never grabbed' : (frames / 120 * 1000).toFixed(0) + 'ms');
    }
  }
}

console.log('\n' + (fails === 0
  ? '=== ROUTES TOPPABLE, SPAWNS CLEAN ==='
  : '=== ' + fails + ' CHECK(S) FAILED ==='));
process.exit(fails ? 1 : 0);

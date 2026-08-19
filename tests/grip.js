/* Does hold quality still decide whether you stay on?
 * Hang from a single hold of each type, swing hard, and see how long you last. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const sandbox = {}; sandbox.window = sandbox; sandbox.console = console;
sandbox.localStorage = { _d:{}, getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=v;} };
sandbox.document = { createElement: () => ({ getContext: () => ({}) }) };
const ctx = vm.createContext(sandbox);
for (const f of ['util','physics','holds','climber','components','levels','party'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'src',f+'.js'),'utf8'), ctx, {filename:f+'.js'});
const RS = sandbox.RS;

/* Hang one-handed from a single hold high off the deck, swinging the free arm
 * from side to side to load the grip. Report how long the hand stays on. */
function hang(type, mods, swing, lockPx) {
  if (lockPx === undefined) lockPx = 30;   // how far above the hold we aim
  const g = { solver: new RS.Solver(), world: null, climber: null, runTime: 0,
              shake(){}, toast(){}, sfx(){} };
  const def = {
    id:'t', name:'t', theme:'gym', height: 900, par: 60,
    bounds:{x:0,y:-940,w:660,h:1360},
    start:{x:330,y:-400}, finish:{x:330,y:-880,r:38},
    terrain:[{type:'rect',x:-300,y:0,w:1260,h:420,mat:'rock'}],
    holds:[[type,330,-430]], zones:[], props:[]
  };
  RS.buildWorld(g, def);
  const target = g.world.holds.find(h => h.type === type);
  if (mods.greased) target.greased = mods.greased;
  if (mods.chalked) target.chalked = mods.chalked;
  if (mods.wet) { /* applied to the climber below */ }

  const cl = new RS.Climber(g, { x: 330, y: -400, profile: RS.PROFILES[0] });
  g.climber = cl;
  /* Hang from the hold with the arm already extended. Teleporting the body up
     level with the hold instead starts the arm fully collapsed, which the grip
     model quite correctly reads as a maximal lock-off - the single hardest
     position there is - so every hold failed regardless of its quality. */
  cl.teleport(330, -430 + RS.CLIMBER_REACH + 26);
  cl.handL.setPos(target.x, target.y, false);
  cl.latch(cl.limbs.handL, target);
  if (mods.wet) cl.wet = mods.wet;

  const FIXED = 1/120;
  let heldFor = 0;
  for (let i = 0; i < 6*120; i++) {
    if (mods.wet) cl.wet = mods.wet;              // keep hands soaked
    const t = i * FIXED;
    /* free hand thrashes side to side to generate swing load */
    const mx = 330 + Math.sin(t * swing) * 150;
    const input = { mx, my: -430 - lockPx, left: true, right: false, jump: false };
    cl.update(FIXED, input, true);
    g.solver.step(FIXED);
    RS.updateProps(g, FIXED, g.solver.time);
    if (cl.limbs.handL.hold) heldFor = t; else break;
  }
  return heldFor;
}

function row(label, secs) {
  const bar = '#'.repeat(Math.round(secs * 6));
  console.log('  ' + label.padEnd(30) + (secs >= 5.9 ? ' held 6.0s+' : ' fell at ' + secs.toFixed(2) + 's').padEnd(18) + bar);
  return secs;
}

console.log('\nOne-handed hang, free arm swinging hard (6s max):');
const jug     = row('jug',                       hang('jug',    {}, 3.2));
const sloper  = row('sloper',                    hang('sloper', {}, 3.2));
const crimp   = row('crimp',                     hang('crimp',  {}, 3.2));
const ice     = row('ice hold',                  hang('ice',    {}, 3.2));
const greased = row('jug, greased',              hang('jug',    {greased:1}, 3.2));
const wetJug  = row('jug, wet hands',            hang('jug',    {wet:1}, 3.2));
const chalked = row('sloper, chalked',           hang('sloper', {chalked:1}, 3.2));
const resin   = row('resin hold',                hang('resin',  {}, 3.2));

console.log('\nStill hang (locked off vs straight-armed):');
const sloperStill = row('sloper, locked off',      hang('sloper', {}, 0.0, 30));
const sloperHang  = row('sloper, straight-armed',  hang('sloper', {}, 0.0, 0));
const crimpHang   = row('crimp, straight-armed',   hang('crimp',  {}, 0.0, 0));
const jugLock     = row('jug, locked off',         hang('jug',    {}, 0.0, 30));

console.log('');
const checks = [
  ['a jug beats a sloper',            jug > sloper],
  ['grease makes a jug worse',        greased < jug],
  ['wet hands make a jug worse',      wetJug < jug],
  ['chalk makes a sloper better',     chalked > sloper],
  ['ice is far worse than a jug',     ice < jug],
  ['resin is unslippable',            resin >= 5.9],
  ['a sloper holds when straight-armed', sloperHang >= 5.9],
  ['locking off a sloper does not',   sloperStill < 5.9],
  ['a crimp holds when straight-armed', crimpHang >= 5.9],
  ['you can lock off on a jug',       jugLock >= 5.9]
];
let bad = 0;
for (const [name, pass] of checks) {
  console.log('  ' + (pass ? 'ok  ' : 'FAIL') + '  ' + name);
  if (!pass) bad++;
}
console.log('\n' + (bad === 0 ? '=== GRIP QUALITY STILL MATTERS ===' : '=== ' + bad + ' GRIP CHECK(S) FAILED ==='));
process.exit(bad ? 1 : 0);

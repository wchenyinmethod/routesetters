/* ROUTESETTERS - components.js
 * The routesetting deck. Every card is a fully simulated change to the wall:
 * new holds, modifications to holds that already exist, motion rigs, weather
 * and hazards. 49 cards in total.
 *
 * Card contract
 *   mode      how the player places it: point | pointAngle | segment | hold |
 *             holdAngle | holdMove | twoHolds
 *   make      returns {holds,zones,props,terrain} for a fresh placement
 *   mutate    for cards that alter an existing hold instead of adding one
 *   valid     extra placement rules on top of the global ones
 *   limit     max uses per match (undefined = unlimited)
 */
(function (RS) {
  'use strict';

  var clamp = RS.clamp;

  var CAT = {
    hold: { label: 'Hold', color: '#5ba0e0' },
    mod: { label: 'Modify', color: '#c9a227' },
    motion: { label: 'Motion', color: '#8f6bd0' },
    env: { label: 'Weather', color: '#4bb3a5' },
    trap: { label: 'Hazard', color: '#d9534f' },
    help: { label: 'Kindness', color: '#63c26a' }
  };
  RS.CARD_CATS = CAT;

  var RARITY = { common: 10, uncommon: 5, rare: 2 };

  var CARDS = [];
  function card(o) {
    o.weight = RARITY[o.rarity || 'common'];
    o.cat = o.cat || 'hold';
    if (!o.mode) o.mode = 'point';
    CARDS.push(o);
    return o;
  }

  /* Shorthand: a card that simply drops one hold type at a point. */
  function holdCard(o) {
    var typeId = o.type;
    o.make = o.make || function (sel, world, ctx) {
      var h = RS.makeHold(typeId, sel.x, sel.y, {
        angle: sel.angle || 0,
        placedBy: ctx ? ctx.playerIndex : -1
      });
      var out = { holds: [h], zones: [], props: [], terrain: [] };
      if (h.solid) out.terrain.push(RS.holdTerrain(h));
      return out;
    };
    o.ghostHold = typeId;
    return card(o);
  }

  /* ==================================================================== HOLDS */

  holdCard({
    id: 'jug', type: 'jug', name: 'Bomber Jug', cat: 'hold', rarity: 'common',
    glyph: '●', desc: 'A big friendly handle. Everyone can use it, including your opponents.'
  });

  holdCard({
    id: 'crimp', type: 'crimp', name: 'Razor Crimp', cat: 'hold', rarity: 'common',
    glyph: '▪', desc: 'Tiny edge. Poor grip and it burns through stamina three times as fast.'
  });

  holdCard({
    id: 'sloper', type: 'sloper', name: 'Sloper', cat: 'hold', rarity: 'common',
    glyph: '◗', desc: 'Rounded blob. Fine if you hang still, spits you off the moment you swing.'
  });

  holdCard({
    id: 'pinch', type: 'pinch', name: 'Pinch Block', cat: 'hold', rarity: 'common',
    glyph: '◆', desc: 'Squeeze it. Middling grip, middling drain, no surprises.'
  });

  holdCard({
    id: 'pocket', type: 'pocket', name: 'Two-Finger Pocket', cat: 'hold', rarity: 'common',
    glyph: '◎', desc: 'Two digits only. Positive but very tiring.'
  });

  holdCard({
    id: 'undercling', type: 'undercling', name: 'Undercling', cat: 'hold', rarity: 'uncommon',
    glyph: '◠', desc: 'Only works if your hand comes at it from below. Reach past it and it is useless.'
  });

  holdCard({
    id: 'sidepull', type: 'sidepull', name: 'Sidepull', cat: 'hold', rarity: 'uncommon',
    glyph: '◄', mode: 'pointAngle',
    desc: 'Directional. Pull along the arrow and it is solid; pull across it and you drop.'
  });

  holdCard({
    id: 'footchip', type: 'footchip', name: 'Foot Chip', cat: 'help', rarity: 'common',
    glyph: '▁', desc: 'Feet only. Standing on something halves how fast your arms tire.'
  });

  holdCard({
    id: 'volume', type: 'volume', name: 'Volume', cat: 'hold', rarity: 'uncommon',
    glyph: '▲', desc: 'A solid wedge bolted to the wall. Grab the apex or just stand on it.'
  });

  holdCard({
    id: 'restledge', type: 'restledge', name: 'Rest Ledge', cat: 'help', rarity: 'uncommon',
    glyph: '▬', desc: 'A flat shelf. Stand here and your stamina comes back fast.'
  });

  holdCard({
    id: 'crumble', type: 'crumble', name: 'Crumbling Hold', cat: 'trap', rarity: 'uncommon',
    glyph: '◌', desc: 'Feels great for about a second and a bit, then snaps off the wall forever.'
  });

  holdCard({
    id: 'icehold', type: 'ice', name: 'Ice Hold', cat: 'trap', rarity: 'uncommon',
    glyph: '❄', desc: 'Glassy. Barely grips at all and gets worse the longer you hang on it.'
  });

  holdCard({
    id: 'resin', type: 'resin', name: 'Resin Hold', cat: 'hold', rarity: 'rare',
    glyph: '⬤', desc: 'Sticks like tar. Unslippable, but you cannot let go for two thirds of a second.'
  });

  holdCard({
    id: 'magnet', type: 'magnet', name: 'Magnet Hold', cat: 'hold', rarity: 'rare',
    glyph: '⊙', desc: 'Drags any hand that comes near into place. Generous aim assist for whoever is climbing.'
  });

  holdCard({
    id: 'spring', type: 'spring', name: 'Spring Hold', cat: 'motion', rarity: 'rare',
    glyph: '⇑', mode: 'pointAngle',
    desc: 'Loaded on a coil. Let go and it launches you along the arrow. Aim it well or aim it cruelly.'
  });

  holdCard({
    id: 'partybox', type: 'partybox', name: 'Party Box', cat: 'help', rarity: 'rare',
    glyph: '★', limit: 1,
    desc: 'Golden hold. Anyone who touches it this round scores a bonus point. One per match.'
  });

  card({
    id: 'rail', name: 'Bolt-On Rail', cat: 'hold', rarity: 'uncommon', mode: 'segment',
    glyph: '━', minLen: 45, maxLen: 190,
    desc: 'A long steel rail. Grabbable anywhere along its length, so it opens up big traverses.',
    make: function (sel, world, ctx) {
      var holds = [], n = Math.max(2, Math.round(RS.dist(sel.x, sel.y, sel.x2, sel.y2) / 22));
      for (var i = 0; i <= n; i++) {
        var t = i / n;
        var h = RS.makeHold('rail', RS.lerp(sel.x, sel.x2, t), RS.lerp(sel.y, sel.y2, t), {
          placedBy: ctx ? ctx.playerIndex : -1
        });
        h.angle = Math.atan2(sel.y2 - sel.y, sel.x2 - sel.x);
        h.railGroup = 'rg' + RS.uid('');
        h.railEnds = (i === 0 || i === n);
        holds.push(h);
      }
      return {
        holds: holds, zones: [], props: [],
        terrain: [{ type: 'capsule', x1: sel.x, y1: sel.y, x2: sel.x2, y2: sel.y2, r: 4, mat: 'metal' }]
      };
    }
  });

  /* ================================================================ MODIFIERS */

  card({
    id: 'shift', name: 'Shift Hold', cat: 'mod', rarity: 'common', mode: 'holdMove',
    glyph: '✥', moveRadius: 135,
    desc: 'Pick any hold and slide it up to 135px. The cheapest way to break someone else\'s beta.',
    mutate: function (sel, world) {
      var h = sel.hold;
      h.x = h.baseX = sel.x;
      h.y = h.baseY = sel.y;
      if (h.motion && h.motion.kind === 'cam') { h.motion.cx = sel.x; h.motion.cy = sel.y; }
      RS.syncHoldTerrain(world, h);
    }
  });

  card({
    id: 'reaim', name: 'Re-Aim Hold', cat: 'mod', rarity: 'common', mode: 'holdAngle',
    glyph: '⟲',
    desc: 'Spin a directional hold to face somewhere unhelpful. Does nothing to round holds.',
    valid: function (sel) {
      if (!sel.hold) return 'Pick a hold';
      var t = RS.HOLD_TYPES[sel.hold.type];
      if (!t.directional && !sel.hold.springPower) return 'That hold has no direction';
      return true;
    },
    mutate: function (sel) { sel.hold.angle = sel.angle; }
  });

  card({
    id: 'sandbag', name: 'Sandbag It', cat: 'mod', rarity: 'common', mode: 'hold',
    glyph: '⤓',
    desc: 'Grind a hold down to 55% size. Smaller edge, worse grip, much more tiring.',
    valid: function (sel) {
      if (!sel.hold) return 'Pick a hold';
      if (sel.hold.sandbagged) return 'Already sandbagged';
      return true;
    },
    mutate: function (sel, world) {
      var h = sel.hold;
      h.sandbagged = true;
      h.r *= 0.55;
      h.reach *= 0.7;
      h.grip *= 0.72;
      h.drain *= 1.9;
      RS.syncHoldTerrain(world, h);
    }
  });

  card({
    id: 'grease', name: 'Grease Job', cat: 'mod', rarity: 'common', mode: 'hold',
    glyph: '≈',
    desc: 'Smear a hold with grease. Grip drops by well over half and it looks disgusting.',
    valid: function (sel) { return sel.hold ? (sel.hold.greased >= 0.95 ? 'Already greased' : true) : 'Pick a hold'; },
    mutate: function (sel) { sel.hold.greased = Math.min(1, sel.hold.greased + 1); sel.hold.chalked = 0; }
  });

  card({
    id: 'chalk', name: 'Chalk Up', cat: 'help', rarity: 'common', mode: 'hold',
    glyph: '✧',
    desc: 'Brush and chalk a hold. Better grip, less drain. Helps whoever climbs next, including you.',
    valid: function (sel) { return sel.hold ? (sel.hold.chalked >= 0.95 ? 'Already chalked' : true) : 'Pick a hold'; },
    mutate: function (sel) {
      var h = sel.hold;
      h.chalked = Math.min(1, h.chalked + 1);
      h.greased = Math.max(0, h.greased - 0.7);
      h.drain *= 0.72;
    }
  });

  card({
    id: 'pry', name: 'Pry It Off', cat: 'mod', rarity: 'rare', mode: 'hold', limit: 2,
    glyph: '✕',
    desc: 'Unbolt a hold and throw it in the bin. Gone for the rest of the match.',
    mutate: function (sel, world) {
      sel.hold.dead = true;
      RS.syncHoldTerrain(world, sel.hold);
    }
  });

  card({
    id: 'swap', name: 'Swap Two Holds', cat: 'mod', rarity: 'uncommon', mode: 'twoHolds',
    glyph: '⇄',
    desc: 'Exchange the positions of two holds. Great for putting the good jug somewhere useless.',
    mutate: function (sel, world) {
      var a = sel.hold, b = sel.hold2;
      var ax = a.baseX, ay = a.baseY;
      a.x = a.baseX = b.baseX; a.y = a.baseY = b.baseY;
      b.x = b.baseX = ax; b.y = b.baseY = ay;
      if (a.motion && a.motion.kind === 'cam') { a.motion.cx = a.baseX; a.motion.cy = a.baseY; }
      if (b.motion && b.motion.kind === 'cam') { b.motion.cx = b.baseX; b.motion.cy = b.baseY; }
      RS.syncHoldTerrain(world, a);
      RS.syncHoldTerrain(world, b);
    }
  });

  card({
    id: 'spincam', name: 'Spin Cam', cat: 'motion', rarity: 'rare', mode: 'hold',
    glyph: '✷',
    desc: 'Mount a hold on a rotating cam. It orbits its old position forever. Timing problem.',
    valid: function (sel) { return sel.hold ? (sel.hold.motion ? 'That hold already moves' : true) : 'Pick a hold'; },
    mutate: function (sel, world) {
      var h = sel.hold;
      h.motion = { kind: 'cam', cx: h.baseX, cy: h.baseY, radius: 42, speed: 1.15, phase: RS.rand(RS.TAU) };
      RS.syncHoldTerrain(world, h);
    }
  });

  /* =================================================================== MOTION */

  card({
    id: 'metronome', name: 'Metronome Hold', cat: 'motion', rarity: 'uncommon', mode: 'hold',
    glyph: '⇄',
    desc: 'Put a hold on a horizontal slider. It sweeps 75px each way, on the beat.',
    valid: function (sel) { return sel.hold ? (sel.hold.motion ? 'That hold already moves' : true) : 'Pick a hold'; },
    mutate: function (sel) {
      sel.hold.motion = { kind: 'oscillate', amp: 75, speed: 1.5, phase: RS.rand(RS.TAU) };
    }
  });

  card({
    id: 'elevator', name: 'Elevator Hold', cat: 'motion', rarity: 'uncommon', mode: 'hold',
    glyph: '⇅',
    desc: 'Put a hold on a vertical lift. Catch it at the top of its travel and you gain 90px free.',
    valid: function (sel) { return sel.hold ? (sel.hold.motion ? 'That hold already moves' : true) : 'Pick a hold'; },
    mutate: function (sel) {
      sel.hold.motion = { kind: 'elevator', amp: 92, speed: 0.95, phase: RS.rand(RS.TAU) };
    }
  });

  card({
    id: 'conveyor', name: 'Conveyor Rail', cat: 'motion', rarity: 'uncommon', mode: 'segment',
    glyph: '⇥', minLen: 70, maxLen: 240,
    desc: 'A jug that shuttles back and forth along a track. Free ride if you catch it going your way.',
    make: function (sel, world, ctx) {
      var h = RS.makeHold('jug', sel.x, sel.y, { placedBy: ctx ? ctx.playerIndex : -1 });
      h.segment = { x1: sel.x, y1: sel.y, x2: sel.x2, y2: sel.y2 };
      h.motion = { kind: 'conveyor', speed: 0.30, phase: RS.rand(1), pingpong: true };
      return {
        holds: [h], zones: [], terrain: [],
        props: [{ kind: 'track', x1: sel.x, y1: sel.y, x2: sel.x2, y2: sel.y2 }]
      };
    }
  });

  card({
    id: 'zipline', name: 'Zipline', cat: 'motion', rarity: 'rare', mode: 'segment',
    glyph: '⟍', minLen: 110, maxLen: 420,
    desc: 'A cable with a trolley. Grab the handle and it runs you downhill, fast.',
    valid: function (sel) {
      if (Math.abs(sel.y2 - sel.y) < 24) return 'Needs a slope to run down';
      return true;
    },
    make: function (sel, world, ctx) {
      /* run the cable downhill so the trolley starts high */
      var a = { x: sel.x, y: sel.y }, b = { x: sel.x2, y: sel.y2 };
      if (a.y > b.y) { var t = a; a = b; b = t; }
      return {
        holds: [], zones: [], terrain: [],
        props: [{ kind: 'zipline', x1: a.x, y1: a.y, x2: b.x, y2: b.y, placedBy: ctx ? ctx.playerIndex : -1 }]
      };
    }
  });

  card({
    id: 'pendulum', name: 'Pendulum Rope', cat: 'motion', rarity: 'uncommon', mode: 'point',
    glyph: '⌇',
    desc: 'A rope bolted to the wall. Grab the knot, swing, and let go at the right moment.',
    make: function (sel, world, ctx) {
      return {
        holds: [], zones: [], terrain: [],
        props: [{ kind: 'rope', x: sel.x, y: sel.y, segs: 9, segLen: 15, style: 'rope', placedBy: ctx ? ctx.playerIndex : -1 }]
      };
    }
  });

  card({
    id: 'vine', name: 'Hanging Vine', cat: 'motion', rarity: 'uncommon', mode: 'point',
    glyph: '⚯',
    desc: 'A long floppy vine you can grab in three places. Softer and wilder than a rope.',
    make: function (sel, world, ctx) {
      return {
        holds: [], zones: [], terrain: [],
        props: [{ kind: 'rope', x: sel.x, y: sel.y, segs: 15, segLen: 14, style: 'vine', grips: [0.45, 0.72, 1.0], placedBy: ctx ? ctx.playerIndex : -1 }]
      };
    }
  });

  /* ============================================================== ENVIRONMENT */

  card({
    id: 'wind', name: 'Wind Draft', cat: 'env', rarity: 'common', mode: 'pointAngle',
    glyph: '≫',
    desc: 'A gusting crosswind, 260 wide. It comes and goes, so time your moves between the gusts.',
    make: function (sel) {
      return {
        holds: [], props: [], terrain: [],
        zones: [{
          kind: 'wind', shape: 'rect', x: sel.x, y: sel.y, w: 260, h: 190, angle: 0,
          gustAmp: 1250, gustFreq: 0.42, gustDir: sel.angle, gustPhase: RS.rand(1),
          visual: 'wind', dir: sel.angle
        }]
      };
    }
  });

  card({
    id: 'updraft', name: 'Updraft Fan', cat: 'help', rarity: 'uncommon', mode: 'point',
    glyph: '⇧',
    desc: 'An industrial fan blowing straight up. Lifts you, and makes falling much less final.',
    make: function (sel) {
      return {
        holds: [], props: [{ kind: 'fan', x: sel.x, y: sel.y + 110 }], terrain: [],
        zones: [{
          kind: 'updraft', shape: 'rect', x: sel.x, y: sel.y, w: 150, h: 240, angle: 0,
          fy: -1150, drag: 0.004, visual: 'updraft'
        }]
      };
    }
  });

  card({
    id: 'waterfall', name: 'Waterfall', cat: 'env', rarity: 'uncommon', mode: 'point',
    glyph: '⋮',
    desc: 'A curtain of water. Soaks your hands so every hold grips at half strength until you dry off.',
    make: function (sel) {
      return {
        holds: [], props: [{ kind: 'spout', x: sel.x, y: sel.y - 150 }], terrain: [],
        zones: [{
          kind: 'water', shape: 'rect', x: sel.x, y: sel.y, w: 96, h: 300, angle: 0,
          fy: 340, wet: 1, drag: 0.008, visual: 'water'
        }]
      };
    }
  });

  card({
    id: 'verglas', name: 'Verglas Patch', cat: 'trap', rarity: 'uncommon', mode: 'point',
    glyph: '❅',
    desc: 'Thin ice over the rock. Every hold inside grips at a third, and your feet find nothing.',
    make: function (sel) {
      return {
        holds: [], props: [], terrain: [],
        zones: [{
          kind: 'ice', shape: 'circle', x: sel.x, y: sel.y, r: 105,
          slick: 0.33, visual: 'ice'
        }]
      };
    }
  });

  card({
    id: 'tarpit', name: 'Tar Smear', cat: 'trap', rarity: 'uncommon', mode: 'point',
    glyph: '◍',
    desc: 'Sticky black tar. Your limbs move like they are in treacle and you tire twice as fast.',
    make: function (sel) {
      return {
        holds: [], props: [], terrain: [],
        zones: [{
          kind: 'tar', shape: 'circle', x: sel.x, y: sel.y, r: 100,
          drag: 0.055, staminaMul: 2.0, visual: 'tar'
        }]
      };
    }
  });

  card({
    id: 'fog', name: 'Fog Bank', cat: 'trap', rarity: 'common', mode: 'point',
    glyph: '☁',
    desc: 'Cloud rolls in and you cannot see the holds. You will have to remember where they were.',
    make: function (sel) {
      return {
        holds: [], props: [], terrain: [],
        zones: [{
          kind: 'fog', shape: 'circle', x: sel.x, y: sel.y, r: 150,
          fog: 0.92, visual: 'fog', phase: RS.rand(10)
        }]
      };
    }
  });

  card({
    id: 'lowgrav', name: 'Gravity Anomaly', cat: 'help', rarity: 'rare', mode: 'point',
    glyph: '◌',
    desc: 'Something is wrong with the physics here. Gravity drops to 40% inside the bubble.',
    make: function (sel) {
      return {
        holds: [], props: [], terrain: [],
        zones: [{
          kind: 'lowgrav', shape: 'circle', x: sel.x, y: sel.y, r: 130,
          gravMul: 0.40, visual: 'lowgrav'
        }]
      };
    }
  });

  card({
    id: 'heavyair', name: 'Heavy Air', cat: 'trap', rarity: 'rare', mode: 'point',
    glyph: '⬇',
    desc: 'Gravity runs at 175% in here. Every hold suddenly feels two grades harder.',
    make: function (sel) {
      return {
        holds: [], props: [], terrain: [],
        zones: [{
          kind: 'heavygrav', shape: 'circle', x: sel.x, y: sel.y, r: 125,
          gravMul: 1.75, visual: 'heavygrav'
        }]
      };
    }
  });

  card({
    id: 'airjet', name: 'Air Jet', cat: 'trap', rarity: 'uncommon', mode: 'pointAngle',
    glyph: '➤',
    desc: 'A compressed air nozzle that fires a hard blast every couple of seconds. Nothing subtle.',
    make: function (sel) {
      return {
        holds: [], terrain: [],
        props: [{ kind: 'nozzle', x: sel.x, y: sel.y, angle: sel.angle }],
        zones: [{
          kind: 'jet', shape: 'rect',
          x: sel.x + Math.cos(sel.angle) * 90, y: sel.y + Math.sin(sel.angle) * 90,
          w: 200, h: 74, angle: sel.angle,
          gustAmp: 5200, gustFreq: 0.45, gustDuty: 0.22, gustDir: sel.angle,
          gustPhase: RS.rand(1), visual: 'jet', dir: sel.angle
        }]
      };
    }
  });

  /* =================================================================== TRAPS */

  card({
    id: 'rockfall', name: 'Rockfall Chute', cat: 'trap', rarity: 'uncommon', mode: 'point',
    glyph: '⁙',
    desc: 'Loose block above the route. Drops a boulder every three seconds. Getting hit means letting go.',
    make: function (sel, world, ctx) {
      return {
        holds: [], zones: [], terrain: [],
        props: [{ kind: 'rockfall', x: sel.x, y: sel.y, interval: 3.0, t: RS.rand(3), placedBy: ctx ? ctx.playerIndex : -1 }]
      };
    }
  });

  card({
    id: 'saw', name: 'Bolt Saw', cat: 'trap', rarity: 'rare', mode: 'segment',
    glyph: '✻', minLen: 60, maxLen: 300,
    desc: 'A spinning blade that runs a track across the route. Touch it and you are peeled off the wall.',
    make: function (sel) {
      return {
        holds: [], zones: [], terrain: [],
        props: [{ kind: 'saw', x1: sel.x, y1: sel.y, x2: sel.x2, y2: sel.y2, r: 17, speed: 0.42, phase: RS.rand(1) }]
      };
    }
  });

  card({
    id: 'beartrap', name: 'Bear Trap', cat: 'trap', rarity: 'uncommon', mode: 'point',
    glyph: '⋀',
    desc: 'Jaws bolted to the rock. Step in it and you get sent back to your last clip.',
    make: function (sel) {
      return {
        holds: [], zones: [], terrain: [],
        props: [{ kind: 'beartrap', x: sel.x, y: sel.y, r: 20, armed: 1, snap: 0 }]
      };
    }
  });

  card({
    id: 'swingbeam', name: 'Metronome Beam', cat: 'trap', rarity: 'rare', mode: 'point',
    glyph: '⌁',
    desc: 'A heavy steel beam that sweeps a full circle. Solid, so it will physically shove you off.',
    make: function (sel) {
      var beam = { kind: 'beam', x: sel.x, y: sel.y, len: 105, speed: 0.85, phase: RS.rand(RS.TAU) };
      var shape = { type: 'capsule', x1: sel.x, y1: sel.y, x2: sel.x + 105, y2: sel.y, r: 8, mat: 'metal', moving: true };
      beam.shape = shape;
      return { holds: [], zones: [], props: [beam], terrain: [shape] };
    }
  });

  /* ============================================================== KINDNESSES */

  card({
    id: 'checkpoint', name: 'Quickdraw Clip', cat: 'help', rarity: 'uncommon', mode: 'point', limit: 3,
    glyph: '⚑',
    desc: 'A bolt and a quickdraw. Whoever climbs past it respawns here instead of the ground.',
    make: function (sel) {
      return {
        holds: [], zones: [], terrain: [],
        props: [{ kind: 'checkpoint', x: sel.x, y: sel.y, r: 42 }]
      };
    }
  });

  card({
    id: 'chalkstash', name: 'Chalk Stash', cat: 'help', rarity: 'common', mode: 'point',
    glyph: '⬜',
    desc: 'A bucket of chalk on a ledge. Climb through it to get 45 stamina back. Refills every 8 seconds.',
    make: function (sel) {
      return {
        holds: [], zones: [],
        terrain: [{ type: 'capsule', x1: sel.x - 14, y1: sel.y + 8, x2: sel.x + 14, y2: sel.y + 8, r: 4, mat: 'ply' }],
        props: [{ kind: 'chalkstash', x: sel.x, y: sel.y, r: 26, cd: 0 }]
      };
    }
  });

  card({
    id: 'crashpad', name: 'Crash Pad', cat: 'help', rarity: 'common', mode: 'point',
    glyph: '▭',
    desc: 'A bouncy mat. Land on it and you get flung back up instead of hitting the deck.',
    make: function (sel) {
      return {
        holds: [], zones: [],
        terrain: [{ type: 'capsule', x1: sel.x - 42, y1: sel.y, x2: sel.x + 42, y2: sel.y, r: 9, mat: 'pad', visual: 'pad' }],
        props: [{ kind: 'pad', x: sel.x, y: sel.y, w: 84 }]
      };
    }
  });

  /* ================================================================= TERRAIN */

  card({
    id: 'overhang', name: 'Overhang Roof', cat: 'mod', rarity: 'uncommon', mode: 'pointAngle',
    glyph: '⌐',
    desc: 'Bolt a solid roof panel across the route. No holds on it, so you have to climb around.',
    make: function (sel) {
      var L = 92;
      return {
        holds: [], zones: [], props: [],
        terrain: [{
          type: 'capsule',
          x1: sel.x - Math.cos(sel.angle) * L, y1: sel.y - Math.sin(sel.angle) * L,
          x2: sel.x + Math.cos(sel.angle) * L, y2: sel.y + Math.sin(sel.angle) * L,
          r: 11, mat: 'granite', visual: 'panel'
        }]
      };
    }
  });

  card({
    id: 'slab', name: 'Slab Panel', cat: 'mod', rarity: 'common', mode: 'segment',
    glyph: '◣', minLen: 60, maxLen: 250,
    desc: 'An angled plywood slab. Friction only. You can smear up it if the angle is kind.',
    make: function (sel) {
      return {
        holds: [], zones: [], props: [],
        terrain: [{
          type: 'capsule', x1: sel.x, y1: sel.y, x2: sel.x2, y2: sel.y2,
          r: 7, mat: 'ply', visual: 'panel'
        }]
      };
    }
  });

  RS.CARDS = CARDS;
  RS.CARD_BY_ID = {};
  for (var ci = 0; ci < CARDS.length; ci++) RS.CARD_BY_ID[CARDS[ci].id] = CARDS[ci];

  /* ============================================================ world helpers */

  /* Keep the static collision shape of a solid hold in sync with the hold. */
  RS.syncHoldTerrain = function (world, h) {
    var tag = 'hold:' + h.hid;
    var i, found = false;
    for (i = world.terrain.length - 1; i >= 0; i--) {
      if (world.terrain[i].tag === tag) {
        if (h.dead || !h.solid) { world.terrain.splice(i, 1); continue; }
        var fresh = RS.holdTerrain(h);
        for (var k in fresh) world.terrain[i][k] = fresh[k];
        found = true;
      }
    }
    if (!found && !h.dead && h.solid) world.terrain.push(RS.holdTerrain(h));
  };

  /* Global placement rules shared by every card. */
  RS.checkPlacement = function (world, card, sel, ctx) {
    var x = sel.x, y = sel.y;
    if (card.mode === 'hold' || card.mode === 'holdAngle' || card.mode === 'twoHolds') {
      if (!sel.hold) return 'Click a hold';
      if (sel.hold.protected) return 'That hold is part of the anchor';
      if (card.mode === 'twoHolds') {
        if (!sel.hold2) return 'Now pick a second hold';
        if (sel.hold2 === sel.hold) return 'Pick two different holds';
        if (sel.hold2.protected) return 'That hold is part of the anchor';
      }
    } else if (card.mode === 'holdMove') {
      if (!sel.hold) return 'Click a hold to move';
      if (sel.hold.protected) return 'That hold is part of the anchor';
      if (sel.placed) {
        if (RS.dist(sel.hold.baseX, sel.hold.baseY, x, y) > card.moveRadius) return 'Too far - stay in the circle';
      }
    }

    var needsSpace = card.mode === 'point' || card.mode === 'pointAngle' ||
                     card.mode === 'segment' || card.mode === 'holdMove';
    if (needsSpace && sel.x !== undefined) {
      if (x < world.bounds.x + 8 || x > world.bounds.x + world.bounds.w - 8) return 'Outside the wall';
      if (y < world.bounds.y + 8 || y > world.bounds.y + world.bounds.h - 8) return 'Outside the wall';
      var fin = world.finish;
      if (fin && RS.dist(x, y, fin.x, fin.y) < 62) return 'Too close to the top anchor';
      if (world.start && RS.dist(x, y, world.start.x, world.start.y) < 58) return 'Too close to the start';
    }

    if (card.mode === 'segment' && sel.x2 !== undefined) {
      var len = RS.dist(sel.x, sel.y, sel.x2, sel.y2);
      if (card.minLen && len < card.minLen) return 'Too short';
      if (card.maxLen && len > card.maxLen) return 'Too long';
      var f2 = world.finish;
      if (f2 && RS.dist(sel.x2, sel.y2, f2.x, f2.y) < 62) return 'Too close to the top anchor';
      if (sel.x2 < world.bounds.x + 8 || sel.x2 > world.bounds.x + world.bounds.w - 8) return 'Outside the wall';
      if (sel.y2 < world.bounds.y + 8 || sel.y2 > world.bounds.y + world.bounds.h - 8) return 'Outside the wall';
    }

    if (card.valid) {
      var r = card.valid(sel, world, ctx);
      if (r !== true) return r;
    }
    return true;
  };

  /* Build the entities a card would create, without committing them. */
  RS.previewCard = function (world, card, sel, ctx) {
    if (!card.make) return { holds: [], zones: [], props: [], terrain: [] };
    try { return card.make(sel, world, ctx); }
    catch (e) { return { holds: [], zones: [], props: [], terrain: [] }; }
  };

  /* Commit a card. Returns a record for the round log. */
  RS.applyCard = function (game, card, sel, ctx) {
    var world = game.world;
    var record = { card: card.id, by: ctx.playerIndex, entities: { holds: [], zones: [], props: [], terrain: [] } };

    if (card.mutate) {
      card.mutate(sel, world, ctx);
      record.target = sel.hold ? sel.hold.hid : null;
    }
    if (card.make) {
      var out = card.make(sel, world, ctx);
      var i;
      for (i = 0; i < out.holds.length; i++) { out.holds[i].round = ctx.round; world.holds.push(out.holds[i]); record.entities.holds.push(out.holds[i]); }
      for (i = 0; i < out.zones.length; i++) { world.zones.push(out.zones[i]); record.entities.zones.push(out.zones[i]); }
      for (i = 0; i < out.terrain.length; i++) { world.terrain.push(out.terrain[i]); record.entities.terrain.push(out.terrain[i]); }
      for (i = 0; i < out.props.length; i++) {
        var p = out.props[i];
        p.pid = RS.uid('p');
        world.props.push(p);
        RS.initProp(game, p);
        record.entities.props.push(p);
      }
    }
    return record;
  };

  /* ================================================================== props
   * Props are the stateful bits of scenery: ropes, ziplines, hazards, pickups.
   */

  RS.initProp = function (game, p) {
    var world = game.world, solver = game.solver;
    switch (p.kind) {
      case 'rope': {
        p.rope = new RS.Rope(solver, p.x, p.y, p.segLen, p.segs, {
          bend: p.style === 'vine' ? 0.10 : 0.30,
          damping: p.style === 'vine' ? 0.988 : 0.993,
          mass: 0.9,
          collide: false
        });
        p.gripHolds = [];
        var fracs = p.grips || [1.0];
        for (var i = 0; i < fracs.length; i++) {
          var idx = clamp(Math.round(fracs[i] * (p.segs - 1)), 1, p.segs - 1);
          var pt = p.rope.pts[idx];
          var h = RS.makeHold('vinegrip', pt.x, pt.y, { placedBy: p.placedBy });
          h.dynamic = pt;
          h.ropeStyle = p.style;
          world.holds.push(h);
          p.gripHolds.push(h);
        }
        break;
      }
      case 'zipline': {
        p.trolley = solver.add(new RS.Point(p.x1, p.y1, {
          r: 6, invMass: 1 / 1.6, damping: 0.998, collide: false, owner: p.pid, tag: 'trolley'
        }));
        p.handle = RS.makeHold('trolley', p.x1, p.y1, { placedBy: p.placedBy });
        p.handle.dynamic = p.trolley;
        world.holds.push(p.handle);
        break;
      }
      case 'rockfall':
        p.boulders = [];
        break;
      case 'beartrap':
        p.armed = 1;
        break;
      case 'beam':
        /* A beam declared in level data arrives without its collision shape -
           only the card path builds one. Give it the missing geometry. */
        if (!p.shape) {
          p.shape = { type: 'capsule', x1: p.x, y1: p.y, x2: p.x + (p.len || 105), y2: p.y,
                      r: 8, mat: 'metal', moving: true };
          world.terrain.push(p.shape);
        }
        break;
    }
  };

  RS.destroyProp = function (game, p) {
    var world = game.world;
    if (p.rope) p.rope.destroy();
    if (p.trolley) game.solver.removePoint(p.trolley);
    if (p.gripHolds) for (var i = 0; i < p.gripHolds.length; i++) p.gripHolds[i].dead = true;
    if (p.handle) p.handle.dead = true;
    if (p.boulders) for (var j = 0; j < p.boulders.length; j++) game.solver.removePoint(p.boulders[j].pt);
    p.dead = true;
  };

  /* Per-frame prop simulation. Called after the solver step. */
  RS.updateProps = function (game, dt, t) {
    var world = game.world;
    var cl = game.climber;
    var props = world.props;

    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (p.dead) continue;

      switch (p.kind) {

        /* -------- zipline: keep the trolley on the cable, let it run down */
        case 'zipline': {
          var tr = p.trolley;
          var c = RS.closestOnSegment(tr.x, tr.y, p.x1, p.y1, p.x2, p.y2);
          tr.x = c.x; tr.y = c.y;
          /* strip the velocity component off the cable */
          var dx = p.x2 - p.x1, dy = p.y2 - p.y1, dl = RS.len(dx, dy) || 1;
          var tx = dx / dl, ty = dy / dl;
          var vx = tr.x - tr.px, vy = tr.y - tr.py;
          var vt = (vx * tx + vy * ty) * 0.995;
          tr.px = tr.x - tx * vt;
          tr.py = tr.y - ty * vt;
          p.trolleyT = c.t;
          /* once nobody is holding it, it winds back to the top */
          var held = cl && ((cl.limbs.handL.hold === p.handle) || (cl.limbs.handR.hold === p.handle));
          if (!held) {
            var back = RS.closestOnSegment(tr.x, tr.y, p.x1, p.y1, p.x2, p.y2).t;
            var nt = Math.max(0, back - dt * 0.55);
            tr.setPos(RS.lerp(p.x1, p.x2, nt), RS.lerp(p.y1, p.y2, nt), false);
          }
          break;
        }

        /* -------- rockfall: periodic boulders that knock you off */
        case 'rockfall': {
          p.t += dt;
          if (p.t >= p.interval) {
            p.t = 0;
            var pt = game.solver.add(new RS.Point(p.x + RS.rand(-9, 9), p.y + 14, {
              r: RS.rand(8, 14), invMass: 1 / 5, damping: 0.999, owner: p.pid, tag: 'boulder'
            }));
            p.boulders.push({ pt: pt, life: 0, spin: RS.rand(RS.TAU), spinV: RS.rand(-4, 4) });
            p.shake = 1;
          }
          if (p.shake) p.shake = Math.max(0, p.shake - dt * 3);
          for (var b = p.boulders.length - 1; b >= 0; b--) {
            var bo = p.boulders[b];
            bo.life += dt;
            bo.spin += bo.spinV * dt;
            if (cl) {
              for (var k in cl.limbs) { /* body hit check below covers it */ }
              var hitPts = [cl.chest, cl.head, cl.pelvis, cl.handL, cl.handR];
              for (var q = 0; q < hitPts.length; q++) {
                var hp = hitPts[q];
                if (RS.dist(hp.x, hp.y, bo.pt.x, bo.pt.y) < bo.pt.r + hp.r + 2) {
                  var ix = RS.sign(hp.x - bo.pt.x) * 4 + (bo.pt.x - bo.pt.px) * 0.5;
                  cl.knockOff(ix, 3.2, 0.8);
                  bo.life = 99;
                  game.shake(7);
                  break;
                }
              }
            }
            if (bo.life > 7 || bo.pt.y > world.height + 200) {
              game.solver.removePoint(bo.pt);
              p.boulders.splice(b, 1);
            }
          }
          break;
        }

        /* -------- saw: blade shuttling along its track */
        case 'saw': {
          var u = ((t * p.speed + p.phase) % 1 + 1) % 1;
          var uu = u < 0.5 ? u * 2 : (1 - u) * 2;
          p.cx = RS.lerp(p.x1, p.x2, uu);
          p.cy = RS.lerp(p.y1, p.y2, uu);
          p.spin = (p.spin || 0) + dt * 26;
          if (cl) {
            var pts = [cl.chest, cl.head, cl.pelvis, cl.handL, cl.handR, cl.footL, cl.footR, cl.kneeL, cl.kneeR];
            for (var s = 0; s < pts.length; s++) {
              if (RS.dist(pts[s].x, pts[s].y, p.cx, p.cy) < p.r + pts[s].r) {
                var nx = pts[s].x - p.cx, ny = pts[s].y - p.cy, nl = RS.len(nx, ny) || 1;
                cl.knockOff(nx / nl * 5.5, ny / nl * 5.5 - 1.5, 0.9);
                game.shake(9);
                break;
              }
            }
          }
          break;
        }

        /* -------- swinging steel beam: moving solid geometry */
        case 'beam': {
          var a = t * p.speed + p.phase;
          p.angle = a;
          p.shape.x1 = p.x - Math.cos(a) * 10;
          p.shape.y1 = p.y - Math.sin(a) * 10;
          p.shape.x2 = p.x + Math.cos(a) * p.len;
          p.shape.y2 = p.y + Math.sin(a) * p.len;
          break;
        }

        /* -------- bear trap: sends you back to your last clip */
        case 'beartrap': {
          if (p.snap > 0) p.snap -= dt * 2.2;
          if (p.armed > 0 && cl) {
            var tpts = [cl.footL, cl.footR, cl.pelvis, cl.handL, cl.handR];
            for (var tp = 0; tp < tpts.length; tp++) {
              if (RS.dist(tpts[tp].x, tpts[tp].y, p.x, p.y) < p.r + tpts[tp].r) {
                p.snap = 1;
                cl.respawn();
                game.shake(11);
                game.toast('Bear trap!');
                break;
              }
            }
          }
          break;
        }

        /* -------- quickdraw clip: moves your respawn point up */
        case 'checkpoint': {
          if (cl && RS.dist(cl.chest.x, cl.chest.y, p.x, p.y) < p.r) {
            if (!cl.checkpoint || cl.checkpoint.y > p.y) {
              cl.checkpoint = { x: p.x, y: p.y - 10 };
              if (!p.lit) { p.lit = 1; game.toast('Clipped'); }
            }
            p.glow = 1;
          }
          if (p.glow) p.glow = Math.max(0, p.glow - dt);
          break;
        }

        /* -------- chalk stash: stamina pickup on a timer */
        case 'chalkstash': {
          if (p.cd > 0) p.cd -= dt;
          if (p.cd <= 0 && cl && RS.dist(cl.chest.x, cl.chest.y, p.x, p.y) < p.r) {
            cl.stamina = Math.min(cl.staminaMax, cl.stamina + 45);
            cl.puff(p.x, p.y, 20);
            p.cd = 8;
            game.toast('Chalked up');
          }
          break;
        }

        case 'fan':
          p.spin = (p.spin || 0) + dt * 15;
          break;
        case 'spout':
          p.t = (p.t || 0) + dt;
          break;
      }
    }

    /* Ropes and ziplines drive dynamic holds; the hold update reads the point. */
    for (var hi = 0; hi < world.holds.length; hi++) {
      RS.updateHold(world.holds[hi], dt, t);
    }
  };

})(window.RS);

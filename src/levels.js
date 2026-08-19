/* ROUTESETTERS - levels.js
 * Story routes and the party-mode base walls, plus the world builder that
 * turns a level definition into live simulation state.
 *
 * Coordinate system: y grows downward, the ground is y = 0, so the top of a
 * 2000px wall sits at y = -2000.
 */
(function (RS) {
  'use strict';

  var W = 660;          // wall width
  var X0 = 0;           // left edge

  /* ------------------------------------------------- procedural route ladder
   * Walks upward from the start placing holds on alternating sides. Deterministic
   * for a given seed, so a level always plays the same way, but it saves
   * hand-typing several hundred coordinates per route.
   *
   * Spacing is driven by the climber's actual reach envelope rather than by
   * independent rise/span numbers, which is the only way to guarantee the route
   * is physically climbable. With an arm contracted onto a hold the chest sits
   * ~19px from it and the free hand spans another ~41px, so hand-to-hand
   * distances up to about 60px are reachable statically and anything beyond that
   * needs a dyno. Each route's `reach` band sets where on that scale it sits.
   */
  function ladder(opts) {
    var r = new RS.Rng(opts.seed);
    var holds = [];
    var x = opts.x0, y = opts.y0;
    var side = 1;
    var sinceRest = 0, sinceFoot = 0;
    var types = opts.types;
    var top = opts.yTop;
    var band = opts.reach;

    while (y > top) {
      var d = r.range(band[0], band[1]);
      /* how much of that distance goes sideways - the rest goes up */
      var lean = r.range(0.22, 0.72);
      var dx = d * lean * side;
      var dy = -Math.sqrt(Math.max(4, d * d - dx * dx));

      var nx = RS.clamp(x + dx, X0 + 70, X0 + W - 70);
      if (nx !== x + dx) side = -side;      // bounced off the edge, turn around
      var rise = -dy;
      x = nx;
      y += dy;
      if (y <= top) break;

      var pick = r.weighted(types);
      holds.push([pick.type, Math.round(x), Math.round(y), pick.angle ? r.range(-1, 1) : 0]);

      sinceRest++; sinceFoot++;
      /* footholds below and between the hands, so feet always have something */
      if (sinceFoot >= 2 && r.chance(0.8)) {
        holds.push(['footchip',
          Math.round(RS.clamp(x - dx * 0.5, X0 + 60, X0 + W - 60)),
          Math.round(y + rise * 0.62), 0]);
        sinceFoot = 0;
      }
      /* a shelf every so often, otherwise long routes are unsurvivable */
      if (sinceRest >= opts.restEvery && r.chance(0.8)) {
        holds.push(['restledge',
          Math.round(RS.clamp(x + dx * 0.3, X0 + 80, X0 + W - 80)),
          Math.round(y - rise * 0.35), 0]);
        sinceRest = 0;
      }
      if (r.chance(0.30)) side = -side;
    }
    return holds;
  }

  function baseTerrain(height) {
    return [
      /* Ground surface sits just below the start shelf. It used to be at y=0,
         which buried the shelf AND put the climber's legs inside solid rock at
         spawn - the ejection launched the ragdoll and it settled upside down. */
      { type: 'rect', x: X0 - 300, y: 52, w: W + 600, h: 420, mat: 'rock' },
      /* the start shelf */
      { type: 'capsule', x1: X0 + W / 2 - 58, y1: 44, x2: X0 + W / 2 + 58, y2: 44, r: 8, mat: 'rock' },
      /* top-out ledge */
      { type: 'capsule', x1: X0 + W / 2 - 76, y1: -height + 96, x2: X0 + W / 2 + 76, y2: -height + 96, r: 10, mat: 'granite' }
    ];
  }

  function level(o) {
    o.bounds = { x: X0, y: -o.height - 40, w: W, h: o.height + 460 };
    o.start = { x: X0 + W / 2, y: -14 };
    o.finish = { x: X0 + W / 2, y: -o.height + 58, r: 38 };
    o.terrain = baseTerrain(o.height).concat(o.terrain || []);
    return o;
  }

  /* ============================================================ STORY ROUTES */

  var STORY = [];

  /* --- 1. The Warm-Up Wall -------------------------------------------------- */
  STORY.push(level({
    id: 'warmup',
    name: 'The Warm-Up Wall',
    subtitle: 'Left click grabs with your left hand. Right click with your right. That is the whole game.',
    theme: 'gym',
    grade: 'V0',
    height: 900,
    par: 70,
    holds: ladder({
      seed: 11, x0: X0 + W / 2, y0: -20, yTop: -840, reach: [24, 32],
      restEvery: 4,
      types: [{ type: 'jug', weight: 8 }, { type: 'pinch', weight: 2 }]
    }),
    zones: [],
    props: [],
    tips: [
      'Grab a hold, then move the mouse ABOVE it to pull up on that arm.',
      'Move the mouse below a hold to pay the arm out and hang long.',
      'Your feet find footholds on their own. Space kicks off them for a jump.'
    ]
  }));

  /* --- 2. Friction Only ---------------------------------------------------- */
  STORY.push(level({
    id: 'friction',
    name: 'Friction Only',
    subtitle: 'Slopers do not hold a swing. Get still, then move.',
    theme: 'sandstone',
    grade: 'V2',
    height: 1300,
    par: 110,
    holds: ladder({
      seed: 27, x0: X0 + W / 2, y0: -20, yTop: -1230, reach: [26, 34],
      restEvery: 5,
      types: [
        { type: 'sloper', weight: 5 }, { type: 'jug', weight: 3 },
        { type: 'pinch', weight: 3 }, { type: 'volume', weight: 2 }
      ]
    }),
    terrain: [
      { type: 'capsule', x1: X0 + 90, y1: -430, x2: X0 + 300, y2: -470, r: 8, mat: 'ply', visual: 'panel' },
      { type: 'capsule', x1: X0 + W - 90, y1: -880, x2: X0 + W - 310, y2: -920, r: 8, mat: 'ply', visual: 'panel' }
    ],
    zones: [],
    props: [],
    tips: [
      'A sloper spits you off the moment you start swinging. Kill the swing first.',
      'Volumes are solid. You can stand on top of them and shake out.'
    ]
  }));

  /* --- 3. The Wind Tunnel -------------------------------------------------- */
  STORY.push(level({
    id: 'windtunnel',
    name: 'The Wind Tunnel',
    subtitle: 'Move between the gusts, not through them.',
    theme: 'alpine',
    grade: 'V4',
    height: 1700,
    par: 150,
    holds: ladder({
      seed: 44, x0: X0 + W / 2, y0: -20, yTop: -1620, reach: [28, 36],
      restEvery: 5,
      types: [
        { type: 'crimp', weight: 4 }, { type: 'jug', weight: 3 },
        { type: 'pocket', weight: 3 }, { type: 'pinch', weight: 2 },
        { type: 'sidepull', weight: 2, angle: true }
      ]
    }),
    zones: [
      { kind: 'wind', shape: 'rect', x: X0 + 300, y: -520, w: 340, h: 220, angle: 0,
        gustAmp: 1500, gustFreq: 0.38, gustDir: 0, gustPhase: 0.1, visual: 'wind', dir: 0 },
      { kind: 'wind', shape: 'rect', x: X0 + 320, y: -1010, w: 380, h: 240, angle: 0,
        gustAmp: 1750, gustFreq: 0.30, gustDir: Math.PI, gustPhase: 0.6, visual: 'wind', dir: Math.PI },
      { kind: 'wind', shape: 'rect', x: X0 + 330, y: -1450, w: 420, h: 260, angle: 0,
        gustAmp: 2050, gustFreq: 0.26, gustDir: 0.25, gustPhase: 0.35, visual: 'wind', dir: 0.25 }
    ],
    props: [
      { kind: 'rope', x: X0 + 200, y: -760, segs: 9, segLen: 15, style: 'rope' },
      { kind: 'checkpoint', x: X0 + W / 2, y: -840, r: 42 },
      { kind: 'chalkstash', x: X0 + 130, y: -1180, r: 26 }
    ],
    tips: [
      'Wind builds and fades. Watch the streaks and move on the lull.',
      'The rope swings. Build momentum, then let go at the top of the arc.'
    ]
  }));

  /* --- 4. Wet Season ------------------------------------------------------- */
  STORY.push(level({
    id: 'wetseason',
    name: 'Wet Season',
    subtitle: 'Everything is soaked and half of it is about to fall off.',
    theme: 'granite',
    grade: 'V6',
    height: 2000,
    par: 190,
    holds: ladder({
      seed: 71, x0: X0 + W / 2, y0: -20, yTop: -1920, reach: [28, 38],
      restEvery: 6,
      types: [
        { type: 'crimp', weight: 4 }, { type: 'undercling', weight: 3 },
        { type: 'crumble', weight: 3 }, { type: 'jug', weight: 2 },
        { type: 'sloper', weight: 3 }, { type: 'pocket', weight: 2 }
      ]
    }),
    zones: [
      { kind: 'water', shape: 'rect', x: X0 + 250, y: -430, w: 110, h: 340, angle: 0,
        fy: 340, wet: 1, drag: 0.008, visual: 'water' },
      { kind: 'water', shape: 'rect', x: X0 + 430, y: -1220, w: 120, h: 420, angle: 0,
        fy: 380, wet: 1, drag: 0.010, visual: 'water' },
      { kind: 'tar', shape: 'circle', x: X0 + 200, y: -1620, r: 110,
        drag: 0.055, staminaMul: 2.0, visual: 'tar' }
    ],
    props: [
      { kind: 'spout', x: X0 + 250, y: -600 },
      { kind: 'spout', x: X0 + 430, y: -1430 },
      { kind: 'checkpoint', x: X0 + W / 2, y: -700, r: 42 },
      { kind: 'checkpoint', x: X0 + W / 2 - 40, y: -1400, r: 42 },
      { kind: 'zipline', x1: X0 + 110, y1: -1050, x2: X0 + 520, y2: -880 },
      { kind: 'chalkstash', x: X0 + 560, y: -640, r: 26 },
      { kind: 'chalkstash', x: X0 + 120, y: -1780, r: 26 }
    ],
    tips: [
      'Wet hands halve your grip. Get out of the water and wait a beat to dry.',
      'Crumbling holds break after about a second. Do not hang around on them.'
    ]
  }));

  /* --- 5. The Machine Room ------------------------------------------------- */
  STORY.push(level({
    id: 'machineroom',
    name: 'The Machine Room',
    subtitle: 'The wall moves. You will have to move with it.',
    theme: 'gym',
    grade: 'V8',
    height: 2300,
    par: 230,
    holds: ladder({
      seed: 96, x0: X0 + W / 2, y0: -20, yTop: -2210, reach: [30, 39],
      restEvery: 6,
      types: [
        { type: 'jug', weight: 4 }, { type: 'crimp', weight: 3 },
        { type: 'pinch', weight: 3 }, { type: 'pocket', weight: 2 },
        { type: 'magnet', weight: 1 }, { type: 'spring', weight: 1, angle: true }
      ]
    }),
    /* motion is applied to a slice of the ladder in postBuild */
    postBuild: function (world) {
      var i, n = 0;
      for (i = 0; i < world.holds.length; i++) {
        var h = world.holds[i];
        if (h.type === 'footchip' || h.type === 'restledge' || h.protected) continue;
        n++;
        if (n % 5 === 0) h.motion = { kind: 'oscillate', amp: 68, speed: 1.4, phase: RS.rand(RS.TAU) };
        else if (n % 7 === 0) h.motion = { kind: 'elevator', amp: 84, speed: 0.9, phase: RS.rand(RS.TAU) };
        else if (n % 11 === 0) h.motion = { kind: 'cam', cx: h.baseX, cy: h.baseY, radius: 40, speed: 1.2, phase: RS.rand(RS.TAU) };
      }
    },
    zones: [
      { kind: 'jet', shape: 'rect', x: X0 + 300, y: -760, w: 220, h: 78, angle: 0,
        gustAmp: 5200, gustFreq: 0.45, gustDuty: 0.22, gustDir: 0, gustPhase: 0.2, visual: 'jet', dir: 0 },
      { kind: 'jet', shape: 'rect', x: X0 + 360, y: -1620, w: 220, h: 78, angle: Math.PI,
        gustAmp: 5400, gustFreq: 0.5, gustDuty: 0.2, gustDir: Math.PI, gustPhase: 0.7, visual: 'jet', dir: Math.PI },
      { kind: 'updraft', shape: 'rect', x: X0 + 120, y: -1200, w: 150, h: 260, angle: 0,
        fy: -1150, drag: 0.004, visual: 'updraft' }
    ],
    props: [
      { kind: 'nozzle', x: X0 + 180, y: -760, angle: 0 },
      { kind: 'nozzle', x: X0 + 490, y: -1620, angle: Math.PI },
      { kind: 'fan', x: X0 + 120, y: -1090 },
      { kind: 'saw', x1: X0 + 110, y1: -520, x2: X0 + 550, y2: -560, r: 17, speed: 0.4, phase: 0 },
      { kind: 'saw', x1: X0 + 520, y1: -1880, x2: X0 + 130, y2: -1940, r: 17, speed: 0.55, phase: 0.4 },
      { kind: 'beam', x: X0 + W / 2, y: -1400, len: 110, speed: 0.85, phase: 0 },
      { kind: 'checkpoint', x: X0 + W / 2, y: -640, r: 42 },
      { kind: 'checkpoint', x: X0 + W / 2, y: -1300, r: 42 },
      { kind: 'checkpoint', x: X0 + W / 2, y: -1900, r: 42 },
      { kind: 'chalkstash', x: X0 + 570, y: -1000, r: 26 },
      { kind: 'chalkstash', x: X0 + 100, y: -1700, r: 26 },
      { kind: 'crashpad', x: X0 + 330, y: -300 }
    ],
    tips: [
      'Catch a moving hold at the end of its travel, not the middle.',
      'Spring holds fling you along the arrow when you let go. Use them.'
    ]
  }));

  /* --- 6. Verglas --------------------------------------------------------- */
  STORY.push(level({
    id: 'verglas',
    name: 'Verglas',
    subtitle: 'Thin ice, falling rock, and gravity that cannot make up its mind.',
    theme: 'night',
    grade: 'V11',
    height: 2700,
    par: 300,
    holds: ladder({
      seed: 131, x0: X0 + W / 2, y0: -20, yTop: -2610, reach: [30, 40],
      restEvery: 7,
      types: [
        { type: 'ice', weight: 4 }, { type: 'crimp', weight: 4 },
        { type: 'pocket', weight: 3 }, { type: 'undercling', weight: 2 },
        { type: 'magnet', weight: 2 }, { type: 'resin', weight: 1 },
        { type: 'jug', weight: 2 }
      ]
    }),
    zones: [
      { kind: 'ice', shape: 'circle', x: X0 + 260, y: -520, r: 120, slick: 0.33, visual: 'ice' },
      { kind: 'ice', shape: 'circle', x: X0 + 430, y: -1180, r: 130, slick: 0.30, visual: 'ice' },
      { kind: 'ice', shape: 'circle', x: X0 + 200, y: -2020, r: 130, slick: 0.28, visual: 'ice' },
      { kind: 'heavygrav', shape: 'circle', x: X0 + W / 2, y: -1600, r: 150, gravMul: 1.75, visual: 'heavygrav' },
      { kind: 'lowgrav', shape: 'circle', x: X0 + 480, y: -2280, r: 150, gravMul: 0.40, visual: 'lowgrav' },
      { kind: 'fog', shape: 'circle', x: X0 + 300, y: -880, r: 170, fog: 0.9, visual: 'fog', phase: 2 },
      { kind: 'fog', shape: 'circle', x: X0 + 380, y: -2400, r: 190, fog: 0.9, visual: 'fog', phase: 5 },
      { kind: 'wind', shape: 'rect', x: X0 + 330, y: -2150, w: 460, h: 300, angle: 0,
        gustAmp: 2300, gustFreq: 0.24, gustDir: Math.PI * 0.92, gustPhase: 0.1, visual: 'wind', dir: Math.PI * 0.92 }
    ],
    props: [
      { kind: 'rockfall', x: X0 + 240, y: -1000, interval: 2.6, t: 0 },
      { kind: 'rockfall', x: X0 + 440, y: -1760, interval: 3.1, t: 1.1 },
      { kind: 'rockfall', x: X0 + 300, y: -2380, interval: 2.4, t: 0.5 },
      { kind: 'beartrap', x: X0 + 150, y: -1330, r: 20, armed: 1, snap: 0 },
      { kind: 'beartrap', x: X0 + 520, y: -1980, r: 20, armed: 1, snap: 0 },
      { kind: 'vine', x: X0 + 560, y: -1450 },
      { kind: 'rope', x: X0 + 120, y: -2250, segs: 11, segLen: 15, style: 'rope' },
      { kind: 'checkpoint', x: X0 + W / 2, y: -700, r: 42 },
      { kind: 'checkpoint', x: X0 + W / 2, y: -1450, r: 42 },
      { kind: 'checkpoint', x: X0 + W / 2, y: -2100, r: 42 },
      { kind: 'chalkstash', x: X0 + 560, y: -600, r: 26 },
      { kind: 'chalkstash', x: X0 + 110, y: -1550, r: 26 },
      { kind: 'chalkstash', x: X0 + 540, y: -2500, r: 26 }
    ],
    tips: [
      'Ice holds get worse the longer you hang. Move fast and keep moving.',
      'Magnet holds pull your hand in. On this route they are your friends.'
    ]
  }));

  /* Vines are declared with kind 'vine' for readability; normalise to ropes. */
  for (var si = 0; si < STORY.length; si++) {
    var ps = STORY[si].props || [];
    for (var pi = 0; pi < ps.length; pi++) {
      if (ps[pi].kind === 'vine') {
        ps[pi].kind = 'rope';
        ps[pi].style = 'vine';
        ps[pi].segs = 15; ps[pi].segLen = 14;
        ps[pi].grips = [0.45, 0.72, 1.0];
      }
      if (ps[pi].kind === 'crashpad') {
        ps[pi].kind = 'pad'; ps[pi].w = 84;
      }
    }
  }

  RS.STORY_LEVELS = STORY;

  /* ========================================================= PARTY BASE WALLS
   * Deliberately incomplete. Big gaps for the players to fill in, and just
   * enough holds that the first round is not hopeless.
   */

  var PARTY = [];

  function partyWall(o) {
    o.party = true;
    return level(o);
  }

  PARTY.push(partyWall({
    id: 'p_bones',
    name: 'Bare Bones',
    subtitle: 'A skeleton route with holes in it. Fill them, or make them worse.',
    theme: 'gym',
    grade: '?',
    height: 1150,
    par: 60,
    holds: (function () {
      var out = [], y = -90;
      var xs = [330, 250, 400, 300, 430, 240, 350];
      for (var i = 0; i < xs.length; i++) {
        out.push(['jug', xs[i], y]);
        out.push(['footchip', xs[i] + (i % 2 ? -46 : 46), y + 52]);
        y -= 98;                  // a deliberate gap: two placed holds bridge it
      }
      out.push(['restledge', 330, -560]);
      return out;
    })(),
    zones: [],
    props: []
  }));

  PARTY.push(partyWall({
    id: 'p_pillars',
    name: 'The Pillars',
    subtitle: 'Two solid columns and nothing in between.',
    theme: 'sandstone',
    grade: '?',
    height: 1300,
    par: 60,
    terrain: [
      { type: 'capsule', x1: 150, y1: -180, x2: 150, y2: -1140, r: 26, mat: 'granite' },
      { type: 'capsule', x1: 510, y1: -260, x2: 510, y2: -1060, r: 26, mat: 'granite' }
    ],
    holds: (function () {
      var out = [];
      for (var y = -140; y > -1200; y -= 132) {
        out.push([y % 264 === 0 ? 'sloper' : 'jug', y % 264 === 0 ? 205 : 455, y]);
        out.push(['footchip', y % 264 === 0 ? 250 : 410, y + 66]);
      }
      out.push(['volume', 330, -640]);
      out.push(['restledge', 330, -1000]);
      return out;
    })(),
    zones: [],
    props: []
  }));

  PARTY.push(partyWall({
    id: 'p_roof',
    name: 'Under the Roof',
    subtitle: 'A real overhang. Getting round it is the whole problem.',
    theme: 'granite',
    grade: '?',
    height: 1400,
    par: 60,
    terrain: [
      { type: 'capsule', x1: 120, y1: -620, x2: 470, y2: -660, r: 16, mat: 'granite', visual: 'panel' },
      { type: 'capsule', x1: 540, y1: -1010, x2: 200, y2: -1050, r: 16, mat: 'granite', visual: 'panel' }
    ],
    holds: (function () {
      var out = [];
      var seq = [[330, -110], [286, -212], [352, -310], [424, -404],
                 [486, -502], [452, -604], [386, -700], [318, -796],
                 [356, -892], [430, -988], [378, -1092], [330, -1196],
                 [330, -1300]];
      for (var i = 0; i < seq.length; i++) {
        out.push([i % 3 === 1 ? 'undercling' : 'jug', seq[i][0], seq[i][1]]);
        out.push(['footchip', seq[i][0] + (i % 2 ? -44 : 44), seq[i][1] + 56]);
      }
      out.push(['restledge', 560, -420]);
      return out;
    })(),
    zones: [],
    props: []
  }));

  PARTY.push(partyWall({
    id: 'p_chimney',
    name: 'Cold Chimney',
    subtitle: 'Iced up and unfriendly before anyone has even set a hold.',
    theme: 'alpine',
    grade: '?',
    height: 1250,
    par: 60,
    holds: (function () {
      var out = [], y = -120, x = 330;
      for (var i = 0; i < 11; i++) {
        out.push([i % 3 === 0 ? 'ice' : 'crimp', x, y]);
        out.push(['footchip', x + (i % 2 ? -40 : 40), y + 54]);
        x += (i % 2 ? 62 : -62);
        y -= 104;
      }
      out.push(['restledge', 330, -700]);
      return out;
    })(),
    zones: [
      { kind: 'ice', shape: 'circle', x: 330, y: -430, r: 110, slick: 0.36, visual: 'ice' }
    ],
    props: []
  }));

  RS.PARTY_WALLS = PARTY;


  /* ------------------------------------------------------- climbability guard
   * A procedural route is only as good as its worst seam. This walks the holds
   * from the start, and wherever the chain of reachable moves dead-ends before
   * the bell it bolts in bridging jugs. Without it a bad seed can produce a
   * route that simply cannot be topped out, which is the one bug a climbing
   * game must never ship.
   *
   * Deliberately NOT applied to party walls, where the big gaps are the point.
   */
  RS.ensureClimbable = function (world, maxStep) {
    maxStep = maxStep || 40;
    var MAX_BRIDGES = 40;
    var added = 0;
    var lastFrontierY = Infinity;

    /* A move may traverse sideways or even step down a little - climbing is not
       monotonic. Demanding strict height gain here was wrong, and it made the
       near-horizontal bridges this function inserts untraversable, so it looped
       bolting on hundreds of useless holds. */
    var linked = function (a, b) {
      return b.y < a.y + 18 && RS.dist(a.x, a.y, b.x, b.y) <= maxStep;
    };

    for (var iter = 0; iter < 60 && added < MAX_BRIDGES; iter++) {
      var hands = world.holds.filter(function (h) { return h.hands && !h.dead; });
      var seed = hands.filter(function (h) { return h.y > world.start.y - 60; });
      if (!seed.length) break;

      var inSeen = {}, seen = [], queue = [];
      var mark = function (h) {
        if (!inSeen[h.hid]) { inSeen[h.hid] = 1; seen.push(h); queue.push(h); }
      };
      seed.forEach(mark);
      while (queue.length) {
        var cur = queue.shift();
        for (var i = 0; i < hands.length; i++) {
          if (!inSeen[hands[i].hid] && linked(cur, hands[i])) mark(hands[i]);
        }
      }

      var fin = world.finish;
      var reach = (fin.r || 38) + 14;
      var frontier = null, canRing = false;
      for (var k = 0; k < seen.length; k++) {
        if (RS.dist(seen[k].x, seen[k].y, fin.x, fin.y) < reach) canRing = true;
        if (!frontier || seen[k].y < frontier.y) frontier = seen[k];
      }
      if (canRing || !frontier) break;
      /* no progress since the last pass means bridging is not helping - stop
         rather than pile on holds forever */
      if (frontier.y >= lastFrontierY - 1) break;
      lastFrontierY = frontier.y;

      /* aim at the lowest hold we could not reach, else straight at the bell */
      var target = null;
      for (var j = 0; j < hands.length; j++) {
        var h2 = hands[j];
        if (inSeen[h2.hid] || h2.y >= frontier.y - 4) continue;
        if (!target || h2.y > target.y) target = h2;
      }
      var tx = target ? target.x : fin.x;
      var ty = target ? target.y : fin.y + (fin.r || 38);

      var steps = Math.ceil(RS.dist(frontier.x, frontier.y, tx, ty) / (maxStep - 8));
      if (steps < 2) break;
      for (var m = 1; m < steps && added < MAX_BRIDGES; m++) {
        var t = m / steps;
        var nb = RS.makeHold('jug',
          Math.round(RS.lerp(frontier.x, tx, t)),
          Math.round(RS.lerp(frontier.y, ty, t)), { placedBy: -1 });
        nb.round = 0;
        nb.bridged = true;
        world.holds.push(nb);
        added++;
      }
    }
    return added;
  };

  /* ============================================================ world builder */

  RS.buildWorld = function (game, def) {
    var world = {
      def: def,
      id: def.id,
      name: def.name,
      theme: def.theme,
      height: def.height,
      bounds: RS.deepCopy(def.bounds),
      start: RS.deepCopy(def.start),
      finish: RS.deepCopy(def.finish),
      terrain: RS.deepCopy(def.terrain || []),
      holds: [],
      zones: RS.deepCopy(def.zones || []),
      props: []
    };
    game.world = world;
    game.solver.world = world;

    /* holds */
    var i;
    var src = def.holds || [];
    for (i = 0; i < src.length; i++) {
      var d = src[i];
      var h = RS.makeHold(d[0], d[1], d[2], { angle: d[3] || 0, placedBy: -1 });
      h.round = 0;
      world.holds.push(h);
      if (h.solid) world.terrain.push(RS.holdTerrain(h));
    }

    /* the anchor holds by the bell, so topping out is always possible */
    var f = world.finish;
    var anchorPositions = [[f.x - 46, f.y + 30], [f.x + 46, f.y + 26], [f.x, f.y + 62]];
    for (i = 0; i < anchorPositions.length; i++) {
      var a = RS.makeHold('anchor', anchorPositions[i][0], anchorPositions[i][1], { protected: true });
      a.round = 0;
      world.holds.push(a);
    }
    /* and two starting jugs off the deck */
    var st = world.start;
    [[-38, -34], [38, -30]].forEach(function (o) {
      var s = RS.makeHold('jug', st.x + o[0], st.y + o[1], { protected: true });
      s.round = 0;
      world.holds.push(s);
    });

    /* props */
    var sp = RS.deepCopy(def.props || []);
    for (i = 0; i < sp.length; i++) {
      var p = sp[i];
      p.pid = RS.uid('p');
      if (p.kind === 'rockfall') { p.interval = p.interval || 3; p.t = p.t || 0; }
      world.props.push(p);
      RS.initProp(game, p);
    }

    if (def.postBuild) def.postBuild(world);

    /* Guarantee the route can actually be topped out. */
    if (!def.party) {
      world.bridged = RS.ensureClimbable(world, 40);
    }

    return world;
  };

  /* Snapshot / restore so a party round can be replayed by each player on the
   * exact same wall, including hold wear and broken holds. */
  RS.snapshotWorld = function (world) {
    var snap = { holds: [], zones: [], props: [] };
    var i, h;
    for (i = 0; i < world.holds.length; i++) {
      h = world.holds[i];
      snap.holds.push({
        hid: h.hid, dead: h.dead, wear: h.wear, greased: h.greased, chalked: h.chalked,
        x: h.x, y: h.y, baseX: h.baseX, baseY: h.baseY, r: h.r, grip: h.grip, drain: h.drain
      });
    }
    for (i = 0; i < world.props.length; i++) {
      var p = world.props[i];
      snap.props.push({ pid: p.pid, cd: p.cd || 0, lit: p.lit || 0, t: p.t || 0, snap: 0 });
    }
    return snap;
  };

  RS.restoreWorld = function (game, world, snap) {
    var byHid = {}, i;
    for (i = 0; i < snap.holds.length; i++) byHid[snap.holds[i].hid] = snap.holds[i];
    for (i = 0; i < world.holds.length; i++) {
      var h = world.holds[i], s = byHid[h.hid];
      if (!s) continue;
      h.dead = s.dead; h.wear = s.wear; h.greased = s.greased; h.chalked = s.chalked;
      h.baseX = s.baseX; h.baseY = s.baseY; h.r = s.r; h.grip = s.grip; h.drain = s.drain;
      if (!h.dynamic && !h.motion) { h.x = s.x; h.y = s.y; }
      h.wobble = 0;
    }
    var byPid = {};
    for (i = 0; i < snap.props.length; i++) byPid[snap.props[i].pid] = snap.props[i];
    for (i = 0; i < world.props.length; i++) {
      var p = world.props[i], sp2 = byPid[p.pid];
      if (!sp2) continue;
      p.cd = sp2.cd; p.lit = sp2.lit; p.snap = 0;
      if (p.kind === 'rockfall') {
        for (var b = 0; b < p.boulders.length; b++) game.solver.removePoint(p.boulders[b].pt);
        p.boulders.length = 0;
        p.t = sp2.t;
      }
      if (p.kind === 'zipline' && p.trolley) p.trolley.setPos(p.x1, p.y1, false);
    }
    for (i = 0; i < world.holds.length; i++) RS.syncHoldTerrain(world, world.holds[i]);
  };

})(window.RS);

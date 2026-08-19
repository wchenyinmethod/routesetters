# Routesetters

A very difficult game about climbing, in which your friends are allowed to
redesign the wall between every attempt.

The climbing is modelled on *A Difficult Game About Climbing*: a physics ragdoll,
two arms, one mouse, no forgiveness. The multiplayer is modelled on *Ultimate
Chicken Horse*: every round each player bolts one change onto the route, then
everyone takes a turn climbing the thing they just ruined. Instead of placing
platforms you place holds, move existing ones, grease them, hang ropes, and point
wind machines at people.

**Play it: [routesetters.vercel.app](https://routesetters.vercel.app)**

## Running it locally

Open `index.html`. That's it, no build step and no bundler. Plain `<script>` tags
and a canvas, so double-clicking the file works.

If you want a real http origin instead:

```bash
npm run dev
```

Then open http://localhost:5173. No dependencies - the dev server is 25 lines of
Node.

## Tests

```bash
npm test
```

Four headless suites, no dependencies. They stub enough of `window`/`document` to
load the simulation and run the actual physics:

- `smoke.js` builds every level, places all 49 cards, runs a full party round
- `grip.js` asserts hold quality behaves the way the cards describe
- `climbable.js` asserts every route can actually be topped out
- `tutorial.js` asserts every tutorial step is satisfiable

`npm run test:reach` prints the measured reach envelope that the route spacing is
derived from. If you change the control scheme or body proportions, re-run it and
re-tune the `reach` bands in `src/levels.js`.

## How to climb

The mouse is where you are reaching. Both arms follow the cursor.

- **Hold left mouse** to close your left hand, **hold right mouse** for your
  right. Release the button and the hand opens. `Q` and `E` do the same, for
  trackpads.
- Once a hand is on a hold, move the mouse **above that hold** and the arm
  contracts and hauls you up. Move it **below** and the arm pays out so you hang
  long and rest.
- A move is: latch, pull the mouse up, throw the free hand at the next hold,
  close it, let the first one go.
- Your feet look after themselves. They seek out footholds and high-step onto
  them, which is most of where your reach comes from. `Space` kicks off them for
  a dyno.
- `R` restarts the attempt, `Esc` pauses, `M` mutes.

Two things decide whether a hold keeps you:

- **Stamina** (the GRIP bar) is your forearms. Crimps drain it fast, jugs barely
  touch it, rest ledges refill it. At zero your hands open whether you like it
  or not.
- **Slipping** is separate. Hanging straight-armed is cheap; locking off is
  strenuous; swinging is worse. A greasy sloper will hold you when you are still
  and spit you off the moment you move. Getting your feet on, or matching both
  hands, buys most of it back. The hold shakes and flushes red just before it goes.

There is no death. You slide down the wall, land badly, and restart from your
last quickdraw clip, or from the ground if nobody has set one.

## Modes

**Tutorial** - ten steps on a purpose-built wall, each one verifying you actually
did the thing before it moves on: close a hand, pull up on it, reach with the
other, swap, read the grip bar, survive a sloper, kick off your feet, ring the
bell. Every step offers a skip after twenty seconds, so you cannot get stuck.

**Story routes** — six routes of escalating unreasonableness, from a jug ladder
to an iced-over night route with falling rock and gravity that cannot make up its
mind. Top out to unlock the next. Best times are saved locally.

**Party routesetting** — 2 to 4 players, local hotseat, pass the mouse around.
Each round every player draws three cards and places one, then everyone climbs in
turn on a 75 second clock. Scoring:

| | |
|---|---|
| Topped out | +1 |
| Only one to top out | +2 extra |
| Fastest send (if more than one topped) | +1 |
| Touched the Party Box | +1 |
| Highest point, when nobody topped | +1 |

First to the target score, and clear of everyone else, wins. The trick is the
same as Ultimate Chicken Horse: the genuinely good cards help whoever climbs
next, and that includes your rivals.

**Free build** — every card, unlimited, no turns. Build something horrible, then
switch to Climb mode and find out whether you can do it.

## The deck

49 cards, all fully simulated. Browse them in-game under *The deck*.

**Holds (17)** — Bomber Jug · Razor Crimp · Sloper · Pinch Block · Two-Finger
Pocket · Undercling (only grips from below) · Sidepull (directional, aimable) ·
Foot Chip · Volume (solid, standable) · Rest Ledge · Bolt-On Rail (drag a line,
grabbable anywhere) · Crumbling Hold (snaps off after ~1.4s) · Ice Hold (decays
while you hang) · Resin Hold (unslippable, but you cannot let go for 0.65s) ·
Magnet Hold (drags your hand in) · Spring Hold (launches you when released) ·
Party Box (bonus point, one per match)

**Modifiers (8)** — Shift Hold (move it up to 135px) · Re-Aim Hold · Sandbag It
(shrink and worsen) · Grease Job · Chalk Up (helps everyone) · Pry It Off
(delete, twice per match) · Swap Two Holds · Spin Cam (mount it on a rotating arm)

**Motion (6)** — Metronome Hold (slides sideways) · Elevator Hold (rides up and
down) · Conveyor Rail (a jug shuttling along a track) · Zipline (grab the trolley
and run downhill) · Pendulum Rope · Hanging Vine (grabbable in three places)

**Weather (9)** — Wind Draft (gusting, aimable) · Updraft Fan · Waterfall (soaks
your hands) · Verglas Patch · Tar Smear · Fog Bank (hides the holds) · Gravity
Anomaly (40%) · Heavy Air (175%) · Air Jet (periodic hard blast)

**Hazards (4)** — Rockfall Chute · Bolt Saw (blade on a track) · Bear Trap (sends
you back to your last clip) · Metronome Beam (solid steel, sweeps a full circle)

**Kindnesses (3)** — Quickdraw Clip (moves everyone's respawn up) · Chalk Stash ·
Crash Pad

**Terrain (2)** — Overhang Roof · Slab Panel

## Layout

```
index.html              shell + all the menu markup
styles.css
icon.svg, icon-*.png    app icons (generated, see scripts/mkicons.js)
og.png                  social preview
manifest.webmanifest    PWA manifest, installable
vercel.json             static hosting config + cache headers
src/util.js             maths, seeded RNG, noise, colour
src/physics.js          verlet solver, constraints, terrain collision, force zones
src/holds.js            hold catalogue, grip/slip model
src/climber.js          the ragdoll, control scheme, stamina, grab resolution
src/character-render.js the figure: shaded limbs, articulated fingers, harness
src/scene-render.js     wall, holds, zone effects, props, the top-out bell
src/components.js       the 49 cards and the props they spawn
src/levels.js           six story routes, four party walls, world builder
src/tutorial.js         the tutorial wall and its ten gated steps
src/party.js            match flow and scoring
src/ui.js               menus, card hand, HUD, scoreboards
src/game.js             loop, camera, input, placement interaction
scripts/serve.js        dependency-free dev server
scripts/mkicons.js      PNG icon generator (hand-rolled encoder)
tests/                  four headless suites
```

Everything hangs off a global `RS` namespace so it loads from `file://` with no
module loader.

## Notes on the physics

The climber is 11 verlet points with distance constraints. Grabbing is not a
teleport-and-stick: the hand snaps onto the hold keeping its momentum, and a
"winch" constraint between chest and hand is what you shorten to pull up. A
latched hand becomes much heavier so the winch hauls the body to the hand rather
than the hand to the body.

Slip load is deliberately *not* derived from solver correction distances, because
a latched limb is heavy on purpose and how far it drifts says more about its mass
than about how hard you are pulling. It is computed from body weight, momentum,
arm flexion and points of contact instead.

The reach envelope was measured rather than guessed: a move of up to ~40px
succeeds from any direction, 45-50px is marginal, beyond ~55px needs momentum.
Every route's hold spacing is generated inside that envelope, widening with
difficulty.

Route layout is generated, so it gets a post-condition rather than trust: after
building, `RS.ensureClimbable` walks the holds from the start and bolts in
bridging jugs wherever the chain of reachable moves dead-ends before the bell.
Without it a bad seed can produce a route that simply cannot be topped out, which
is the one bug a climbing game must never ship. Party walls are exempt, because
there the gaps are the whole design.

Force zones are data, not code — `gravMul`, `fx/fy`, gust parameters, `drag`,
`slick`, `wet`, `staminaMul`, `fog` — so wind, water, tar, verglas, fog and both
gravity anomalies are the same handful of fields with different numbers.

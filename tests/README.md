# Test harnesses

Headless, no dependencies. They stub just enough `window`/`document` to load the
simulation modules and run the real physics.

```bash
node tests/smoke.js     # builds every level, places all 49 cards, runs a match
node tests/grip.js      # asserts hold quality behaves as the cards describe
node tests/reach.js     # measures the reach envelope the route spacing depends on
```

`smoke.js` and `grip.js` exit non-zero on failure. `reach.js` prints a table:
the route spacing in `src/levels.js` is set from it, so if the control scheme or
body proportions change, re-run it and re-tune the `reach` bands.

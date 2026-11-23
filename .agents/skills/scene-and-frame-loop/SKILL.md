---
name: scene-and-frame-loop
description: Explains how the Happy Hare Console draws — the split between app.js (state, connection, frame loop) and scene.js (one render of one scene state), the named render parts, spool rotation and tag-pulse conventions in spool.js, and the test traps (frame.test.mjs slices app.js by source text, syntax.test.mjs parses every file as a module). Use this whenever touching console/app.js, console/scene.js, console/spool.js, console/style.css or a view module, adding something to the drawing, changing what animates per frame, or when frame.test.mjs fails after an edit that looks unrelated.
---

# Scene and frame loop

## Who owns what

- `app.js` holds one `store` object: connection, data source, playback position, what is playing.
  It runs the frame loop and the sidebar. It decides **what** state to show.
- `scene.js` exports `createScene(host, hooks)`. `render(view, settings)` draws exactly one scene
  state. It reads no sidebar input and writes no control. The hooks (`now`, `requestFrame`,
  `rackHeld`, `rackMoved`) are how it gets a clock, which is also what lets a test advance it one frame at a time.
- The render is a sequence of named parts (`measure`, `rack`, `tips`, `sensors`, `gears`, `nozzle`
  and others) sharing one frame context. Add a feature as a part, or inside the part that owns the
  geometry it needs; do not reach across parts through module globals.
- Everything else is pure logic with no DOM access, or a small view module for one panel.
- `simulator.js` is the only module that calls `sim.console.*`. The app probes for those calls once
  on connect and hides the controls on a printer.

Known and accepted: the scene is rebuilt from one SVG string on every animated frame. Spools are the
exception; `SpoolRenderer` keeps its nodes and updates only what changed.

## Spools

- Rotation sign: **positive is the espooler assist direction, negative is rewind.** A forward
  filament move turns the spool the assist way, a retract the rewind way.
- `scene.advanceSpools(now, {espoolers, running, session, scan, backward})` advances rotation.
  `backward` negates elapsed time for a step played in reverse. `scan` turns the scanned gate's spool
  even with no espooler; direction arrows are drawn only when an espooler is actually working.
- The tag pulse is a group of rings at the tag mark on the spool face, alternating red and white. It
  is emitted **after** the white rim marking so the rings draw over it. It is on the face only: an
  attempt to pulse the spool's edge for near edge-on viewing angles was tried and removed.
- Anything drawn on the spool face must respect the viewing angle (it is an ellipse, not a circle).

## Test traps

- **`frame.test.mjs` slices `app.js` by source text.** It takes the text from `function draw()` to
  `function renderScene()`, and from `function drawFrame()` to `const toolheadPanel=createToolheadPanel`,
  and runs it in a `vm` context with stubs. A helper the frame loop calls must sit inside one of
  those slices, and any new name the sliced code uses must be added to the context in `harness()`.
  Moving a function or renaming one of those four markers breaks six tests at once.
- **`syntax.test.mjs`** copies every `.js` file to `.mjs` and runs `node --check`, because a script
  can pass `node --check` as a script and still be rejected by the browser as a module (a repeated
  `const`, for example). `app.js` cannot be imported without a DOM, so this is its only parse check.
- The `*.browser.mjs` files are optional Playwright tests and are not run by `make test` or CI.

## Borrowed rules

The unit footer, the gate action menu and the tool mapping chart follow Mainsail Happy Hare
Edition's rules, logos and geometry. `unit-icons.js` holds its vendor logos as SVG paths. When
changing one of these, check what Mainsail Happy Hare Edition does first; matching it is the point.

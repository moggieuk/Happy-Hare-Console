# Happy Hare Console

A web interface for [Happy Hare](https://github.com/moggieuk/Happy-Hare) that animates the MMU from
a printer or the Happy Hare simulator, live or from a recording. This file is the always-loaded
orientation; deeper knowledge lives in `.agents/skills/` as [Agent Skills](https://agentskills.io),
listed at the end.

## Layout

- `console/` is the whole application: one `index.html`, one `style.css` and flat ES modules. There is
  **no build step, no bundler and no dependencies**. `console/README.md` is the technical reference
  (modules, data sources, how telemetry is drawn); read it before changing behavior.
- `install.sh` and `nginx/happy-hare-console.conf` serve `console/` from a printer.
- `test/test_install.py` tests the installer; the JavaScript tests sit beside their modules as
  `console/*.test.mjs`.

## Testing

```bash
make test         # JavaScript tests, then the installer tests
make lint         # ruff
make spellcheck   # CSpell, US English; add real project terms to .project-words.txt
```

If you fix a bug, write a test that fails before the fix and passes after. One basic test per fix is
enough.

## Rules that are easy to break

- **Keep `console/` flat.** The Happy Hare simulator serves only `index.html` and `<name>.js` /
  `<name>.css` directly inside `console/`. A module in a subfolder, or an image or font file, loads
  from nginx but 404s under the simulator. Artwork is inline SVG paths (`unit-icons.js`).
- **Relative URLs only.** The page is served from a port's root by nginx and from `/sim/console/` by
  the simulator. `test/test_install.py` fails on a root-absolute `src`, `href`, `import` or `url()`.
- **Logic modules have no DOM access.** Only `app.js`, `scene.js` and the small view modules touch
  the page; everything else is pure and is what the JavaScript tests cover.
- **Happy Hare is a separate repository.** The telemetry stream, the `mmu_machine` object and the
  simulator's `sim.console.*` calls are a contract with it. A change to what the Console expects
  usually needs a matching change there, and nothing here tests that side.
- **Changes that break existing setups will probably be rejected.** That includes the installed
  nginx site name, its port choice and the update manager section name.

## Branches

Work lands on `development` through pull requests; `main` is what printers install and update from
(`primary_branch: main` in the update manager entry). `development` pairs with Happy Hare's
`development` branch, whose simulator serves this checkout.

## Commit and PR titles

Conventional commits: `feat`, `fix`, `chore` or `docs`, then `: ` and a subject, with a scope where
it helps (`feat(scene): ...`, `fix(install): ...`). A CI check enforces the PR title.

## Subsystem knowledge (`.agents/skills/<name>/SKILL.md`)

Agents that support Agent Skills load these when relevant; otherwise read the matching `SKILL.md`
before touching that area.

- **`telemetry-playback`**: what a telemetry record means, how moves become animation steps, and the
  inferences the Console makes because telemetry does not say (NFC scans, empty gates, sensor limits).
- **`scene-and-frame-loop`**: how `app.js` and `scene.js` divide the work, the frame loop, spool
  rotation conventions, and the test that slices `app.js` by source text.
- **`simulator-verification`**: running the Console against the Happy Hare simulator, capturing a
  recording, and checking an animation frame by frame instead of by eye.
- **`installer-nginx`**: `install.sh`, the nginx site, the Moonraker update manager entry and how
  the installer is tested without root.

These do not replace reading the code. They record invariants and decisions that already cost a
debugging session once.

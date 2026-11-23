---
name: simulator-verification
description: Explains how to run the Happy Hare Console against the Happy Hare simulator and verify an animation properly — where the simulator finds the Console (sibling checkout or HH_CONSOLE_DIR), why it must be started under a terminal, which simulator profiles exercise which hardware, how to capture a telemetry recording, and how to check motion frame by frame instead of by eye. Use this whenever a change needs to be seen working, when asked to run, demo, screenshot or record the Console, when the page sits on "identifying source", or before claiming an animation fix is verified.
---

# Verifying against the simulator

The Console has no printer of its own. The Happy Hare repository's simulator is the test bed, and it
serves the Console itself.

## Starting it

In a Happy Hare checkout (`make console` passes flags through `ARGS`):

```bash
make console ARGS='--profile boxturtle2_ercf --serve 7131'
```

- The page is at `http://127.0.0.1:<port>/sim/viewer/` (the address is in the console banner).
  The default port is 7125, which is also a real Moonraker's port; choose another when one may be
  running on the machine.
- The simulator serves `../Happy-Hare-Console/viewer` relative to the Happy Hare checkout, or the
  folder named by `HH_CONSOLE_DIR`. Without either the address returns a 404 explaining this.
- It serves the files on every request, so an edit needs only a page reload.
- **It must run under a terminal.** Started with no terminal attached (from a script or a background
  job with stdin piped) it serves the files but never answers the API, and the page stays on
  "Connected · identifying source…". Wrap it in a pseudo-terminal, for example with `script -q`.

## Profiles worth knowing

| Profile | Use it for |
|---|---|
| `boxturtle2_ercf` | Several units of different types, the rack, unit footers, a cross-unit toolchange |
| `ercf_vvd` | An ERCF beside a unit with a heater: drying icon, eject, a gate with its own NFC reader |
| `nfc_per_gate` | NFC scans on gates with their own readers |
| `ercf_mmu_cutter` | A servo cutter at the MMU: the cut and release steps |
| `emu` | The second fixture's machine |

An interactive start primes different spools each time and prints the seed; pass `--seed N` to
repeat one when comparing before and after.

## Capturing a recording

Run the commands, then **Save telemetry** in the page. The JSONL it saves replays offline with
**Load telemetry**, with no simulator running. A recording is the right artifact for a bug report
and for comparing a change, because the same history can be replayed before and after.

## Check motion by numbers

Animation bugs here are jumps, stalls and wrong directions between frames, which a screenshot does
not show. To verify a fix:

1. Capture a recording that shows the problem.
2. Replay it with a clock you control. `createScene` takes `now` and `requestFrame` hooks, so a page
   served with a manual clock can be advanced one frame at a time.
3. At each frame read the value in question from the SVG (the tip position, a spool's rotation, an
   element's opacity) and look at the differences between consecutive frames.
4. Do it forward **and** stepping backward; reverse playback has had its own bugs.

Report the measurement ("largest step fell from 67 px to 6 px"), not "looks right".

## Say what was not verified

The simulator reports state only before and after a command in live status mode, so live-only
animation (homing rings, spool motion) is not exercised by it. The simulator's sensors report
temperature but not humidity. Nothing has been run on a real printer unless someone says so. State
these gaps when reporting on a change that touches them.

---
name: telemetry-playback
description: Explains how the Happy Hare Console turns Happy Hare motion telemetry into animation steps — the happy_hare.motion record format, what a movement event's time, duration and requested fields mean, and the inferences the Console makes where telemetry is silent (NFC scan moves, an empty selected gate, sensor limits on the drawn tip). Use this whenever touching viewer/telemetry.js, viewer/playback.js, viewer/scene-state.js, viewer/overlay.js or the fixtures, adding an animation that depends on a kind of move, debugging a tip that jumps, stalls or lands in the wrong place, or changing what the Console expects from Happy Hare's telemetry — even if the request only says "the filament jumps" or "the spool turns the wrong way".
---

# Telemetry playback

The Console never reads the simulator's filament coordinates. Every animated step is reconstructed
from Happy Hare's source telemetry, the same on a printer and in the simulator. `viewer/README.md`
("Using the live viewer", "How telemetry is drawn") describes what is drawn; this file records what
is easy to get wrong.

## The record format is a contract with another repository

`TelemetryReplay` (`viewer/telemetry.js`) accepts only records with `schema: happy_hare.motion` and
`version: 1`, and a loaded file must begin with a session snapshot. The producer is Happy Hare
(`extras/mmu/telemetry/`, documented in its `extras/mmu/telemetry/README.md`). Nothing in this
repository tests the producer, so:

- Do not start depending on a new field, label or sensor name without checking Happy Hare emits it
  on a printer as well as in the simulator.
- Prefer an explicit field over matching text. Where the Console does match text (below), say so in
  the code, because a reworded label in Happy Hare breaks it silently.
- The two fixtures (`viewer/fixtures/ercf-vvd.json`, `emu.json`) are recordings of `MMU_LOAD`,
  `MMU_UNLOAD`, `MMU_LOAD` from those simulator profiles. Regenerate them from the simulator when the
  format changes; never edit them by hand.

## What a movement event's fields mean

After reduction, a movement event has:

- `time`: the timestamp of the **start** of the move, not its end. The end is `time + duration`.
  Computing the gap between two moves as a difference of `time` values is wrong.
- `duration`: elapsed seconds of the move.
- `requested`: signed distance; negative is a retract. Fall back to `distance` when it is absent.
- `state` and `before`: the full scene state after and before the move. Recorded states are
  authoritative at the endpoints; the Console interpolates only between them.

## Inferences, because telemetry does not say

**NFC scan.** There is no scan marker. `nfcScan` in `playback.js` recognizes a scan move by a label
containing the word `NFC` or an endstop name containing `nfc`. `scanMove` extends this to the moves
that park the filament straight after a scan: same gate, each starting less than one second after
the previous move ended, traced back to a scan move. Only true scan moves pulse the tag rings; the
parking moves only turn the spool. Live status mode has no record of a scan and shows neither.

**Empty selected gate.** A selected gate with `gate_status` 0 and `filament_pos` 0 shows no
filament. The drawn tip is not cut: `withdrawTip` eases it into the spool over 450 ms, and back out
when the gate has filament again. Before this, an eject ended with a visible jump when the gate
turned empty and its entry sensor cleared.

**Sensor limits.** A clear presence sensor limits forward travel of the drawn tip and a triggered one
limits withdrawal. A limit is carried smoothly across a move so the tip never stalls and then jumps.
A gate exit or shared exit sensor the unit neither homes nor preloads on has no known position, so
it neither limits the tip nor raises a warning. Buffer and encoder sensors never limit the tip.

## Playing a step backward

Stepping back plays the same event in reverse (`store.playing.reverse`). Anything driven by the
direction of a move must take that into account; spool rotation does so with the `backward` flag
passed to `scene.advanceSpools`.

## Tests

Pure logic belongs in `playback.js`, `telemetry.js` or `scene-state.js` with a test beside it. A
test that needs a realistic history should reduce one of the fixtures rather than hand-build events.

/* Copyright (C) 2022-2026 Paul Morgan. GPLv3. */
// The only place that knows the simulator's sim.console.* RPCs. A printer does not provide them,
// so the console probes once on connect and treats a failed probe as a live machine.
const liveMachineSetup = () => ({connection_kind: 'live_machine', units: [], parameters: [], profiles: []});

export const simulatorApi = rpc => ({
  setup: unit => rpc('sim.console.setup', {unit}),
  restart: options => rpc('sim.console.restart', options),
  sensor: (name, enabled) => rpc('sim.console.sensor', {name, enabled}),
});

export async function detectConnection(rpc, unit = 0) {
  try {
    const setup = await simulatorApi(rpc).setup(unit);
    return {...setup, connection_kind: setup.connection_kind || 'simulator'}; // Older responses are simulator-only
  } catch {
    return liveMachineSetup();
  }
}

/* Copyright (C) 2022-2026 Paul Morgan. GPLv3. */
// The only place that knows the simulator's sim.console.* RPCs. A printer does not provide them,
// so the console probes on connect and treats a refused probe as a live machine.
const liveMachineSetup = () => ({connection_kind: 'live_machine', units: [], parameters: [], profiles: []});

export const simulatorApi = rpc => ({
  setup: unit => rpc('sim.console.setup', {unit}),
  restart: options => rpc('sim.console.restart', options),
  sensor: (name, enabled) => rpc('sim.console.sensor', {name, enabled}),
});

export async function detectConnection(rpc, unit = 0) {
  for (;;) {
    try {
      const setup = await simulatorApi(rpc).setup(unit);
      return {...setup, connection_kind: setup.connection_kind || 'simulator'}; // Older responses are simulator-only
    } catch (error) {
      // A printer answers that it has no such method. No answer in time says nothing: a simulator
      // in the middle of a command or a restart is busy, so ask again.
      if (!/timed out/.test(error?.message || '')) return liveMachineSetup();
    }
  }
}

// Moonraker lists the components it loaded; the simulator always streams.
export async function telemetryAvailable(rpc, kind) {
  if (kind === 'simulator') return true;
  try {
    return ((await rpc('server.info')).components || []).includes('mmu_telemetry');
  } catch {
    return false;
  }
}

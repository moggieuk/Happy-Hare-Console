/* Copyright (C) 2022-2026 Paul Morgan. GPLv3. */
// The only place that knows the simulator's sim.console.* RPCs. A printer does not provide them,
// so the console probes on connect and treats a refused probe as a live machine.
const liveMachineSetup = () => ({connection_kind: 'live_machine', units: [], parameters: [], profiles: []});

export const simulatorApi = rpc => ({
  setup: unit => rpc('sim.console.setup', {unit}),
  restart: options => rpc('sim.console.restart', options),
  sensor: (name, enabled) => rpc('sim.console.sensor', {name, enabled}),
});

// An uploaded folder is a configuration only if it holds mmu.cfg, at any depth
export const hasMmuConfig = names => names.some(name => /(^|\/)mmu\.cfg$/.test(name));

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

// The oldest Happy Hare this Console works with
export const REQUIRED_VERSION = '4.3.0';
export function versionAtLeast(found, needed) {
  const parts = text => String(text).split('.').map(part => parseInt(part, 10) || 0);
  const a = parts(found), b = parts(needed);
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return true;
}
// Why this printer or simulator cannot be used, or null. A printer that cannot list its objects
// (Klipper starting or stopped) is left to connect as it always has.
export async function versionProblem(rpc) {
  let objects;
  try {
    objects = (await rpc('printer.objects.list')).objects || [];
  } catch {
    return null;
  }
  const found = objects.includes('mmu_machine')
    ? (await rpc('printer.objects.query', {objects: {mmu_machine: ['happy_hare_version']}})).status?.mmu_machine?.happy_hare_version
    : null;
  if (!found) return `Happy Hare was not found here. The Console needs Happy Hare ${REQUIRED_VERSION} or later.`;
  return versionAtLeast(found, REQUIRED_VERSION) ? null
    : `This is Happy Hare ${found}. The Console needs ${REQUIRED_VERSION} or later.`;
}

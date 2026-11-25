/* Copyright (C) 2022-2026 Paul Morgan. GPLv3. */
const clock=seconds=>{
  const s=Math.max(0,Math.round(seconds)), h=Math.floor(s/3600), m=Math.floor(s%3600/60);
  return h ? `${h}:${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}` : `${m}:${String(s%60).padStart(2,'0')}`;
};
const degrees=value=>`${Math.round(value)}°C`;

// What an MMU pause means for the printer, from subscribed status. Klipper publishes neither timer's deadline, so the
// countdowns run from when the pause (or a change of the idle timeout) was seen here: `memory` carries those moments,
// and a pause already under way when the view connected can only be given its limits. `now` is in seconds.
// Happy Hare may publish when the heater goes off (mmu.hotend_off_time), on Klipper's clock (`klipperNow`), which makes that one exact.
export function pauseStatus(objects, extruder, memory, now, klipperNow=null) {
  const mmu=objects.mmu || {}, state=mmu.print_state;
  if (!['paused','pause_locked'].includes(state)) return {memory:{paused:false},text:''};
  const settings={...objects.configfile?.settings?.mmu_parameters,...mmu.config_changes?.mmu_parameters};
  const idle=objects.idle_timeout || {}, heater=objects[extruder] || {};
  const locked=state==='pause_locked';
  // Happy Hare sets timeout_pause while locked; an older Klipper does not publish the timeout in force
  const timeout=idle.idle_timeout ?? (locked ? Number(settings.timeout_pause) : undefined);
  const seen=memory?.paused ? memory : {paused:true,since:now,observed:memory?.paused===false,timeout,timeoutSince:now};
  // Klipper is 'Idle' before anything has run as well as after the timeout, so only a change to it is an expiry
  const next={...seen,active:seen.active || idle.state!=='Idle',...(timeout===seen.timeout ? {} : {timeout,timeoutSince:now})};
  const lines=[`MMU paused: ${mmu.reason_for_pause || 'no reason given'}`];
  if (mmu.pause_hint) lines.push(mmu.pause_hint);
  lines.push(locked ? 'Locked: MMU_UNLOCK restores the extruder temperature' : 'Unlocked: RESUME continues the print');
  const target=heater.target, temperature=heater.temperature, off=Number(settings.disable_heater);
  if (Number.isFinite(target)) {
    const reading=Number.isFinite(temperature) ? ` (now ${degrees(temperature)})` : '';
    if (target<=0) lines.push(`Extruder heater is off${reading}`);
    else if (!locked) lines.push(Number.isFinite(temperature) && temperature<target-2
      ? `Extruder heating to ${degrees(target)}${reading}` : `Extruder at ${degrees(target)}`);
    else if (Number.isFinite(mmu.hotend_off_time) && Number.isFinite(klipperNow)) lines.push(`Extruder heater off in ${clock(mmu.hotend_off_time-klipperNow)}`);
    else if (Number.isFinite(off)) lines.push(next.observed ? `Extruder heater off in ${clock(off-(now-next.since))}`
      : `Extruder heater off within ${clock(off)}`);
  }
  if (idle.state==='Idle') { if (next.active) lines.push('Idle timeout has expired'); }
  else if (Number.isFinite(next.timeout)) lines.push(next.observed || next.timeoutSince>next.since
    ? `Idle timeout in about ${clock(next.timeout-(now-next.timeoutSince))}` : `Idle timeout within ${clock(next.timeout)}`);
  return {memory:next,text:lines.join('\n')};
}

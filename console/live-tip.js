/* Copyright (C) 2022-2026 Paul Morgan. GPLv3. */
import {short, positions, clamp, finite} from './util.js';

const PRESENCE=/^(mmu_exit(_\d+)?|mmu_shared_exit|extruder|toolhead)$/;
const REPORTED=/^(mmu_entry(_\d+)?|mmu_exit(_\d+)?|mmu_shared_exit|extruder|toolhead)$/;

// Where a filament_pos state allows the tip to be: [lowest, highest, reference]. A state at one place has no span.
export function tipRange(pos,at) {
  const home=at(1), gears=at(6), toolhead=at(8), nozzle=at(10);
  if ([0,1,5,6,8,10].includes(pos)) return [at(pos),at(pos),at(pos)];
  return {2:[home,gears,home],3:[home,gears,at(3)],4:[home,gears,at(4)],
    7:[gears,toolhead,at(7)],9:[toolhead,nozzle,at(9)]}[pos] || null;
}

// A state that says the filament has homed to a place still sees it fed on from there before the next state is
// reported: the place it may reach by then. Only the live position can show that travel.
const FED_ON={5:6,6:8,8:10};

// With a calibrated Bowden the live position places the tip, so it may also carry a parked or gate-homed filament
// on, and an unloading one back, before the next state is reported
const FED_FROM={0:6,1:6,...FED_ON}, FED_BACK={8:6,6:5};
// Happy Hare restarts the position from zero at the start of a load or unload without saying so: landing on zero, or
// a step against the direction of travel larger than any tightening move, is taken to be that
const RESET_MM=25;

// A load counts on from where it began. An unload that began in the extruder is re-set by Happy Hare to the distance
// back from the nozzle wherever it learns where the end is, so that is read from the nozzle.
function positionedTip(memory,status,pos,[lo,hi,reference],at,nozzle) {
  const p=status.filament_position_live, direction=status.filament_direction===-1 ? -1 : 1;
  let frame='anchor', anchor, ceiling=Infinity, tip=reference;
  if (memory) {
    const last=memory.filamentPosition;
    frame=memory.frame || 'anchor'; ceiling=memory.ceiling ?? Infinity;
    anchor=finite(memory.anchor) ? memory.anchor : memory.tip-(finite(last) ? last : p);
    const reset=(memory.direction ?? direction)!==direction
      || finite(last) && (p===0 && last!==0 || frame==='anchor' && (p-last)*direction<-RESET_MM);
    if (reset) { frame=direction===-1 && memory.pos>=7 ? 'nozzle' : 'anchor'; anchor=ceiling=memory.tip; }
    tip=frame==='nozzle' ? Math.min(ceiling,nozzle+p) : anchor+p;
  }
  // Only a load carries a filament on from the gate: UNLOADED is otherwise the park, wherever the tip was last put
  const loading=frame==='anchor' && direction===1;
  if (pos===0 && !(loading && memory?.pos===0)) tip=reference;
  const low=direction===-1 && FED_BACK[pos]!==undefined ? Math.min(lo,at(FED_BACK[pos])) : lo;
  const high=FED_FROM[pos]!==undefined && (pos>1 || loading) ? Math.max(hi,at(FED_FROM[pos])) : hi;
  return {tip:clamp(tip,low,high),frame,ceiling,direction};
}

// The selected gate's tip from status alone. filament_position is the commanded position: it steps to a move's
// target and restarts from a different zero on unload, so it only moves the tip within a state.
// filament_position_live, where Happy Hare reports it, is where the stepper has got to: it is used in its place,
// and is true during a homing move, which the commanded position is not.
export function resolveTip(memory,status,s,at,bowdenStart,frame) {
  const pos=status.filament_pos, range=tipRange(pos,at), name=positions[pos] || 'UNKNOWN';
  const same=Boolean(memory) && memory.unit===s.unit && memory.gate===s.gate;
  const progress=finite(status.bowden_progress) && status.bowden_progress>=0 ? Math.min(100,status.bowden_progress) : null;
  const homing=Boolean(status.homing);
  const live=finite(status.filament_position_live);
  const reported=live ? status.filament_position_live : finite(status.filament_position) ? status.filament_position : undefined;
  const last=same ? memory.filamentPosition : undefined;
  const held=homing && !live;
  const filamentPosition=held ? last : reported;
  const warnings=[];
  if (!range) {
    if (s.gate>=0) warnings.push('filament position is unknown');
    return {tip:at(pos),warnings,memory:{unit:s.unit,gate:s.gate,pos,filamentPosition,tip:at(pos)}};
  }
  const [lo,hi,reference]=range;
  const fed=live && FED_ON[pos]!==undefined, reach=fed ? Math.max(hi,at(FED_ON[pos])) : hi;
  const followed=frame?.calibrated && live ? positionedTip(same && finite(memory.tip) ? memory : null,status,pos,range,at,frame.nozzle) : null;
  let tip;
  if (followed) tip=followed.tip;
  else if (progress!==null && lo<hi) tip=clamp(bowdenStart+(at(6)-bowdenStart)*progress/100,lo,hi);
  else if (same && memory.pos===pos) {
    const moved=!held && finite(reported) && finite(last) ? reported-last : 0;
    tip=clamp(memory.tip+moved,lo,reach);
  } else tip=!fed && same && memory.tip>lo && memory.tip<hi ? memory.tip : reference;

  const kept=s.retained_segment, endstop=short(s.encoder_reference?.endstop || '').replace(/_\d+$/,'');
  let lower=-Infinity, upper=Infinity;
  for (const [sensor,d] of Object.entries(s.sensors)) {
    const label=short(sensor).replace(/_\d+$/,'');
    if (!REPORTED.test(short(sensor)) || d.enabled===false || typeof d.state!=='boolean' || d.assumed || !finite(d.position)) continue;
    const fragment=Boolean(kept) && kept.start<=d.position && kept.end>=d.position;
    // A gate sensor the gate does not home on is drawn at a nominal place: a parked filament may well reach it
    const placed=PRESENCE.test(short(sensor)) && (!label.startsWith('mmu_') || label===endstop);
    if (placed) {
      if (!d.state) upper=Math.min(upper,d.position);
      else if (!fragment) lower=Math.max(lower,d.position);
    }
    if (placed && d.state && !fragment && hi<d.position) warnings.push(`${name} but the ${label} sensor is triggered`);
    // UNLOADED says nothing about a filament being there, and homing back to a sensor ends with it clear
    if (!d.state && pos>0 && lo>=d.position && !(lo===hi && lo===d.position)) warnings.push(`${name} but the ${label} sensor is clear`);
  }
  if (lower>upper) warnings.push('presence sensors disagree');
  else tip=clamp(tip,lower,upper);
  if (pos>0 && s.gate_status?.[s.gate]===0) warnings.push(`${name} but the gate is marked empty`);
  if (!followed && progress!==null && (pos<2 || pos>4)) warnings.push(`${name} but Bowden progress is reported`);
  const frameMemory=followed ? {frame:followed.frame,ceiling:followed.ceiling,direction:followed.direction,
    ...(followed.frame==='anchor' ? {anchor:tip-filamentPosition} : {})} : {};
  return {tip,warnings,memory:{unit:s.unit,gate:s.gate,pos,filamentPosition,tip,...frameMemory}};
}

// Sensor and state changes arrive in separate updates, so a disagreement counts only once it has lasted
export function lastingWarnings(seen,warnings,now,idle,hold=1000) {
  for (const text of [...seen.keys()]) if (!warnings.includes(text)) seen.delete(text);
  for (const text of warnings) if (!seen.has(text)) seen.set(text,now);
  return warnings.filter(text=>idle || now-seen.get(text)>=hold);
}

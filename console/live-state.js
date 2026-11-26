/* Copyright (C) 2022-2026 Paul Morgan. GPLv3. */
import {SceneModel} from './scene-state.js';
import {liveMachine,qualifySensors} from './live-config.js';
import {short as sensorName, DEFAULT_COLOR, clamp} from './util.js';
import {duration, playbackFrame, purgeColor, purgeOutletColor, gateTransition, gateTransitionMs, gateTransitionFrame, withGate} from './playback.js';
import {resolveTip} from './live-tip.js';
const clone=value=>structuredClone(value);
const rgb=value=>Array.isArray(value) ? value.slice(0,3).map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('') : String(value || DEFAULT_COLOR).replace(/^#/,'').slice(0,6);

// Moonraker replaces individual status fields, including dictionary-valued fields.
// Keep one current snapshot, never a history of subscription messages.
export class LiveState {
  constructor() { this.objects={}; this.eventtime=-Infinity; this.tip=null; this.unloaded=new Set(); this.purge=newPurge(); }
  accept(delta,eventtime=0) {
    if (eventtime<this.eventtime) return null;
    this.eventtime=eventtime;
    for (const [name,fields] of Object.entries(delta)) this.objects[name]={...this.objects[name],...clone(fields)};
    return this.snapshot();
  }
  // What a tip is resolved against: where it was last put, and the gates seen unloading
  memory() { return {tip:this.tip && {...this.tip},unloaded:[...this.unloaded],purge:{...this.purge}}; }
  restore(memory) { this.tip=memory?.tip || null; this.unloaded=new Set(memory?.unloaded || []); this.purge={...newPurge(),...memory?.purge}; }
  // Startup facts carry no time of their own, so they must not be ordered against status updates
  seed(objects) { Object.assign(this.objects,clone(objects)); }
  snapshot() {
    const status=this.objects.mmu, machine=liveMachine(this.objects);
    if (!status || !machine) return null;
    // The gate is reported before the unit it belongs to, so the unit is taken from the gate
    const names=Object.keys(machine.units), unitName=names.find(name=>machine.units[name].gates?.includes(status.gate)) || names[status.unit] || names[0];
    if (!unitName) return null;
    const sensors=qualifySensors(status.sensors,unitName,status.gate,machine.units[unitName].buffer?.name,machine.units[unitName].toolhead.name);
    machine.units[unitName].sensors=Object.keys(sensors);
    const m={...clone(status),unit:unitName, sensors,active_sensors:Object.keys(sensors),
      gate_color:(status.gate_color_rgb || status.gate_color || []).map(rgb),
      drive_motors:{gear:['gear'],extruder:['extruder']},sync_mode:status.sync_drive ? 1 : 0};
    while (m.gate_color.length<machine.num_gates) m.gate_color.push(DEFAULT_COLOR);
    const macros={};
    for (const [name,object] of Object.entries(this.objects)) if (name.startsWith('gcode_macro ')) macros[name.slice(12)]=clone(object);
    // As Happy Hare finds it: the park macro's own retraction, else _MMU_PARK's
    const retracted=[machine.park_macro,'_MMU_PARK'].map(name=>Object.entries(macros)
      .find(([macro])=>macro.toLowerCase()===String(name).toLowerCase())?.[1]?.retracted_length).find(Number.isFinite) || 0;
    for (const u of Object.values(machine.units)) {
      const ext=this.objects[`mmu_extruder ${u.extruder.name}`] || (u===machine.units[unitName] ? status : {});
      Object.assign(u.extruder,ext,{filament_remaining_color:rgb(ext.filament_remaining_color),
        target_temperature:this.objects[u.extruder.name]?.target},
        u===machine.units[unitName] ? {retracted_length:retracted} : {});
      if (u.encoder) {
        u.encoder.status=this.objects[`mmu_encoder ${u.encoder.name}`] || {};
        u.encoder.distance=u.encoder.status.encoder_pos ?? 0;
      }
      if (u.buffer) u.buffer.value=this.objects[`${u.buffer.name}:filament_proportional`]?.value ?? null;
      u.espooler={operations:Object.fromEntries(u.gates.map(g=>[g,{direction:status.espooler?.[g] || 'stopped',
        output_power:['assist','rewind'].includes(status.espooler?.[g]) ? 1 : 0}]))};
    }
    const model=new SceneModel();
    if (this.tip?.unit===unitName && this.tip.gate===m.gate && this.tip.pos>0 && m.filament_pos===0) this.unloaded.add(m.gate);
    model.unloaded=this.unloaded;
    model.facts={printer:{mmu:m,mmu_machine:machine},macros};
    model.tips=Array(machine.num_gates).fill(-20);
    model.shapes=model.tips.map(()=>machine.form_tip_macro?.toLowerCase().includes('cut') ? 'square' : 'cone');
    model.hairLengths=model.tips.map(()=>15);
    let s=model.snapshot();
    for (const g of s.unit_gates) model.tips[g]=model.logicalTip({...s,gate:g},0,true);
    let warnings=[];
    if (m.gate>=0) {
      // A loaded filament parked with a retraction has left its melt in the nozzle, as a replayed retract shows it
      const parked=retracted>0 ? s.layout.nozzle-s.filament.residual_mm-retracted : null;
      if (parked!==null && m.filament_pos===10) model.shapes[m.gate]='cone';
      // A cut leaves the filament's end at the blade
      const blade=s.cutters.find(cutter=>cutter.kind==='toolhead' && !cutter.before_extruder)?.position;
      const resolved=resolveTip(this.tip,status,s,pos=>pos===10 && parked!==null ? parked
        : pos===9 && Number.isFinite(blade) ? blade : model.logicalTip(s,pos,true),
        s.layout.extruder_gears-(machine.units[unitName].bowden_lengths[m.gate] || 700));
      this.tip=resolved.memory;
      model.tips[m.gate]=resolved.tip;
      warnings=resolved.warnings;
      const hotend=model.hotends[s.filament.extruder];
      this.purge=purged(this.purge,status);
      hotend.extruded=this.purge.extruded; hotend.base=this.purge.base;
      if (hotend.plan) hotend.plan.start_mm=this.purge.start;
    } else this.tip=null;
    // Buffer position is reported state, never a result of integrating motor travel.
    model.bufferPositions={};
    const buffer=machine.units[unitName].buffer;
    if (buffer && m.gate>=0 && model.tips[m.gate]>=0) {
      const center=buffer.buffer_maxrange/2, half=Math.min(buffer.buffer_range,buffer.buffer_maxrange)/2;
      const reading=buffer.proportional && Number.isFinite(buffer.value) ? Math.max(-1,Math.min(1,buffer.value))
        : m.sensors[`${buffer.name}:filament_compression`]?.triggered ? 1
        : m.sensors[`${buffer.name}:filament_tension`]?.triggered ? -1 : 0;
      model.bufferPositions[m.gate]=center+reading*half;
    }
    s=model.snapshot();
    // A released MMU grip does not invalidate a directly reported buffer position.
    if (buffer?.proportional && Number.isFinite(buffer.value)) {
      const d=s.devices[`${unitName}:buffer`];
      d.travel=d.displacement=d.modeled_displacement=buffer.buffer_maxrange/2+
        Math.max(-1,Math.min(1,buffer.value))*Math.min(buffer.buffer_range,buffer.buffer_maxrange)/2;
      d.excess=0;
    }
    s.homing=clone(status.homing || null);
    const touch=Object.keys(s.sensors).find(n=>n.endsWith(':mmu_gear_touch'));
    if (touch && s.homing) s.homing.endstops=s.homing.endstops.map(n=>sensorName(n).startsWith('mmu_gear_touch') ? touch : n);
    s.bowden_progress=status.bowden_progress;
    s.action=status.action;
    s.num_toolchanges=status.num_toolchanges;
    s.tip_resolved=true;
    s.live_warnings=warnings;
    return s;
  }
}

// What has come out of the nozzle, in mm of filament: Happy Hare reports that it is purging and the volume it
// suggests, not the extrusion itself. The live position counts it where the extruder is the stepper being followed;
// only where none was seen is the suggested volume taken to have gone, once the purge is over. The pile falls when the filament leaves.
const FILAMENT_AREA=Math.PI*(1.75/2)**2;
const newPurge=()=>({extruded:0,base:0,start:0,active:false,from:0,amount:0,position:null,origin:null});
export function purged(memory,status) {
  const p={...memory}, purging=status.action==='Purging';
  const position=Number.isFinite(status.filament_position_live) ? status.filament_position_live : null;
  if (purging && !p.active) Object.assign(p,{active:true,from:p.extruded,start:p.extruded,base:p.extruded,amount:0,origin:position});
  // It is measured from the first update of the purge, as the one before may be part-way through the load, and
  // only the furthest the filament has been fed counts: a purge retracts and primes again as it goes.
  // The update that ends a purge still carries the last of its movement
  if (p.active && position!==null && p.origin!==null) p.extruded=Math.max(p.extruded,p.from+position-p.origin);
  if (purging) p.amount=Math.max(p.amount,(Number(status.toolchange_purge_volume) || 0)/FILAMENT_AREA);
  else if (p.active) Object.assign(p,{active:false,extruded:p.extruded>p.from ? p.extruded : p.from+p.amount});
  else if (status.filament_pos!==10) p.base=p.extruded;
  p.position=position;
  return p;
}

// Klipper resends a whole dictionary field when one value in it changes; the encoder's own object sends just that value
export const liveMmuFields=mmu=>Object.keys(mmu || {}).filter(field=>field!=='encoder');
export const gateChanged=(from,to)=>Boolean(from) && from.gate>=0 && to.gate>=0 && from.gate!==to.gate;
const emitted=(from,to)=>(to.extruded_mm || 0)-(from.extruded_mm || 0);
const dropped=(from,to)=>(to.purge_base_mm || 0)>(from.purge_base_mm || 0);
const sameGate=(from,to)=>Boolean(from) && from.unit===to.unit && from.gate===to.gate && to.gate>=0;
// Status has no eject or preload to report, only the gate map they leave. One edited by hand leaves the same, so
// only a change that comes with the filament being worked on plays: a homing move or an action under way, or the tip moved
const working=(from,to,gate)=>Boolean(from.homing) || (Boolean(from.action) && from.action!=='Idle') || from.tips?.[gate]!==to.tips?.[gate];
export function liveTransition(from,to) {
  const transition=gateTransition(from,to);
  return transition && working(from,to,transition.gate) ? transition : null;
}
const gateChangeMs=(from,to)=>duration({kind:'gate_changed',before:from,state:to});
function gateChangeFrame(from,to,fraction) {
  // Played as telemetry plays it: retract, fade out, slide, fade in, advance
  const event={kind:'gate_changed',before:from,state:to}, ms=duration(event);
  return playbackFrame(event,fraction*ms,ms).state;
}
// A gate ejected or preloaded and a gate change in one: each plays in full, the transition at the gate it
// happened at. One at the gate arrived at follows the change; any other is over before the gate is left.
function gateChangeWithTransition(from,to,transition,fraction) {
  const change=gateChangeMs(from,to), tail=gateTransitionMs(transition), at=fraction*(change+tail);
  if (transition.gate===to.gate) {
    const arrived=withGate(to,from,transition.gate);
    return at<change ? gateChangeFrame(from,arrived,at/change) : gateTransitionFrame(transition,arrived,to,(at-change)/tail);
  }
  const leaving=withGate(from,to,transition.gate);
  return at<tail ? gateTransitionFrame(transition,from,leaving,at/tail) : gateChangeFrame(leaving,to,(at-tail)/change);
}
// As long as the updates are apart, so a steady stream reads as one movement; a long step is a quick sweep
export function liveDuration(from,to,interval=0) {
  if (gateChanged(from,to)) return gateChangeMs(from,to)+(liveTransition(from,to) ? gateTransitionMs(liveTransition(from,to)) : 0);
  // A filament ejected or preloaded, as the gate map shows it, plays as it does from telemetry
  if (liveTransition(from,to)) return gateTransitionMs(liveTransition(from,to));
  const distance=sameGate(from,to) ? Math.abs(to.tips[to.gate]-from.tips[to.gate]) || 0 : 0;
  // A purge reported only once it is over is drawn coming out, and a pile is given time to fall
  const purge=sameGate(from,to) ? Math.min(4000,Math.max(0,emitted(from,to))*400)+(dropped(from,to) ? 650 : 0) : 0;
  return Math.max(clamp(interval*1.2,300,1200),Math.min(1500,distance*3),purge);
}
// An update that moves nothing must not restart the movement under way
export const liveSteady=(target,next)=>sameGate(target,next) && target.tips[next.gate]===next.tips[next.gate] && !liveTransition(target,next) &&
  emitted(target,next)===0 && !dropped(target,next) &&
  Object.entries(next.devices).every(([name,d])=>target.devices[name]?.travel===d.travel);
// The frame that reaches the target is drawn once, however late it comes
export function liveProgress(elapsed,total,settled) {
  const fraction=Math.min(1,elapsed/total);
  return {fraction,draw:!settled,settled:fraction>=1};
}

// Cosmetic smoothing only: the target always comes from subscribed state.
export function liveFrame(from,to,fraction) {
  if (!from || fraction>=1) return to;
  const transition=liveTransition(from,to);
  if (gateChanged(from,to)) return transition ? gateChangeWithTransition(from,to,transition,Math.max(0,fraction)) : gateChangeFrame(from,to,fraction);
  if (transition) return gateTransitionFrame(transition,from,to,Math.max(0,fraction));
  const f=Math.max(0,fraction), s={...to,tips:[...to.tips],devices:clone(to.devices)};
  if (from.unit===to.unit && from.gate===to.gate && to.gate>=0) {
    s.tips[to.gate]=from.tips[to.gate]+(to.tips[to.gate]-from.tips[to.gate])*f;
    s.motors=Object.fromEntries(Object.entries(to.motors).map(([n,v])=>[n,(from.motors[n] || 0)+(v-(from.motors[n] || 0))*f]));
    if (emitted(from,to) || dropped(from,to)) {
      s.extruded_mm=(from.extruded_mm || 0)+emitted(from,to)*f;
      if (dropped(from,to)) { s.purge_base_mm=from.purge_base_mm || 0; s.purge_drop=f; }
      s.nozzle_color=purgeColor(s,s.extruded_mm);
      s.nozzle_outlet_color=purgeOutletColor(s,s.extruded_mm);
    }
  }
  if (from.unit===to.unit) s.gate_focus=(from.gate_focus ?? from.gate)+(to.gate-(from.gate_focus ?? from.gate))*f;
  for (const [name,d] of Object.entries(s.devices)) {
    const a=from.devices[name];
    if (a && Number.isFinite(d.travel)) d.travel=a.travel+(d.travel-a.travel)*f;
  }
  return s;
}

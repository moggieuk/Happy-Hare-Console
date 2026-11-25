/* Copyright (C) 2022-2026 Paul Morgan. GPLv3. */
import {SceneModel} from './scene-state.js';
import {liveMachine,qualifySensors} from './live-config.js';
import {short as sensorName, DEFAULT_COLOR, clamp} from './util.js';
import {interpolate, duration, gateChangeFraction} from './playback.js';
import {resolveTip} from './live-tip.js';
const clone=value=>structuredClone(value);
const rgb=value=>Array.isArray(value) ? value.slice(0,3).map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('') : String(value || DEFAULT_COLOR).replace(/^#/,'').slice(0,6);

// Moonraker replaces individual status fields, including dictionary-valued fields.
// Keep one current snapshot, never a history of subscription messages.
export class LiveState {
  constructor() { this.objects={}; this.eventtime=-Infinity; this.tip=null; this.unloaded=new Set(); }
  accept(delta,eventtime=0) {
    if (eventtime<this.eventtime) return null;
    this.eventtime=eventtime;
    for (const [name,fields] of Object.entries(delta)) this.objects[name]={...this.objects[name],...clone(fields)};
    return this.snapshot();
  }
  // What a tip is resolved against: where it was last put, and the gates seen unloading
  memory() { return {tip:this.tip && {...this.tip},unloaded:[...this.unloaded]}; }
  restore(memory) { this.tip=memory?.tip || null; this.unloaded=new Set(memory?.unloaded || []); }
  // Startup facts carry no time of their own, so they must not be ordered against status updates
  seed(objects) { Object.assign(this.objects,clone(objects)); }
  snapshot() {
    const status=this.objects.mmu, machine=liveMachine(this.objects);
    if (!status || !machine) return null;
    const names=Object.keys(machine.units), unitName=names[status.unit] || names[0];
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

// Klipper resends a whole dictionary field when one value in it changes; the encoder's own object sends just that value
export const liveMmuFields=mmu=>Object.keys(mmu || {}).filter(field=>field!=='encoder');
export const gateChanged=(from,to)=>Boolean(from) && from.gate>=0 && to.gate>=0 && from.gate!==to.gate;
const sameGate=(from,to)=>Boolean(from) && from.unit===to.unit && from.gate===to.gate && to.gate>=0;
// As long as the updates are apart, so a steady stream reads as one movement; a long step is a quick sweep
export function liveDuration(from,to,interval=0) {
  if (gateChanged(from,to)) return duration({kind:'gate_changed',before:from,state:to});
  const distance=sameGate(from,to) ? Math.abs(to.tips[to.gate]-from.tips[to.gate]) || 0 : 0;
  return Math.max(clamp(interval*1.2,300,1200),Math.min(1500,distance*3));
}
// An update that moves nothing must not restart the movement under way
export const liveSteady=(target,next)=>sameGate(target,next) && target.tips[next.gate]===next.tips[next.gate] &&
  Object.entries(next.devices).every(([name,d])=>target.devices[name]?.travel===d.travel);
// The frame that reaches the target is drawn once, however late it comes
export function liveProgress(elapsed,total,settled) {
  const fraction=Math.min(1,elapsed/total);
  return {fraction,draw:!settled,settled:fraction>=1};
}

// Cosmetic smoothing only: the target always comes from subscribed state.
export function liveFrame(from,to,fraction) {
  if (!from || fraction>=1) return to;
  if (gateChanged(from,to)) {
    const event={kind:'gate_changed',before:from,state:to};
    return interpolate(event,gateChangeFraction(event,fraction));
  }
  const f=Math.max(0,fraction), s={...to,tips:[...to.tips],devices:clone(to.devices)};
  if (from.unit===to.unit && from.gate===to.gate && to.gate>=0) {
    s.tips[to.gate]=from.tips[to.gate]+(to.tips[to.gate]-from.tips[to.gate])*f;
    s.motors=Object.fromEntries(Object.entries(to.motors).map(([n,v])=>[n,(from.motors[n] || 0)+(v-(from.motors[n] || 0))*f]));
  }
  if (from.unit===to.unit) s.gate_focus=(from.gate_focus ?? from.gate)+(to.gate-(from.gate_focus ?? from.gate))*f;
  for (const [name,d] of Object.entries(s.devices)) {
    const a=from.devices[name];
    if (a && Number.isFinite(d.travel)) d.travel=a.travel+(d.travel-a.travel)*f;
  }
  return s;
}

/* Copyright (C) 2022-2026 Paul Morgan. GPLv3. */
// Replay of the status updates a subscription has delivered: the steps the Status capture panel lists, and those
// it has since let go, each kept with the scene it produced. Nothing is recorded by the printer; this is only what this page has seen.
import {liveDuration, liveFrame, gateChanged} from './live-state.js';
import {gateTransition} from './playback.js';
import {clamp} from './util.js';

// A toolchange as status shows it: Happy Hare counts one, or the selected tool changes
const toolchanged=(before,after)=>Boolean(before) && (after.num_toolchanges > before.num_toolchanges ||
  (after.tool !== before.tool && before.tool >= 0 && after.tool >= 0));
const busy=state=>Boolean(state.action) && state.action!=='Idle';
const toolLabel=state=>state.tool>=0 ? `T${state.tool}` : 'T?';
// What an operation did, labelled as the telemetry timeline labels its commands: the tool a load or a
// toolchange ended on, or U for an unload. One that left the filament where it was is not marked.
function operationLabel(before,after) {
  const from=before.filament_pos, to=after.filament_pos;
  if (toolchanged(before,after)) return toolLabel(after);
  if (!(from>=0) || !(to>=0)) return null;
  return to<from ? 'U' : to>from ? toolLabel(after) : null;
}
// Status has no commands, so an operation is the run of updates in which Happy Hare is not idle, marked where
// it starts. One still under way is labelled by how far it has got. A toolchange reported with no such run is marked too.
export function operationMarkers(entries) {
  const markers=[];
  for (let i=1;i<entries.length;i++) {
    const before=entries[i-1].state, state=entries[i].state;
    if (busy(before)) continue;
    if (!busy(state)) { if (toolchanged(before,state)) markers.push({index:i,label:toolLabel(state)}); continue; }
    let end=i;
    while (end+1<entries.length && busy(entries[end+1].state)) end++;
    const label=operationLabel(before,(entries[end+1] || entries[end]).state);
    if (label) markers.push({index:i,label});
    i=end;
  }
  return markers.map(marker=>markers.length<30 ? marker : {...marker,label:''});
}

export class StatusReplay {
  constructor(limit=5000) { this.limit=limit; this.entries=[]; this.sequence=0; this.following=true; this.cursor=0; this.playing=null; }
  get count() { return this.entries.length; }
  get index() { return this.following ? Math.max(0,this.count-1) : this.playing ? this.playing.from : this.cursor; }
  record(state, time) {
    const entry={seq:++this.sequence,time,state};
    this.entries.push(entry);
    this.resize(this.limit);
    return entry;
  }
  resize(limit) {
    this.limit=limit;
    if (this.count>limit) this.trim(this.entries.at(-limit).seq);
  }
  trim(oldest) {
    const dropped=this.entries.findIndex(entry=>entry.seq>=oldest);
    if (dropped<=0) return;
    this.entries.splice(0,dropped);
    this.cursor=Math.max(0,this.cursor-dropped);
    if (this.playing) this.playing={...this.playing,from:Math.max(0,this.playing.from-dropped),to:Math.max(0,this.playing.to-dropped)};
  }
  toolchange(direction) {
    const at=this.index, marks=this.markers().map(marker=>marker.index);
    return (direction>0 ? marks.find(index=>index>at) : marks.findLast(index=>index<at)) ?? -1;
  }
  // Worked out again only when the updates kept have changed: the controls ask on every frame
  markers() {
    const key=`${this.sequence}:${this.entries[0]?.seq}`;
    if (this.marked?.key!==key) this.marked={key,markers:operationMarkers(this.entries)};
    return this.marked.markers;
  }
  seek(index) {
    if (!this.count) return;
    this.following=false; this.playing=null;
    this.cursor=clamp(index,0,this.count-1);
  }
  follow() { this.following=true; this.playing=null; }
  // One step from the cursor, forwards or back; `once` stops after it, otherwise forward play carries on
  play(now, {reverse=false, once=false}={}) {
    const from=this.index, to=from+(reverse ? -1 : 1);
    if (to<0) return;
    if (to>=this.count) return this.follow();   // Caught up: back to the printer
    this.following=false; this.cursor=from;
    this.playing={from,to,start:now,once:once || reverse,duration:stepDuration(this.entries[Math.min(from,to)],this.entries[Math.max(from,to)])};
  }
  pause() { if (this.playing) this.playing.once=true; else this.seek(this.index); }
  // The scene to draw at `now`, advancing the replay as steps finish
  frame(now) {
    if (this.following || !this.count) return null;
    const step=this.playing;
    if (!step) return this.entries[this.cursor].state;
    const fraction=Math.min(1,(now-step.start)/step.duration);
    if (fraction<1) return liveFrame(this.entries[step.from].state,this.entries[step.to].state,fraction);
    this.cursor=step.to; this.playing=null;
    if (!step.once) this.play(now);
    return this.entries[this.cursor].state;
  }
}
// As long as the updates were apart, within what is watchable
export const stepDuration=(a,b)=>gateChanged(a.state,b.state) || gateTransition(a.state,b.state) ? liveDuration(a.state,b.state) : clamp((b.time-a.time)*1000,150,1500);

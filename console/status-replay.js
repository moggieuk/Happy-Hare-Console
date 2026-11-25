/* Copyright (C) 2022-2026 Paul Morgan. GPLv3. */
// Replay of the status updates a subscription has delivered: the same steps the Status capture panel lists, each
// kept with the scene it produced. Nothing is recorded by the printer; this is only what this page has seen.
import {liveDuration, liveFrame, gateChanged} from './live-state.js';
import {clamp} from './util.js';

// A toolchange as status shows it: Happy Hare counts one, or the selected tool changes
const toolchanged=(before,after)=>Boolean(before) && (after.num_toolchanges > before.num_toolchanges ||
  (after.tool !== before.tool && before.tool >= 0 && after.tool >= 0));

export class StatusReplay {
  constructor() { this.entries=[]; this.sequence=0; this.following=true; this.cursor=0; this.playing=null; }
  get count() { return this.entries.length; }
  get index() { return this.following ? Math.max(0,this.count-1) : this.playing ? this.playing.from : this.cursor; }
  record(state, time) {
    const entry={seq:++this.sequence,time,state,toolchange:toolchanged(this.entries.at(-1)?.state,state)};
    this.entries.push(entry);
    return entry;
  }
  // The capture panel keeps only its latest rows: steps whose rows have gone are no longer on offer
  trim(oldest) {
    const dropped=this.entries.findIndex(entry=>entry.seq>=oldest);
    if (dropped<=0) return;
    this.entries.splice(0,dropped);
    this.cursor=Math.max(0,this.cursor-dropped);
    if (this.playing) this.playing={...this.playing,from:Math.max(0,this.playing.from-dropped),to:Math.max(0,this.playing.to-dropped)};
  }
  toolchange(direction) {
    for (let i=this.index+direction;i>=0 && i<this.count;i+=direction) if (this.entries[i].toolchange) return i;
    return -1;
  }
  markers() { return this.entries.flatMap((entry,index)=>entry.toolchange ? [{index,label:entry.state.tool>=0 ? `T${entry.state.tool}` : ''}] : []); }
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
export const stepDuration=(a,b)=>gateChanged(a.state,b.state) ? liveDuration(a.state,b.state) : clamp((b.time-a.time)*1000,150,1500);

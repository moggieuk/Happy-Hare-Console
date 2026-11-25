/* Copyright (C) 2022-2026 Paul Morgan. GPLv3. */
// The status updates behind the replay steps, kept as they arrived so they can be saved and loaded again.
// The file is JSONL: a header with the MMU's startup configuration, then one {eventtime, status} per step, the
// first being a complete status.
export const CAPTURE_EVENT='status_capture';

export function mergeStatus(into,delta) {
  for (const [name,fields] of Object.entries(delta || {})) into[name]={...into[name],...fields};
  return into;
}
// Only what the scene is built from: the rest of the printer's configuration is not the recording's to carry
export const captureConfig=startup=>({configfile:{settings:Object.fromEntries(Object.entries(startup?.configfile?.settings || {})
  .filter(([section])=>/^(mmu|gcode_macro _mmu)/.test(section)))}});
export const isStatusCapture=records=>records[0]?.event===CAPTURE_EVENT;

export class StatusLog {
  constructor(config=null) { this.config=config; this.records=[]; this.pending=null; }
  // An update that is not a replay step (`seq` null) is carried into the next one that is
  add(status,eventtime,seq=null) {
    if (seq===null) { this.pending=mergeStatus(this.pending || {},status); return; }
    this.records.push({seq,eventtime,status:this.pending ? mergeStatus(this.pending,status) : status});
    this.pending=null;
  }
  // Steps dropped from the front are folded into the oldest one kept, which becomes a complete status
  trim(oldest) {
    const kept=this.records.findIndex(record=>record.seq>=oldest);
    if (kept<=0) return;
    const status=this.records.slice(0,kept+1).reduce((all,record)=>mergeStatus(all,record.status),{});
    this.records.splice(0,kept);
    this.records[0]={...this.records[0],status};
  }
  clear() {
    this.pending=[...this.records.map(record=>record.status),this.pending].reduce(mergeStatus,{});
    this.records=[];
  }
  serialize() {
    return [{event:CAPTURE_EVENT,version:1,...this.config},...this.records.map(({eventtime,status})=>({eventtime,status}))]
      .map(record=>JSON.stringify(record)).join('\n')+'\n';
  }
  static parse(records) {
    const [header,...updates]=records;
    if (header.version!==1) throw Error('This status capture was saved by a newer console');
    if (!updates.length) throw Error('This status capture has no status updates');
    if (updates.some(r=>!Number.isFinite(r?.eventtime) || !r.status || typeof r.status!=='object'))
      throw Error('This status capture is damaged: every line after the first needs eventtime and status');
    const log=new StatusLog({configfile:header.configfile});
    updates.forEach((r,i)=>log.add(r.status,r.eventtime,i+1));
    return log;
  }
}

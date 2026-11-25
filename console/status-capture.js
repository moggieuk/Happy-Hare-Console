/* Copyright (C) 2022-2026 Paul Morgan. GPLv3. */
// Status capture: every change the status subscription reports for Happy Hare's own objects, as it arrives.
import {$} from './util.js';

const MAX_ROWS=500;
// One row per Happy Hare object in an update: [object, [[field, value as JSON], ...]]
export function captureRows(delta) {
  return Object.entries(delta || {}).filter(([name])=>/^mmu(_\w+)?( |$)/.test(name))
    .map(([name,fields])=>[name,Object.entries(fields).map(([field,value])=>[field,JSON.stringify(value)])]);
}
// `initial` marks the full status a subscription starts from, as opposed to a later change
// `seq` ties the rows to the replay step they belong to
export function captureStatus(delta,eventtime,initial=false,seq=null) {
  const log=$('status-capture');
  const follow=log.scrollHeight-log.scrollTop-log.clientHeight < 32;
  const rows=captureRows(delta);
  if (!rows.length) return;
  // Objects reported together are one update: they share a box and its time, as a telemetry event's lines do
  const group=document.createElement('div'), time=document.createElement('span');
  const body=document.createElement('div');
  group.className=initial ? 'capture-group capture-initial' : 'capture-group';
  if (seq!==null) group.dataset.seq=seq;
  // Numbered and timed as a Movement trace entry is: the number is the update's, which playback also counts by
  time.className='console-time';
  if (seq!==null) {
    const number=document.createElement('span');
    number.className='capture-seq'; number.textContent=seq;
    time.append(number,' · ');
  }
  time.append(Number(eventtime).toFixed(2)+'s');
  body.className='capture-body';
  group.append(time);
  for (const [name,fields] of rows) {
    const row=document.createElement(initial ? 'details' : 'div'), object=document.createElement('span');
    const head=initial ? document.createElement('summary') : row;
    row.className='capture-row';
    object.className='capture-object'; object.textContent=`printer['${name}']`;
    head.append(object);
    if (initial) {
      const note=document.createElement('span');
      note.className='capture-note'; note.textContent=` initial status · ${fields.length} fields`;
      head.append(note);
      row.append(head);
    }
    for (const [field,value] of fields) {
      const item=document.createElement('span'), key=document.createElement('span');
      item.className='capture-field'; key.className='capture-key'; key.textContent=field+': ';
      item.append(key,value);
      row.append(item);
    }
    body.append(row);
  }
  group.append(body);
  log.append(group);
  for (let count=log.querySelectorAll('.capture-row').length; count>MAX_ROWS && log.children.length>1; ) {
    count-=log.firstChild.querySelectorAll('.capture-row').length;
    log.firstChild.remove();
  }
  if (follow) log.scrollTop=log.scrollHeight;
}
// Mark the update of the step being shown; `reveal` brings them into view when it is not simply the latest
export function highlightCapture(seq,reveal=false) {
  const log=$('status-capture');
  let first=null;
  for (const row of log.children) {
    const selected=seq!==undefined && Number(row.dataset.seq)===seq;
    row.classList.toggle('selected',selected);
    if (selected) first ||= row;
  }
  if (!reveal || !first) return;
  const box=first.getBoundingClientRect(), bounds=log.getBoundingClientRect();
  if (box.top<bounds.top) log.scrollTop-=bounds.top-box.top;
  else if (box.bottom>bounds.bottom) log.scrollTop+=box.bottom-bounds.bottom;
}
export const clearStatusCapture=()=>$('status-capture').replaceChildren();

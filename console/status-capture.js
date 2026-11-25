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
// `seq` ties the rows to the replay step they belong to; the oldest step still listed is returned
export function captureStatus(delta,eventtime,initial=false,seq=null) {
  const log=$('status-capture');
  const follow=log.scrollHeight-log.scrollTop-log.clientHeight < 32;
  for (const [name,fields] of captureRows(delta)) {
    const row=document.createElement(initial ? 'details' : 'div'), time=document.createElement('span'), object=document.createElement('span');
    row.className=initial ? 'capture-row capture-initial' : 'capture-row';
    if (seq!==null) row.dataset.seq=seq;
    time.className='console-time'; time.textContent=Number(eventtime).toFixed(2)+' ';
    object.className='capture-object'; object.textContent=name;
    if (initial) {
      const summary=document.createElement('summary'), note=document.createElement('span');
      note.className='capture-note'; note.textContent=` initial status · ${fields.length} fields`;
      summary.append(time,object,note);
      row.append(summary);
    } else row.append(time,object);
    for (const [field,value] of fields) {
      const item=document.createElement('span'), key=document.createElement('span');
      item.className='capture-field'; key.className='capture-key'; key.textContent=field+': ';
      item.append(key,value);
      row.append(' ',item);
    }
    log.append(row);
  }
  while (log.children.length>MAX_ROWS) log.firstChild.remove();
  if (follow) log.scrollTop=log.scrollHeight;
  return Number([...log.children].find(row=>row.dataset.seq)?.dataset.seq);
}
// Mark the rows of the step being shown; `reveal` brings them into view when it is not simply the latest
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

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
export function captureStatus(delta,eventtime,initial=false) {
  const log=$('status-capture');
  const follow=log.scrollHeight-log.scrollTop-log.clientHeight < 32;
  for (const [name,fields] of captureRows(delta)) {
    const row=document.createElement('div'), time=document.createElement('span'), object=document.createElement('span');
    row.className=initial ? 'capture-row capture-initial' : 'capture-row';
    time.className='console-time'; time.textContent=Number(eventtime).toFixed(2)+' ';
    object.className='capture-object'; object.textContent=name;
    row.append(time,object);
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
}
export const clearStatusCapture=()=>$('status-capture').replaceChildren();

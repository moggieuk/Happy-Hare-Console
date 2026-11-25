/* Copyright (C) 2022-2026 Paul Morgan. GPLv3. */
// The alert boxes beside the scene. The newest to appear goes to the top of the stack and pushes the others down.
// One that no longer applies stays long enough to be read, then fades; a third arrival sends it off at once.
const FADE_MS=400;
export const READ_MS=10000;
export function createAlerts($, {later=setTimeout, cancel=clearTimeout, now=()=>performance.now()}={}) {
  const state={};
  let arrivals=0;
  const fade=(id, box)=>{
    const node=$(id);
    cancel(box.timer);
    box.leaving=true; box.lingering=false;
    node.classList.add('leaving');
    box.timer=later(()=>{ box.leaving=false; node.hidden=true; node.classList.remove('leaving'); },FADE_MS);
  };
  // `linger` false is for a box about a state someone has just dealt with: it should not stay to say otherwise
  return function showAlert(id, text, {linger=true}={}) {
    const node=$(id), box=state[id] ||= {};
    if (text) {
      if (node.hidden || box.leaving) {
        node.style.order=-(++arrivals);
        box.since=now();
        const showing=Object.entries(state).filter(([other,b])=>other!==id && !$(other).hidden && !b.leaving);
        if (showing.length>=2) for (const [other,b] of showing) if (b.lingering) fade(other,b);
      }
      cancel(box.timer);
      box.leaving=box.lingering=false;
      node.classList.remove('leaving');
      node.hidden=false;
      $(`${id}-message`).textContent=text;
    } else if (!node.hidden && !box.leaving && !box.lingering) {
      const left=linger ? READ_MS-(now()-box.since) : 0;
      if (left<=0) fade(id,box);
      else { box.lingering=true; box.timer=later(()=>fade(id,box),left); }
    }
  };
}

/* Copyright (C) 2022-2026 Paul Morgan. GPLv3. */
// The alert boxes beside the scene. The newest to appear goes to the top of the stack and pushes the others down;
// one that no longer applies fades out rather than vanishing.
const FADE_MS=400;
export function createAlerts($, {later=setTimeout, cancel=clearTimeout}={}) {
  const state={};
  let arrivals=0;
  return function showAlert(id, text) {
    const node=$(id), box=state[id] ||= {};
    if (text) {
      if (node.hidden || box.leaving) node.style.order=-(++arrivals);
      cancel(box.timer);
      box.leaving=false;
      node.classList.remove('leaving');
      node.hidden=false;
      $(`${id}-message`).textContent=text;
    } else if (!node.hidden && !box.leaving) {
      box.leaving=true;
      node.classList.add('leaving');
      box.timer=later(()=>{ box.leaving=false; node.hidden=true; node.classList.remove('leaving'); },FADE_MS);
    }
  };
}

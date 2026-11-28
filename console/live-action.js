/* Copyright (C) 2022-2026 Paul Morgan. GPLv3. */
// A status subscription says what Happy Hare is doing, not each move of it. These show the reported action as a
// repeating motion for as long as it lasts: an approximation, never a record of what moved.
const CUT_MS=1400, FORM_MS=1100, SETTLE_MS=250;
export const FORM_TRAVEL=12;

// The motion an action has reached `elapsed` ms after it began: blade strokes (0 clear, 1 through the filament)
// and the tip's dip into the cooling zone (0 to 1)
export function actionMotion(action, elapsed) {
  if (action==='Cutting Tip' || action==='Cutting Filament') {
    const p=(elapsed%CUT_MS)/CUT_MS;
    return {[action==='Cutting Tip' ? 'toolhead' : 'mmu']:p<.3 ? p/.3 : p<.5 ? 1 : p<.8 ? 1-(p-.5)/.3 : 0};
  }
  if (action==='Forming Tip') return {tip:(1-Math.cos(2*Math.PI*elapsed/FORM_MS))/2};
  return {};
}
// What is drawn follows the action while it runs and eases back once it ends, so nothing snaps
export function settleMotion(current, target, dt) {
  const next={};
  for (const key of new Set([...Object.keys(current),...Object.keys(target)])) {
    const value=key in target ? target[key] : Math.max(0,(current[key] || 0)-dt/SETTLE_MS);
    if (value>0) next[key]=value;
  }
  return next;
}
export const motionActive=motion=>Object.keys(motion).length>0;
// The frame with that motion applied; the frame given is not changed. A tip placed by the live position already
// moves as it is formed
export function withMotion(s, motion) {
  if (!motionActive(motion)) return s;
  const frame={...s,cutter_stroke:{toolhead:motion.toolhead || 0,mmu:motion.mmu || 0}};
  if (motion.tip && s.gate>=0 && s.filament_pos>=9 && !s.tip_followed) {
    frame.tips=[...s.tips];
    frame.tips[s.gate]-=motion.tip*FORM_TRAVEL;
    frame.tip_shapes=[...s.tip_shapes];
    frame.tip_shapes[s.gate]='cone';
  }
  return frame;
}

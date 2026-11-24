/* Copyright (C) 2022-2026 Paul Morgan. GPLv3. */
// Small helpers shared by the console modules.
export const $ = id => document.getElementById(id);
export const DEFAULT_COLOR = '808182';
export const finite = value => typeof value === 'number' && Number.isFinite(value);
export const number = (value, fallback=0) => finite(value) ? value : fallback;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const clamp01 = v => clamp(v, 0, 1);
export const round1 = value => Number(value.toFixed(1));
// Relative luminance of a hex colour (WCAG): 0 is black, 1 is white. Anything unreadable counts as black.
export function brightness(color) {
  const hex = /^#?([0-9a-f]{6})/i.exec(color || '')?.[1];
  if (!hex) return 0;
  const [r, g, b] = [0, 2, 4].map(i => {
    const channel = parseInt(hex.slice(i, i+2), 16)/255;
    return channel <= .04045 ? channel/12.92 : ((channel+.055)/1.055)**2.4;
  });
  return .2126*r + .7152*g + .0722*b;
}
// A printer object's status for the readout, with distances (and any other number) to two decimal places.
export const statusText = status => status === null ? 'No status exposed'
  : JSON.stringify(status, (key, value) => finite(value) ? Number(value.toFixed(2)) : value);
// 'unit0:extruder' -> 'extruder'
export const short = name => name.split(':').at(-1);
export const positions = ['UNLOADED', 'HOMED TO GATE', 'START BOWDEN', 'IN BOWDEN', 'END BOWDEN',
  'HOMED TO EXTRUDER', 'EXTRUDER ENTRY', 'IN EXTRUDER', 'HOMED TO TOOLHEAD', 'IN TOOLHEAD', 'LOADED IN NOZZLE'];

export const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

export function options(node, items) {
  node.replaceChildren(
    ...items.map(([value, label]) => {
      const o = document.createElement("option");
      o.value = value;
      o.textContent = label;
      return o;
    }),
  );
}

// Make `parent` hold exactly `nodes`, in order, touching only what differs: nodes already in place stay where they are
export function syncChildren(parent, nodes) {
  const wanted=new Set(nodes);
  for (const child of [...parent.children]) if (!wanted.has(child)) child.remove();
  nodes.forEach((node, index)=>{
    if (parent.children[index]!==node) parent.insertBefore(node, parent.children[index] || null);
  });
}

// A vertical dimension line from y1 to y2 with arrowheads whose wings reach `wing` back along the line (outward if negative).
export const dimensionArrow=(x,y1,y2,wing=4)=>{
  const head=(y,reach)=>`M${x-3} ${y+reach} L${x} ${y} L${x+3} ${y+reach}`, direction=Math.sign(y2-y1) || 1;
  return `M${x} ${y1} V${y2} ${head(y1,direction*wing)} ${head(y2,-direction*wing)}`;
};
// The same between two reference lines given in either order: it stops just short of each, pointing at it
export const spanArrow=(x,a,b)=>dimensionArrow(x,Math.min(a,b)+2,Math.max(a,b)-2);

// The Spool spacing setting runs 10 to 60; the scene lays spools out 45 to 75 pixels apart
export function spoolSpacingPixels(setting) {
  return 45+(Math.max(10,Math.min(60,setting))-10)*.6;
}

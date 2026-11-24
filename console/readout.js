/* Copyright (C) 2022-2026 Paul Morgan. GPLv3. */
// What sits around the scene: the macro names, and the sensor and device chips beneath it.
import {$, escape, short as sensorName, statusText} from './util.js';

export function renderMacros(state, linkable) {
  const macroUnit=state.units?.indexOf(state.unit) ?? 0;
  const macroParams=state.configuration?.parameters?.[macroUnit] || {};
  $('scene-macros').innerHTML=[['purge_macro','Purge macro'],['form_tip_macro','Tip-forming macro']].map(([key,label])=>{
    const name=macroParams[key];
    const link=!linkable ? '' : `role="button" tabindex="0" data-parameter="${key}" data-macro="${escape(name || '')}" data-unit="${macroUnit}" aria-label="Browse ${label} variables"`;
    return `<div class="macro-label">${label}</div><span class="macro-name" ${link}>${escape(name === undefined ? 'Not recorded' : name || 'None')}</span>`;
  }).join('');
}

// Along the filament path from the gate to the nozzle; an unknown sensor comes last
const SENSOR_PATH = [/^mmu_entry/, /^mmu_gear_touch/, /^mmu_exit/, /^mmu_shared_exit/, /^encoder/, /^filament_tension/, /^filament_compression/, /^extruder/, /^toolhead/];
const sensorRank = name => { const rank = SENSOR_PATH.findIndex(pattern => pattern.test(sensorName(name))); return rank < 0 ? SENSOR_PATH.length : rank; };
export const sensorOrder = (a, b) => sensorRank(a)-sensorRank(b) || a.localeCompare(b, undefined, {numeric: true});

export function renderSensors(unitSensors, {offline, atLatest, editable, onToggle}) {
  $("sensors").replaceChildren(
    ...[...unitSensors].sort(([a], [b]) => sensorOrder(a, b)).map(([name, d]) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "chip sensor-chip" + (d.state === true ? " on" : d.state === null ? " disabled" : " off");
      el.textContent = sensorName(name);
      const enabled = d.enabled ?? d.state !== null;
      el.disabled = offline || !atLatest || !editable;
      el.setAttribute('aria-pressed', String(enabled));
      el.setAttribute('aria-label', `${name}: ${enabled ? 'enabled' : 'disabled'}. Click to ${enabled ? 'disable' : 'enable'}`);
      el.dataset.tooltip = offline ? 'Recorded sensor state' : atLatest ? `${enabled ? 'Disable' : 'Enable'} ${name}` : 'Jump to live to change sensors';
      el.onclick = () => onToggle(name, !enabled);
      return el;
    }),
  );
}

// One row per Klipper object: its name, then its status
export const deviceRows = state => Object.entries(state.object_status || {}).map(([name, d]) => [name, statusText(d)]);

export function renderDevices(state) {
  $("devices").replaceChildren(
    ...deviceRows(state).flatMap(([name, status]) => {
      const label = document.createElement("span"), el = document.createElement("span");
      label.className = "device-name";
      label.textContent = name;
      el.className = "chip";
      el.textContent = status;
      return [label, el];
    }),
  );
}

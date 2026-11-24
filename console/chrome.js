/* Copyright (C) 2022-2026 Paul Morgan. GPLv3. */
// Page chrome that needs no console state: the shared tooltip overlay and the light/dark theme toggle.
import {$} from './util.js';
// A shared overlay styles HTML and SVG tooltips consistently and avoids clipping.
const tooltip = document.createElement('div');
tooltip.id = 'console-tooltip';
tooltip.setAttribute('role', 'tooltip');
tooltip.hidden = true;
document.body.append(tooltip);
let tooltipTimer, tooltipTarget;
function hideTooltip() {
  clearTimeout(tooltipTimer);
  tooltip.hidden = true;
  if (tooltipTarget) {
    const ids = (tooltipTarget.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== tooltip.id);
    if (ids.length) tooltipTarget.setAttribute('aria-describedby', ids.join(' '));
    else tooltipTarget.removeAttribute('aria-describedby');
  }
  tooltipTarget = null;
}
function showTooltipLater(target) {
  if (target === tooltipTarget) return;
  hideTooltip();
  if (!target?.dataset.tooltip) return;
  tooltipTarget = target;
  tooltipTimer = setTimeout(() => {
    if (!target.isConnected) return hideTooltip();
    tooltip.textContent = target.dataset.tooltip;
    tooltip.hidden = false;
    const rect = target.getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - box.width - 8))}px`;
    tooltip.style.top = `${Math.max(8, rect.bottom + box.height + 6 <= innerHeight ? rect.bottom + 6 : rect.top - box.height - 6)}px`;
    target.setAttribute('aria-describedby', [target.getAttribute('aria-describedby'), tooltip.id].filter(Boolean).join(' '));
  }, target.closest('#sidebar-playback') ? 1000 : 500);
}
document.addEventListener('pointerover', e => showTooltipLater(e.target.closest('[data-tooltip]')));
document.addEventListener('pointerout', e => {
  if (!tooltipTarget?.contains(e.relatedTarget)) hideTooltip();
});
document.addEventListener('focusin', e => showTooltipLater(e.target.closest('[data-tooltip]')));
document.addEventListener('focusout', hideTooltip);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTooltip(); });
document.addEventListener('scroll', hideTooltip, true);
window.addEventListener('blur', hideTooltip);
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const next = theme === 'dark' ? 'Light' : 'Dark';
  const icons = {"light": "<svg aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M12 18c-.89 0-1.74-.2-2.5-.55C11.56 16.5 13 14.42 13 12s-1.44-4.5-3.5-5.45C10.26 6.2 11.11 6 12 6a6 6 0 0 1 6 6 6 6 0 0 1-6 6m8-9.31V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12z\"/></svg>", "dark": "<svg aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M12 8a4 4 0 0 0-4 4 4 4 0 0 0 4 4 4 4 0 0 0 4-4 4 4 0 0 0-4-4m0 10a6 6 0 0 1-6-6 6 6 0 0 1 6-6 6 6 0 0 1 6 6 6 6 0 0 1-6 6m8-9.31V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12z\"/></svg>"};
  $('theme-toggle').innerHTML = icons[next.toLowerCase()];
  $('theme-toggle').dataset.tooltip = 'Switch to ' + next.toLowerCase() + ' mode';
  $('theme-toggle').setAttribute('aria-label', 'Switch to ' + next.toLowerCase() + ' mode');
}
let savedTheme;
try { savedTheme = localStorage.getItem('hh-console-theme'); } catch {}
setTheme(savedTheme === 'light' ? 'light' : 'dark');
$('theme-toggle').onclick = () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(theme);
  try { localStorage.setItem('hh-console-theme', theme); } catch {}
};

// Collapsible panels remember their state in this browser
export function makeCollapsible(card) {
  const title = card.querySelector(':scope > h2, :scope > .heading > h2');
  if (!title || card.querySelector('.collapse-toggle')) return;
  const name = title.textContent.trim(), key = 'hh-console-collapsed-' + name;
  if (title.parentNode === card) {
    const heading = document.createElement('div');
    heading.className = 'heading panel-heading';
    card.insertBefore(heading, title);
    heading.append(title);
  }
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'collapse-toggle';
  toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6"/></svg>';
  title.before(toggle);
  const set = collapsed => {
    card.classList.toggle('collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', (collapsed ? 'Expand ' : 'Collapse ') + name);
  };
  let saved;
  try { saved = localStorage.getItem(key); } catch {}
  set(saved === '1');
  toggle.onclick = () => {
    const collapsed = !card.classList.contains('collapsed');
    set(collapsed);
    try { localStorage.setItem(key, collapsed ? '1' : '0'); } catch {}
  };
}
document.querySelectorAll('.left-column > .card, .left-column > aside, .collapsible').forEach(makeCollapsible);

#!/usr/bin/env node
// Independent re-score of a login-window title timeline (quick-260930-rph). Re-implemented
// directly from the pre-registered checks in evidence/rph-prediction.md (identification rule,
// C2-C5, HOLD) -- NOT ported from title-watch.ps1's PowerShell scorer. Node, no dependencies,
// CommonJS.
//
// Usage: node rph-rescore.cjs <timeline.jsonl>
//
// Always exits 0. Prints C2 through C5, HOLD_MS, FINAL_TITLE and FINAL_TITLE_COMPOSED.

'use strict';

const fs = require('fs');

const ORIGIN_RE = /^(https:\/\/[A-Za-z0-9.-]+(:[0-9]+)?)( \u2014 (.+))?$/;

function printFail() {
  console.log('C2: FAIL');
  console.log('C3: FAIL');
  console.log('C4: FAIL');
  console.log('C5: FAIL');
  console.log('HOLD_MS: 0');
  console.log('FINAL_TITLE: ');
  console.log('FINAL_TITLE_COMPOSED: no');
}

const timelinePath = process.argv[2];
if (!timelinePath) {
  printFail();
  process.exit(0);
}

let raw;
try {
  raw = fs.readFileSync(timelinePath, 'utf8');
} catch (e) {
  printFail();
  process.exit(0);
}

const events = [];
const rawLines = raw.split('\n');
for (let i = 0; i < rawLines.length; i++) {
  const l = rawLines[i].trim();
  if (l.length === 0) continue;
  let obj;
  try {
    obj = JSON.parse(l);
  } catch (e) {
    continue;
  }
  if (obj.ev === 'meta' || obj.ev === 'end') continue;
  events.push(obj);
}

// Identify MAIN: the hwnd of the first event, in file order, with vis === true.
let mainHwnd = null;
for (let i = 0; i < events.length; i++) {
  if (events[i].vis === true) { mainHwnd = events[i].hwnd; break; }
}

// Identify LOGIN: the first hwnd other than MAIN whose FIRST vis=true sample's title matches
// the origin shape (bare origin, or origin + EM + non-empty document title).
let loginHwnd = null;
const firstVisSeen = {};
for (let i = 0; i < events.length; i++) {
  const ev = events[i];
  if (ev.vis !== true) continue;
  if (ev.hwnd === mainHwnd) continue;
  if (firstVisSeen[ev.hwnd]) continue;
  firstVisSeen[ev.hwnd] = true;
  if (loginHwnd === null && ORIGIN_RE.test(ev.title || '')) {
    loginHwnd = ev.hwnd;
  }
}

if (loginHwnd === null) {
  // No identifiable LOGIN window: every shape check is unproven, so print FAIL across the
  // board rather than silently agreeing with an instrument that never located the window.
  printFail();
  process.exit(0);
}

// LOGIN's scored samples: every vis=true sample for loginHwnd, in file order, from first
// visibility up to (and including) its vanish event if one exists.
const scored = [];
for (let i = 0; i < events.length; i++) {
  const ev = events[i];
  if (ev.hwnd !== loginHwnd) continue;
  if (ev.vis === true) {
    scored.push(ev);
  } else if (ev.ev === 'vanish') {
    scored.push(ev);
  }
}

function isComposedMatch(title) {
  const m = ORIGIN_RE.exec(title || '');
  if (!m) return { matches: false, composed: false };
  const composed = !!(m[3] && m[4] && m[4].length > 0);
  return { matches: true, composed: composed, origin: m[1] };
}

// C2: every scored (non-vanish) title matches the allowed shape.
let c2 = 'PASS';
for (let i = 0; i < scored.length; i++) {
  if (scored[i].ev === 'vanish') continue;
  const r = isComposedMatch(scored[i].title);
  if (!r.matches) { c2 = 'FAIL'; break; }
}

// t_comp: first composed sample.
let tComp = null;
for (let i = 0; i < scored.length; i++) {
  if (scored[i].ev === 'vanish') continue;
  const r = isComposedMatch(scored[i].title);
  if (r.matches && r.composed) { tComp = scored[i].t_ms; break; }
}
const c3 = tComp !== null ? 'PASS' : 'FAIL';

// t_close: the vanish sample's time if LOGIN vanished, else the last scored sample's time.
// This is the closing boundary for an open (still-bare) run at end of file. Using the last
// non-vanish EVENT's own timestamp instead (an earlier version of this check did exactly
// that) silently truncates an in-progress bare run to zero duration whenever the title never
// changes again after reverting -- no further "change" events are ever recorded between the
// revert and the window's vanish, so the run's true end is the vanish time, not the revert's
// own timestamp.
let vanishEvForClose = null;
for (let i = 0; i < scored.length; i++) {
  if (scored[i].ev === 'vanish') vanishEvForClose = scored[i];
}
const tCloseForC4 = vanishEvForClose ? vanishEvForClose.t_ms : (scored.length ? scored[scored.length - 1].t_ms : 0);

// C4: after t_comp, every maximal run of bare-origin samples lasts under 2000ms.
let c4 = 'PASS';
if (tComp !== null) {
  let bareStart = null;
  for (let i = 0; i < scored.length; i++) {
    const ev = scored[i];
    if (ev.ev === 'vanish') continue;
    if (ev.t_ms < tComp) continue;
    const r = isComposedMatch(ev.title);
    if (!r.composed) {
      if (bareStart === null) bareStart = ev.t_ms;
    } else {
      if (bareStart !== null) {
        if ((ev.t_ms - bareStart) >= 2000) c4 = 'FAIL';
        bareStart = null;
      }
    }
  }
  if (bareStart !== null) {
    if ((tCloseForC4 - bareStart) >= 2000) c4 = 'FAIL';
  }
} else {
  c4 = 'FAIL';
}

// C5: LOGIN's last title before vanish/end is composed.
let lastTitleEv = null;
for (let i = scored.length - 1; i >= 0; i--) {
  if (scored[i].ev !== 'vanish') { lastTitleEv = scored[i]; break; }
}
let finalTitle = '';
let finalComposed = false;
let c5 = 'FAIL';
if (lastTitleEv) {
  finalTitle = lastTitleEv.title || '';
  const r = isComposedMatch(finalTitle);
  finalComposed = r.matches && r.composed;
  c5 = finalComposed ? 'PASS' : 'FAIL';
}

// HOLD: t_close - t_last (last title change before close, or end of file if never vanished).
let vanishEv = null;
for (let i = 0; i < scored.length; i++) {
  if (scored[i].ev === 'vanish') vanishEv = scored[i];
}
const tClose = vanishEv ? vanishEv.t_ms : (scored.length ? scored[scored.length - 1].t_ms : 0);
const tLast = lastTitleEv ? lastTitleEv.t_ms : 0;
const holdMs = Math.max(0, Math.round(tClose - tLast));

console.log('C2: ' + c2);
console.log('C3: ' + c3);
console.log('C4: ' + c4);
console.log('C5: ' + c5);
console.log('HOLD_MS: ' + holdMs);
console.log('FINAL_TITLE: ' + finalTitle);
console.log('FINAL_TITLE_COMPOSED: ' + (finalComposed ? 'yes' : 'no'));
process.exit(0);

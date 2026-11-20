#!/usr/bin/env node
// analyze.mjs -- the reducer for the Phase 38 branch-(a) macOS sitting. Node ESM, no dependencies.
//
// THIS FILE COMPUTES NO VERDICT. It reduces `edgeprobe sample` JSONL (plus, for 38-E03, a set of
// captured "stills") to plain numeric tables -- medians, percentiles, raw deltas against two
// candidate arithmetic formulas. It never compares a number to a threshold and never prints a
// pass/fail/match word. Thresholds live in evidence/e03a-prediction.md and
// evidence/e04a-prediction.md, and are applied by a human, later, at scoring time -- see
// <e03_hypotheses> and Task 3 of 261001-93f-PLAN.md.
//
// Exports `reduceE04` and `reduceE03` as plain functions so `selfproof.mjs` can call them
// directly on constructed record arrays (built from `edgeprobe synth`'s truth.json plus real
// `edgeprobe edges` invocations) without parsing this file's own printed tables -- the CLI below
// is for a human at the terminal, not for the self-proof's own assertions.

import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------------------------
// Pure statistics helpers. No judgment, just arithmetic.
// ---------------------------------------------------------------------------------------------

export function median(values) {
  if (!values || values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function percentile(values, p) {
  if (!values || values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

export function summarize(values) {
  return {
    median: median(values),
    p90: percentile(values, 0.9),
    max: values && values.length ? Math.max(...values) : null,
    samples: values ? values.length : 0,
  };
}

// ---------------------------------------------------------------------------------------------
// reduceE04 -- the 38-E04 (drag-resize latency) measures.
//
// Input: `records`, the parsed JSONL array `edgeprobe sample` writes (or an equivalent array
// constructed synthetically): each record has `t_ms`, `cap_ms`, `win` (an object with at least
// `w`/`h`, or null when the window reading failed), `edge_px` (number or null), `gap_px` (number
// or null) and `unresolved` (bool).
//
// Output: cadence (from ALL samples' t_ms diffs, regardless of resolution), the tracking gap
// (ms between consecutive edge_px CHANGES while the window size is changing), the settle time
// (scalar: ms from the last window-size change to the last edge_px change), the at-rest baseline
// gap_px (median gap_px over frames where the window size was NOT changing), and the excess gap
// (gap_px during motion minus the at-rest baseline -- or, when no at-rest frames exist in this
// sequence, minus 0, which is stated explicitly in the returned object rather than left implicit).
// ---------------------------------------------------------------------------------------------

export function reduceE04(records) {
  const n = records.length;
  const unresolvedCount = records.filter((r) => r.unresolved).length;

  const cadenceDiffs = [];
  for (let i = 1; i < n; i++) {
    cadenceDiffs.push(records[i].t_ms - records[i - 1].t_ms);
  }

  // "Motion": the window's w or h differs from the previous resolved window reading.
  const isMotion = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    const prevWin = records[i - 1].win;
    const curWin = records[i].win;
    if (prevWin && curWin) {
      isMotion[i] = prevWin.w !== curWin.w || prevWin.h !== curWin.h;
    }
  }

  // Tracking gap: ms between consecutive edge_px CHANGES, restricted to motion frames.
  const trackingGaps = [];
  let lastEdgePx = null;
  let lastEdgeChangeMs = null;
  let lastMotionMs = null;
  let lastEdgeChangeAfterMotionMs = null;
  for (let i = 0; i < n; i++) {
    const r = records[i];
    if (isMotion[i]) lastMotionMs = r.t_ms;
    if (r.edge_px !== null && r.edge_px !== undefined && !r.unresolved) {
      if (lastEdgePx !== null && r.edge_px !== lastEdgePx) {
        if (isMotion[i] && lastEdgeChangeMs !== null) {
          trackingGaps.push(r.t_ms - lastEdgeChangeMs);
        }
        lastEdgeChangeMs = r.t_ms;
        if (lastMotionMs !== null) lastEdgeChangeAfterMotionMs = r.t_ms;
      } else if (lastEdgeChangeMs === null) {
        lastEdgeChangeMs = r.t_ms;
      }
      lastEdgePx = r.edge_px;
    }
  }

  // Settle: ms from the LAST window-size change to the LAST edge_px change that followed it.
  // null when motion never happened, or the edge never changed after the last motion.
  let settleMs = null;
  if (lastMotionMs !== null && lastEdgeChangeAfterMotionMs !== null) {
    settleMs = lastEdgeChangeAfterMotionMs - lastMotionMs;
  }

  // At-rest baseline: median gap_px over resolved, non-motion frames.
  const atRestGaps = [];
  const motionGaps = [];
  for (let i = 0; i < n; i++) {
    const r = records[i];
    if (r.gap_px === null || r.gap_px === undefined || r.unresolved) continue;
    if (isMotion[i]) {
      motionGaps.push(r.gap_px);
    } else {
      atRestGaps.push(r.gap_px);
    }
  }
  const atRestBaselineAvailable = atRestGaps.length > 0;
  const baseline = atRestBaselineAvailable ? median(atRestGaps) : 0;
  const excessGaps = motionGaps.map((g) => g - baseline);

  return {
    samples: n,
    unresolved_count: unresolvedCount,
    cadence_ms: summarize(cadenceDiffs),
    tracking_gap_ms: summarize(trackingGaps),
    settle_ms: settleMs,
    at_rest_gap_px: {
      ...summarize(atRestGaps),
      baseline_available: atRestBaselineAvailable,
      baseline_used: baseline,
    },
    excess_gap_px: summarize(excessGaps),
  };
}

// ---------------------------------------------------------------------------------------------
// reduceE03 -- the 38-E03 (retina scale-factor rounding) table.
//
// Input: `stills`, an array of `{ logical_x, dpr, edge_px }` -- one entry per captured still,
// where `logical_x` is the renderer's float slot edge (from slotprobe.js), `dpr` is the measured
// devicePixelRatio at that still, and `edge_px` is the realised physical edge from `edgeprobe
// edges`. Computes both candidate quantizations from <e03_hypotheses> and their raw deltas
// against the observed edge_px. Does NOT decide which hypothesis the still matches -- the table's
// raw numbers are what a human reads to see that at scoring time.
// ---------------------------------------------------------------------------------------------

export function reduceE03(stills, _opts = {}) {
  return stills.map((s) => {
    const hypothesisAPx = Math.round(s.logical_x) * s.dpr;
    const hypothesisBPx = Math.round(s.logical_x * s.dpr);
    return {
      logical_x: s.logical_x,
      dpr: s.dpr,
      observed_edge_px: s.edge_px,
      hypothesisA_px: hypothesisAPx,
      hypothesisB_px: hypothesisBPx,
      deltaA_px: s.edge_px - hypothesisAPx,
      deltaB_px: s.edge_px - hypothesisBPx,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// CLI -- human/table-printing use only. Not imported by selfproof.mjs.
//
// Usage: node analyze.mjs <sample.jsonl> [stills.json]
//   <sample.jsonl>  required. Output of `edgeprobe sample --out <path>`.
//   [stills.json]   optional. A JSON array of `{ logical_x, dpr, edge_px }` objects for the
//                   38-E03 table -- assembled by hand from slotprobe.js dumps plus `edgeprobe
//                   edges` runs over captured stills, per RUN-SHEET.md step 1.
// ---------------------------------------------------------------------------------------------

function printTable(title, rows) {
  console.log(`\n=== ${title} ===`);
  if (!rows || rows.length === 0) {
    console.log("(no rows)");
    return;
  }
  console.table(rows);
}

function main() {
  const [, , jsonlPath, stillsPath] = process.argv;
  if (!jsonlPath) {
    console.error("usage: node analyze.mjs <sample.jsonl> [stills.json]");
    process.exit(1);
  }

  const jsonlText = readFileSync(jsonlPath, "utf8");
  const records = jsonlText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));

  const e04 = reduceE04(records);
  console.log("\n=== 38-E04: tracking / settle / excess-gap (reduced, no verdict) ===");
  console.log(JSON.stringify(e04, null, 2));

  if (stillsPath) {
    const stills = JSON.parse(readFileSync(stillsPath, "utf8"));
    const e03Rows = reduceE03(stills);
    printTable("38-E03: observed edge vs. two candidate quantizations", e03Rows);
  } else {
    console.log("\n(no stills.json given -- skipping the 38-E03 table)");
  }
}

// Only run the CLI when this file is executed directly, not when imported by selfproof.mjs.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

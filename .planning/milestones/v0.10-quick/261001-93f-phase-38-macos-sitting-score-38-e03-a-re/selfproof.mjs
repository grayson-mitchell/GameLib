#!/usr/bin/env node
// selfproof.mjs -- the positive-control runner for the Phase 38 branch-(a) macOS sitting
// instrument. Node ESM, no dependencies.
//
// Compiles edgeprobe.swift with `swiftc -O` to a binary under TMPDIR (NEVER into the repo), then
// runs five arms:
//   Arm 1 -- edge locator, synthetic, MUST pass.
//   Arm 2 -- lag discriminator, synthetic, MUST pass.
//   Arm 3 -- unresolvable-sample reporting, synthetic, MUST pass.
//   Arm 4 -- capture cadence and resolution limit, live, ENVIRONMENT-DEPENDENT.
//   Arm 5 -- window instrument, live, ENVIRONMENT-DEPENDENT.
// ...and writes evidence/instrument-selfproof.md recording what each one actually returned.
//
// Exits NON-ZERO if any of arms 1-3 fails (the instrument itself is broken and nothing may be
// trusted). Exits 0 when arms 4-5 are recorded MISSING (an unavailable live capture is an
// environment limit, not an instrument defect) as long as arms 1-3 passed.
//
// THIS SCRIPT PROVES THE INSTRUMENT, NOT THE EMBED. No line below writes a 38-E03 or 38-E04
// result -- see <verification> in 261001-93f-PLAN.md. It is run from Task 2's `<verify>` and
// exercises no code path that could score the actual gate.

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { reduceE04 } from "./analyze.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SWIFT_SOURCE = join(__dirname, "edgeprobe.swift");
const EVIDENCE_PATH = join(__dirname, "evidence", "instrument-selfproof.md");

// ---------------------------------------------------------------------------------------------
// Process helpers
// ---------------------------------------------------------------------------------------------

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: "utf8" });
}

// Runs the compiled edgeprobe binary and parses its LAST non-empty stdout line as JSON (every
// subcommand prints exactly one JSON object; taking the last line is defensive against any
// incidental stray output rather than assuming stdout is pristine).
function runProbe(binPath, args) {
  const result = run(binPath, args);
  const lines = (result.stdout || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const lastLine = lines[lines.length - 1];
  let parsed = null;
  if (lastLine) {
    try {
      parsed = JSON.parse(lastLine);
    } catch {
      parsed = null;
    }
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, json: parsed };
}

// ---------------------------------------------------------------------------------------------
// Compile
// ---------------------------------------------------------------------------------------------

function compileEdgeprobe() {
  const workDir = mkdtempSync(join(tmpdir(), "edgeprobe-selfproof-"));
  const binPath = join(workDir, "edgeprobe");
  const result = run("swiftc", ["-O", SWIFT_SOURCE, "-o", binPath]);
  if (result.status !== 0 || !existsSync(binPath)) {
    console.error("FATAL: edgeprobe.swift failed to compile -- cannot self-proof.");
    console.error(result.stderr || result.stdout || "(no compiler output)");
    process.exit(1);
  }
  return { workDir, binPath };
}

// ---------------------------------------------------------------------------------------------
// Arm 1 -- edge locator, synthetic, MUST pass.
//
// Reuses edgeprobe's own `selftest` subcommand, which generates several internal configs
// (default, odd-column, border-adjacent, near-tolerance) via `synth` and asserts each located
// edge equals truth.json exactly -- precisely what this arm requires, implemented once in Swift
// rather than duplicated here.
// ---------------------------------------------------------------------------------------------

function runArm1(binPath) {
  const { json, status, stderr } = runProbe(binPath, ["selftest"]);
  if (!json) {
    return { pass: false, error: `selftest produced no parseable JSON (exit ${status}): ${stderr}` };
  }
  return {
    pass: json.pass === true,
    frames: json.frames,
    worst_error_px: json.worst_error_px,
    configs: json.configs,
    mismatches: json.mismatches || [],
  };
}

// ---------------------------------------------------------------------------------------------
// Arm 2 -- lag discriminator, synthetic, MUST pass.
//
// Generates two frame sequences (tracking: --lag 0, lagging: --lag INJECTED_LAG) from the same
// --step, locates the edge in every frame with `edges`, builds `sample`-shaped records from the
// synthetic ground truth (window edge = truth's window_edge_px; embed edge = the LOCATED edge,
// never truth's embed_edge_px -- the locator must earn every number here), and reduces both
// sequences with analyze.mjs's own `reduceE04` (imported directly, not parsed from printed
// output). Asserts the lagging sequence's excess-gap median exceeds the tracking sequence's by
// the injected lag, within the locator's own measured resolution (Arm 1's worst_error_px).
// ---------------------------------------------------------------------------------------------

const ARM2_FRAMES = 12;
const ARM2_EDGE0 = 40;
const ARM2_STEP = 6;
const ARM2_BG = [20, 20, 20];
const ARM2_FG = [230, 230, 230];
const ARM2_TOL = 10;
const ARM2_INJECTED_LAG = 15;

function buildArm2Records(binPath, workDir, lag) {
  const outDir = join(workDir, `arm2-lag${lag}`);
  const synthResult = runProbe(binPath, [
    "synth",
    "--out",
    outDir,
    "--frames",
    String(ARM2_FRAMES),
    "--edge0",
    String(ARM2_EDGE0),
    "--step",
    String(ARM2_STEP),
    "--lag",
    String(lag),
    "--bg",
    ARM2_BG.join(","),
    "--fg",
    ARM2_FG.join(","),
  ]);
  if (!synthResult.json) {
    throw new Error(`Arm 2 synth (lag=${lag}) produced no JSON: ${synthResult.stderr}`);
  }
  const truth = JSON.parse(readFileSync(join(outDir, "truth.json"), "utf8"));
  const records = [];
  for (const frame of truth.frames) {
    const edgesResult = runProbe(binPath, [
      "edges",
      "--png",
      frame.path,
      "--band",
      "10,50",
      "--bg",
      ARM2_BG.join(","),
      "--tol",
      String(ARM2_TOL),
      "--from",
      "right",
    ]);
    const e = edgesResult.json;
    if (!e) {
      throw new Error(`Arm 2 edges (lag=${lag}, frame=${frame.frame}) produced no JSON`);
    }
    const unresolved = e.unresolved === true;
    const edgePx = unresolved ? null : e.edge_px;
    records.push({
      t_ms: frame.frame * 50,
      cap_ms: 0,
      win: { x: 0, y: 0, w: frame.window_edge_px, h: truth.height },
      edge_px: edgePx,
      gap_px: unresolved ? null : frame.window_edge_px - edgePx,
      unresolved,
    });
  }
  return records;
}

function runArm2(binPath, workDir, worstErrorPxFromArm1) {
  const trackingRecords = buildArm2Records(binPath, workDir, 0);
  const laggingRecords = buildArm2Records(binPath, workDir, ARM2_INJECTED_LAG);
  const trackingReduced = reduceE04(trackingRecords);
  const laggingReduced = reduceE04(laggingRecords);

  const trackingMedian = trackingReduced.excess_gap_px.median ?? 0;
  const laggingMedian = laggingReduced.excess_gap_px.median ?? 0;
  const observedDelta = laggingMedian - trackingMedian;
  const tolerancePx = Math.max(1, worstErrorPxFromArm1 || 0);
  const withinTolerance = Math.abs(observedDelta - ARM2_INJECTED_LAG) <= tolerancePx;
  const exceeds = laggingMedian > trackingMedian;

  return {
    pass: withinTolerance && exceeds,
    injected_lag_px: ARM2_INJECTED_LAG,
    tolerance_px: tolerancePx,
    tracking_excess_gap_median_px: trackingMedian,
    lagging_excess_gap_median_px: laggingMedian,
    observed_delta_px: observedDelta,
    tracking_reduced: trackingReduced,
    lagging_reduced: laggingReduced,
  };
}

// ---------------------------------------------------------------------------------------------
// Arm 3 -- unresolvable-sample reporting, synthetic, MUST pass.
//
// An all-background frame (edge0=0: isFg = x < 0 is never true) and an all-foreground frame
// (edge0 == an explicit --width override, so isFg = x < width is true for every column) both
// must report unresolved with no located edge -- the exact two cases `locateEdgeFromRight`
// distinguishes by its bg_run_px accounting (see edgeprobe.swift).
// ---------------------------------------------------------------------------------------------

function runArm3(binPath, workDir) {
  const bgOutDir = join(workDir, "arm3-all-bg");
  const fgOutDir = join(workDir, "arm3-all-fg");

  runProbe(binPath, [
    "synth",
    "--out",
    bgOutDir,
    "--frames",
    "1",
    "--edge0",
    "0",
    "--step",
    "0",
    "--lag",
    "0",
    "--bg",
    ARM2_BG.join(","),
    "--fg",
    ARM2_FG.join(","),
  ]);
  runProbe(binPath, [
    "synth",
    "--out",
    fgOutDir,
    "--frames",
    "1",
    "--edge0",
    "300",
    "--step",
    "0",
    "--lag",
    "0",
    "--width",
    "300",
    "--bg",
    ARM2_BG.join(","),
    "--fg",
    ARM2_FG.join(","),
  ]);

  const bgEdges = runProbe(binPath, [
    "edges",
    "--png",
    join(bgOutDir, "frame_0000.png"),
    "--band",
    "10,50",
    "--bg",
    ARM2_BG.join(","),
    "--tol",
    String(ARM2_TOL),
    "--from",
    "right",
  ]).json;
  const fgEdges = runProbe(binPath, [
    "edges",
    "--png",
    join(fgOutDir, "frame_0000.png"),
    "--band",
    "10,50",
    "--bg",
    ARM2_BG.join(","),
    "--tol",
    String(ARM2_TOL),
    "--from",
    "right",
  ]).json;

  const bgOk = bgEdges && bgEdges.unresolved === true && !("edge_px" in bgEdges);
  const fgOk = fgEdges && fgEdges.unresolved === true && !("edge_px" in fgEdges);

  return {
    pass: Boolean(bgOk && fgOk),
    all_background: bgEdges,
    all_foreground: fgEdges,
  };
}

// ---------------------------------------------------------------------------------------------
// Arm 4 -- capture cadence and resolution limit, live, ENVIRONMENT-DEPENDENT.
//
// This arm's own precondition (Screen Recording permission for `/usr/sbin/screencapture`) is
// checked here, as part of the arm itself, by attempting exactly the capture the arm needs --
// there is no separate probe with a different side effect. A refusal degrades this ONE arm to
// MISSING with the verbatim error; it never substitutes an invented cadence and never fails the
// synthetic arms, which do not depend on it.
// ---------------------------------------------------------------------------------------------

function runArm4(binPath, workDir) {
  const probePath = join(workDir, "arm4-precondition-probe.png");
  const precondition = run("/usr/sbin/screencapture", ["-x", "-o", "-R", "0,0,64,64", probePath]);
  const preconditionOk =
    precondition.status === 0 && existsSync(probePath) && statSync(probePath).size > 0;
  if (!preconditionOk) {
    const err =
      precondition.stderr?.trim() ||
      precondition.stdout?.trim() ||
      `screencapture exited ${precondition.status}`;
    return {
      status: "MISSING",
      error: `capture refused: ${err}`,
      cadence_ms: "MISSING",
      unresolved_count: "MISSING",
      backend: "MISSING",
    };
  }

  const outJsonl = join(workDir, "arm4-sample.jsonl");
  const { json, status, stderr } = runProbe(binPath, [
    "sample",
    "--rect",
    "0,0,64,64",
    "--band",
    "10,50",
    "--bg",
    "128,128,128",
    "--tol",
    "10",
    "--pid",
    String(process.pid),
    "--duration-s",
    "3",
    "--out",
    outJsonl,
  ]);
  if (!json) {
    return {
      status: "MISSING",
      error: `capture refused: sample exited ${status}: ${stderr}`,
      cadence_ms: "MISSING",
      unresolved_count: "MISSING",
      backend: "MISSING",
    };
  }
  return {
    status: "OK",
    samples: json.samples,
    duration_ms: json.duration_ms,
    cadence_ms: json.cadence_ms,
    unresolved_count: json.unresolved_count,
    backend: json.backend,
  };
}

// ---------------------------------------------------------------------------------------------
// Arm 5 -- window instrument, live, ENVIRONMENT-DEPENDENT.
//
// Targets Finder or Dock -- always-running, never GameLib (the operator owns GameLib's
// lifecycle, per <two_profile_declaration>).
// ---------------------------------------------------------------------------------------------

function findCandidatePid() {
  for (const name of ["Finder", "Dock"]) {
    const result = run("/usr/bin/pgrep", ["-x", name]);
    if (result.status === 0 && result.stdout.trim()) {
      const pid = result.stdout.trim().split("\n")[0];
      return { name, pid };
    }
  }
  return null;
}

function runArm5(binPath) {
  const candidate = findCandidatePid();
  if (!candidate) {
    return { status: "MISSING", error: "neither Finder nor Dock pid could be found via pgrep" };
  }
  const { json, status, stderr } = runProbe(binPath, ["winrect", "--pid", candidate.pid]);
  if (!json || json.error) {
    return {
      status: "MISSING",
      target: candidate.name,
      error: json?.error || `winrect exited ${status}: ${stderr}`,
    };
  }
  return {
    status: "OK",
    target: candidate.name,
    pid: candidate.pid,
    bounds: json.bounds,
    onscreenFlagPresent: json.onscreenFlagPresent,
    isOnscreen: json.isOnscreen,
  };
}

// ---------------------------------------------------------------------------------------------
// Artifact
// ---------------------------------------------------------------------------------------------

function fmtJSON(obj) {
  return "```json\n" + JSON.stringify(obj, null, 2) + "\n```";
}

function generateMarkdown(results) {
  const { arm1, arm2, arm3, arm4, arm5 } = results;
  const lines = [];
  lines.push("# Instrument Self-Proof -- Phase 38 branch-(a) macOS sitting");
  lines.push("");
  lines.push(
    `Generated ${new Date().toISOString()} by \`selfproof.mjs\` (Task 2 of 261001-93f-PLAN.md).`
  );
  lines.push("");
  lines.push(
    "**This artifact proves the INSTRUMENT, not the embed.** Every number below is about " +
      "edgeprobe/analyze.mjs's own correctness against generated ground truth, or about a live " +
      "environment capability of this machine. **No result for 38-E03 or 38-E04 appears anywhere " +
      "in this file** — see `<verification>` in 261001-93f-PLAN.md."
  );
  lines.push("");

  lines.push("## Arm 1 -- edge locator (synthetic, MUST pass)");
  lines.push("");
  lines.push(
    `Ran edgeprobe's own \`selftest\` subcommand: several internal synth configs (default, ` +
      `odd-column, border-adjacent, near-tolerance), each frame's located edge asserted to equal ` +
      `\`truth.json\` exactly.`
  );
  lines.push("");
  lines.push(`Result: **${arm1.pass ? "PASS" : "FAIL"}**`);
  lines.push(`- frames: ${arm1.frames}`);
  lines.push(`- worst_error_px: ${arm1.worst_error_px}`);
  lines.push(fmtJSON({ configs: arm1.configs, mismatches: arm1.mismatches }));
  lines.push("");

  lines.push("## Arm 2 -- lag discriminator (synthetic, MUST pass)");
  lines.push("");
  lines.push(
    `Generated a tracking sequence (--lag 0) and a lagging sequence (--lag ${arm2.injected_lag_px}) ` +
      `from the same --step, located every frame's edge with \`edges\`, reduced both with ` +
      `analyze.mjs's \`reduceE04\` (imported directly). Asserted the lagging sequence's excess-gap ` +
      `median exceeds the tracking sequence's by the injected lag, within Arm 1's measured ` +
      `resolution (tolerance ${arm2.tolerance_px}px).`
  );
  lines.push("");
  lines.push(`Result: **${arm2.pass ? "PASS" : "FAIL"}**`);
  lines.push(`- injected_lag_px: ${arm2.injected_lag_px}`);
  lines.push(`- tolerance_px: ${arm2.tolerance_px}`);
  lines.push(`- tracking excess_gap_px median: ${arm2.tracking_excess_gap_median_px}`);
  lines.push(`- lagging excess_gap_px median: ${arm2.lagging_excess_gap_median_px}`);
  lines.push(`- observed_delta_px: ${arm2.observed_delta_px}`);
  lines.push(fmtJSON({ tracking_reduced: arm2.tracking_reduced, lagging_reduced: arm2.lagging_reduced }));
  lines.push("");

  lines.push("## Arm 3 -- unresolvable-sample reporting (synthetic, MUST pass)");
  lines.push("");
  lines.push(
    "Generated an all-background frame and an all-foreground frame (via `synth --width` " +
      "override) and asserted `edges` reports `unresolved: true` with no `edge_px` for both."
  );
  lines.push("");
  lines.push(`Result: **${arm3.pass ? "PASS" : "FAIL"}**`);
  lines.push(fmtJSON({ all_background: arm3.all_background, all_foreground: arm3.all_foreground }));
  lines.push("");

  lines.push("## Arm 4 -- capture cadence and resolution limit (live, ENVIRONMENT-DEPENDENT)");
  lines.push("");
  lines.push(
    "Ran `edgeprobe sample` against a fixed 64x64 screen strip for 3 seconds with no gesture."
  );
  lines.push("");
  if (arm4.status === "MISSING") {
    lines.push(`Result: **MISSING** — capture refused: ${arm4.error}`);
    lines.push("- cadence_ms: MISSING (not invented)");
    lines.push("- unresolved_count: MISSING");
    lines.push("- backend: MISSING");
    lines.push(
      "- The operator measures achieved cadence at RUN-SHEET.md step 0 instead, per Task 2's " +
        "precondition."
    );
  } else {
    lines.push("Result: **OK**");
    lines.push(`- samples: ${arm4.samples}`);
    lines.push(`- duration_ms: ${arm4.duration_ms}`);
    lines.push(`- unresolved_count: ${arm4.unresolved_count}`);
    lines.push(`- backend: ${arm4.backend}`);
    lines.push("- cadence_ms:");
    lines.push("");
    lines.push(fmtJSON(arm4.cadence_ms));
  }
  lines.push("");

  lines.push("## Arm 5 -- window instrument (live, ENVIRONMENT-DEPENDENT)");
  lines.push("");
  lines.push(
    "Ran `edgeprobe winrect` against a running GUI application's pid (Finder or Dock, never " +
      "GameLib -- the operator owns GameLib's lifecycle)."
  );
  lines.push("");
  if (arm5.status === "MISSING") {
    lines.push(`Result: **MISSING** — ${arm5.error}`);
  } else {
    lines.push("Result: **OK**");
    lines.push(`- target: ${arm5.target} (pid ${arm5.pid})`);
    lines.push(`- bounds: ${fmtJSON(arm5.bounds)}`);
    lines.push(`- onscreenFlagPresent: ${arm5.onscreenFlagPresent}`);
    lines.push(`- isOnscreen: ${arm5.isOnscreen}`);
  }
  lines.push("");

  lines.push("## Limits");
  lines.push("");
  const cadenceLine =
    arm4.status === "OK"
      ? `the achieved sample cadence measured here is median ${arm4.cadence_ms.median}ms / ` +
        `p90 ${arm4.cadence_ms.p90}ms / max ${arm4.cadence_ms.max}ms over ${arm4.samples} samples`
      : "the achieved sample cadence could not be measured on this run (Arm 4 MISSING) and the " +
        "operator must measure it at RUN-SHEET.md step 0 instead";
  lines.push(
    `- **Cadence ceiling.** ${cadenceLine}. Any real resize frame shorter than this interval is ` +
      "invisible to the sampler between two consecutive captures -- the operator's own eyes cover " +
      "that gap, per RUN-SHEET.md step 2's gesture requirement."
  );
  lines.push(
    "- **Pixel-only readback.** The embed's realised geometry is read from screen pixels, never " +
      "from an RPC call, because `main.rs`'s RPC dispatch exposes no `store_embed_get_bounds` -- " +
      "the embed is an `NSView` subview (`addSubview`), not a child window, so " +
      "`CGWindowListCopyWindowInfo` sees the parent window but never the embed itself."
  );
  lines.push(
    "- **Widen-only lag visibility.** The sampler locates the embed's edge scanning inward from " +
      "the window's right edge. A lag during WIDENING shows as a visible background gap between the " +
      "embed's edge and the window's edge -- exactly what Arm 2 proves the reducer can see. A lag " +
      "during SHRINKING instead leaves the embed overflowing past the window's new, smaller edge, " +
      "where the window itself clips the overflow: the pixels show no gap because there is nothing " +
      "past the window edge to capture. The instrument cannot see a shrink-direction lag; only a " +
      "widen-direction one."
  );
  lines.push(
    "- **Inactive-Space hazard.** `CGWindowListCopyWindowInfo` readings are garbage whenever the " +
      "app's Space is not the active one -- `kCGWindowIsOnscreen` goes absent or the window " +
      "disappears from the list entirely. This is why every `sample` record and every `winrect` " +
      "reading carries `onscreenFlagPresent`, and why RUN-SHEET.md step 0 activates the app's " +
      "Space before any reading is trusted."
  );
  lines.push("");

  lines.push("## Overall");
  lines.push("");
  const arms123Pass = arm1.pass && arm2.pass && arm3.pass;
  lines.push(
    `Synthetic arms 1-3 (instrument correctness against generated ground truth): ` +
      `**${arms123Pass ? "ALL PASS" : "AT LEAST ONE FAILED"}**.`
  );
  lines.push(
    `Live arms 4-5 (environment capability on this machine, right now): Arm 4 ${arm4.status}, ` +
      `Arm 5 ${arm5.status}.`
  );
  lines.push("");
  lines.push(
    "No result for `38-E03` or `38-E04` exists anywhere in this file. This artifact describes " +
      "the instrument, not the embed."
  );
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

function main() {
  const { workDir, binPath } = compileEdgeprobe();
  try {
    const arm1 = runArm1(binPath);
    const arm2 = runArm2(binPath, workDir, arm1.worst_error_px);
    const arm3 = runArm3(binPath, workDir);
    const arm4 = runArm4(binPath, workDir);
    const arm5 = runArm5(binPath);

    const markdown = generateMarkdown({ arm1, arm2, arm3, arm4, arm5 });
    writeFileSync(EVIDENCE_PATH, markdown, "utf8");

    console.log(`Wrote ${EVIDENCE_PATH}`);
    console.log(`Arm 1 (edge locator):        ${arm1.pass ? "PASS" : "FAIL"}`);
    console.log(`Arm 2 (lag discriminator):   ${arm2.pass ? "PASS" : "FAIL"}`);
    console.log(`Arm 3 (unresolved reporting):${arm3.pass ? "PASS" : "FAIL"}`);
    console.log(`Arm 4 (capture cadence):     ${arm4.status}`);
    console.log(`Arm 5 (window instrument):   ${arm5.status}`);

    if (!(arm1.pass && arm2.pass && arm3.pass)) {
      console.error("\nSELF-PROOF FAILED: a synthetic arm did not match generated ground truth.");
      process.exit(1);
    }
    process.exit(0);
  } finally {
    // Never leave the compiled binary or synth scratch frames on disk past this run.
    rmSync(workDir, { recursive: true, force: true });
  }
}

main();

---
phase: quick-260901-b8z
verified: 2026-09-01T10:15:00Z
status: passed
score: 7/7 must-haves verified
overrides_applied: 0
---

# Quick Task 260901-b8z: Repoint frontendDist at renderer-only dir — Verification Report

**Task Goal:** Repoint Tauri's `frontendDist` from the shared `build/` tree to a renderer-only
`build/renderer/`, so the shell binary stops brotli-embedding ~410 MB of non-webview-reachable
content. Fix (2) of the 2026-08-28 bundle-size todo.

**Verified:** 2026-09-01
**Status:** passed
**Method:** Independent codebase inspection, targeted jest runs, git history/diff audit,
`paths.ts`/`bundle.resources` data-flow trace. Did not re-run the ~10-13 min release build — the
orchestrator had already independently mounted the current on-disk DMG and re-measured all
gate-critical figures before dispatching this verification; those numbers were spot-checked
against file size on disk and found consistent (see below), not re-derived from scratch.

## Goal Achievement

### Observable Truths (plan must_haves + roadmap contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `__TEXT,__const` < 30,000,000 B (was 223,766,872 B) | VERIFIED | Orchestrator's independent DMG mount measured 5,273,944 B; MEASUREMENTS.md records the same figure with derivation (`size -m`, `Segment __TEXT`). Both the plan's Task 3 automated gate and the orchestrator's own re-measurement agree. |
| 2 | `strings <shell> \| grep -c 'bin/x64/win32/gogdl.exe'` == 0 | VERIFIED | Orchestrator's independent re-run returned 0, plus a `gamelib`=27 anti-vacuity control proving the pipeline itself is live. MEASUREMENTS.md records the same, with the fail-open shell-pipe hazard explicitly closed (measured via direct `strings` + return-code check, not `grep -c` alone). |
| 3 | LIVE: packaged app renders a non-English locale | VERIFIED (human) | Task 4 checkpoint: Gesture A scored PASS by a human on the real packaged artifact (confirmed running from `/Applications/GameLib.app` with the bundled SEA sidecar, PID-verified, byte-identical to the DMG's `.app`). Deviation in method (in-app Settings vs. scripted `config.json` edit) is recorded honestly with sound reasoning (exercises the runtime on-demand fetch path, not just initial load). |
| 4 | LIVE: About window opens AND its icon renders | VERIFIED (human) | Task 4: Gesture B scored PASS on both sub-items separately (window content, icon render), per the plan's explicit anti-vacuity instruction not to conflate "window opened" with "content is correct." `Version: unknown` was correctly treated as informational only, not a gate criterion. |
| 5 | Shipped `Resources/build/bin` non-regression (~233.8 MiB, helpers executable, symlink plugin restores 12) | PARTIAL — literal band FAILED, root-caused, honestly reported; the substantive regression check (helpers present + executable + symlink restore) PASSED | The plan's own automated gate ran the 230–260 MB band literally and it failed at 195,358,418 B. This is recorded as a genuine `AssertionError: NON-REGRESSION FAIL` in MEASUREMENTS.md and the todo, not laundered into a pass. Full byte-exact root cause given: `244,265,279 (PRE-a2w) − 48,906,861 (a2w's measured dev-tree delta) = 195,358,418` (exact match). Confirmed independently: `git diff` on `tauri.conf.json` + all 3 platform overlays shows only the `frontendDist` line changed; `bundle.resources` (the mechanism populating `Resources/build/bin`) is byte-for-byte untouched. All five named `arm64/darwin` helpers verified present + executable in the gate. Symlink plugin verified live: `find public -type l` = 12, `find build -type l` = 12 on this machine, matching the claimed `restored 12 symlink(s), skipped 0, rejected 0`. |
| 6 | `260901-b8z-MEASUREMENTS.md` records old-shipped vs new-shipped with PRE-a2w caveat | VERIFIED | File exists, states the PRE-a2w baseline hazard prominently in a "read this first" section, and explicitly warns "~23 MB of the `__const` delta and all 48,906,861 B of the shipped-bin delta below are quick-260901-a2w's effect, not this task's" — directly answering the attribution-honesty concern raised for this verification. |
| 7 | Todo records fix (2) DONE, remains in `pending/`, Cause 3 + `steam_api.pdb` re-scoped as open remainder | VERIFIED | `.planning/todos/pending/2026-08-28-tauri-macos-bundle-is-786mb-frontenddist-embeds-build-bin-in.md` confirmed present in `pending/` (no `done/` directory exists in this repo). Fix (2) section states "DONE, closed by quick-260901-b8z" with real numbers. Cause 3 and the `steam_api.pdb`/`steam_api_shim.lib` item are both still described as open, explicitly out of scope for this task. |

**Score:** 7/7 (truth 5 verified as "gate failed as designed, correctly reported, root cause confirmed independent of this task's code" — this is the correct outcome per the plan's own instruction to report rather than weaken a failing gate, and the substantive regression check it exists to guard against did pass).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `meta/assembleRendererDist.ts` | generateBundle-driven renderer-dir assembly, fail-loud post-conditions, exports `assembleRendererDist`/`assembleRendererDistPlugin`/`STATIC_RENDERER_FILES`/`STATIC_RENDERER_DIRS` | VERIFIED | 240 lines. All four exports present and match the described shape (pure function + thin plugin wrapper, mirroring `preserveRunnerSymlinks.ts`/`pruneStaleHelperBinaries.ts`). Six fail-loud throws confirmed by direct read: empty bundleKeys, missing bundle-key source file, missing static file, missing index.html, empty assets dir, missing/empty-JSON static dir (checked via `hasJsonFileRecursive`, distinct from a bare existence check — closes the exact `collectEntries`-empty-Map trap the header comment names). |
| `meta/__tests__/assembleRendererDist.test.ts` | Both-direction coverage: presence AND absence, every post-condition throws | VERIFIED | 270 lines, 13 `test(` blocks: Tests 1–10 as specified, Test 11 correctly split into 11a/11b (locales absent vs. locales-present-but-no-JSON, tested separately per the plan's explicit requirement), plus one bonus constants-shape test. Ran directly: 39/39 passed across this file + `viteRendererConfig.test.ts`. |
| `260901-b8z-MEASUREMENTS.md` | Old-shipped vs new-shipped with derivations | VERIFIED | 264 lines. Every figure states its source command and derivation. Apparent-bytes-only discipline stated and followed. Baseline-hazard section leads the document. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `vite.config.ts` | `meta/assembleRendererDist` | import + registered last in plugins array | VERIFIED | `import { assembleRendererDistPlugin } from './meta/assembleRendererDist'` at line 62; `assembleRendererDistPlugin()` is the final entry in the `plugins` array (line 161), after `preserveRunnerSymlinksPlugin()` — confirmed by direct read of `vite.config.ts:55-161`. |
| `src-tauri/tauri.conf.json` | `build/renderer` | `frontendDist` | VERIFIED | `"frontendDist":"../build/renderer"` confirmed by direct read and by `git diff 8cdbf4272..955655a8b` showing this as the ONLY changed line in `tauri.conf.json`, with all three platform overlays untouched. |
| `.github/workflows/release-tauri.yml` | `build/renderer/index.html` | prune-step hard guard | VERIFIED | Line 425 (`test -f build/index.html`) unchanged, line 426 (`test -f build/renderer/index.html`) added — confirmed additive, not a replacement, by direct grep. |
| `assembleRendererDist generateBundle` | `closeBundle` | captured rollup bundle keys | VERIFIED | `generateBundle(_options, bundle)` sets a closure-local `bundleKeys = Object.keys(bundle)`; `closeBundle()` calls `assembleRendererDist(outDir, rendererDir, bundleKeys)` over that captured list — confirmed by direct read. |

### Data-Flow Trace (Level 4) — Residual Risk Assessment (verification requirement #4)

**Question:** Could `frontendDist` moving from `../build` to `../build/renderer` plausibly affect
runtime helper-binary resolution (game launching), given no helper has actually been executed
under the new build?

**Traced, not assumed.** Runtime helper resolution goes through `src/backend/constants/paths.ts`'s
`publicDir`:

```
publicDir = resolve(app.getAppPath(), app.isPackaged ? 'build' : 'public')
```

Under the Tauri sidecar, `app.getAppPath()` (the electron-stub shim,
`src/backend/platform/index.ts:300`) resolves to `process.env.GAMELIB_APP_ROOT || process.cwd()`.
That env var is set at spawn time (`src-tauri/src/main.rs:6987`,
`packaged_app_root_env_value(app.path().resource_dir()...)`) — driven entirely by Tauri's
`resource_dir()`, which is populated by the `bundle.resources` mappings, not by `frontendDist`.

Confirmed by direct read of `src-tauri/tauri.macos.conf.json`: `bundle.resources` sources are
`../build/bin/arm64/darwin/`, `../build/bin/x64/darwin/`, two named Wine exes, and
`legendary.LICENSE` — all still rooted at `../build/bin/...` (the full repo `build/` tree, NOT
`build/renderer`), targeting `build/bin/...` under `Contents/Resources`. This mapping is byte-for-byte
unchanged by this task (confirmed by `git diff` above).

Independently confirmed `assembleRendererDist.ts` never copies anything under `bin/`: the Task 1
probe recorded (and the plugin's own header states) that captured bundle keys are only
`index.html` + `^assets/`, and the only additional static copies are `about.html`, `icon.png`,
`locales/` — none of which include `bin/`. `build/renderer` on disk right now (10 MB, contains only
`about.html`, `assets/`, `icon.png`, `index.html`, `locales/`) confirms this directly.

**Verdict: `frontendDist` moving cannot plausibly affect runtime helper resolution.** The two
mechanisms — webview asset embedding (`frontendDist`, consumed only by renderer-side relative
fetches: i18next `loadPath`, the About window `url`, `about.html`'s `<img src>`) and native helper
resolution (`bundle.resources` → `resource_dir()` → `GAMELIB_APP_ROOT` → `publicDir`) — are
structurally disjoint config keys with no shared code path. This matches the record's own claim in
`assembleRendererDist.ts`'s header comment and the plan's Task 3a note. No live game-launch test is
required to close this task; the disjointness is a property of the config structure, not a
behavior that could vary at runtime.

### Records Integrity (verification requirement #2 — weighted heavily)

- **SUMMARY.md vs MEASUREMENTS.md vs commits:** All cross-checked numbers agree.
  `__TEXT,__const` 223,766,872→5,273,944, gogdl 1→0, and the 116/116 test count all match across
  both documents and my own independent jest run.
- **Shipped-bin band failure:** Recorded as a genuine `AssertionError: NON-REGRESSION FAIL` — not
  laundered into a pass anywhere I could find. The todo's Fix (2) section states the literal
  195,358,418 B figure and flags the ~233.8 MiB figure elsewhere in the same file as "now stale."
  SUMMARY.md's "Self-Check: PASSED" section checks file/commit presence only — it does not claim
  "all success criteria met," so no misrepresentation there either.
- **Gesture A deviation:** Recorded explicitly as a deviation in METHOD (in-app Settings vs.
  scripted `config.json` edit), with sound reasoning for why it is still valid (exercises the
  on-demand runtime fetch path, arguably a stronger proof).
- **Todo status:** Confirmed still in `.planning/todos/pending/`, with Cause 3 (~45 MB symlink
  dereferencing) and the `steam_api.pdb`/`steam_api_shim.lib` item (~2.7 MB) both still described
  as open and explicitly out of this task's scope.
- **Unsourced numbers:** None found. Every figure in MEASUREMENTS.md states its derivation command.

### Attribution Honesty (verification requirement #3)

MEASUREMENTS.md's "Baseline hazard (read this first)" section explicitly states: *"Roughly 23 MB
of the `__const` delta and all 48,906,861 B of the shipped-bin delta below are quick-260901-a2w's
effect, not this task's."* The DMG size table is explicitly labeled "informational, not a gate
criterion" for the same reason. This directly answers the concern about a third mis-attributed
subtraction in this task series — the record does not claim the full delta as fix (2)'s own
achievement anywhere I found.

### Regression Surface (verification requirement #5)

- `bundle.resources` and all three platform overlays: confirmed byte-for-byte unchanged by
  `git diff 8cdbf4272..955655a8b`.
- `emptyOutDir`: confirmed still `false` at `vite.config.ts:113`.
- `preserveRunnerSymlinksPlugin` and `pruneStaleHelperBinariesPlugin`: both still registered in
  `vite.config.ts`'s plugins array, confirmed by direct read. Live symlink counts on this machine
  (`find public -type l` = 12, `find build -type l` = 12) match the claimed
  `restored 12 symlink(s), skipped 0, rejected 0`.
- Todo Non-goals honoured: no `steam_api.pdb` removal, no Cause 3 fix, no sidecar work — confirmed
  by `git diff --stat` across both task commits showing only the 10 files declared in the plan's
  `files_modified` frontmatter.

### Behavioral Spot-Checks / Test Suite State (verification requirement #6)

| Suite | Command | Result | Status |
|-------|---------|--------|--------|
| `releaseWorkflow.test.ts` + `packagingConfig.test.ts` | `pnpm exec jest src/backend/__tests__/releaseWorkflow.test.ts src/backend/__tests__/packagingConfig.test.ts` | 116 passed, 116 total | PASS — matches SUMMARY.md claim exactly |
| `assembleRendererDist.test.ts` + `viteRendererConfig.test.ts` | `pnpm exec jest meta/__tests__/assembleRendererDist.test.ts meta/__tests__/viteRendererConfig.test.ts` | 39 passed, 39 total (13 in the new file, matching 11 behaviors with 11 split into 11a/11b plus 1 bonus constants test) | PASS |
| `tsc --noEmit` | `pnpm exec tsc --noEmit -p .` | Clean, no output | PASS |
| Seventh releaseWorkflow test exercises the new guard | Direct read of `src/backend/__tests__/releaseWorkflow.test.ts:541-551` | Confirmed: seeds tree, removes `build/renderer/index.html`, asserts non-zero exit | PASS |

I did not re-run the ~10-13 minute release build myself. The orchestrator had already
independently mounted the current on-disk DMG (`src-tauri/target/release/bundle/dmg/GameLib_0.7.0_aarch64.dmg`,
155,175,396 B — confirmed present on disk at that exact size) and re-measured all
gate-critical figures before this verification pass, and re-running it would not add
information beyond what was already independently gathered.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TODO-2026-08-28-FIX-2 | 260901-b8z-PLAN.md | Repoint `frontendDist` at renderer-only dir | SATISFIED | All 7 success criteria addressed; criterion 5's literal band failure is a stale-baseline plan defect, honestly reported, with the substantive regression check (helpers present/executable) passing. |

### Anti-Patterns Found

None. Grepped all files listed in the plan's `files_modified` frontmatter for `TBD`, `FIXME`,
`XXX`, `TODO`, `HACK`, `PLACEHOLDER`, "not yet implemented" — zero matches. No stub returns, no
empty handlers, no hardcoded-empty data flowing to rendering.

### Human Verification Required

None outstanding. Task 4's blocking human checkpoint already ran and both gestures scored PASS
per-item, per the plan's own anti-vacuity requirement (not just "window opened," but content and
icon scored separately).

### Gaps Summary

No gaps block the phase goal. The one notable finding — Task 3's automated non-regression gate
literally failing its stale 230–260 MB shipped-bin band — is not a gap in the delivered work; it
is a defect in the plan's own gate band (computed from a pre-a2w baseline), correctly identified,
root-caused to the byte, and honestly reported rather than silently absorbed or laundered into a
pass. The substantive property that gate exists to protect (helpers still shipped, still
executable, symlink restoration still working) is independently confirmed true.

---

_Verified: 2026-09-01_
_Verifier: Claude (gsd-verifier)_

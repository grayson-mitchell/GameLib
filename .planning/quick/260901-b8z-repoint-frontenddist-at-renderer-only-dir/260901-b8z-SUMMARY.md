---
phase: quick-260901-b8z
plan: 01
subsystem: build
tags: [vite, tauri, frontendDist, bundle-size, macos-packaging]
requires:
  - phase: quick-260901-8rm
    provides: "bundle.resources narrowed to per-platform overlays"
  - phase: quick-260901-a2w
    provides: "stale build/bin helper-binary prune (dev-tree measured, packaged-build effect predicted only)"
provides:
  - "meta/assembleRendererDist.ts vite plugin: rollup-emitted-file-list-driven renderer subtree assembly with fail-loud post-conditions"
  - "frontendDist repointed at build/renderer, dropping ~410MB of helper binaries/dead Electron bundle/SEA blob from the shell binary embed"
  - "release-tauri.yml additive guard for build/renderer/index.html"
  - "measured, corrected shipped-Resources/build/bin baseline (195,358,418 B) superseding the stale ~233.8 MiB figure"
affects: [release-packaging, macos-bundle-size, i18n-locale-loading, about-window]
tech-stack:
  added: []
  patterns:
    - "pure-function + thin-plugin-wrapper shape for vite plugins (matches meta/preserveRunnerSymlinks.ts, meta/pruneStaleHelperBinaries.ts) — enables direct unit testing without a real build"
    - "generateBundle-captured bundle keys, closeBundle-driven assembly — copy is exact and driven by rollup's own emitted-file list, not a directory glob"
key-files:
  created:
    - meta/assembleRendererDist.ts
    - meta/__tests__/assembleRendererDist.test.ts
    - .planning/quick/260901-b8z-repoint-frontenddist-at-renderer-only-dir/260901-b8z-MEASUREMENTS.md
  modified:
    - vite.config.ts
    - meta/__tests__/viteRendererConfig.test.ts
    - src-tauri/tauri.conf.json
    - .github/workflows/release-tauri.yml
    - src/backend/__tests__/releaseWorkflow.test.ts
    - src/frontend/index.tsx
    - src-tauri/build.rs
    - src-tauri/src/main.rs
    - .planning/todos/pending/2026-08-28-tauri-macos-bundle-is-786mb-frontenddist-embeds-build-bin-in.md
key-decisions:
  - "Implemented design D1 from the todo's two candidates: outDir/publicDir/emptyOutDir left exactly as-is, bundle.resources untouched, and a new explicit copy step (meta/assembleRendererDist.ts) produces the webview-reachable subset in build/renderer/ for frontendDist to point at."
  - "Copy is driven by rollup's generateBundle emitted-file list, not a directory glob — de-risked first via a throwaway Task 1 probe before any implementation was built on the assumption, and this is also what drops 19,540,372 B of stale build/assets for free."
  - "Six independently-tested fail-loud post-conditions in assembleRendererDist so a silently empty/partial build/renderer cannot ship a white screen — the plan's stated anti-pattern to avoid."
  - "Reported the Task 3 non-regression gate's literal FAIL (195,358,418 B vs. the plan's 230-260 MB band) rather than weakening the gate; root-caused it as a2w's already-landed effect being measured in a packaged build for the first time, not a regression from this task's code."
requirements-completed: [TODO-2026-08-28-FIX-2]
metrics:
  duration: "~45min visible executor work across a continued session (Tasks 2-3 spanned 09:15-09:28 +12 per commit timestamps; Task 1's probe and the human-checkpoint wait are not separately timed)"
  completed: "2026-09-01"
---

# Quick Task 260901-b8z: Repoint frontendDist at a renderer-only dir Summary

**Repointed Tauri's `frontendDist` from the shared `build/` directory to a purpose-assembled `build/renderer/`, dropping the packaged shell binary's brotli-embedded dead weight from 223,766,872 B to 5,273,944 B — verified live on a real packaged release DMG, including two webview-relative consumers (`about.html`, `icon.png`) that no prior investigation in this todo's history had enumerated.**

## Performance

- **Duration:** ~45 min of visible executor work (Task 2 commit → Task 3 commit, 09:15→09:28 +12 on 2026-09-01); does not include Task 1's probe or the human-checkpoint wait, which spanned a session continuation
- **Completed:** 2026-09-01
- **Tasks:** 4/4 (Task 1 probe, Task 2 TDD build, Task 3 repoint+build+measure, Task 4 human checkpoint) — all complete
- **Files modified:** 10 code/test files + 1 todo doc + 1 new MEASUREMENTS.md

## Accomplishments

- Built `meta/assembleRendererDist.ts`, a TDD vite plugin (11 behaviors, both copy directions asserted — presence AND absence) that assembles a renderer-only subtree from rollup's own emitted bundle keys plus `about.html`/`icon.png`/`locales/`, with six fail-loud post-conditions.
- Repointed `frontendDist` to `../build/renderer`; `bundle.resources` and everything under it left completely untouched.
- Ran a real, full ~13-minute release build (vite → sidecar SEA → `tauri build`) and measured the result on a mounted DMG: `__TEXT,__const` 223,766,872 B → 5,273,944 B (criterion 1 PASS), gogdl-string leak 1 → 0 (criterion 2 PASS).
- Closed the fail-open workflow guard: added `test -f build/renderer/index.html` additively alongside the existing `build/index.html` check, with a dedicated seventh test proving it actually fails when the new tree is missing.
- Live human verification (Task 4 checkpoint) confirmed all three consumers that resolve relative to `frontendDist` on a real packaged artifact: i18next `loadPath` (French locale, verified via in-app Settings), the About window `url`, and — the previously-unenumerated third consumer — `about.html`'s `<img src="./icon.png">`.
- Found and honestly reported (not silently absorbed) a stale non-regression threshold in the plan's own automated gate: the shipped `Resources/build/bin` band (230–260 MB) was computed from a pre-quick-260901-a2w baseline; the real, measured figure is 195,358,418 B, exactly matching a2w's dev-tree delta applied to the pre-a2w shipped baseline. This is a plan-baseline defect, not a code regression — recorded in full in `260901-b8z-MEASUREMENTS.md` and in the todo.

## Task Commits

1. **Task 1: Probe rollup's `generateBundle` key set** — no commit (throwaway probe, fully reverted via `cp`; `git diff --stat vite.config.ts` confirmed empty before Task 2 began)
2. **Task 2: Build `meta/assembleRendererDist.ts` (TDD, 11 behaviors), wire into vite** — `8590fe386` (feat)
3. **Task 3: Repoint `frontendDist`, close fail-open guard, build and measure** — `955655a8b` (feat)
4. **Task 4: LIVE gate — non-English locale and About window + icon** — human checkpoint, all three verdicts PASS (see below); no code commit (records-only task)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `meta/assembleRendererDist.ts` — new: pure `assembleRendererDist()` function + `assembleRendererDistPlugin()` vite wrapper, following the established sibling-plugin shape
- `meta/__tests__/assembleRendererDist.test.ts` — new: 11 behavior tests against a `mkdtempSync` fixture
- `vite.config.ts` — registered `assembleRendererDistPlugin()` as the last plugin, after `preserveRunnerSymlinksPlugin()`
- `meta/__tests__/viteRendererConfig.test.ts` — added the third plugin-name assertion
- `src-tauri/tauri.conf.json` — `frontendDist: "../build"` → `"../build/renderer"`
- `.github/workflows/release-tauri.yml` — additive `test -f build/renderer/index.html` guard
- `src/backend/__tests__/releaseWorkflow.test.ts` — extended fixture, seventh test for the new guard
- `src/frontend/index.tsx` — removed dead `addPath` (never executed; `saveMissing` is nowhere set), preserved live `loadPath`
- `src-tauri/build.rs`, `src-tauri/src/main.rs` — corrected stale "electron-vite" / `../build` documentation comments
- `.planning/quick/260901-b8z-repoint-frontenddist-at-renderer-only-dir/260901-b8z-MEASUREMENTS.md` — new: full derivations for every number, old-shipped vs new-shipped, including the two honestly-reported anomalies below
- `.planning/todos/pending/2026-08-28-tauri-macos-bundle-is-786mb-frontenddist-embeds-build-bin-in.md` — fix (2) marked DONE with real numbers; left in `pending/` with Cause 3 and the `steam_api.pdb` item re-scoped as the explicit open remainder

## Deviations from Plan

### Auto-fixed Issues

None beyond what the plan itself scoped as fail-loud correctness work (the six post-conditions and the additive workflow guard were prescribed by the plan, not discovered mid-execution).

### Reported, Not Auto-Fixed (gate failure honestly documented, not weakened)

**1. [Reported per plan instruction — not a Rule 1-4 auto-fix] Non-regression gate band is stale**
- **Found during:** Task 3's artifact-level `<verify>` gate, run verbatim exactly as written in the plan.
- **Issue:** The gate asserts shipped `Resources/build/bin` is `230,000,000 < t < 260,000,000` (~233.8 MiB). Measured `t = 195,358,418` B — outside the band, gate raises `AssertionError: NON-REGRESSION FAIL`.
- **Root cause:** The band was computed from a PRE-a2w shipped-bin baseline (244,265,279 B). quick-260901-a2w's own MEASUREMENTS.md explicitly labeled its packaged-shipped-bin saving as an *unmeasured prediction* — a2w never produced a release build. This task's Task 3 build is the first release build since a2w landed, so it is the first time a2w's real (not predicted) effect on a packaged artifact has been measured. `244,265,279 − 48,906,861 (a2w's real, measured dev-tree delta) = 195,358,418` — an exact byte match to the new measurement.
- **Confirmed not a regression from this task's code:** `git diff` on `tauri.conf.json` (and all three platform overlays) shows only the `frontendDist` line changed; `bundle.resources` is untouched. Repo-tree `build/bin`/`public/bin`, measured after this task's own build, are byte-identical to a2w's landed "after" figure.
- **Action taken:** Did NOT weaken or edit the gate. Ran it exactly as written, reported the literal failure with its output, and documented the full root-cause accounting in `260901-b8z-MEASUREMENTS.md` and in the todo. Recommended corrected band for future use: `195,000,000 < t < 210,000,000`.
- **Files:** none modified to "fix" this — it is a plan/documentation-baseline correction, recorded in `260901-b8z-MEASUREMENTS.md` and the todo.

**2. [Reported, unexplained by design — not a defect requiring a fix] `/Applications/GameLib.app` provenance**
- **Found during:** Task 4's live human checkpoint. The orchestrator's checkpoint-approval message referenced `/Applications/GameLib.app` (PID 71506/71519) as the artifact under live test.
- **Investigated:** `/Applications/GameLib.app` exists, mtime `2026-09-01 09:18:23` (essentially the moment the Task 3 release build completed), contents byte-identical to the DMG's `.app` (384,357,326 B apparent bytes).
- **The executor did not perform this copy.** Every DMG mount in this task's execution used `hdiutil attach -nobrowse -readonly` followed by `hdiutil detach` — never an install step, never a write to `/Applications`. This is stated plainly, per instruction, so the discrepancy stays visible rather than being silently absorbed. The timestamp is consistent with the human tester installing the freshly built app to `/Applications` themselves (the ordinary way to run a packaged macOS app outside its read-only mount) in order to perform Gestures A and B — but this executor has no direct evidence of who performed the copy, only that it was not itself.

### Deviation in Method (human gesture, not executor action, recorded per plan instruction)

**Gesture A executed via a different mechanism than prescribed, PASS either way.** The plan's `<how-to-verify>` prescribes editing `config.json` before launch. The human instead used the app's in-app Settings UI to switch to French while the app was running. This is recorded as a valid, arguably stronger deviation: it exercises i18next's on-demand runtime fetch of `tauri://localhost/locales/fr/translation.json`, not just the initial-load path, and the human directly observed the live English→French transition. Full reasoning in `260901-b8z-MEASUREMENTS.md`.

## Live Human Checkpoint (Task 4) — Results

All three items scored separately, per the plan's explicit anti-vacuity instruction:

- **Gesture A (non-English locale renders):** PASS
- **Gesture B item 1 (About window opens with real content):** PASS (incidental: version rendered `v0.7`, the known sidecar-race timeout did not fire — informational only, not a gate criterion)
- **Gesture B item 2 (icon renders):** PASS — the highest-value observation in the gate; `icon.png` is a consumer neither the original todo nor its research enumerated, found only by reading `public/about.html`'s `<img src="./icon.png">`, and appears in zero built JS chunks.

Full corroborating static evidence (string counts on the mounted binary, independently gathered and framed as necessary-but-not-sufficient corroboration, not a replacement for the live gate) is recorded in `260901-b8z-MEASUREMENTS.md`.

## Self-Check: PASSED

- All 7 claimed files verified present on disk (`meta/assembleRendererDist.ts`, `meta/__tests__/assembleRendererDist.test.ts`, `260901-b8z-MEASUREMENTS.md`, `260901-b8z-SUMMARY.md`, the todo, `src-tauri/tauri.conf.json`, `.github/workflows/release-tauri.yml`).
- Both claimed commits (`8590fe386`, `955655a8b`) verified present in `git log --all`.
- Todo file confirmed present in `.planning/todos/pending/` and absent from `.planning/todos/done/`.

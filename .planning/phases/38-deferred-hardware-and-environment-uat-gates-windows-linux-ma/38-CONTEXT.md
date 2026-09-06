# Phase 38: Deferred hardware and environment UAT gates — Windows/Linux machine and game controller - Context

**Gathered:** 2026-09-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 38 delivers **observations, not code**. Its deliverable is ledger entries moved from
`human_verification` to `human_verification_discharged` in `38-VERIFICATION.md`. It ships no
source changes and mints no requirements.

This discussion **narrows the phase**: after `38-01`, Phase 38 owns only what a Windows host
plus a game controller can observe. Linux-only items and the off-macOS embed-backend items
leave for two newly-created destination phases.

**Item accounting (34 today → 17 after `38-01`):**

| Disposition | Count | Items |
|---|---|---|
| Retired as unscoreable (Electron runtime deleted in Phase 35) | 9 | `38-C07`, `38-S01`, `38-S03`, `38-S05`, `38-S07`, `38-S09`, `38-S11`, `38-S13`, `38-S15` |
| Relocated → **Phase 42** (Linux collection) | 4 + 1 new | `38-W05`, `38-S04`, `38-S10`, `38-S12`, plus newly-minted `38-S17` (Linux row-7 half of `38-S16`) |
| Relocated → **Phase 43** (off-macOS embed backend) | 4 | `38-E01`, `38-E02`, `38-E03`, `38-E04` |
| **Remain in Phase 38** | **17** | `38-W01`, `38-W02`, `38-W03`, `38-W04`, `38-W06`; `38-C01`–`38-C06`, `38-C08`; `38-S02`, `38-S06`, `38-S08`, `38-S14`, `38-S16` |

Totals reconcile: 17 + 5 + 4 + 9 = 35 = 34 original + 1 newly minted (`38-S17`).

**Out of scope:** any source change to fix a defect the sitting uncovers. A FAIL is recorded and
filed as a todo; Phase 38 does not repair what it observes.

</domain>

<decisions>
## Implementation Decisions

### Dead-item disposition (the 9 Electron items)

- **D-38-01:** The 9 Electron-runtime items are **moved into `human_verification_discharged`**
  with an explicit `result: unscoreable` and a `retired_reason` naming Phase 35's removal of the
  Electron build. They are **not** recorded as passes and **not** deleted. This executes
  `38-C07`'s own pre-written `electron_cutover_risk` field verbatim — the ledger anticipated this
  cutover and specified its own disposition before the fact. The same reasoning extends to the 8
  S-series items by symmetry.
- **D-38-02:** No `human_verification_retired` array is introduced. `audit-uat` has never parsed
  such a key, and this file's own `audit_tool_note` records that both failure modes here are
  **silent** — an unproven schema change against the array that holds the project's entire
  deferred-hardware backlog is not worth the cleaner semantics.
- **D-38-03:** **No observation is lost.** Every retired Electron item has an open Tauri twin
  carrying the same question: `S01→S02`, `S03→S04`, `S05→S06`, `S07→S08`, `S09→S10`, `S11→S12`,
  `S13→S14`, `S15→S16`, `C07→C08`. Verified against the live ledger — all 9 twins are present in
  `human_verification`. The repair must re-check this rather than trust this line.
- **D-38-04:** The repair is written as **`38-01-PLAN.md`** (docs-only, atomic commit, SUMMARY),
  **and** ROADMAP § Phase 38's `Plans: No plan files` bullet is amended in the same commit to
  record the exception and why. Both documents change together so neither silently contradicts
  the other — the same forward/return-half discipline the `38-E03`/`38-E04` ROADMAP entry uses.
- **D-38-05:** `38-01` repairs **both** phase documents. `38-HUMAN-UAT.md` is independently
  stale: its header says "6 items seeded, 0 discharged" (34 today), its Scope block enumerates
  "`38-C01` … `38-C05`" (now `C01`–`C08`), and it asserts the controller items "can run today"
  on the macOS machine — which the 2026-09-06 Steam-running / Steam-quit 2x2 disproved for the
  PowerA pad.

### Close boundary — the split

- **D-38-06:** Phase 38 **splits** rather than staying open across hosts. Phase 38 retains
  Windows + controller items only.
- **D-38-07:** Phase 38's status **stays `human_needed`** throughout. It does not close as
  `gaps_closed_partially`. Per this file's `audit_tool_note`, any status other than
  `human_needed` makes `audit-uat` emit **zero** items — the remaining backlog would vanish from
  the only tool that counts it, with nothing turning red.
- **D-38-08:** **Phase 42 — Deferred Linux-host UAT gates.** A collection phase, 0 plans, its own
  `42-VERIFICATION.md` at `status: human_needed`. Receives `38-W05` (AppImage), `38-S04`,
  `38-S10`, `38-S12`, and newly-minted `38-S17`.
- **D-38-09:** **Phase 43 — Off-macOS embed backend.** An implementation phase: widen
  `src-tauri/Cargo.toml`'s `[target.'cfg(target_os = "macos")'.dependencies]` gate so
  `Window::add_child` exists on WebView2 and webkit2gtk, then answer `38-E01`–`38-E04`. These four
  are **implementation tasks before they are verification tasks** (D-04), which is why keeping
  them in 38 would hold it open no matter which host runs.
  - *For the Phase 43 planner:* create `43-VERIFICATION.md` at `status: human_needed` carrying all
    four as relocated items so they stay audit-visible until 43 is planned. Planning 43 then
    converts `E01`/`E02` into requirements; `E03`/`E04` remain human-verification items behind them.
- **D-38-10:** **Both destination phases are created in `38-01`, BEFORE any item is relocated.**
  This is Phase 38's own rule 1, written after Phase 34.9 routed 8 items to a phase that was never
  in ROADMAP.md and six of them dangled 9–11 days while every gate read `unmapped 0`. A relocation
  must never point at a phase that does not exist.
- **D-38-11:** **`38-S16` splits.** It narrows to the Windows row-5 branch and stays in 38; the
  Linux row-7 branch is minted as `38-S17` in Phase 42. One host per item, so each closes on its
  own. Consistent with the S-series' existing one-item-per-host-per-row shape and relocation
  rule (4).

### 38-W04 — installer provenance

- **D-38-12:** **Two installs, one scoring artifact.** A local `tauri build` NSIS is smoke-launched
  first for cheap feedback on installer bugs; `38-W04` is then **scored only on the CI artifact**
  from a `workflow_dispatch` run of `release-tauri.yml`. A local build alone would satisfy the
  smoke half of D-16 while abandoning the CI-provenance half D-16 actually names — and
  `38-W04`'s `reduction_note` records that it is *already* a scope reduction against D-16, so a
  second one is not acceptable.
- **D-38-13:** The dispatch run targets **the branch tip after pulling the 4 outstanding commits**
  from `origin/fix/steam-native-install-stability`. Quick `260906-hq8` fixed `runTs.cjs` to spawn
  esbuild via `process.execPath` on win32 — building the Windows smoke-launch artifact *without* a
  Windows-specific fix would be self-defeating, and the ledger evidence must name a commit that is
  still the branch tip.
- **D-38-14:** No `v*` tag is pushed. The tag path co-triggers `draft-release-mac.yml` and
  `draft-release-linux.yml` and opens a draft GitHub Release — that is Phase 34-07's deferred live
  gate, not Phase 38's work.

### Evidence standard

- **D-38-15:** **Re-test the DevTools console assumption before the sitting.** `38-HUMAN-UAT`'s
  "GameLib's DevTools console accepts no input" is a WKWebView measurement. WebView2's DevTools is
  Edge DevTools and plausibly accepts paste and Enter; if it does, probes can be evaluated
  interactively instead of round-tripping through `logInfo`, which is materially cheaper across 17
  items. One check, and the answer is **recorded either way** rather than assumed — carrying a
  macOS-derived constraint onto a different engine without evidence is the same rot as the
  `blocked_by: "a Windows machine"` values that stood false for ten days.
- **D-38-16:** An item moves to `human_verification_discharged` only with **both** (a) positive
  evidence the code path under test actually executed — a log line, a rendered element, a state
  change — and (b) the operator's PASS/FAIL, both written into a dated session block in
  `38-HUMAN-UAT.md`. Implements that document's own rule: *"an item whose code path never executed
  is indistinguishable, in every green result, from one that passed."*
- **D-38-17:** Any probe page or diagnostic surface built during the sitting carries a
  **visibly-changing heartbeat** and is **verified end-to-end headlessly** (`--headless
  --dump-dom` or equivalent) **before a human is asked to read it**. This is the blocking
  constraint from `.planning/.continue-here.md`, recorded after a missing `</script>` tag produced
  four confident, void "the pad is dead" readings across two browsers and two origins.
- **D-38-18:** Windows evidence lands at `%LOCALAPPDATA%\GameLib\logs\gamelib.log`
  (`src/backend/logger/paths.ts:16`), not the macOS path `38-HUMAN-UAT.md` names. `38-01` corrects
  that path in the document.

### Claude's Discretion

- Exact `retired_reason` wording on the 9 retired items, and the phrasing of the amended ROADMAP
  `Plans:` bullet.
- Whether ROADMAP § Phase 38's stale historical counts ("Items: 29 as of 2026-09-01", "Was 8 as of
  2026-08-23") are corrected in the same pass or left as marked historical record.
- Sitting order across the 17 remaining items.

### Verification gate for 38-01 (measured, not asserted)

Both of this ledger's failure modes are **silent**, so the repair must be proven at the tool, not
reasoned about. Capture `gsd-sdk query audit-uat` **before and after** the edit and assert:

- `by_phase["38"]` goes **34 → 17**
- `by_phase["42"]` == **5**, `by_phase["43"]` == **4**
- Total open items across all phases falls by exactly **9** (the retirements), the newly-minted
  `38-S17` offsetting one relocation

A **flat** count after an edit means an item was silently dropped — this is the check the file's
own `audit_tool_note` prescribes, and the same one that caught the `29 → 30` insert on 2026-09-01.
Cross-reference every item by its `test:` prose, **never** by audit position: positions are in
arrival order, not id order, and are already known to be off-by-one at rows 1–2 (`38-W02` sits at
position 1, `38-W01` at position 2).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The phase's own source of truth
- `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md`
  — the authoritative item ledger and the array `gsd-sdk query audit-uat` reads. Its
  `audit_tool_note` frontmatter documents three silent failure modes (status field, in-place
  annotation, positional ids) and is required reading before any edit.
- `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md`
  — sitting protocol: "instrument rather than ask", "prove each branch was armed before recording a
  pass". Currently stale; repaired by `38-01`.
- `.planning/ROADMAP.md` § Phase 38 (line ~4574) — the corrected hardware premise, the two
  relocation rules, and the `Plans: No plan files` bullet amended by `38-01`.

### Session state
- `.planning/.continue-here.md` — the machine-migration handoff. Carries three **blocking**
  anti-patterns (inert instrument, piped exit code, `git checkout --` firing the post-checkout
  hook) and the controller/engine findings.
- `.planning/HANDOFF.json` — structured form of the same handoff. Note its push blocker is now
  **stale**: the 17 commits are on origin and this checkout is behind, not ahead.

### Cross-phase
- `.planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-LIVE-GATE.md`
  — §"What this run establishes, and what it does not" and §"Non-closure statement". A macOS PASS
  is not a close for `38-E03`/`38-E04`; both sides record it.
- `.planning/REQUIREMENTS.md` REQ-35-20 — the origin-side acknowledgment of `38-W04`'s scope
  reduction against D-16.

### Source-level gates (verified live on this tree, 2026-09-06)
- `src/frontend/App.tsx:79` — `showOverlayControls = isFrameless && !hasNativeOverlayControls && !isMac`.
  Gate for `38-W01`.
- `src/frontend/helpers/gamepad.ts:559,678` — `window.api.gamepadAction` dispatched **only** from
  the `navigator.getGamepads()` polling loop. Gate for `38-C01`–`38-C08`; the reason none of them
  is keyboard-runnable.
- `src/preload/api/tauriGamepadInput.ts:50-62` — `getFocusableElements()` builds its own list and
  drops `hasZeroArea` / `disabled` / `aria-hidden` elements. The Tauri-only predicate that makes
  `38-C08` independent of `38-C07`.
- `src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts:182-214` —
  `platformRow` branches on `hostPlatform`; `'readonly-windows'` requires `=== 'win32'`. Gate for
  the whole S-series.
- `src-tauri/Cargo.toml:113` — `[target.'cfg(target_os = "macos")'.dependencies]` carries
  `unstable`. Gate for `38-E01`–`38-E04`; the line Phase 43 must widen.
- `src-tauri/tauri.conf.json:31` — `"targets": ["nsis", "appimage", "dmg"]`. Binary-format boundary
  for `38-W04` / `38-W05`.
- `src/backend/logger/paths.ts:16` — `join(localAppData, 'GameLib', 'logs')`. The Windows evidence
  path.
- `.github/workflows/release-tauri.yml` — `on: push: tags: v*` **and** `workflow_dispatch`. Its
  header self-declares the pipeline UNPROVEN LIVE.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **The S-series pairing.** The ledger is already structured as odd = Electron / even = Tauri twin,
  one pair per host per matrix row. The retirement is mechanical because the structure anticipated
  it; no observation has to be re-derived.
- **`38-C07`'s `electron_cutover_risk` field.** A pre-written disposition for exactly this
  situation. The repair applies it rather than inventing a policy.
- **`gsd-sdk query audit-uat`** — the only tool that counts this backlog, and therefore the only
  acceptable proof that an edit did not break the ledger.

### Established Patterns
- **Every item carries a grep-able `platform_gate`, not a prose blocker** (ROADMAP rule 2). Any item
  minted or rewritten by `38-01` — `38-S17` especially — must carry one. This rule was violated
  29/29 for ten days; it is not self-enforcing.
- **Discharge by moving, never by annotating.** `audit-uat` counts array membership and ignores any
  `result:` field.
- **Forward half / return half.** When a document predicts a non-closure, the document that later
  observes it records the outcome from its own side, so neither reader has to find the other.
  `38-01`'s ROADMAP amendment follows this shape.

### Integration Points
- `38-01` touches planning documents only: `38-VERIFICATION.md`, `38-HUMAN-UAT.md`,
  `.planning/ROADMAP.md`, and two new phase directories. **No source files.**
- The sitting itself runs against `pnpm tauri:dev` — never bare `tauri dev`, which serves a stale
  static bundle.

</code_context>

<specifics>
## Specific Ideas

- **Windows toolchain is not ready.** `rustc`/`cargo` are absent and `src-tauri/target/` does not
  exist, so `pnpm tauri:dev` cannot run yet. `node` 24.19.0, `pnpm` 10.28.0 and `node_modules/` are
  present. `python3` resolves to the Microsoft Store stub, which breaks `pnpm planning-gates` (it
  invokes `python3 meta/runPlanningGates.py` literally). `graphify` is absent, so both PATH-resolved
  `PreToolUse` hooks exit 127 — noisy but non-blocking **by design** (quick `260906-h2k`:
  `PreToolUse` blocks only on exit 2, so a missing binary surfaces a visible prompt instead of
  silently disabling a workflow CLAUDE.md calls mandatory).
- **Controller hardware is still unresolved for 7 items.** The PowerA Advantage Wired for Switch 2
  (`0x20D6`/`0xA720`) is a **Windows** asset: WKWebView returns 0 slots, Chromium/WebView2 reads it.
  It is therefore usable for `38-C01`–`38-C06`/`C08` **on this Windows box**, which is a change from
  the macOS assessment. Steam Input exclusivity was ruled out as a cause by a complete
  Steam-running / Steam-quit 2x2.
- **`38-S07`/`38-S08` need a second registered Steam library folder** or they are unscoreable.
  `38-S07` is retired; `38-S08` remains and still needs it.
- **`38-C03` is a trap.** Its wording says "Tab/Shift+Tab" and reads keyboard-runnable. It is not —
  see the `gamepad.ts:559,678` dispatch gate.
- **`38-C07`/`38-C08` were specified to run back-to-back** on the same game under identical library
  state. With `C07` retired, `C08` loses its comparison arm; run it against the game the operator
  would have used for both.

</specifics>

<deferred>
## Deferred Ideas

- **Retain the `workflow_dispatch` run's AppImage** for the Phase 42 Linux sitting rather than
  spending a second CI cycle — Phase 42's concern, noted so it is not re-discovered.
- **Does a green dispatch run say anything about Phase 34-07's deferred live gate or REQ-35-20?**
  Plausibly yes, but that is 34-07's close to claim, not Phase 38's. Not folded.
- **Apple signing / notarization** (`2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md`) —
  surfaced while reading `release-tauri.yml`'s signing gates. Unrelated to this phase.
- **The lint ratchet** (`pnpm lint` 4166 vs `--max-warnings 4157` in `.husky/pre-push`) — Phase 39
  owns this debt. Not Phase 38's to fix, and the push it was blocking has already landed.

### Reviewed Todos (not folded)

`gsd-sdk query todo.match-phase 38` returned **all 47 pending todos** at score 0.9, which is keyword
noise rather than signal — the matcher fired on generic tokens (`status`, `open`, `src`, `backend`)
against a phase whose scope is a ledger, not a code area. **None were folded.** Phase 38 ships no
code, so every code-fix todo is out of scope by construction; a FAIL observed during the sitting
becomes a *new* todo rather than folding an existing one.

Three were genuinely adjacent and are still deliberately not folded:
- `2026-09-05-confirm-the-gap-d-nav-drain-on-store-gog-on-real-hardware.md` — a deferred live
  hardware confirmation, i.e. Phase-38-shaped. Left out because it belongs to Phase 40's open items,
  and relocating it needs a receipt on the origin side (relocation rule 1), which is its own decision.
- `2026-09-06-detectvcredist-never-runs-on-windows.md` — Windows-specific, but a code defect to
  repair, not an observation to make.
- `2026-08-29-windows-single-instance-guard-and-deep-link-registration.md` — same shape.

</deferred>

---

*Phase: 38-deferred-hardware-and-environment-uat-gates-windows-linux-ma*
*Context gathered: 2026-09-06*

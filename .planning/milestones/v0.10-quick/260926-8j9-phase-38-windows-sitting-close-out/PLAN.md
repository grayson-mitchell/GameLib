---
phase: quick-260926-8j9
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: []
files_modified:
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
  - .planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-VERIFICATION.md
  - .planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/34.4.1-VERIFICATION.md
  - .planning/todos/pending/2026-09-26-login-window-on-page-load-overwrites-the-composed-title.md
  - .planning/todos/pending/2026-09-26-tray-glyph-variant-selection-is-manual-and-theme-blind.md
  - .planning/STATE.md

must_haves:
  truths:
    - "`gsd-sdk query audit-uat` reports phase 38 with EXACTLY 13 open items (was 16) and a grand total of EXACTLY 38 (was 41)"
    - "`38-VERIFICATION.md` still parses and its `status:` still reads `human_needed`"
    - "38-W01, 38-W02 and 38-W03 all live in `human_verification_discharged`; NONE remains in `human_verification`"
    - "38-W03's `result:` carries every disclosure token in the gate list, so no paraphrase can quietly drop the honesty framing"
    - "38-W03's `expected:` states the APPEND contract, not the replace contract"
    - "Both origin phases record the outcome on their EXISTING receipt entry, with no parallel key created"
    - "`pnpm planning-gates` passes, so both new todos carry severity/platform/ready in that order"
  artifacts:
    - path: ".planning/todos/pending/2026-09-26-login-window-on-page-load-overwrites-the-composed-title.md"
      provides: "TODO A, with the accepted-by-operator rationale recorded so it does not read as missed"
    - path: ".planning/todos/pending/2026-09-26-tray-glyph-variant-selection-is-manual-and-theme-blind.md"
      provides: "TODO B, including the Windows SystemUsesLightTheme trap and the UseDarkTrayIcon stale-fallback fold-in"
  key_links:
    - from: "38-VERIFICATION.md human_verification_discharged"
      to: "origin-phase receipts in 34.1 and 34.4.1"
      via: "relocation rule (3) walk-back"
      pattern: "outcome:"
---

<objective>
Close out the 2026-09-26 Phase 38 Windows sitting. Three Windows items were attempted live on
the operator's Windows 11 machine under `tauri dev` (debug build). All three are now
dischargeable: 38-W01 PASS, 38-W02 PASS, 38-W03 FAIL-accepted-by-operator-decision. This plan
writes that sitting into the ledger, corrects one item's own mis-specified `expected:`, walks
the receipts back to both origin phases, and files the two design/defect questions the sitting
surfaced.

Purpose: a FAIL discharges an item exactly as legitimately as a PASS — the point of running an
off-macOS item is to learn what the off-macOS behaviour IS. 38-W03's value is entirely in the
honesty of its record: one half of its evidence is a verbatim log artifact, another half is an
inference from source that was never instrumented, and the root cause is SILENT on Windows by
construction. The ledger is worth what that distinction is worth, so this plan gates on the
distinction surviving into the written text rather than being flattened into a tidy "FAIL".

Output: three items moved to `human_verification_discharged`; a `Sitting 4` block in
`38-HUMAN-UAT.md`; two origin receipts carrying outcomes; two pending todos; one STATE.md row.

DOCUMENTATION ONLY. Nothing under `src/`, `src-tauri/`, `meta/` or `public/` is touched by this
plan. Every source reference below was verified read-only at plan time.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
@.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
</context>

<measured_baseline>
Every number, line reference and file shape below was MEASURED at plan time on 2026-09-26 against
this tree. Assert these; do not re-derive them. Where the briefing's figure was wrong, the
corrected value is marked **CORRECTED** and the corrected value is the one to write.

**Audit baseline (measured with `npx gsd-sdk query audit-uat`)**
- phase 38: `status: human_needed`, **16** open items. Grand total across all files: **41**.
  (`summary.by_phase` = `{"27":2,"30":2,"32":2,"33":3,"34":2,"35":7,"38":16,"34.13":7}`.)
- After this plan: phase 38 = **13**, grand total = **38**. Every other phase unchanged.
- ARRIVAL-ORDER HAZARD CONFIRMED LIVE: audit positions 1/2/3 are 38-W02 (tray), 38-W01 (window
  buttons), 38-W03 (login title) — i.e. exactly the three items being discharged, and position 1
  is NOT 38-W01. After the edit, position 1 becomes 38-W04. Never cross-reference by position.

**`38-VERIFICATION.md` structure (line numbers at plan time)**
- `status: human_needed` at line 4. LOAD-BEARING. Do not touch.
- `score:` narrative at line 5 — currently says "16 relocated items OPEN, 10 discharged ... 10
  retired". Must become 13 OPEN / 13 discharged / 10 retired.
- `human_verification:` line 12 · `sweep_notes:` line 177 · `human_verification_retired:` line 182
  · `human_verification_discharged:` line 307 · frontmatter closes at line 422.
- Entries to move: `38-W02` (line 13, FIRST in the array), `38-W01` (line 23), `38-W03` (line 33).
  They are the first three entries; `38-W04` at line 44 becomes the new head of the array.
- NOT STRICT YAML. `js-yaml` throws on this file. Edit TEXTUALLY with Edit/sed; never round-trip
  it through a YAML library. The house quoting style is single-quoted scalars with `''` escaping
  for any value containing a colon-space or an apostrophe.

**`src-tauri/src/main.rs` — all four title-setting sites, verified read-only**
- `fn login_window_title(origin, document_title)` at **:2069** — CONFIRMED. Body:
  `Some(title) if !title.is_empty() => format!("{origin} — {title}")`, else `origin.to_string()`.
  Its doc comment at :2060-2068 states the security rationale verbatim, naming T-34.5-G6-23 and
  "places `origin` first, unconditionally, with the document title (if any) appended only AFTER
  it -- a truncated title bar still shows the trustworthy part first".
- builder `.title(login_window_title(&origin, None))` at **:6293** — CONFIRMED.
- post-`build()` seed `window.set_title(&login_window_title(&origin, None))` at **:6709** —
  CONFIRMED, inside `if visible {`.
- `on_document_title_changed`: **CORRECTED**. `let composed = login_window_title(&origin_now,
  Some(&title));` is at **:6357**; the `window.set_title(&composed)` that applies it is at
  **:6358**; the `eprintln!` emitting `title change applied len={}` is at **:6359-6362**. Cite
  ":6357-6362" or ":6358", not a bare ":6357 set_title".
- `on_page_load` reset `window.set_title(&login_window_title(&new_origin, None))` at **:6491** —
  CONFIRMED exactly.
- EVENT-BRANCHING CONFIRMED: the closure opens with `match payload.event() { Started => "started",
  Finished => "finished" }` but that match ONLY produces a diagnostic `kind` string for
  `push_login_window_event`. The `set_title` sits OUTSIDE the match, inside `if visible {`, so it
  runs on BOTH events. The briefing's claim is correct and is now source-verified.
- SILENCE CONFIRMED: `push_login_window_event` (**:2145-2155**) only pushes a `Value` into an
  in-memory `LOGIN_WINDOW_EVENTS` queue — it prints nothing. The closure's ONLY `eprintln!` is the
  origin-banner line at :6503-6506, inside `#[cfg(target_os = "macos")]`. So the reset really is
  completely silent on Windows.
- **CORRECTED**: the "is WR-07's actual requirement" sentence is NOT at :6283. It spans
  **:6284-6285** ("The document title still / arrives via `on_document_title_changed` below and
  replaces this, which is / WR-07's actual requirement"), inside the comment block :6282-6288.
  Cite the block as `main.rs:6282-6288`.
- `main.rs:1551` (the "AppKit sheets structurally render NO title bar UI at all" statement quoted
  by 38-W03's own `platform_gate`) is unchanged and still cited correctly by the ledger.

**Tray references**
- `TRAY_ICON_TEMPLATE` const at `main.rs:117`; `fn tray_image(dark: bool)` at `main.rs:141`,
  returning the template on macOS regardless of `dark` (block comment at :77, :135). CONFIRMED.
- Dispatch chain CONFIRMED end to end: `ipcMain.on('changeTrayColor', ...)` at
  `src/backend/sidecar/appShellFlowRegistration.ts:613` -> the 500ms settle-delay timer at :206 ->
  `requestRustInvoke(RUST_TRAY_SET_ICON, [...])` at :238 -> `tray_image(dark)`.
- **CORRECTED**: `src/frontend/screens/Settings/components/UseDarkTrayIcon.tsx` — the stale
  fallback `t('setting.darktray', 'Use Dark Tray Icon (needs restart)')` is at **line 49**, not
  50. The macOS hide (`if (isMac) return <></>`) is at :40-42.
- `public/locales/en/translation.json:829` — `"darktray": "Use Dark Tray Icon"` (no "(needs
  restart)"). CONFIRMED exactly at 829.
- `src/common/types.ts:128` — `darkTrayIcon: boolean`. CONFIRMED exactly at 128.
- **CORRECTED**: `src/backend/__tests__/trayIconAssets.test.ts` — line 119 is the `it(...)` title
  ("is a black glyph ... and a white one"); the `isUniformFill(...)` calls are at **:125** and
  **:131**. Cite `trayIconAssets.test.ts:119-137` or `:125,:131`, not a bare `:119`.
- `meta/trayIconVariants.ts` — the "refuses to write a byte-identical pair at any scale" gate is
  real (see :6-12 and HARD GATE 3 at :516). CONFIRMED.

**tao — the Windows trap, verified against the INSTALLED crate**
`~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tao-0.35.3/src/platform_impl/windows/dark_mode.rs`
— `fn read_apps_use_light_theme()` occupies lines **230-249 exactly**, calling `RegGetValueW` on
`HKEY_CURRENT_USER`, `w!(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize")`,
`w!("AppsUseLightTheme")`. The briefing's citation is correct verbatim. `SystemUsesLightTheme` does
NOT appear anywhere in that file, which is the point.

**Origin receipts — BOTH EXIST. Exact locations, and a gap the briefing did not anticipate.**
- `34.1-VERIFICATION.md:59` opens `human_verification_relocated:`, an array of THREE entries:
  1. window buttons -> `moved_to: "Phase 38"`, `moved_as: "38-W01"`, `moved_on`, `platform_gate`,
     `was_uat_item: "1a"`, `note`. **This is 38-W01's receipt. It needs an `outcome:`.**
  2. tray dark/light swap -> `moved_to: "Phase 38"`, `moved_on`, `why_moved`, `platform_gate`.
     **This is 38-W02's receipt AND IT NAMES NO ITEM ID.** It has neither `moved_as` nor
     `was_uat_item`. Relocation rule (3) requires "a receipt naming this phase AND THE ITEM ID";
     this one names only the phase. That is a real, pre-existing rule-(3) gap, not a design
     choice — contrast entry 1, which carries both. This plan closes it by ADDING
     `moved_as: "38-W02"` and `was_uat_item: "6d / Gap G3"` to the EXISTING entry alongside the
     `outcome:`. This is completing an entry, NOT creating a parallel key.
  3. gamepad -> already carries an `outcome:` added by quick `260925-r8j`. **This is the shape to
     copy**: a single `outcome:` key appended to the existing entry, opening with
     `"DISCHARGED <date> (quick \`<id>\`, sitting N)."` and then the per-item disposition.
- `34.4.1-VERIFICATION.md:88` opens `human_verification_relocated:`, whose FIRST entry is 38-W03's:
  `test: "D-29-05 -- the login window's provisional title ..."`, `moved_to: "Phase 38"`,
  **`item_id: "38-W03"`** (note: `item_id`, NOT `moved_as` — the two origin files use different
  key names for the same concept), `requirement: REQ-34.4.1-09`, `note:`. **It needs an
  `outcome:`.** Do not normalise `item_id` to `moved_as`; leave the existing key alone.
- The 34.10 precedent the briefing cites (`260925-r8j`) is a DIFFERENT shape — there the receipt
  was nested under `deferred[0]` and carries a `receipt_key_note` explaining why. Neither file
  here needs that treatment; both have a real `human_verification_relocated` array.

**`38-HUMAN-UAT.md` (421 lines)**
- Frontmatter carries `updated: 2026-09-25` and a `sessions:` array of three strings. Both need a
  Sitting 4 entry / date bump.
- `## Current Test` (line 13) opens with a bracketed reconciliation paragraph that currently reads
  "Three sittings held" and "as of 2026-09-25 it holds 16 open items, 10 discharged, 10 retired".
  Both figures go stale with this change. Commit `5a0edd4a9` set the precedent for reconciling
  this paragraph in place rather than rewriting frozen sitting text.
- Section headings: sitting 1 is `### Session 1 — ...` nested under `## Results` (line 73/75);
  sittings 2 and 3 are top-level `## Sitting 2 — ...` (201) and `## Sitting 3 — ...` (262).
  **Follow the sitting 2/3 shape**: `## Sitting 4 — 2026-09-26, Windows 11, `tauri dev``.
- House block shape, from sitting 3: a bolded **Conditions.** paragraph, verbatim artifacts
  indented four spaces as a code block, a bolded per-item line `**`38-WXX` — PASS.**`, and a
  closing **Honest-limits paragraph.**
- Sittings 1, 2 and 3 are FROZEN HISTORY. Do not edit their bodies.

**Gates and what they actually cover**
- `.prettierignore` lists `.planning` (under "Tooling/agent state and planning artifacts, not
  shipped source"). VERIFIED. **This plan writes ONLY `.planning/` files, so a
  `npx prettier --check` over any path it writes is VACUOUS and must not appear in any verify
  block and must not be claimed in any commit message or summary.** This is the one case where
  CLAUDE.md's formatter-check convention does not apply, and the reason is mechanical, not
  stylistic.
- `pnpm planning-gates` = `python3 meta/runPlanningGates.py`, which auto-discovers `*-gate.py`.
  The two that bite here: `.planning/todos/todo-frontmatter-gate.py` (severity/platform/ready on
  every `pending/` todo) and `.planning/uat-visibility-gate.py` (ratchets on invisible UAT items).
- `git status --porcelain --cached` is NOT valid. Use `git diff --cached --name-only`.
- Windows console is cp1252. Any python that PRINTS an em-dash or arrow needs
  `PYTHONIOENCODING=utf-8`. The gates below are written to print ASCII-only labels for this
  reason, and the one python invocation sets the variable anyway.

**STATE.md**
- `### Quick Tasks Completed` header at line 1122; table header at 1124-1125; the final row is
  `260925-uok` at line **1563**. Rows are **5 cells**: `| id | Description | Date | Status |
  Directory |`. Append after 1563. ROADMAP.md is NOT touched by this plan.
</measured_baseline>

<tasks>

<task type="auto">
  <name>Task 1: Discharge 38-W01 and 38-W02 as PASS</name>
  <files>.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md</files>
  <action>
MOVE the `38-W01` entry (currently at line 23) and the `38-W02` entry (currently at line 13,
first in the array) out of `human_verification` and append both to `human_verification_discharged`
(currently opening at line 307), after the existing `38-C08` entry. MOVE, not annotate: `audit-uat`
counts array MEMBERSHIP and ignores any `result:` field, so an in-place `result:` leaves the item
open and the discharge silently does not happen. Preserve every existing field on both entries
verbatim as it travels — `test`, `expected`, `why_human`, `blocked_by`, `platform_gate`,
`origin_phase`, `origin_item`, `prior_state`, and for 38-W02 its `watch_out` — and add ONLY a new
`result:` as the first key after `id:`, matching the placement used by every entry already in
`human_verification_discharged`.

Do NOT touch `status: human_needed` at line 4. Do NOT touch the `human_verification_retired`
array. Edit textually; this file is not strict YAML and `js-yaml` throws on it.

`38-W01` result — PASS. It must state:
- PASS, sitting 4, 2026-09-26, Windows 11, `tauri dev` (debug build), framelessWindow ON.
- All FOUR custom-titlebar window operations were exercised — minimize, maximize, restore, close
  — and each drove the real OS window exactly as the equivalent native title-bar button would,
  which is this item's `expected:` verbatim. Score the four independently in the text; do not
  collapse them into "the buttons work".
- THE LOAD-BEARING FRAMING: this is the FIRST LIVE CONFIRMATION. The item was STATICALLY FIXED by
  plan 34.1-09 (`WindowControls/index.scss:2` re-anchored off the stale sidebar-era
  `grid-area: content`) and is gated by `windowControlsPlacement.test.ts`, which recomputes the
  expected row from `.App`'s own live `grid-template-areas` rather than a pinned literal — strong
  static evidence, but never observed on a real Windows or Linux window across five sessions. The
  item's own `prior_state` says exactly that; this result is the return half of it. Say
  "STATICALLY FIXED, NEVER LIVE-CONFIRMED" is now closed, and say which five-session claim it
  closes, so a reader can tell this apart from a re-run of an already-observed item.
- The macOS unobservability reason stands unchanged and is not weakened by this pass:
  `src/frontend/App.tsx:79` renders `WindowControls` under an unconditional `!isMac` gate.

`38-W02` result — PASS, all three legs. It must state:
- PASS, sitting 4, 2026-09-26, Windows 11, `tauri dev` (debug build).
- Leg 1 — THE SWAP IS REAL AND IMMEDIATE. Toggling Settings -> General -> "Use Dark Tray Icon"
  changes the visible image in the Windows notification area with no restart. The item's bar was
  "~500ms"; the observed swap was immediate on toggle. Record that the bar was beaten, not merely
  met.
- Leg 2 — BLACK GLYPH AGAINST A LIGHT TASKBAR READS AS A CAT. Operator switched Windows to Light
  mode with the toggle ON and confirmed a legible cat silhouette, not a smudge.
- Leg 3 — WHITE GLYPH AGAINST A DARK TASKBAR READS AS A CAT. Operator returned to Dark mode with
  the toggle OFF and confirmed the same.
- Say explicitly that each variant was judged against THE TASKBAR IT WAS DESIGNED FOR, and that
  this is the only way the item can be scored honestly — the legibility clause in its `expected:`
  is meaningless against the wrong background.
- TRAP 1, which must be written down as EXPECTED rather than left to be rediscovered as a defect:
  "the dark glyph is hard to read on a dark taskbar" is CORRECT behaviour. Black is the variant
  intended for a LIGHT taskbar. The operator observed exactly this mid-sitting. Frame it as the
  same class as this item's own existing `watch_out` (macOS showing no change at all must not be
  recorded as a FAIL) — a correct outcome that looks like a failure.
- TRAP 2, the observation trap that delayed the score: the full-colour cat on the Windows TASKBAR
  BUTTON is the APPLICATION icon and is NOT the tray glyph. The tray glyph lives in the
  notification area, which Windows 11 hides behind the `^` overflow chevron by default. The
  monochrome pair is machine-proven by `src/backend/__tests__/trayIconAssets.test.ts:119-137`,
  which decodes pixels and asserts `isUniformFill(dark, 0)` at :125 and `isUniformFill(light, 255)`
  at :131 across 1x/2x/3x — so a COLOURED tray image is not reachable from `tray_image()` at all,
  and anyone looking at a colour cat is looking at the wrong element. (Cite the line numbers as
  given here; the briefing's bare `:119` is the `it(...)` title, not the assertions.)
- FIRST LIVE CONFIRMATION THAT `darkTrayIcon` DOES ANYTHING AT ALL. Per the item's own
  `prior_state`, `icon-dark.png` and `icon-light.png` were byte-identical for the project's
  entire history, so the setting was a switch wired to nothing and this item would have FAILED on
  a Windows machine too. The 2026-08-22 fix — `meta/trayIconVariants.ts` generating
  `icon-tray-{dark,light}{,@2x,@3x}.png` from a hue-segmented mask and refusing to write a
  byte-identical pair at any scale — is what made the item runnable, and is now proven live end to
  end: `changeTrayColor` (`src/backend/sidecar/appShellFlowRegistration.ts:613`) -> the 500ms
  settle-delay timer (:206) -> `requestRustInvoke(RUST_TRAY_SET_ICON, ...)` (:238) ->
  `tray_image(dark)` (`src-tauri/src/main.rs:141`) -> a visibly different, legible glyph.
- The macOS unobservability reason stands unchanged: `tray_image` returns `TRAY_ICON_TEMPLATE`
  (`main.rs:117`) regardless of the `dark` argument, so `darkTrayIcon` is vestigial on macOS BY
  DESIGN, which is why `UseDarkTrayIcon.tsx:40-42` hides the toggle there under D-05.

Do not write a `result:` for 38-W03 in this task — Task 2 owns it.
  </action>
  <verify>
    <automated>bash -c 'F=.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md; D=$(grep -n "^human_verification_discharged:" "$F" | cut -d: -f1); for id in 38-W01 38-W02; do L=$(grep -n "  - id: \"$id\"" "$F" | cut -d: -f1); [ -n "$L" ] || { echo "FAIL $id missing"; exit 1; }; [ "$L" -gt "$D" ] || { echo "FAIL $id still in human_verification (line $L, discharged starts $D)"; exit 1; }; done; grep -q "^status: human_needed$" "$F" || { echo "FAIL status changed"; exit 1; }; echo OK</automated>
  </verify>
  <done>Both ids resolve to exactly one entry each, both below the `human_verification_discharged:` key, `status: human_needed` untouched, every pre-existing field on both entries preserved verbatim.</done>
</task>

<task type="auto">
  <name>Task 2: Discharge 38-W03 as FAIL-accepted, correct its expected:, update the score: narrative</name>
  <files>.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md</files>
  <action>
MOVE the `38-W03` entry from `human_verification` to `human_verification_discharged`, after the
38-W02 entry Task 1 appended. A FAIL discharges an item exactly as legitimately as a PASS — the
point of running an off-macOS item is to learn what the off-macOS behaviour IS. Do not leave it
open, do not record it as a gap, do not re-open it as a defect in the ledger (the defect gets a
todo in Task 3 instead).

REWRITE its `expected:` in place, as a SPECIFICATION CORRECTION — the same treatment 38-C03's
mis-specification received in quick `260925-r8j`, and it must be labelled as such so no reader
mistakes it for a re-score. The current text claims the origin is "REPLACED by the loaded
document's own title" and that "an origin that never gives way to the document title is a WR-07
REGRESSION". That is wrong about the code. `login_window_title` (`src-tauri/src/main.rs:2069`)
returns `format!("{origin} — {title}")` when a non-empty document title is present and the bare
origin otherwise — the document title is APPENDED AFTER the origin, never substituted for it.
The new `expected:` must state:
- The title bar NEVER reads the framework default "Tauri app".
- It shows the ORIGIN from the moment the window is presented.
- The document title, when one arrives, is APPENDED AFTER the origin, producing
  `https://www.humblebundle.com — Humble Bundle - Log In`. That exact string is the correct target.
- The origin comes first UNCONDITIONALLY and survives truncation, which is deliberate and
  security-load-bearing (T-34.5-G6-23): the page title is fully attacker-controlled and may be
  crafted to look like an origin, so the trustworthy, shell-resolved half goes first. Cite
  `main.rs:2060-2068`, which states this verbatim in the helper's own doc comment.
Keep `expected:` INLINE. Never a block scalar — that is a UAT-file hazard and this is a
VERIFICATION file, but the inline shape is the house style here regardless.

Add a `result:` that opens `FAIL (accepted by operator decision, will not fix)`. It must carry
ALL SEVEN of the following. The disclosure gate in the verify block will fail the task if the
honesty framing is paraphrased away, so write these in the terms given:

(a) VERBATIM ARTIFACT. These two lines exactly as the operator read them from the `tauri dev`
terminal, reproduced byte-for-byte:

    [shell] humble_login_open: presentation requested visible=true width=900 height=700 center=true focus_once=true persistent_pin=false light_theme_requested=true sheet_presented=false
    [shell] humble_login_open: title change applied len=22

(b) OBSERVED. The login window's OS title bar read `https://www.humblebundle.com` and never
became the composed `origin — document title`. THE HOOK FIRED; that is what `len=22` proves.
`len=22` matches the item's own expected document title `Humble Bundle - Log In` at exactly 22
characters, but this is CORROBORATION ONLY, NOT PROOF, because `on_document_title_changed`
deliberately never logs the title string itself (T-34.4.1-106: remote page content must never
reach an uploadable log). Write it in exactly those terms. Do not upgrade it to proof.

(c) SPECIFICATION CORRECTION. Record that the item's `expected:` was rewritten at discharge time,
state the old claim and the new contract, and label it a SPECIFICATION CORRECTION, NOT A
RE-SCORE — the same disposition 38-C03 received.

(d) ROOT CAUSE BY ELIMINATION, with the inference LABELLED as an inference. Four sites set this
window's title across its life: the builder `.title(login_window_title(&origin, None))` at
`main.rs:6293`; the post-`build()` seed at `:6709`; `on_document_title_changed` at `:6357-6362`
(the composition at :6357, the `set_title` at :6358, the `len=22` `eprintln!` at :6359-6362); and
`on_page_load` at `:6491`. Only the last can run AFTER the document-title change, and it calls
`window.set_title(&login_window_title(&new_origin, None))` — origin only. Source-verified at plan
time: that call sits OUTSIDE the closure's `match payload.event()` (which only builds a diagnostic
`kind` string for `push_login_window_event`), inside `if visible {`, so it runs on BOTH
`PageLoadEvent::Started` AND `PageLoadEvent::Finished`. `Finished` normally lands after the
`<head>` is parsed, so it overwrites the composed title and nothing restores it. THE EVENT
ORDERING IS INFERRED, NOT OBSERVED — that closure's only `eprintln!` sits inside a
`#[cfg(target_os = "macos")]` block (the origin-banner update at :6503-6506), and
`push_login_window_event` (`:2145-2155`) only queues a value in memory and prints nothing, so on
Windows the reset is COMPLETELY SILENT. Say that plainly. Do not present the ordering as measured.

(e) WHY IT SURVIVED. Structurally invisible on macOS: the login window is presented there as an
AppKit sheet with no title bar at all (`main.rs:1551`, quoted by this item's own `platform_gate`),
and that same macOS-only block re-texts the IN-PAGE origin banner instead. The reset is a CORRECT
action on macOS and a DESTRUCTIVE one on Windows, in one unconditional line.

(f) OPERATOR DECISION. Accepted, WILL NOT FIX. Recorded as a decision AGAINST WR-07's letter
rather than as a pass. Rationale: the origin is the trustworthy, shell-resolved half (it comes
from `login_window_url_arg`'s validated URL via `Url::origin().ascii_serialization()`, never from
page content) and it is the half that SURVIVES; the lost document title costs usability, not
security. Flag it explicitly as a DELIBERATE DEVIATION, because `main.rs:6282-6288` states
outright that the document title arriving and replacing the provisional title "is WR-07's actual
requirement". (Note the corrected citation: the sentence spans :6284-6285 inside that block, not
:6283.)

(g) INCIDENTAL FINDING. `sheet_presented=false` in that scrollback is the FIRST LIVE CONFIRMATION
that the macOS sheet path is genuinely off on Windows. That is the premise this item's own
`platform_gate` rests on, and it had never been observed. The `platform_gate`'s falsifiability
clause ("if the login window ever stops being presented as a sheet on macOS, this item becomes
observable here") is untouched and still correct.

THEN update two narrative fields, in the same task so the file is self-consistent in one commit:

1. `score:` (line 5). Change the leading figures from "16 relocated items OPEN, 10 discharged" to
   "13 relocated items OPEN, 13 discharged", keep "10 retired" unchanged, and PREPEND a new
   parenthetical in the established house style — i.e. matching the existing "(Was 24 until
   2026-09-25 ...)" sentences — recording: sitting 4, 2026-09-26, quick `260926-8j9` discharged
   `38-W01` PASS, `38-W02` PASS and `38-W03` FAIL-accepted; that `38-W03`'s `expected:` was also
   corrected at discharge as a specification correction, not a re-score; and the tool
   confirmation, which is the check that the array still parses: `audit-uat` moved 16 -> 13 and
   41 -> 38. A FLAT count after a removal would mean the edit did not register or the array
   failed to parse. Do not delete or reorder the existing parentheticals.
2. `sweep_notes.windows_linux_dependency` (line 180). Its first clause reads "38-W01, 38-W04 and
   38-W05 need Phase 34's Windows/Linux builds to exist". Append a dated amendment in the same
   voice as the note's existing 2026-09-25 amendment: `38-W01` was DISCHARGED PASS on 2026-09-26
   (quick `260926-8j9`, sitting 4) on a `tauri dev` debug build — which confirms the note's
   premise that the Windows build exists and runs, while leaving 38-W04/38-W05 untouched, since
   those need a CI-produced NSIS/AppImage ARTIFACT, which a dev build is not. That distinction is
   the whole reason W01 could discharge and W04/W05 could not.

Do NOT touch `status: human_needed`. Do NOT touch `audit_tool_note`, `purpose`,
`deferral_note` or `relocation_rules`.
  </action>
  <verify>
    <automated>bash -c 'F=.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md; D=$(grep -n "^human_verification_discharged:" "$F" | cut -d: -f1); L=$(grep -n "  - id: \"38-W03\"" "$F" | cut -d: -f1); [ "$L" -gt "$D" ] || { echo "FAIL 38-W03 not discharged"; exit 1; }; grep -q "^status: human_needed$" "$F" || { echo "FAIL status changed"; exit 1; }; awk -v s="$L" "NR>=s{print} NR>s && /^  - id: /{exit}" "$F" | head -n -1 > /tmp/w03.txt; miss=0; while IFS= read -r t; do grep -Fq "$t" /tmp/w03.txt || { echo "MISSING TOKEN: $(echo "$t" | cut -c1-40)"; miss=1; }; done <<TOKENS
INFERRED, NOT OBSERVED
CORROBORATION ONLY, NOT PROOF
SPECIFICATION CORRECTION
NOT A RE-SCORE
operator decision
will not fix
DELIBERATE DEVIATION
T-34.5-G6-23
T-34.4.1-106
sheet_presented=false
title change applied len=22
FIRST LIVE CONFIRMATION
PageLoadEvent::Started
main.rs:6491
TOKENS
[ "$miss" = 0 ] || exit 1; grep -Fq "Humble Bundle - Log In" /tmp/w03.txt || { echo "MISSING target title string"; exit 1; }; grep -q "expected: |" /tmp/w03.txt && { echo "FAIL block scalar in expected"; exit 1; }; echo OK</automated>
  </verify>
  <done>38-W03 sits in `human_verification_discharged` with a `result:` containing every disclosure token and the corrected inline `expected:`; `score:` reads 13 OPEN / 13 discharged / 10 retired with a new dated parenthetical; `windows_linux_dependency` carries the dated amendment; `status: human_needed` unchanged.</done>
</task>

<task type="auto">
  <name>Task 3: Commit the ledger discharges</name>
  <files>.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md</files>
  <action>
Stage ONLY `38-VERIFICATION.md` and commit. ANOTHER SESSION IS COMMITTING INTO THIS REPO
CONCURRENTLY TODAY — HEAD moved twice during the session that produced this plan — so run
`git diff --cached --name-only` BEFORE committing and confirm the staged set is exactly that one
path. (`git status --porcelain --cached` is not a valid option; do not reach for it.) If any other
path appears, unstage it and re-check rather than committing a mixed set.

Work on `main`. Do not create a branch.

Message:

    docs(quick-260926-8j9): discharge 38-W01, 38-W02 and 38-W03 from the Windows sitting

Body should say: moved from `human_verification` to `human_verification_discharged` (a move, not
an in-place `result:`, because `audit-uat` counts array membership); W01 and W02 PASS as first
live confirmations of statically-fixed behaviour; W03 FAIL accepted by operator decision against
WR-07's letter, with the root cause labelled as inferred rather than observed because the
`on_page_load` reset is macOS-gated-silent; W03's `expected:` corrected in place as a
specification correction, not a re-score; `status` stays `human_needed`; `audit-uat` now reports
phase 38 at 13 (was 16), grand total 38 (was 41).

Do NOT claim any formatter check in this message — `.prettierignore` lists `.planning`, so none
was run and none would have proved anything.

End the message with:

    Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  </action>
  <verify>
    <automated>bash -c 'git log -1 --format=%s | grep -q "^docs(quick-260926-8j9): discharge" || { echo FAIL subject; exit 1; }; git log -1 --format=%B | grep -q "Co-Authored-By: Claude Opus 5 (1M context)" || { echo FAIL attribution; exit 1; }; git show --name-only --format= HEAD | grep -v "^$" > /tmp/f.txt; [ "$(wc -l < /tmp/f.txt)" = 1 ] || { echo "FAIL more than one file"; cat /tmp/f.txt; exit 1; }; grep -q "38-VERIFICATION.md" /tmp/f.txt || { echo FAIL wrong file; exit 1; }; echo OK</automated>
  </verify>
  <done>One commit on `main` touching exactly `38-VERIFICATION.md`, correctly subjected and attributed.</done>
</task>

<task type="auto">
  <name>Task 4: File the two pending todos</name>
  <files>.planning/todos/pending/2026-09-26-login-window-on-page-load-overwrites-the-composed-title.md, .planning/todos/pending/2026-09-26-tray-glyph-variant-selection-is-manual-and-theme-blind.md</files>
  <action>
Both files need frontmatter carrying `created`, `title`, `area`, `files`, then — in THIS EXACT
ORDER, bare, lowercase, unquoted — `severity:`, `platform:`, `ready:`. The `/gsd-add-todo`
template does NOT emit those three; write them by hand or `pnpm planning-gates` goes red.
`platform:` goes immediately after `severity:`; `ready:` immediately after `platform:`. Never
`severity: "minor"`, never `severity: Minor`. Follow the shape of an existing pending todo (e.g.
`.planning/todos/pending/2026-09-25-vite-dev-watcher-also-walks-build-and-public-bin-both-written-while-serving.md`),
including an optional `found_by:` after `ready:`.

**TODO A** — `severity: minor`, `platform: any`, `ready: code`. Title: the login window's
`on_page_load` handler overwrites the composed title.
Body must record:
- THE DEFECT: the `on_page_load` closure at `src-tauri/src/main.rs:6491` calls
  `window.set_title(&login_window_title(&new_origin, None))` — origin only. That call is OUTSIDE
  the closure's `match payload.event()` and inside `if visible {`, so it runs on BOTH
  `PageLoadEvent::Started` AND `PageLoadEvent::Finished`. The `Finished` call overwrites the
  composed `origin — document title` set at `:6357-6358` by `on_document_title_changed`, and
  nothing restores it. Net effect on Windows: the title bar shows the bare origin forever.
- PROPOSED FIX, stated precisely because the obvious version is wrong: guard ONLY the `set_title`
  call on `PageLoadEvent::Started`, keeping the `page_load_origin` main-frame origin refresh (the
  `if let Ok(mut guard) = page_load_origin.lock()` write at :6488-6490) running on BOTH events.
  A GUARD ON ONE LINE, NOT ON THE BLOCK. Guarding the whole `if visible` block would stop the
  trusted main-frame origin tracking on `Finished`, which the macOS origin banner and the title
  composer both read.
- THE OPERATOR ALREADY WEIGHED THIS AND CHOSE TO ACCEPT IT on 2026-09-26, during the Phase 38
  Windows sitting, rather than fix it: the origin is the trustworthy, shell-resolved half and it
  is the half that survives; the lost document title costs usability, not security. Write this
  explicitly so a later reader sees it was DECIDED, not MISSED. Link to 38-W03's discharged entry
  in `38-VERIFICATION.md` as the record.
- WHY IT WENT UNSEEN FOR SO LONG: silent on Windows, because the closure's only `eprintln!` is
  inside a `#[cfg(target_os = "macos")]` block (the origin-banner update at :6503-6506) and
  `push_login_window_event` (`:2145-2155`) only queues in memory and prints nothing. And
  structurally invisible on macOS, where the login window is an AppKit sheet with no title bar at
  all (`main.rs:1551`).
- THE TENSION TO RESOLVE IF IT IS EVER FIXED: `main.rs:6282-6288` states that the document title
  arriving and replacing the provisional title "is WR-07's actual requirement", so the current
  behaviour deviates from that comment's own stated requirement. Note that the comment's word
  "replaces" is itself imprecise — `login_window_title` APPENDS after the origin
  (`main.rs:2069`), deliberately, per T-34.5-G6-23 — so a fix should correct the comment too.
- `files:` should list `src-tauri/src/main.rs` and
  `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md`.

**TODO B** — `severity: minor`, `platform: any`, `ready: code`. Title: automatic tray-glyph
selection / theme-agnostic tray artwork.
This is ONE todo. Do NOT split the `UseDarkTrayIcon` stale-fallback item into its own file; fold
it in as described at the end.
Body must record:
- MACOS ALREADY SOLVES THIS STRUCTURALLY via the AppKit template image (`TRAY_ICON_TEMPLATE`,
  `src-tauri/src/main.rs:117` — solid black RGB with the shape carried in alpha). Nothing to
  detect; AppKit tints it. `darkTrayIcon` is vestigial there BY DESIGN, which is why
  `UseDarkTrayIcon.tsx:40-42` hides the toggle on macOS under D-05.
- THE WINDOWS TRAP, verified against the INSTALLED crate rather than from memory. tao 0.35.3,
  `src/platform_impl/windows/dark_mode.rs:230-249`, reads `AppsUseLightTheme` from
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize`. That is the APP theme. The
  taskbar and notification area are governed by `SystemUsesLightTheme`, a SIBLING value under the
  same key, and Windows 11 lets the two be set independently (the "Custom" option under
  Personalization -> Colors). Wiring the tray glyph to Tauri's `Window::theme()` /
  `on_theme_changed` VALUE would therefore be correct for defaulted users and WRONG PRECISELY FOR
  USERS WHO DELIBERATELY CUSTOMISED THEIR TASKBAR — a failure that looks like a working feature in
  testing and misfires only in the field. The correct implementation reads `SystemUsesLightTheme`
  directly, and may use `on_theme_changed` as a TRIGGER ONLY (it fires off
  `WM_SETTINGCHANGE`/`ImmersiveColorSet`, which Windows broadcasts for both values) while
  DISCARDING its payload and re-reading the registry. State that `SystemUsesLightTheme` appears
  nowhere in that tao file, which is the point.
- LINUX: no reliable signal exists. The tray host varies (StatusNotifierItem/AppIndicator, a GNOME
  extension, KDE's own) and none publish the panel's background. The closest thing, the XDG
  settings portal's `org.freedesktop.appearance` `color-scheme`, is an app-colour-scheme HINT
  rather than the panel's actual colour, and is not universally answered. Any Linux auto-mode is a
  guess — say so rather than shipping one.
- THIRD OPTION, which removes the problem on every platform INCLUDING Linux: theme-agnostic
  artwork — a silhouette with a contrasting outline or halo, legible on any background, making the
  setting DELETABLE rather than smarter. Honest cost: an outline consumes pixels and a stroked
  glyph can read muddier at 16px than a clean silhouette does against the background it was built
  for. Because the rasters are GENERATED by `meta/trayIconVariants.ts` from a hue-segmented mask,
  this is a GENERATOR PASS rather than a redraw, and the existing "refuses to write a
  byte-identical dark/light pair at any scale" gate would become a CONTRAST gate.
- RECOMMENDATION: tri-state `Auto` / `Light` / `Dark`, Auto as default. Auto works on Windows via
  the registry, macOS stays hidden, and the manual override stays meaningful on Linux where
  detection is unavailable — which is exactly what D-05 ("nothing ships an affordance it cannot
  honour") asks for. Main cost is a CONFIG MIGRATION: `darkTrayIcon` is a `boolean` at
  `src/common/types.ts:128`. IF ONLY ONE OPTION IS BUILT, the outlined artwork is the better buy —
  it is the only one that helps Linux.
- LIVE EVIDENCE, 2026-09-26, Windows 11: with the toggle ON, the black glyph is very hard to read
  against the default dark taskbar.
- SUPPORTING EVIDENCE FROM THE SAME SITTING, which sharpens the question rather than mooting it:
  both variants ARE legible against the taskbar each was designed for (black on a Light-mode
  taskbar, white on a Dark-mode taskbar — both operator-confirmed, see 38-W02's discharged
  result). So THE ARTWORK IS SOUND and the open question is purely WHO PICKS THE VARIANT. The
  setting working correctly is precisely why "should this be automatic at all" is live rather
  than moot.
- FOLD IN, no separate file: `src/frontend/screens/Settings/components/UseDarkTrayIcon.tsx:49`
  still passes the fallback label `'Use Dark Tray Icon (needs restart)'` while the shipped English
  string at `public/locales/en/translation.json:829` reads `"Use Dark Tray Icon"` and omits it —
  and the swap was live-confirmed IMMEDIATE this session, so "(needs restart)" is false. The
  fallback is stale and surfaces only if the translation key goes missing. (Note the corrected
  line number: 49, not 50.)
- `files:` should list `src-tauri/src/main.rs`, `meta/trayIconVariants.ts`,
  `src/frontend/screens/Settings/components/UseDarkTrayIcon.tsx`, `src/common/types.ts`,
  `src/backend/sidecar/appShellFlowRegistration.ts` and `public/locales/en/translation.json`.

Then stage ONLY these two new files, confirm with `git diff --cached --name-only`, and commit:

    docs(quick-260926-8j9): file the login-title reset and tray-glyph-selection todos

ending with the `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` line.
  </action>
  <verify>
    <automated>bash -c 'set -e; pnpm planning-gates; for f in .planning/todos/pending/2026-09-26-login-window-on-page-load-overwrites-the-composed-title.md .planning/todos/pending/2026-09-26-tray-glyph-variant-selection-is-manual-and-theme-blind.md; do [ -f "$f" ] || { echo "FAIL missing $f"; exit 1; }; grep -n "^severity: \|^platform: \|^ready: " "$f" | cut -d: -f1 | paste -sd, - | grep -Eq "^[0-9]+,[0-9]+,[0-9]+$" || { echo "FAIL keys in $f"; exit 1; }; python3 -c "import sys;ls=[int(x) for x in sys.argv[1].split(\",\")];sys.exit(0 if ls[1]==ls[0]+1 and ls[2]==ls[1]+1 else 1)" "$(grep -n "^severity: \|^platform: \|^ready: " "$f" | cut -d: -f1 | paste -sd, -)" || { echo "FAIL key ORDER/adjacency in $f"; exit 1; }; done; grep -q "^severity: minor$" .planning/todos/pending/2026-09-26-tray-glyph-variant-selection-is-manual-and-theme-blind.md; grep -Fq "SystemUsesLightTheme" .planning/todos/pending/2026-09-26-tray-glyph-variant-selection-is-manual-and-theme-blind.md; grep -Fq "PageLoadEvent::Started" .planning/todos/pending/2026-09-26-login-window-on-page-load-overwrites-the-composed-title.md; echo OK</automated>
  </verify>
  <done>Both todos exist, `pnpm planning-gates` is green, the three triage keys are present bare/lowercase and adjacent in severity->platform->ready order, and the two load-bearing technical tokens are present. One commit, two files.</done>
</task>

<task type="auto">
  <name>Task 5: Add the Sitting 4 block to 38-HUMAN-UAT.md</name>
  <files>.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md</files>
  <action>
Append a `## Sitting 4 — 2026-09-26, Windows 11, `tauri dev`` section at the end of the file,
matching the shape of the existing `## Sitting 2` (line 201) and `## Sitting 3` (line 262) blocks:
a bolded **Conditions.** paragraph, verbatim artifacts as four-space-indented code blocks, a
bolded per-item heading line, and a closing **Honest-limits paragraph.**

SITTINGS 1, 2 AND 3 ARE FROZEN HISTORY. Do not edit their bodies.

Content:
- **Conditions.** Windows 11, `tauri dev`, DEBUG build. Say "debug build" explicitly — it is what
  makes 38-W04/38-W05 (which need a CI-produced NSIS/AppImage artifact) still un-runnable while
  38-W01 could discharge.
- **`38-W01` — PASS.** All four custom-titlebar window operations (minimize / maximize / restore /
  close) with framelessWindow ON, each driving the real OS window as the equivalent native button
  would. FIRST LIVE CONFIRMATION after five sessions of static-only evidence (plan 34.1-09 +
  `windowControlsPlacement.test.ts`).
- **`38-W02` — PASS, all three legs.** (1) the swap is real and IMMEDIATE on toggle, no restart,
  beating the item's "~500ms" bar; (2) black glyph against a LIGHT taskbar reads as a cat
  (Windows switched to Light mode, toggle ON); (3) white glyph against a DARK taskbar reads as a
  cat (back to Dark mode, toggle OFF). Each variant judged against the taskbar it was designed
  for. Record that "dark glyph is hard to read on a dark taskbar", observed mid-sitting, is
  CORRECT behaviour and not a failure — same class as the item's own `watch_out`. Record that
  this is the first live confirmation `darkTrayIcon` does anything at all, per the item's
  `prior_state`.
- **`38-W03` — FAIL, accepted.** Reproduce the two verbatim terminal lines as an indented code
  block:

        [shell] humble_login_open: presentation requested visible=true width=900 height=700 center=true focus_once=true persistent_pin=false light_theme_requested=true sheet_presented=false
        [shell] humble_login_open: title change applied len=22

  Then, in prose: the bar read `https://www.humblebundle.com` and never became
  `https://www.humblebundle.com — Humble Bundle - Log In`; the hook FIRED (`len=22`), which is
  corroboration and not proof because the title string is never logged (T-34.4.1-106); root cause
  is the `on_page_load` origin-only reset at `main.rs:6491`, reached by elimination across the
  four title-setting sites, with THE EVENT ORDERING INFERRED, NOT OBSERVED, because that closure
  is macOS-gated-silent; operator accepted it as a deliberate deviation from WR-07's letter. Point
  to 38-W03's discharged entry in `38-VERIFICATION.md` for the full record rather than duplicating
  all seven components here.
- **THE OBSERVATION TRAP, recorded so the next sitting does not repeat it.** The full-colour cat
  on the Windows TASKBAR BUTTON is the APPLICATION icon and is NOT the tray glyph. The tray glyph
  lives in the notification area, which Windows 11 hides behind the `^` overflow chevron by
  default. The monochrome pair is proven by `src/backend/__tests__/trayIconAssets.test.ts:119-137`,
  which decodes pixels and asserts `isUniformFill(dark, 0)` (:125) and `isUniformFill(light, 255)`
  (:131) at 1x/2x/3x — so a coloured tray image is NOT REACHABLE from `tray_image()` at all.
  Keep this even though 38-W02 passed: it is what delayed the score, which makes it MORE valuable
  as a record, not less.
- **Honest-limits paragraph.** 38-W03's root cause is an inference from source, not a measurement;
  no instrument exists on Windows for that code path. 38-W01 and 38-W02's element-level
  observations are operator-reported (there is no log line for a window-manager action or a tray
  repaint) — what is machine-side is the `[shell]` scrollback for W03 and the pixel assertions in
  `trayIconAssets.test.ts` for W02's artwork premise, and neither substitutes for the operator's
  look. Name the todos filed from this sitting (Task 4's two files) and state that they are NOT
  resolved by any PASS recorded here.

THEN reconcile the file's own stale figures, following the precedent set by commit `5a0edd4a9`
(annotate and add, never rewrite frozen text):
1. Frontmatter `updated:` -> `2026-09-26`.
2. Append a fourth entry to the frontmatter `sessions:` array, matching the existing one-line
   string style: `"Sitting 4 -- 2026-09-26, Windows 11, tauri dev (debug build) -- 38-W01 PASS,
   38-W02 PASS, 38-W03 FAIL accepted by operator decision"`.
3. `## Current Test` (line 13): the bracketed paragraph currently says "Three sittings held" and
   "as of 2026-09-25 it holds 16 open items, 10 discharged, 10 retired". Update both to four
   sittings and 13 open / 13 discharged / 10 retired as of 2026-09-26, and point at the
   `## Sitting 4` section. Keep the paragraph's existing note about the earlier staleness intact.

Do NOT introduce any `### N.` numbered item, and never write `expected: |` anywhere — a block
scalar makes EVERY numbered item in a file invisible to `audit-uat`, and
`.planning/uat-visibility-gate.py` ratchets on exactly that.

Stage ONLY this file, confirm via `git diff --cached --name-only`, and commit:

    docs(quick-260926-8j9): add the sitting-4 session block to 38-HUMAN-UAT.md

ending with the `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` line.
  </action>
  <verify>
    <automated>bash -c 'set -e; F=.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md; grep -q "^## Sitting 4 " "$F" || { echo FAIL heading; exit 1; }; grep -q "^updated: 2026-09-26$" "$F" || { echo FAIL updated; exit 1; }; [ "$(grep -c "^  - \"Sit\|^  - \"Session" "$F")" = 4 ] || { echo FAIL sessions count; exit 1; }; grep -Fq "title change applied len=22" "$F" || { echo FAIL artifact; exit 1; }; grep -Fq "notification area" "$F" || { echo FAIL trap; exit 1; }; grep -q "expected: |" "$F" && { echo FAIL block scalar; exit 1; }; pnpm planning-gates; echo OK</automated>
  </verify>
  <done>A `## Sitting 4` block exists carrying all three results, the verbatim artifact and the taskbar-button trap; frontmatter `updated:` and `sessions:` reconciled; `## Current Test` figures corrected; `pnpm planning-gates` green. One commit, one file.</done>
</task>

<task type="auto">
  <name>Task 6: Walk the receipts back to both origin phases</name>
  <files>.planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-VERIFICATION.md, .planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/34.4.1-VERIFICATION.md</files>
  <action>
Relocation rule (3) is two-way: the origin keeps a receipt, and the receipt must record the
OUTCOME or it rots. Both receipts ALREADY EXIST and were located at plan time — do not create a
parallel key in either file. Add an `outcome:` to the EXISTING entry, copying the shape that quick
`260925-r8j` used on this same file's gamepad entry (a single `outcome:` key appended to the
entry, opening `DISCHARGED 2026-09-26 (quick \`260926-8j9\`, sitting 4).`).

**`34.1-VERIFICATION.md`**, array `human_verification_relocated:` at line 59. TWO of its three
entries need work:

1. ENTRY 1 — `test: "Window buttons — Windows/Linux — framelessWindow on, ..."`, already carrying
   `moved_as: "38-W01"` and `was_uat_item: "1a"`. Add `outcome:` recording: DISCHARGED PASS
   2026-09-26, sitting 4, Windows 11 `tauri dev` debug build, quick `260926-8j9`. All four window
   operations drove the real OS window. This is the FIRST LIVE CONFIRMATION and it closes this
   entry's own `note:`, which reads "Never live-confirmed in five sessions" — say so explicitly,
   as the return half of that sentence. The static fix (plan 34.1-09 + `windowControlsPlacement
   .test.ts`) is unaffected and still stands.

2. ENTRY 2 — `test: "Tray — Windows/Linux dark-tray-icon swap"`. THIS ENTRY NAMES NO ITEM ID: it
   has `moved_to: "Phase 38"` but neither `moved_as` nor `was_uat_item`, unlike entry 1. That is a
   pre-existing relocation-rule-(3) gap (the rule requires the receipt name the phase AND the item
   ID), not a deliberate omission — there is no `receipt_key_note` justifying it as there is on
   34.10's. Close it by ADDING, to the existing entry: `moved_as: "38-W02"` and
   `was_uat_item: "6d / Gap G3"` (sourced from 38-W02's own `origin_item`). Then add `outcome:`
   recording: DISCHARGED PASS 2026-09-26, sitting 4, quick `260926-8j9`, all three legs — the swap
   is immediate with no restart, the black glyph is legible against a Light-mode taskbar, the
   white glyph against a Dark-mode taskbar. This is the return half of this entry's own
   `why_moved:`, which states the artwork blocker was discharged on 2026-08-22 and "what remains
   is ONLY observe the swap on a Windows or Linux machine" — that observation has now happened and
   the prediction held. Also record the ID-gap closure itself in the `outcome:` text, in one
   sentence, so a future reader knows the two new keys were added on 2026-09-26 and are not
   original.

   Do NOT touch entry 3 (the gamepad entry) — its `outcome:` is `260925-r8j`'s and is complete.

**`34.4.1-VERIFICATION.md`**, array `human_verification_relocated:` at line 88, FIRST entry
(`test: "D-29-05 -- the login window's provisional title ..."`, carrying
**`item_id: "38-W03"`** — note this file uses `item_id`, NOT `moved_as`; leave that key spelled
as it is, do not normalise it). Add `outcome:` recording:
- DISCHARGED 2026-09-26 as a FAIL, ACCEPTED BY OPERATOR DECISION, sitting 4, quick `260926-8j9`.
  A FAIL discharges the item as legitimately as a PASS; the point was to learn the off-macOS
  behaviour.
- The origin half IS satisfied and always was — the bar showed `https://www.humblebundle.com`
  from presentation and never read "Tauri app", so plan 34.4.1-33's `.title(login_window_title(
  &origin, None))` works as built and WR-07's prohibition on a hard-coded application title is
  intact.
- What FAILED is the document-title half: `on_page_load` at `main.rs:6491` resets to origin-only
  on both `Started` and `Finished`, overwriting the composed title. Root cause reached BY
  ELIMINATION across four title-setting sites; THE EVENT ORDERING IS INFERRED, NOT OBSERVED,
  because that closure's only `eprintln!` is macOS-gated.
- THE SPECIFICATION CORRECTION, which matters most on this side: this entry's own `test:` text
  says the origin "then gives way to the document's own title". That is WRONG about the code and
  has been corrected in 38-W03's `expected:` — `login_window_title` (`main.rs:2069`) APPENDS the
  document title after the origin, never substitutes it, deliberately and security-load-bearingly
  (T-34.5-G6-23). Leave the entry's original `test:` prose intact as the historical record and
  carry the correction in `outcome:`, so provenance is preserved — the same in-place-correction-
  with-provenance habit used elsewhere in this repo.
- The follow-up todo is filed (name the file from Task 4) and the operator's accept decision is
  recorded there too, so this does not read as missed.
- Do NOT touch the second entry in that array (the Epic-logout re-home to Phase 34.6).

Stage ONLY these two files, confirm via `git diff --cached --name-only`, and commit:

    docs(quick-260926-8j9): record sitting-4 outcomes on the 34.1 and 34.4.1 relocation receipts

ending with the `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` line.
  </action>
  <verify>
    <automated>bash -c 'set -e; A=.planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-VERIFICATION.md; B=.planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/34.4.1-VERIFICATION.md; [ "$(grep -c "^    outcome: " "$A")" = 3 ] || { echo "FAIL 34.1 outcome count $(grep -c "^    outcome: " "$A") (want 3)"; exit 1; }; grep -Fq "moved_as: \"38-W02\"" "$A" || { echo "FAIL 38-W02 id not added"; exit 1; }; grep -Fq "38-W01" "$A"; [ "$(grep -c "^    outcome: " "$B")" = 1 ] || { echo "FAIL 34.4.1 outcome count"; exit 1; }; grep -Fq "item_id: \"38-W03\"" "$B" || { echo "FAIL item_id key was renamed"; exit 1; }; grep -c "^human_verification_relocated:" "$A" | grep -q "^1$"; grep -c "^human_verification_relocated:" "$B" | grep -q "^1$"; echo OK</automated>
  </verify>
  <done>Three `outcome:` keys in 34.1 (two new plus `260925-r8j`'s gamepad one), one in 34.4.1; `moved_as: "38-W02"` added to the tray receipt; `item_id: "38-W03"` left spelled as it was; no parallel `human_verification_relocated` key created in either file. One commit, two files.</done>
</task>

<task type="auto">
  <name>Task 7: STATE.md row, then the final verify gate</name>
  <files>.planning/STATE.md</files>
  <action>
Append ONE row to the `### Quick Tasks Completed` table in `.planning/STATE.md`. The header is at
line 1124 and the final existing row is `260925-uok` at line 1563. Rows are FIVE cells:
`| # | Description | Date | Status | Directory |`. Match that cell count exactly.

Row content: id `260926-8j9`; description covering — the Phase 38 Windows sitting closed out with
three items discharged (`38-W01` PASS, `38-W02` PASS, `38-W03` FAIL accepted by operator decision);
that a FAIL discharges as legitimately as a PASS and W03's value is the recorded off-macOS
behaviour, not a green tick; that W03's root cause (the `on_page_load` origin-only reset at
`main.rs:6491` running on both `Started` and `Finished`) was reached BY ELIMINATION and its event
ordering is INFERRED, NOT OBSERVED, because the closure's only `eprintln!` is macOS-gated —
completely silent on Windows; that W03's `expected:` was CORRECTED in place as a specification
correction, not a re-score, because `login_window_title` APPENDS the document title after the
origin rather than replacing it (T-34.5-G6-23, deliberate and security-load-bearing); that W01 and
W02 are both FIRST LIVE CONFIRMATIONS of behaviour that was previously only statically gated, and
for W02 the first proof `darkTrayIcon` does anything at all after the pair was byte-identical for
the project's entire history; that the 34.1 tray receipt was found to name Phase 38 but NOT the
item ID, a pre-existing relocation-rule-(3) gap now closed by adding `moved_as: "38-W02"`; and
that two todos were filed (login-title reset, tray-glyph auto-selection). Date `2026-09-26`.
Directory link to `.planning/quick/260926-8j9-phase-38-windows-sitting-close-out/`, matching the
markdown-link style used by the surrounding rows.

ROADMAP.md is NOT touched.

Write the row BY HAND. Do not use `gsd-sdk state-write`.

Then run the FINAL VERIFY GATE below and paste its output into the task record before committing.
Do NOT claim any prettier check anywhere in this task's commit or in the summary: `.prettierignore`
lists `.planning`, this plan wrote only `.planning/` files, and a `prettier --check` over them
passes vacuously — it was verified at plan time that a malformed probe file under `.planning`
passes at exit 0. Say that plainly instead.

Stage ONLY `.planning/STATE.md`, confirm via `git diff --cached --name-only`, and commit:

    docs(quick-260926-8j9): record the sitting-4 close-out in STATE.md

ending with the `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` line.
  </action>
  <verify>
    <automated>bash -c 'set -e; grep -q "^| 260926-8j9 |" .planning/STATE.md || { echo FAIL row; exit 1; }; awk -F"|" "/^\\| 260926-8j9 \\|/{print NF-2}" .planning/STATE.md | grep -q "^5$" || { echo FAIL cell count; exit 1; }; PYTHONIOENCODING=utf-8 npx gsd-sdk query audit-uat > /tmp/audit.json 2>/dev/null; PYTHONIOENCODING=utf-8 node -e "const d=JSON.parse(require(\"fs\").readFileSync(\"/tmp/audit.json\",\"utf8\"));const p=d.results.find(r=>r.phase===\"38\");if(!p){console.log(\"FAIL phase 38 vanished from the audit\");process.exit(1)}if(p.status!==\"human_needed\"){console.log(\"FAIL status is \"+p.status);process.exit(1)}if(p.items.length!==13){console.log(\"FAIL phase 38 open count is \"+p.items.length+\" want 13\");process.exit(1)}if(d.summary.total_items!==38){console.log(\"FAIL grand total is \"+d.summary.total_items+\" want 38\");process.exit(1)}const bad=p.items.filter(i=>/^Window buttons|^Tray |^Login window provisional title/.test(i.name));if(bad.length){console.log(\"FAIL discharged item still open: \"+bad.map(b=>b.name.slice(0,40)).join(\" ; \"));process.exit(1)}console.log(\"AUDIT OK: phase38=13 total=38 status=human_needed\")"; F=.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md; D=$(grep -n "^human_verification_discharged:" "$F" | cut -d: -f1); for id in 38-W01 38-W02 38-W03; do L=$(grep -n "  - id: \"$id\"" "$F" | cut -d: -f1); [ "$L" -gt "$D" ] || { echo "FAIL $id not discharged"; exit 1; }; done; H=$(grep -n "^human_verification:" "$F" | cut -d: -f1); S=$(grep -n "^sweep_notes:" "$F" | cut -d: -f1); [ "$(awk -v h="$H" -v s="$S" "NR>h && NR<s && /^  - id: /" "$F" | wc -l)" = 13 ] || { echo "FAIL human_verification array is not 13 entries"; exit 1; }; pnpm planning-gates; echo "FINAL GATE OK"</automated>
  </verify>
  <done>STATE.md carries one 5-cell row for `260926-8j9`; `audit-uat` reports phase 38 at 13 open with `status: human_needed` and a grand total of 38; none of the three discharged prose strings appears in the open list; the `human_verification` array literally holds 13 `- id:` entries; `pnpm planning-gates` green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| ledger -> `audit-uat` | The tool parses this file leniently and FAILS SILENTLY in two directions: a `status:` other than `human_needed` yields zero items with no error, and an entry left in `human_verification` with a `result:` field still counts as open. Both failures read as success. |
| concurrent sessions -> `main` | Another session is committing into this repo today. A `git commit -a` or an unchecked staged set would absorb its work into a docs commit. |
| plan prose -> ledger prose | The 38-W03 record's value is entirely in distinctions (inferred vs observed, corroboration vs proof, accepted vs passed) that a fluent paraphrase erodes without tripping any syntactic check. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-8j9-01 | Tampering | `38-VERIFICATION.md` `status:` | mitigate | Every task's verify greps `^status: human_needed$`; the final gate re-asserts it via the tool itself. |
| T-8j9-02 | Repudiation | discharge by annotation | mitigate | Tasks 1/2 and the final gate assert each id's line number is GREATER than the `human_verification_discharged:` key's line, which an in-place `result:` cannot satisfy. |
| T-8j9-03 | Information disclosure | 38-W03 `result:` honesty | mitigate | Task 2's grep gate over the extracted 38-W03 block requires 14 disclosure tokens plus the target title string; a paraphrase that drops "INFERRED, NOT OBSERVED", "CORROBORATION ONLY, NOT PROOF", "SPECIFICATION CORRECTION"/"NOT A RE-SCORE" or the operator-decision framing fails the task. |
| T-8j9-04 | Tampering | concurrent-session commits | mitigate | Every commit task runs `git diff --cached --name-only` first and asserts the exact file set; Task 3's verify asserts `git show --name-only HEAD` is exactly one path. |
| T-8j9-05 | Denial of service | cp1252 console | mitigate | Gates print ASCII-only labels; the one `node`/`python3` invocation sets `PYTHONIOENCODING=utf-8`. No gate echoes an em-dash or arrow. |
| T-8j9-06 | Spoofing | vacuous formatter check | accept | `.prettierignore` lists `.planning`; no formatter gate is included and no task may claim one. Recorded as an accepted absence, with the reason, rather than papered over with a green check that proves nothing. |
| T-8j9-SC | Tampering | npm/pip/cargo installs | accept | This plan installs NOTHING. `npx gsd-sdk` and `pnpm planning-gates` invoke tooling already pinned in this repo. No Package Legitimacy Gate applies. |
</threat_model>

<verification>
Run after all tasks. This is the FINAL VERIFY GATE and must be run explicitly, not inferred from
per-task greens.

1. `npx gsd-sdk query audit-uat` reports phase 38 with `status: human_needed` — unchanged.
2. Phase 38 open count is EXACTLY 13, down from the 16 measured at plan time.
3. Grand total is EXACTLY 38, down from 41. A FLAT count after a removal means the edit did not
   register or the array failed to parse — the single most important signal in this whole plan.
4. `human_verification_discharged` gains EXACTLY `38-W01`, `38-W02` and `38-W03`, and the
   `human_verification` array literally holds 13 `- id:` entries between its key and `sweep_notes:`.
5. None of the three discharged items' `test:` prose appears in the audit's open list.
   CROSS-REFERENCE BY PROSE, NEVER BY POSITION: the audit drops `id:` and emits positional
   integers, and this array is in ARRIVAL order — before this change, positions 1/2/3 were W02,
   W01, W03 (measured), so position 1 was never W01 and after this change becomes W04.
6. `pnpm planning-gates` passes (todo frontmatter + UAT visibility).
7. NO prettier check is run and none is claimed. `.prettierignore` lists `.planning`; this plan
   wrote only `.planning/` files; a `prettier --check` over them is vacuous.
8. `git log --oneline -5` shows five `docs(quick-260926-8j9):` commits, each touching only its own
   files, each ending with the Co-Authored-By attribution line.
</verification>

<success_criteria>
- Phase 38 open count 16 -> 13, grand total 41 -> 38, `status: human_needed` unchanged.
- 38-W01 PASS, 38-W02 PASS, 38-W03 FAIL-accepted, all three MOVED into
  `human_verification_discharged` with every pre-existing field preserved.
- 38-W03's `expected:` states the APPEND contract and names
  `https://www.humblebundle.com — Humble Bundle - Log In`, labelled a specification correction.
- 38-W03's `result:` survives the 14-token disclosure gate.
- `## Sitting 4` block present; sittings 1-3 byte-unchanged.
- Both origin receipts carry an `outcome:` on their EXISTING entry; the 34.1 tray receipt also
  gains the item ID it never had.
- Two pending todos pass the frontmatter gate.
- One STATE.md row. ROADMAP.md untouched.
- Zero changes under `src/`, `src-tauri/`, `meta/`, `public/`.
</success_criteria>

<output>
Create `.planning/quick/260926-8j9-phase-38-windows-sitting-close-out/260926-8j9-SUMMARY.md` when
done. The summary MUST record: the four line-reference corrections this plan made against its
own briefing (`UseDarkTrayIcon.tsx:49` not `:50`; `trayIconAssets.test.ts:125,:131` not `:119`;
`main.rs:6358` for the applying `set_title` and `:6282-6288` for the WR-07 comment, not `:6283`);
the relocation-rule-(3) ID gap found on 34.1's tray receipt; and the fact that no formatter check
was run, with the reason.
</output>

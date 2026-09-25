---
status: resolved
trigger: "Mouse clicks no longer open Dropdown disclosures on Windows — the Steam install caret AND the library nav expanders are both dead to the mouse while the gamepad opens them normally"
created: 2026-09-26
updated: 2026-09-26
source_todo: .planning/todos/completed/2026-09-26-mouse-click-no-longer-opens-dropdown-disclosures.md
platform: windows
---

## Symptoms

- expected: On Windows, one mouse click on the `MainButton` Steam install caret opens the
  "Install with options…" panel; one mouse click on a library nav tier-2 filter group
  (`NavShell`) expands it.
- actual: Neither opens by mouse. The caret chevron never rotates (it is `-90deg` while
  `aria-expanded='false'`, `GamePage/index.css:370-374`), so `setIsExpanded` never commits.
  The gamepad opens both surfaces normally.
- errors: none reported.
- timeline: Worked — the prior session `.planning/debug/resolved/steam-caret-dropdown-dead.md`
  was fixed by `3a0e62918` (2026-09-24) and VERIFIED LIVE over CDP on this Windows machine that
  day. Observed broken 2026-09-26 in Phase 38 sitting 5 (quick 260926-a1l) on `59df4c1b6`,
  `pnpm tauri:dev` debug build. The fix is still in HEAD. Gamepad focus collector was modified
  between 2026-09-24 and 2026-09-25 (quicks 260925-9de, -ms5, -m5i, -qe5).
- reproduction: `pnpm tauri:dev` on Windows 11; open a Steam game's page, click the install
  caret; or click any library nav tier-2 filter dropdown.

## Candidate mechanisms (from the todo, neither established)

1. onBlur self-cancellation: `toggle()` dispatches `window.api.gamepadAction({action:'tab'})`
   before `setIsExpanded(next)`; if `doTab` now lands focus outside the container, the container
   `onBlur` (`Dropdown/index.tsx:62-66`) fires `setIsExpanded(false)` in the same batch. Gamepad
   path bypasses `toggle()`, which would explain the split.
2. The click never reaches the handler (hit-testing / overlay).

Ruled out at the desk: `0475e74bd` (CSS scoped to game cards); no residue from the
260925-op0/-r8j GAMEPAD-ACT probe in `src/preload/api/tauriGamepadInput.ts`.

## Live recipe (reusable from the prior session)

Launch `pnpm tauri:dev` with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`,
attach over CDP, MutationObserver on trigger `aria-expanded`, wrap `window.api.gamepadAction`,
dispatch real `Input.dispatchMouseEvent` at the control centre. Discriminator: does a `focusout`
with `inside=false` arrive between click and state commit? Cheap pre-step: Tab to the caret +
Enter — opens by keyboard but not mouse ⇒ candidate 2; dead both ways ⇒ candidate 1.

This is the Windows machine, so the live gate is available in-session.

## Current Focus

- hypothesis: CONFIRMED — sitting 5 exercised a stale installed build whose embedded frontend
  predates `3a0e62918`; HEAD is not regressed.
- next_action: none in code. Operator: close or replace the stale install before the next
  sitting (see the follow-up todo filed from this session).

```yaml
reasoning_checkpoint:
  hypothesis: "The mouse-dead Dropdowns in sitting 5 are the ALREADY-FIXED toggle() batching self-cancellation, running from the 2026-09-24 07:34 installed exe's embedded bundle, not a regression in HEAD."
  confirming_evidence:
    - "The running instance's served App chunk contains `o=()=>{i||window.api.gamepadAction({action:\"tab\"}),s(l=>!l)}`, the pre-fix functional updater."
    - "Same machine, same profile, same CDP click: installed build gives no aria-expanded mutation; `pnpm tauri:dev` at HEAD gives `MUT aria-expanded=true`, with an otherwise identical focus sequence."
    - "gamelib.log for sitting 5 names GAMELIB_SHELL_EXE = the installed exe and carries sitting 5's own 38-S02/38-W06 work plus [GAMEPAD-AXIS] output that only a stale bundle can emit."
  falsification_test: "HEAD under tauri:dev staying dead to a CDP click. It did not: it opened on the first click on both surfaces."
  fix_rationale: "No code change. The code fix is already in HEAD and was verified live again today. The remedy is operational (do not test against the stale install), plus a tooling decision filed as a todo."
  blind_spots: "The operator did not click HEAD with a physical mouse in this session. CDP Input.dispatchMouseEvent is the browser input pipeline, as accepted in the 2026-09-24 session. Who launched the installed exe at 05:43, and whether a later `pnpm tauri:dev` was bounced into it, is not recorded. The record shows only that sitting 5's work ran in that process."
```

## Evidence

- timestamp: 2026-09-26
  checked: `git diff 3a0e62918 HEAD` over src/preload, gamepad.ts, Dropdown, NavShell, GamePage
  found: tauriGamepadInput.ts differs by ONE blank line (doScroll). gamepad.ts only removes the
  HID dump and passes `controller.mapping`. Dropdown/index.tsx is unchanged since the fix. NavShell
  facet changes are i18n-only (`count` plural). The quicks 260925-9de/-ms5/-m5i/-qe5 did not touch
  `doTab`/`getFocusableElements`.
  implication: Candidate 1's premise ("where doTab lands may have changed") has no code change
  behind it. Either the cause is outside these files or environmental; live capture required.

- timestamp: 2026-09-26
  checked: launched `pnpm tauri:dev` with CDP env for the live gate
  found: the dev shell built, then printed `[shell] another GameLib instance is already running --
  sending focus sentinel to it and exiting` / `granted foreground rights to the running instance
  (pid=12812)`. pid 12812 is `C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe` (the
  INSTALLED shell, v0.7.0, mtime 2026-09-24 07:34:20), started 2026-09-26 05:43:39 from a VS Code
  PowerShell terminal, child sidecar `node <repo>/src-tauri/../build/main/sidecar.js` (the
  compile-time CARGO_MANIFEST_DIR path from `resolve_sidecar_entry()`, main.rs:7823, so the backend
  is the repo's current build/main while the FRONTEND is whatever was embedded into that exe).
  No dev server is listening; the webview loads the exe's embedded assets.
  implication: a `pnpm tauri:dev` launched while this instance is up never shows its own window —
  it focuses the installed build and exits. New hypothesis H1: sitting 5 exercised the installed
  2026-09-24 07:34 build, whose embedded frontend predates the fix `3a0e62918` (2026-09-24 20:25).

- timestamp: 2026-09-26
  checked: `%LOCALAPPDATA%\GameLib\logs\gamelib.log` (the log sitting 5 itself cites for 38-W06),
  grepped only for bootstrap/identity lines and probe tags (no session data copied)
  found: the log begins 05:43:56 with `GAMELIB_SHELL_EXE received=C:\Users\grays\AppData\Local\
  GameLib\gamelib-shell.exe`, and contains sitting 5's own work — Avadon 2 (233310, 38-S02) at
  06:47 and the five `SUPPORTED_NONEMPTY` cookie censuses (38-W06) at 07:10 — in that ONE process.
  It also carries `[Frontend] [GAMEPAD-AXIS] index=… value=…` lines (07:20) from the HID_DUMP
  diagnostic added in 84a44811d (2026-09-23 20:52) and removed in 0978dba81 (2026-09-24 22:07),
  and `[BLANKPROBE]` lines.
  implication: H1 strongly supported by the machine-side record (confirmed directly in the next
  entry). Sitting 5 ran the installed shell, not a
  debug build of `59df4c1b6`, and its frontend bundle is from the window 2026-09-23 20:52 ..
  2026-09-24 22:07 — bracketed by the exe mtime at 07:34 on the 24th, i.e. BEFORE 3a0e62918.
  That bundle carries the pre-fix `setIsExpanded((prev) => !prev)`, whose self-cancellation on
  WebView2 kills every Dropdown whose first Tab target is its own panel — which is both the caret
  and every NavShell filter group, the exact two surfaces reported. The gamepad path never calls
  toggle(), hence the split. Next: prove it over CDP on both builds.

- timestamp: 2026-09-26
  checked: stopped pid 12812. Its node sidecar (pid 14896) did NOT drain-exit within ~25s of the
  shell's death and was stopped by hand. Relaunched the SAME installed exe with
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` on the real profile. This
  is the deliberate real-profile arm of the two-profile rule, because the surfaces need a
  populated library. Fetched every loaded JS resource from `http://tauri.localhost/` and searched
  for `action:"tab"`.
  found: `App-CZYqt-JD.js`: `function nf({title:e,children:t,className:n,buttonClass:r}){const[i,s]
  =c.useState(!1);Dl(i);const o=()=>{i||window.api.gamepadAction({action:"tab"}),s(l=>!l)};...`.
  That is the PRE-FIX functional updater. A real CDP `Input.dispatchMouseEvent` on the NavShell
  "Store" filter group (97,341; elementFromPoint hits the button) gave `mousedown
  SPAN.FilterFacetGroup__title -> focusin BUTTON.dropdownButton -> click -> gamepadAction
  {"action":"tab"} -> focusout inside=true -> focusin BUTTON.FilterFacetRow`, and NO
  aria-expanded mutation. Final state `aria-expanded=false`, `dropdown collapsed`.
  implication: the symptom reproduces on the stale build with exactly the 2026-09-24 signature
  (focus stays inside, the expand never commits). Candidate 1 (onBlur, focus leaving) is refuted
  by `inside=true`. Candidate 2 (the click never arrives) is refuted because the handler runs.

- timestamp: 2026-09-26
  checked: stopped the installed instance and ran `pnpm tauri:dev` (HEAD `73803b8e5`, Vite on
  :5173) with CDP, on the same profile, with the same instrumentation and the same clicks.
  found: NavShell "Store" group: the same event sequence as the stale build, then `MUT#1
  aria-expanded=true`, final `dropdown expanded`. GamePage for 752590 (A Plague Tale: Innocence,
  owned, not installed; reached via the library card link): caret 82x44 at (316,727). One click
  gave `mousedown svg -> focusin BUTTON.dropdownButton -> click -> gamepadAction tab -> focusout
  inside=true -> focusin "Install with options…" -> MUT#0 aria-expanded=true`. The panel is
  `dropdown expanded`, and elementFromPoint at the option's centre returns the option.
  implication: HEAD is NOT regressed. Both reported surfaces open on one mouse click on Windows
  WebView2. The build is the only thing that differs between the dead run and the live run.

- timestamp: 2026-09-26
  checked: `npx jest src/frontend/components/UI/Dropdown`
  found: 26/26 pass. That includes the two 2026-09-24 cases that were RED against
  `prev => !prev`.
  implication: the responsible code condition is already pinned by the describe block `Dropdown
  opens when the synthetic Tab focuses its own panel (steam-caret-dropdown-dead)`. A third case
  would duplicate it. What went wrong in sitting 5 is which binary ran, and no jest test can
  observe that, so no test was added.

## Eliminated

- hypothesis: "onBlur self-cancellation: doTab now lands outside the container"
  evidence: "Live on both builds, the synthetic Tab lands on the panel's first child (`focusout inside=true`). The focus collector is unchanged since 3a0e62918 apart from one blank line."
  timestamp: 2026-09-26

- hypothesis: "the click never reaches the handler (hit-testing or an overlay)"
  evidence: "elementFromPoint at the control's centre returns the button, and `gamepadAction tab` fires from inside toggle() on the dead build."
  timestamp: 2026-09-26

- hypothesis: "HEAD regressed the 3a0e62918 fix"
  evidence: "`pnpm tauri:dev` at HEAD opens both surfaces on one CDP click, and the stale bundle carries the pre-fix code."
  timestamp: 2026-09-26

## Resolution

- root_cause: Not a regression. Sitting 5 did not run HEAD. It ran the INSTALLED shell at
  `%LOCALAPPDATA%\GameLib\gamelib-shell.exe` (mtime 2026-09-24 07:34). That exe's EMBEDDED
  frontend predates `3a0e62918` (2026-09-24 20:25), so `Dropdown.toggle()` still uses the pre-fix
  `setIsExpanded(prev => !prev)`. That is the already-diagnosed WebView2 batching
  self-cancellation (`resolved/steam-caret-dropdown-dead.md`). It kills every Dropdown whose first
  synthetic-Tab target is inside its own panel, which covers both the caret and the NavShell
  filter groups. The gamepad path never calls toggle(), hence the split. The run was mislabelled
  as a debug build of `59df4c1b6` for three reasons. The exe loads the repo's
  `build/main/sidecar.js` (a compile-time path). It writes the same
  `%LOCALAPPDATA%\GameLib\logs\gamelib.log`. So backend and log evidence look current while the
  frontend and shell are two days old. And the single-instance guard makes any `pnpm tauri:dev`
  started alongside it hand focus to it and exit.
- fix: None in code. `3a0e62918` is in HEAD and was verified live again today. A follow-up todo
  covers the stale-install trap and the build labels of sitting 5 (and possibly sitting 4):
  `.planning/todos/pending/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md`.
- verification: Live on this Windows 11 machine, 2026-09-26, with real CDP
  Input.dispatchMouseEvent on the real profile. Stale installed build: the NavShell Store group is
  DEAD (no aria-expanded mutation), and the served bundle shows the pre-fix updater.
  `pnpm tauri:dev` at HEAD: the Store group opens on one click, the GamePage caret for 752590
  opens on one click, and "Install with options…" is painted and hittable. Dropdown jest suite
  26/26.
- files_changed: [] (planning docs only)

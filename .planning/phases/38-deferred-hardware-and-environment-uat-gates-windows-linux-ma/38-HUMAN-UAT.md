---
status: not_started
phase: 38-deferred-hardware-and-environment-uat-gates-windows-linux-ma
source: [38-VERIFICATION.md, 38-CONTEXT.md, 34.1-HUMAN-UAT.md items 1a and 7, 34.10-VERIFICATION.md deferred[0]]
created: 2026-08-22
updated: 2026-09-06
sessions: []
---

## Current Test

[not started — no hardware sitting yet. 17 items in scope, 0 discharged, 9 retired as
unscoreable (Phase 35 removed the Electron build they described), 9 relocated to Phases 42
and 43 (plan 38-01, 2026-09-06).]

> **`38-VERIFICATION.md` is the authoritative item list, not this file.** `gsd-sdk query
> audit-uat` reads that file's `human_verification` array and **cannot see `*-HUMAN-UAT.md`
> files at all**. A result recorded only here changes nothing downstream. Record observations
> here for narrative and artifacts; move the entry in `38-VERIFICATION.md` to discharge it.

## Scope

**17 items, one sitting family, on a Windows host.** Phase 38 narrowed on 2026-09-06 (plan
`38-01`) to Windows-plus-controller items only; the Linux-only items and the off-macOS
embed-backend questions moved to Phases 42 and 43 respectively. The prior version of this
section enumerated `38-C01` … `38-C05` and described "two independent sittings" — both stale as
of the same repair; see Corrections below.

- **Five W items:** `38-W01`, `38-W02`, `38-W03`, `38-W04`, `38-W06` — window chrome, tray icon,
  login-window title, the CI-produced NSIS installer smoke-launch, and off-macOS Epic logout.
- **Seven controller items:** `38-C01`, `38-C02`, `38-C03`, `38-C04`, `38-C05`, `38-C06`, `38-C08`
  — gamepad focus/navigation/scroll across the console routes, the library, and the tier-2 filter
  panel, plus the Tauri half of the D-21 install-options-caret reachability check.
- **Five S items:** `38-S02`, `38-S06`, `38-S08`, `38-S14`, `38-S16` — Steam quick-install and the
  section-gating matrix on a Windows host, Tauri runtime only (the Electron halves of each pair
  were retired in `38-VERIFICATION.md` as unscoreable; `38-S16` is now narrowed to the Windows
  row-5 branch, with the Linux row-7 half minted as `38-S17` in Phase 42).

**Two notes for whoever sits this:**

- **`38-C07` was retired, so `38-C08` has lost its comparison arm.** The two were specified to
  run back-to-back on the same game under identical library state. Run `38-C08` alone, against
  the game the operator would have used for both — there is no Electron result left to compare
  it against.
- **`38-S08` needs a SECOND registered Steam library on the Windows host**, or it is
  unscoreable. `hasChoice` (native Steam installs ON **and** >1 registered library) cannot be
  produced with only one library present.

### Corrections made by plan `38-01` (2026-09-06)

This section previously reported a header count in the single digits (from the phase's original
2026-08-22 seeding) and enumerated `38-C01` … `38-C05` as if the controller items were the whole
ledger. Both were stale — the ledger had grown to 34 items by 2026-09-04 and was never brought
back here. It also asserted the controller items were runnable immediately on the macOS
development machine — see the next section for why that claim does not hold.

## GameLib runs on two different browser engines, and they disagree about gamepads

**The controller items are a WINDOWS sitting, not a macOS one.** GameLib runs in WKWebView on
macOS and WebView2 (Chromium) on Windows, and the two engines disagree about which gamepads
exist. The PowerA Advantage Wired for Nintendo Switch 2 (`0x20D6` / `0xA720`) is read by
Chromium and returns **0 slots** in WebKit; macOS classes the device correctly at the OS level
(`DeviceUsagePage=1` / `DeviceUsage=5`, `AppleUserHIDEventDriver`), so this is an **engine
difference, not a pairing failure** — the pad is genuinely connected and recognized by macOS,
WebKit's `navigator.getGamepads()` simply never surfaces it. Steam Input exclusivity was
**ruled out** as an alternative cause by a complete Steam-running / Steam-quit 2x2 (all four
combinations tested, all four returned the same WebKit-empty / Chromium-populated result).

**Conclusion:** the seven controller items (`38-C01`–`38-C06`, `38-C08`) must be run on the
Windows host, in the same sitting as the W and S items, not separately and not on macOS.
`src/frontend/helpers/gamepad_layouts/nintendo.ts:69`'s deliberately widened third-party-pad
predicate — which goes beyond upstream Heroic's narrow vendor match specifically to admit
devices like the PowerA pad — has never been exercised anywhere, on any platform, because no
prior phase has had both a controller and a Chromium-backed webview available at the same time.

## Before the sitting

1. **Re-derive the gamepad action list from the code.** `src/frontend/helpers/gamepad.ts` and
   `src/frontend/helpers/gamepad_layouts/nintendo.ts` were under active modification as recently
   as 2026-08-22. Do not run against the action list as written in Phase 34.1 — read the current
   source and enumerate what exists at sweep time. A gate literal here would go stale by
   BEHAVIOUR long before the hardware sitting happens.
2. **Do not attempt any gamepad item at a keyboard.** `gamepadAction` is dispatched only from the
   `navigator.getGamepads()` polling loop (`gamepad.ts:559,678`), so keyboard input never reaches
   `src/preload/api/tauriGamepadInput.ts`. `38-C03` is the trap: its wording says "Tab/Shift+Tab"
   and reads keyboard-runnable. It is not.
3. **Route evidence through `logInfo`, into the Windows log path.** On Windows, GameLib's log
   file lives at `%LOCALAPPDATA%\GameLib\logs\gamelib.log`
   (`src/backend/logger/paths.ts:16` — `join(localAppData, 'GameLib', 'logs')`). This CORRECTS
   the prior version of this step, which named the macOS path
   (`~/Library/Logs/GameLib/gamelib.log`) — kept below only as a labelled aside for any future
   macOS sitting, since this project's macOS host cannot run any of this phase's remaining
   17 items. A raw `console.*` call from the renderer stays in the DevTools/Web-Inspector panel
   and never reaches disk on either platform.
   - *macOS aside, not applicable to this sitting:* `~/Library/Logs/GameLib/gamelib.log`.
4. **DevTools-console input capability is UNDER RE-TEST on this engine, not assumed (D-38-15).**
   The claim "GameLib's DevTools console accepts no input — paste fails and Enter does not
   submit" was measured on **WKWebView**. WebView2's DevTools is Edge DevTools and plausibly
   accepts paste and Enter; if it does, probes can be evaluated interactively instead of
   round-tripping every check through the `logInfo` listener, which is materially cheaper across
   17 items. Plan `38-03` re-tests this on WebView2 before the sitting proper and records the
   answer here **either way** — carrying a macOS-derived constraint onto a different engine
   without evidence is the same rot as the `blocked_by: "a Windows machine"` values that stood
   false in `38-VERIFICATION.md` for ten days.
5. **Prove each branch was armed before recording a pass.** An item whose code path never
   executed is indistinguishable, in every green result, from one that passed. See
   "Recording protocol" below for the template this produces.

## Recording protocol

Implements D-38-16: an item moves to `human_verification_discharged` **only** with both
(a) positive evidence the code path under test actually executed — a log line, a rendered
element, a state change, quoted verbatim — and (b) the operator's PASS or FAIL. Both go into a
dated session block in this file. **An item whose code path never executed is indistinguishable,
in every green result, from one that passed** — this is the rule the template below implements,
not merely documents.

Session block template, to be copy-pasted and filled per sitting:

```
### Session YYYY-MM-DD — <host, runtime, commit sha>

Item: <38-XXX id>
Armed: <verbatim evidence the branch under test actually executed — a log line, a rendered
  element's exact text/attribute, a state transition observed in DevTools, quoted, not
  paraphrased>
Observed: <what the operator actually saw, in their own words>
Verdict: PASS | FAIL
Artifact: <path to the log file, or a screenshot reference>

Item: <next id>
...
```

## Blocking constraints

Carried here from `.planning/.continue-here.md` so a sitting operator does not need to find that
file separately. All four are load-bearing for this specific sitting.

1. **An instrument must prove its own liveness before its output counts (D-38-17).** A probe page
   built during the 2026-09-06 session was missing its closing `</script>` tag. It rendered fine,
   sat on its initial status string, and produced **four confident, void** "the pad is dead"
   readings across two browsers and two origins before the defect was found. Mitigation: any
   diagnostic surface built during this sitting must carry a **visibly-changing heartbeat**, and
   must be verified end-to-end **headlessly** (e.g. `--headless --dump-dom`, or equivalent)
   **before a human is asked to read it**.
2. **Never pipe a command whose exit code you intend to trust.** `git push | tail` reported exit
   0 for a push that FAILED; a background-task notification separately reported "completed (exit
   code 0)" for the same failed push. Run the bare command, or capture `${PIPESTATUS[0]}`
   explicitly, before treating any command's success as fact.
3. **Never use `git checkout -- <file>` to restore a file in this repo.** This repo's
   post-checkout hook runs `pnpm i` and `download-helper-binaries`, and throws. Restore a file's
   prior content with `git show HEAD:<path> > <path>` instead.
4. **This sitting runs `pnpm tauri:dev`, never bare `tauri dev`.** Bare `tauri dev` serves a
   stale static bundle, which would silently re-test old behaviour and falsely discharge items
   against code that no longer runs.

## Out of scope

**Any source change to fix a defect the sitting uncovers.** Phase 38 observes; it does not
repair what it observes. A FAIL discovered during the sitting is recorded verbatim in the
Recording protocol template above, and separately filed as a new todo under
`.planning/todos/pending/` — it is not fixed inline, and it is not left unfiled.

## Results

None yet. Add a dated session block here (see "Recording protocol" above) when the first
sitting happens, then move the corresponding entries in `38-VERIFICATION.md` from
`human_verification` to `human_verification_discharged` — annotating in place does not work,
because the audit counts array membership and ignores any `result:` field.

---
phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we
plan: 11
type: live-gate
status: draft
blocking: true
created: 2026-09-04
verdict: NOT YET RUN
run_date: NOT YET RUN
items_total: 3
items_passed: NOT YET RUN
notes: |
  Authored by the plan-40-11 Task 1 executor, BEFORE any live run took place. Per this
  plan's `autonomous: false` and Task 2's `checkpoint:human-verify gate="blocking"`, the
  run itself is performed by a human operator (or an agent explicitly resumed past that
  checkpoint) — never by the agent that authored this contract. No verdict, pass/fail,
  percentage, or narrative outcome may be written into this file until that run actually
  happens. Every RESULT slot below reads "NOT YET RUN" until then. Author and runner are
  deliberately separated so this contract cannot grade its own homework.
---

# Phase 40 Plan 11 — Live Gate: Embedded Store Suppression, Feel, and Resize (macOS)

## Scope

Three items, none of them satisfiable by jest or a screenshot judged by eye:

1. **D-33's suppression gesture** — the one gesture that proves the suppression hook, the
   placeholder, hide/show, and the geometry sync work together on real hardware.
2. **Input and scroll feel** inside the embed — a human-judgment item.
3. **Drag-resize latency** — a human-judgment item.

This contract is written before any of the three has been run. It is a test, not a report.

## Binding decisions carried into this contract

- **D-18/D-19/D-20** — `StoreEmbedSuppressionContext`, a reference-counted suppression
  context; `useSuppressStoreEmbed()` (mount-lifetime) and `useSuppressStoreEmbedWhile(active)`
  (value-gated) are its two consumer hooks.
- **D-24** — chrome (`StoreEmbedControls`) renders above the measurable slot div via CSS
  grid (`grid-template-rows: auto 1fr`), never a percentage height.
- **D-33** — the one live gesture: open a store tab, trigger an overlay that acquires
  suppression, confirm the embed hides and the placeholder shows, dismiss, confirm the
  embed returns to the same rect.
- **D-29** — `store_embed_navigation_policy` blocks `gamelib://` inside the embed and hands
  off `window.open`/downloads to the system browser via `open_external`; not exercised by
  this gate directly but relevant to Item 1's "trigger an overlay" step if the operator
  strays into embed-internal navigation instead of the named UI control.
- **D-04 / Phase 38** — `add_child` is macOS-only (`unstable` cargo feature, gated under
  `[target.'cfg(target_os = "macos")'.dependencies]`). This gate can only ever exercise the
  macOS code path; see the non-closure statement below.
- **D-G1 (this contract, new)** — the plan's own interfaces block names "the login warning
  dialog" as an example trigger for Item 1's overlay. Source investigation performed while
  authoring this contract (recorded in full under Test 7 below) found that trigger to be
  dead code, and substitutes a verified-reachable one: the "Redeem a Steam key" action in
  the Stores tier-2 panel, which opens `RedeemSteamKeyDialog`. This substitution is a
  same-mechanism swap (both are `Dialog`-based, both call `useSuppressStoreEmbed()`) made
  because the plan's own example was not implementable as written, not a change to what
  D-33 tests.

## Structural Reachability Review

Applying `live-gate-contract-authoring.md` Section 2's seven defect-class tests to this
contract's own items, before any of them is run.

### Test 1 — Origin/scheme reachability

Not applicable in the login/cookie sense Section 2 illustrates it with. The one scheme
consideration in scope: Item 1's overlay trigger must not require the embed to navigate to
an unusual origin — it does not. `RedeemSteamKeyDialog` is a renderer-only overlay; it makes
no embed navigation at all. **No finding.**

### Test 2 — Concurrency reachability (platform modality)

`add_child` is compiled only under `cfg(target_os = "macos")` (D-04). There is no Windows or
Linux code path for any of these three items to race against — the modality question Test 2
usually asks (is the code path reachable at this moment, on this platform) collapses to "this
platform is macOS, or this gate does not run at all." Recorded as a precondition, not a race.
**No finding beyond the platform precondition already stated in Preconditions below.**

### Test 3 — Log-line emitter reachability (with the SINK clause)

Checked every renderer- and Rust-side call site behind `store_embed_hide`,
`store_embed_show`, and `store_embed_set_bounds`:

- Rust (`src-tauri/src/main.rs`): `store_embed_hide`, `store_embed_show`, and
  `store_embed_set_bounds` all return `Ok(Value::Null)` silently on success.
  `eprintln!("[shell] ...")` fires ONLY on error paths (child-webview construction failure,
  a poisoned history registry, a blocked in-embed navigation) — never on a successful
  hide/show/bounds call.
- Sidecar (`src/backend/store/storeEmbedSeam.ts`, `storeEmbedFlowRegistration.ts`): same
  shape — `console.warn`/`logWarning` only on a malformed response or error, nothing on
  success.
- Renderer (`src/frontend/screens/WebView/useStoreEmbedHost.ts`): the only
  `window.api.logInfo` call sites in this file are on error/guard paths — a caught
  exception, a null slot-ref guard, a failed `storeEmbedOpen` call. None fires on a
  successful `flush()` (the debounced bounds-sync function), and the bounds values it
  sends are never logged even on the paths that do log.

**Finding, binding on Item 1's evidence design:** there is no literal, in either sink, that
fires on a successful hide, show, or bounds-sync call. A contract that asked the operator to
grep for one would be asking for something that does not exist — indistinguishable, per
Test 3, from an emitter whose sink is never captured. **Item 1's pass condition therefore
rests entirely on the three window-targeted screenshots and their pixel measurements, never
on a log-line assertion for the hide/show/bounds mechanics themselves.** The evidence-capture
instruction still archives both sinks in full (Section 3 of the reference requires this
unconditionally, and the archived logs remain useful for catching an unexpected ERROR line),
but no PASS condition below cites an expected literal for a successful suppression call.

### Test 4 — Absence-observability

Directly downstream of Test 3's finding. "The embed is hidden" cannot be proven by the
absence of a log line — nothing logs on success, so absence proves nothing (Section 2's own
rule: an absence check over a code path that logs nothing on success proves nothing).
**Item 1's middle capture must instead show a POSITIVE observable**: the placeholder
component rendered and filling the slot's rect, AND the store page content visibly absent
from that same rect in the captured window image. Both halves are required — a capture that
merely fails to show store content (e.g., a black rect, a crash) is not evidence of the
placeholder; it must show the placeholder's own rendered content.

### Test 5 — Requirement-interaction reachability (the PAIR test)

**Reduction applied, stated explicitly per the reference's requirement:** the pass considers
every {state-mutating requirement} in this contract against every {evidence-bearing
requirement} in this contract. State-mutating set (M = 2): {Item 1's overlay open/dismiss},
{Item 3's window drag-resize}. Evidence-bearing set (N = 3): {Item 1's rect-match pass
condition (captures A vs B)}, {Item 1's placeholder-visible pass condition (the middle
capture)}, {Item 3's measured resize duration}. M×N = 6 pairs considered:

1. **Item 1 overlay-open × Item 1 rect-match — FLAGGED.** Opening the overlay (which hides
   the embed, per D-33) destroys the very thing capture A measured. **Mitigation already
   built into the gesture ordering**: capture A is taken BEFORE the overlay opens, capture B
   is taken AFTER it closes; the pass condition compares A and B, never asks for a capture
   taken while the overlay is open. This is the exact pairing the plan's own text calls out
   (planning_findings item 8) and it is satisfied by sequencing, not by avoidance.
2. **Item 1 overlay-open × Item 1 placeholder-visible — not destructive.** The middle
   capture is deliberately the one taken while the overlay is open; this pair is the
   mechanism the item tests, not a hazard to it.
3. **Item 1 overlay-open × Item 3 resize duration — no interaction.** Opening/closing a
   Dialog does not resize the window. Nothing flagged.
4. **Item 3 resize × Item 1 rect-match — FLAGGED.** A window resize changes the slot's
   `getBoundingClientRect()` output (`useStoreEmbedHost.ts`'s `ResizeObserver` exists
   precisely because of this). If Item 3 ran before Item 1, Item 1's "capture A" baseline
   would no longer describe the window's resting geometry. **Mitigation: sequence Item 1
   entirely before Item 3** (stated in the Launch Plan below), and treat Item 1's captures A
   and B as consumed once Item 3 begins — no later item may cite them as still valid.
5. **Item 3 resize × Item 1 placeholder-visible — no interaction post-sequencing.** Once
   Item 1 has fully completed (dismissed, re-shown, captures taken) before Item 3 starts,
   there is no live placeholder state left for a resize to disturb.
6. **Item 3 resize × Item 3 resize duration — not a pair, same requirement.** Excluded from
   the M×N count; listed only to show it was considered and correctly excluded.

**Additional pair outside the strict M×N grid, considered because Test 6 requires naming the
premise's external-state dependency and Test 5 requires checking whether anything in this
contract clears it:** {Item 1's precondition that `steam.username` is truthy} × {every other
requirement in this contract}. No item in this contract logs the Steam session out, clears
the Steam config store, or restarts the app between items. **Considered, nothing flagged.**

**Sequencing conclusion, binding on the Launch Plan:** Item 1 runs first, on an unresized
window, in full (open → hide capture → dismiss → re-show capture). Item 2 (scroll/click/type
feel) runs second — it does not resize the window and does not open a suppressing overlay,
so it does not need to precede or follow Item 1 for correctness, but running it after Item 1
avoids re-deriving the login precondition a second time. Item 3 (drag-resize) runs last,
because it is the one operation in this contract that invalidates a prior item's geometry
evidence.

### Test 6 — Pre-existing external-state reachability

**Item 1 and Item 2's shared premise** — "the operator is logged into Steam, so the Redeem-a-
-key control is present and a real store page loads" — depends on external state (the Steam
session held by `steam-user`/`steam-session`, per this project's steam-session/steam-user
stack) that this contract's own preflight cannot silently assume. Per Test 6's general rule
("an emptied app-side store does not prove a logged-out session," and by the same logic here,
a *populated* one does not by itself prove a logged-*in*, *reachable* session), the
precondition below requires a POSITIVE observable: the Steam username/avatar actually
rendered in the app's account surface, and the "Redeem a Steam key" row actually visible in
the Stores tier-2 panel (it is conditionally rendered on `steam.username`,
`StoresPanel/index.tsx`) — not merely "a config file exists" or "the user says they're logged
in." See Preconditions.

**Item 2's embed-internal state**: the WKWebView cookie jar is shared by default (per
`tauri-embedded-store-browser.md`'s cookie section) and could auto-fill a Steam store session
inside the embed independent of the app's own Steam auth. This does not invalidate Item 2 (it
does not depend on being logged out of anything), but it is named here because a future
reader might mistake Item 2's embed session for the app-level Steam session Item 1 depends
on — they are two different sessions in two different cookie/credential stores.

**External-state surface for all three items**: a leftover `gamelib-shell` process from a
prior session. Covered by the single-instance assertion in the Evidence-Capture Instruction,
not by anything item-specific.

### Test 7 — UI-level reachability, distinct from backend-logic reachability

**This is where the plan's own suggested gesture failed, and the central finding of this
contract's authoring pass.**

The plan's interfaces block names, as its example overlay trigger, "the login warning
dialog." Tracing that gesture to the component that renders it:

- `src/frontend/screens/Login/components/LoginWarning/index.tsx` renders a `Dialog` with
  `className="notLoggedIn"`, but its `warnLoginForStore` prop type is
  `null | 'epic' | 'gog' | 'amazon' | 'zoom'` — **Steam is not a member of that union.** Even
  granting a different store, its actual render site matters more:
- `src/frontend/screens/WebView/index.tsx` computes `showLoginWarningFor` /
  `onLoginWarningClosed` state from a `startUrl` regex match, but **there is no
  `<LoginWarning>` JSX anywhere in that file's return** — the variables are referenced only
  to satisfy the linter (`void showLoginWarningFor`-style dead reference), not rendered.
- A full-tree grep for `<LoginWarning` across `src/frontend/` returns **zero matches**.

**Conclusion: `LoginWarning` cannot be triggered by any operator gesture, because the
frontend does not render it anywhere. This is exactly the class of defect Test 7 exists to
catch before a run** — the reference's own worked example (F-34.4.2-17) is a gesture that
was backend-reachable but frontend-unreachable; this one is backend-*nonexistent* on the
render side, an even more complete version of the same failure mode.

**Every other named D-33 suppression consumer was checked for the same defect**, tracing
each to its render site and the route/state it needs:

- **`Dropdown`** — consumers are `GamePage/components/MainButton.tsx` and
  `Library/components/FilterFacetGroup` (a Games-tab tier-2 panel row). Neither is mounted
  on a `/store/*` route. Reaching either requires navigating away from the store screen,
  which (per `NavShell/index.tsx`'s `activeTab = resolveActiveTab(location.pathname)`) is a
  route change and would independently unmount the store screen's `<Outlet/>` content —
  confounding Item 1's causal story (the embed would be gone because the route changed, not
  because the suppression hook fired). **Rejected as Item 1's trigger.**
- **`NavShellTour`** — "manual-start only," reachable only via a launcher row inside
  `SettingsPanel`, itself only rendered when the active route is a Settings route. Same
  navigate-away problem as `Dropdown`. Its `disableInteraction: true` step behavior also
  makes returning to the store screen mid-tour unreliable. **Rejected.**
- **`HumbleExpiryToast`** — mounted globally, route-independent (`App.tsx`'s `Root()`), but
  its render condition depends on the authenticated account actually holding a real,
  near-expiry Humble key. Not a gesture an operator can reliably invoke on demand
  regardless of test-account state. **Rejected as unreliable, not as unreachable.**
- **`ExternalLinkDialog`** — also mounted globally and also `Dialog`-based (would suppress
  correctly if reached), but its only call site for
  `handleExternalLinkDialog(...)` is inside `SettingsPanel` — same navigate-away problem as
  `Dropdown`/`Tour`. **Rejected.**
- **`StoreEmbedControls`'s "open in browser" button** — persistent chrome, zero navigation
  required, but its `onClick` (`WebView/index.tsx`: `onOpenInBrowser={() =>
  window.api.openExternalUrl(embedHost.currentUrl)}`) calls `openExternalUrl` directly, with
  no confirmation `Dialog` in between. **Rejected — does not open any overlay at all.**
- **`RedeemSteamKeyDialog`, triggered by the "Redeem a Steam key" row in `StoresPanel`
  (`src/frontend/components/UI/NavShell/components/StoresPanel/index.tsx`) — ACCEPTED.**
  This row is `elementType="button"` with an `onClick={() => handleRedeemKeyDialog(true)}` —
  not a `NavItem url=...` link, so clicking it does not navigate and does not change
  `location.pathname`. `StoresPanel` itself is the tier-2 panel already showing whenever
  `activeTab === 'stores'`, which is exactly the tab active while the current route is
  `/store/*` — so the row is visible and clickable while the operator is already looking at
  the Steam store embed, with no route change at any point. `RedeemSteamKeyDialog` (mounted
  globally in `App.tsx`, a sibling of `<Outlet/>` inside `StoreEmbedSuppressionProvider`)
  renders via `<Dialog onClose={resetAndClose} showCloseButton>` (`Dialog` component at
  `src/frontend/components/UI/Dialog/components/Dialog.tsx:78`, which calls
  `useSuppressStoreEmbed()` unconditionally on mount — the same suppression hook every other
  named consumer uses). Its own "Close" button (`resetAndClose`) dismisses it, releasing
  suppression. Precondition: `steam.username` must be truthy (the row's own render guard,
  `{steam.username && (...)}`), which doubles as the Test 6 positive observable named above.

**Gesture, as actually reachable, replacing the plan's example verbatim in Item 1 below.**

## Evidence-capture instruction

Sink partition — restated so no item is written against the wrong sink:

- Rust `[shell]`-prefixed `eprintln!` lines reach the packaged binary's stdout/stderr, and
  therefore the session transcript ONLY (never `gamelib.log`).
- Sidecar `logInfo`/`logWarning` reach `~/Library/Logs/GameLib/gamelib.log` ONLY.
- Sidecar stderr reaches the transcript, to be prefixed `[sidecar:err]` when it appears.
- Sidecar `console.*` reaches nothing capturable — do not expect it in either sink.
- Per this contract's own Test 3 finding above: **no successful hide/show/bounds-sync call
  emits anything into either sink.** Both sinks are still archived per launch (below), but no
  item's PASS condition cites an expected literal for that mechanism.

**0. Single-instance assertion — before launch, at window-appearance, at teardown.**

Before launch:
```
pgrep -f 'gamelib-shell'
```
must return nothing. A non-empty result means STOP and resolve it before launching.

After the window appears, record the PID into the transcript, not only to screen:
```
pgrep -f 'gamelib-shell' | tee -a "$GATE_SESSION_DIR/terminal.log"
```
At teardown, record it again with the identical command. If the count is ever not exactly 1
at any of these three points, the launch is ABORTED and re-run; nothing from an aborted
attempt is archived or cited as evidence.

**1. One session directory per run**, created once before the first launch:
```
GATE_SESSION_DIR="/tmp/gamelib-gate-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$GATE_SESSION_DIR"
```

**2. Launch delimiter**, written before each launch, into the same appended file:
```
echo "=== GATE LAUNCH ${N} — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$GATE_SESSION_DIR/terminal.log"
```
A reader locates a launch's section with `grep -n '^=== GATE LAUNCH' "$GATE_SESSION_DIR/terminal.log"`.

**3. The launch command — build the packaged binary, not the dev shell.**

`pnpm tauri:dev` serves a stale static bundle and exits 0 without replacing a running
instance; `pnpm tauri:dev:packaged` runs `tauri build --debug`, which ships a debug SEA
sidecar that has already been shown to diverge from the real packaged sidecar on this
project. Neither is acceptable evidence for a live gate. Build a genuine release package:

```
pnpm exec vite build \
  && pnpm build:sidecar-sea \
  && pnpm build:decompress-worker-dev \
  && pnpm exec tauri build \
  2>&1 | tee -a "$GATE_SESSION_DIR/terminal.log"
```

This produces `src-tauri/target/release/bundle/macos/GameLib.app`. Record its build
timestamp (`stat -f '%Sm' src-tauri/target/release/bundle/macos/GameLib.app`) and the exact
commit hash the build was made from, into the Environment block below before the first
launch. Launch it directly — never through `open`, which can silently resolve to a
previously-installed copy in `/Applications` instead of the freshly-built bundle:
```
"src-tauri/target/release/bundle/macos/GameLib.app/Contents/MacOS/gamelib-shell" \
  2>&1 | tee -a "$GATE_SESSION_DIR/terminal.log" &
```

**4. `gamelib.log` archive — per launch, before the next launch's first write rotates it.**
```
cp ~/Library/Logs/GameLib/gamelib.log "$GATE_SESSION_DIR/gamelib-launch-${N}.log"
```
Must run before the next launch produces its first log write — `log_writer.ts:72-74` renames
the current file to `.old` on that writer's first write, and a copy taken after that point
would be empty or would silently pick up the wrong file. Archive any pre-existing `.old` file
on the very first pass too, in case it holds evidence from before this session began.

**5. Window capture — by window id, never full-screen, never through the web inspector.**

Full-screen `screencapture` has repeatedly missed the app window in prior sessions on this
project (wrong display, occlusion, unrelated windows swept in), and the web inspector
console has been observed wedged-but-appearing-responsive. Neither is used here. Use
interactive, click-to-select window capture, which needs no window id and no console:
```
screencapture -o -w "$GATE_SESSION_DIR/<item>-<step>.png"
```
then click the GameLib window when the cursor changes to the camera icon. `-o` omits the
window shadow so the captured rect matches the window's actual content bounds for pixel
measurement. Capture files must not be dotfiles (a dotfile destination causes `screencapture`
to write nothing and exit 0, silently producing a run with no evidence).

**6. Closing inventory**, at session end:
```
ls -la "$GATE_SESSION_DIR/"
wc -l "$GATE_SESSION_DIR"/*
```
A missing or zero-length capture must be visible here, during the run, not discovered later.

**7. Reading the slot's rect — a correction to the plan's own interfaces text.** The plan's
interfaces block says to read the slot's reported rect "from the on-disk renderer state,
never through the web inspector console." Source investigation while authoring this contract
(`useStoreEmbedHost.ts`) found no on-disk or otherwise persisted store of the sent bounds —
`flush()` reads `slot.getBoundingClientRect()` and sends it directly to
`storeEmbedSetBounds`/`storeEmbedOpen`; nothing writes it to disk or logs its value. There is
therefore no artifact matching the plan's literal instruction. This is not a blocker: the
plan's own stated pass condition for Item 1 ("the embed's rect in capture B matches capture A
within one logical pixel") is a pure screenshot-to-screenshot comparison and needs no
persisted rect value at all. Capture A, taken while the embed exactly fills the slot (D-19/
D-24's design guarantee), stands in as the externally observable baseline. This correction is
recorded here rather than silently substituted, per this project's practice of logging
declared-dead instructions instead of quietly working around them.

## Preconditions

- [ ] Platform: macOS (host running this gate). `add_child` has no Windows/Linux code path
      (D-04); a non-macOS host cannot run this gate at all.
- [ ] A release build exists per the Evidence-Capture Instruction's step 3, built from a
      known commit, with its timestamp recorded below.
- [ ] Zero pre-existing `gamelib-shell` processes (Section 0's pre-launch check).
- [ ] The app's Steam session is authenticated: the operator visually confirms a rendered
      Steam username/avatar in the app's account surface (not merely a config file's
      presence) AND confirms the "Redeem a Steam key" row is visible in the Stores tier-2
      panel before starting Item 1 (Test 6's positive-observable requirement).
- [ ] Display scale factor is recorded (`osascript` or System Settings > Displays), because
      every spike measurement behind this phase was taken at scale factor 1.0, and retina
      (2.0) rounding behavior is explicitly unmeasured — see the non-closure statement.
- [ ] No screen recording / capture tool is targeting a dotfile destination anywhere in this
      run (Evidence-Capture step 5).

## Environment (fill in at run time — empty until the gate is run)

| Field | Value |
|---|---|
| Build command used | NOT YET RUN |
| Commit hash built from | NOT YET RUN |
| Binary path | NOT YET RUN |
| Binary/bundle timestamp | NOT YET RUN |
| macOS version | NOT YET RUN |
| Display scale factor | NOT YET RUN |
| No-prior-instance confirmation | NOT YET RUN |
| Session directory (`$GATE_SESSION_DIR`) | NOT YET RUN |

## Launch plan

Per Test 5's sequencing conclusion: Item 1 first (in full, before any resize), Item 2 second,
Item 3 last (it is the one operation that invalidates a prior item's geometry evidence).

| Order | Item | Launch ordinal | Resets window state? |
|---|---|---|---|
| 1 | Item 1 — D-33 suppression gesture | Launch 1 | No |
| 2 | Item 2 — input/scroll feel | Launch 1 (same session, no relaunch needed) | No |
| 3 | Item 3 — drag-resize latency | Launch 1 (same session) | Yes — window resized; run last |

A single launch covers all three items unless a crash or an aborted single-instance check
forces a relaunch, in which case increment the launch ordinal and re-run only the item(s)
whose evidence that launch was covering.

## Items

### Item 1 — D-33 suppression gesture

**Precondition:** Steam-authenticated session, positively confirmed per the Preconditions
section above (not assumed from config-file presence).

**Gesture** (replaces the plan's example trigger with the Test-7-verified one; steps
otherwise follow the plan's interfaces block exactly):

1. Launch the packaged build. Navigate to the Steam store route (`/store/steam`) — a route
   with a real page load, not a placeholder screen.
2. Wait for the embed to finish loading and visually fill the slot.
3. **Capture** (window capture, per Evidence-Capture step 5):
   `item1-capture-A.png` — embed visible, filling the slot. This is geometry evidence A.
4. Click "Redeem a Steam key" in the Stores tier-2 panel (visible in the sidebar while on
   `/store/*`; requires no navigation).
5. **Capture:** `item1-capture-B-overlay.png` — the embed must be HIDDEN and the placeholder
   must be visible, filling the slot.
6. Dismiss the dialog via its "Close" button.
7. **Capture:** `item1-capture-C.png` — embed visible again, same rect as capture A. This is
   geometry evidence B (named "capture C" in filenames to preserve the three-shot sequence;
   it is the "capture B" the plan's pass condition refers to).

**Evidence required:**
- All three window-targeted captures (`item1-capture-A.png`, `item1-capture-B-overlay.png`,
  `item1-capture-C.png`), each with a recorded capture timestamp.
- Pixel measurement of the embed's/placeholder's rendered rect in each capture, using the
  captured image's own pixel coordinates (a ruler/measurement pass over the PNG — e.g. by
  opening it in Preview and reading pixel coordinates, or by a measurement script run over
  the PNG — either is acceptable; the method used must be recorded).
- The archived `gamelib.log` and terminal transcript for the covering launch (Section 3's
  finding: neither is expected to contain a literal for the hide/show mechanics themselves,
  but both are archived and checked for any unexpected ERROR/WARN line).

**Pass condition:**
- Capture A: embed visibly fills the slot with no placeholder content visible.
- Capture B (the middle, overlay-open capture): the embed is absent from the slot's rect and
  the placeholder's rendered content fills that same rect — both halves required (Test 4).
- Capture C: the embed is visible again, and its measured rect matches capture A's measured
  rect **within one logical pixel** (justification: `tauri-embedded-store-browser.md`
  records integer px round-tripping exactly and fractional CSS px rounding to the nearest
  whole logical px with no cumulative drift, at scale factor 1.0 — this run's own recorded
  scale factor must be checked against that basis before applying the tolerance as-is; if
  this run measures at a scale factor other than 1.0, record the discrepancy rather than
  silently applying the same tolerance).
- No unexpected ERROR/WARN line appears in either archived sink for the covering launch.

**RESULT: NOT YET RUN**

### Item 2 — Input and scroll feel

**Precondition:** Item 1 has completed (window not yet resized, per the Launch Plan).

**Gesture:** On the same Steam store route, with a real store page loaded inside the embed:
scroll a real store page inside the embed; click at least one in-page link; type into the
store's own search field; perform a trackpad two-finger scroll and observe momentum/inertia
behavior, if a trackpad is available on the test hardware (record whether a trackpad was
available; if not, state that momentum scrolling could not be evaluated on this run rather
than silently skipping the check).

**Evidence:** A screen recording of the gesture (captured via `screencapture -V` targeting
the same window-click method as step 5's still captures, or an equivalent screen-recording
tool available on the test hardware — record which was used), plus the human operator's
verbatim verdict.

**Pass condition:** The human operator's judgment, recorded verbatim, not paraphrased into a
pass/fail by the agent. This item defines no numeric threshold — per the plan's own
instruction, no automated check and no screenshot can answer whether input and scroll feel
correct; only a human on real hardware can.

**RESULT: NOT YET RUN — human verdict not yet collected.**

### Item 3 — Drag-resize latency

**Precondition:** Items 1 and 2 have both completed. This item runs last because it is the
one operation in this contract that invalidates a prior item's captured geometry (Test 5).

**Gesture:** Drag the application window's edge across a range that substantially changes the
embed slot's width, in both directions (wider then narrower), once slowly and once quickly.

**Evidence:**
- The measured wall-clock duration of the resize handler's bounds-sync sends, if obtainable
  without the web inspector console — e.g. by timestamping the archived transcript/log
  entries bracketing the resize, if any exist, or by the operator's own stopwatch/recording
  timestamps if no such log entries exist (per this contract's Test 3 finding, no log entry
  is guaranteed to exist for a successful bounds-sync call; do not block this item on finding
  one that may not be there).
- A screen recording of the resize gesture (same recording method as Item 2).
- The human operator's verbatim verdict on perceived latency/lag.

**Pass condition:** The human operator's judgment, recorded verbatim. As with Item 2, this
item defines no numeric threshold the agent cannot measure — the agent's job is to make the
gesture unambiguous and capture what is capturable, not to invent a pass/fail number.

**RESULT: NOT YET RUN — human verdict not yet collected.**

## ITEM VERDICT SUMMARY

| Item | Result |
|---|---|
| 1 — D-33 suppression gesture | NOT YET RUN |
| 2 — Input/scroll feel | NOT YET RUN |
| 3 — Drag-resize latency | NOT YET RUN |

## Teardown record

NOT YET RUN. To be filled in at run time: final `pgrep -f 'gamelib-shell'` result (must be
0), closing inventory output (`ls -la`, `wc -l` over `$GATE_SESSION_DIR`).

## Non-closure statement (binding, mirrors ROADMAP.md's Phase 38 ledger from this side)

**A macOS PASS recorded in this gate does not close Phase 38's `38-E03` or `38-E04`.**
`38-E03` and `38-E04` were filed (plan `40-10`) to hold the retina/`scale_factor` 2.0 and
drag-resize-latency questions open for non-macOS-host/hardware verification. This gate's
Items 1 and 3 verify retina-adjacent geometry and drag-resize behavior on exactly ONE macOS
test host, at whatever scale factor that host happens to run at (recorded in the Environment
block above once run). It does not establish behavior on any other host, any other scale
factor, or any non-macOS platform. This statement mirrors `40-VERIFICATION`/`38-VERIFICATION`'s
own anti-conflation note from this artifact's side, so the non-closure is recorded in both
places rather than depending on a reader finding only one of them. `38-E01` and `38-E02`
(Windows/Linux `add_child` feasibility) are unaffected by this gate entirely — no code path
exists for this gate to exercise on those platforms regardless of outcome here.

## PASS bar for the contract as a whole

All three items must record a RESULT (a measured PASS/FAIL for Item 1, a verbatim human
verdict for Items 2 and 3) before this contract's frontmatter `status` may move from `draft`
to `complete`. A single item's failure does not by itself fail the other two — each item's
RESULT stands on its own evidence. The `verdict` field may only be set once every item below
carries a non-placeholder RESULT; setting it earlier is exactly the failure mode Task 2 of
this plan exists to prevent (an auto-mode or an agent answering its own human-verify gate).

## Threat-to-item map

| Threat | Item | Note |
|---|---|---|
| T-40-11-01..07 (Elevation of Privilege: auto-mode answering its own checkpoint) | All | This document's own `verdict`/RESULT fields are the surface those threats target; every one of them is left as "NOT YET RUN" by the author of this contract for that reason. |
| T-40-11-SC (no npm/pip/cargo installs in this plan) | Evidence-Capture step 3 | The build command uses only existing `package.json` scripts (`vite build`, `build:sidecar-sea`, `build:decompress-worker-dev`, `tauri build`) and installs no new package. |

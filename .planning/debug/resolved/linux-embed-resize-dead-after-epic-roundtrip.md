---
status: resolved
trigger: "S1_CONTROL: Linux store embed stops following window resizes after GOG->Epic->GOG plus an in-embed link click"
created: 2026-09-30
updated: 2026-09-30
---

## Current Focus

reasoning_checkpoint:
  hypothesis: "Window resize stops moving the embed after GOG -> Epic -> GOG because useStoreEmbedHost's bounds effect is keyed on a ONE-WAY latch (`slotPresent`), so when the same mounted WebView swaps its slot div out (Epic early return) and a NEW one in, the ResizeObserver, the window resize/scroll listeners and flush()'s closed-over `slot` all stay bound to the DETACHED div; flush() then reads a detached node's rect (0,0,0x0) and sends it, which the Linux shell drops with 'ignored zero-area bounds'."
  confirming_evidence:
    - "2x2: Epic round trip alone fails (x0 same-launch before/after, e1, e2), link click alone passes (l2, l3), both fails (b1, b2), neither passes (n1); the trigger is the Epic round trip only."
    - "Shell log: exactly one 'ignored zero-area bounds' per window resize and zero settled lines; the only shell path printing that is w==0||h==0 (main.rs:5662), so the renderer really sent a zero rect (the shell is not dropping valid rects)."
    - "Unit reproduction on the UNFIXED hook: test 21 (slot A -> null with the latch high, then window resize) received storeEmbedSetBounds {0,0,0,0} twice; test 20 shows the live observer still bound to the old element. Both red before the fix, green after, red again under a one-way-latch mutation."
    - "Code: App.tsx:249 has ONE 'store/:store' route so WebView does not remount; index.tsx early-returns for epic so the slot div unmounts; the latch never lowers (its own comment says so)."
  falsification_test: "After re-keying the effect on the slot element identity, the Epic-round-trip arm must show a settled line per resize with embed==requested and flush 0,0; if it still shows zero-area lines and no settled lines the hypothesis is wrong."
  fix_rationale: "The effect's lifetime must equal the lifetime of the element it observes. Keying on the element (set on every attach AND detach by the callback ref) disconnects the dead observer/listeners on unmount and observes the new element on remount, whose first observation sends the real rect. It keeps plan 40-11's property (a same-store URL change does not change the element, so the observer is not re-created) and the CR-02 late-open behaviour."
  blind_spots: "Live post-fix verification is blocked: the host X server wedged (amdgpu atomic commit stuck on a dma_fence, kernel hung-task at 12:04) after my f1 launch. macOS not run (Linux-only host). The first post-fix live launch (f1) settled the return and the first resize (1100x650) correctly but produced no line for the 2nd/3rd resize; that coincides with the start of the GPU hang and is unproven either way."
  candidate_causes:
    - "code: effect keyed on a one-way latch (chosen, confirmed by unit reproduction + 2x2)"
    - "code: Rust zero-area guard dropping valid rects (ruled out: renderer really sends 0,0,0x0)"
    - "environment: X/WM not delivering resize (ruled out: n1/l*/pre-trigger resizes all worked in the same launches)"
    - "data: none; fresh fake profile every launch"
  and_gate: "no. The Epic round trip alone reproduces it and reverting the latch keying alone re-breaks the unit test; there is no second contributing condition (the link click is not part of it)."

test: post-fix live arms (DONE 2026-10-01, see Post-fix live verification)
expecting: settled line per resize, embed==requested, flush 0,0, no zero-area lines
next_action: none; fix committed d71269c2a and verified live

## Symptoms

expected: after any sequence of store route changes and in-embed navigation, resizing the window makes the renderer re-measure the slot, send a new rect, and the embed follow (a `[shell] store_embed(linux): settled ...` line per resize, embed == requested rect, flush with the window edges).
actual: in the feh launch `s1` (GOG -> Epic -> GOG, then an in-embed link click), resizing the window to 1100x650 (and 1000x600) produced ZERO settled lines. Four `ignored zero-area bounds (slot unmounted)` lines appeared, one at each resize instant. The embed stayed at 204,82 1076x718 and overhung the 1100x650 window (evidence/s1/resize-1100x650-after-e4b-e5.png).
errors: none; the only log signal is the `ignored zero-area bounds (slot unmounted)` line, once per resize.
timeline: found 2026-09-30 in quick 260930-feh (branch quick-260930-feh, commit 63a187936 addendum; results in .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/evidence/results.txt, S1_CONTROL=FAIL). The zero-area-rect guard was added in quick 260930-blh (fix 2) and the route-return re-show in fix 1; both are Linux-only in src-tauri/src/main.rs store_embed_open / store_embed_set_bounds.
reproduction: dev build, X11, WEBKIT_DISABLE_DMABUF_RENDERER unset, fresh createFakeHomeProfile. Harness: .planning/quick/260930-feh-*/gate_live.ts (+ evidence/s1, s1b). Sequence: open GOG store tab, go to Epic (a 'not available in-app yet' panel, no embed), back to GOG, click a link inside the embed, then resize the window. CONTROL: a fresh launch doing tracer -> the same resizes (s1b) gave 6/6 passing settled lines. HiDPI and drag launches also resize correctly, so plain resize works; the two triggers (Epic round trip vs link click) were NOT separated.

## Evidence

- feh SUMMARY and results.txt: S1_CONTROL FAIL; s1b control PASS.
- Not yet established: whether the renderer's ResizeObserver still fires and sends zero rects (slot element unmounted/detached, observer bound to a dead node) vs the shell dropping valid rects; which of the two triggers is sufficient.

## Eliminated

- Plain resize being broken in general (s1b, HiDPI and drag launches resize correctly).
- Inspector race / DMABUF (fixed in 260930-ea0; feh ran unset with 0 blank launches).

## Resolution

root_cause: "useStoreEmbedHost's open/bounds effect was keyed on `slotPresent`, a one-way 'a slot has attached once' latch. Because `store/:store` is a single route (no remount) and the Epic branch of WebView early-returns a panel, GOG -> Epic -> GOG replaces the slot div with a new element while the latch stays true. The effect never re-ran, so the ResizeObserver, resize/scroll listeners and flush()'s closed-over `slot` stayed bound to the detached old div. Every window resize then sent that detached node's rect (0,0,0x0), which the Linux shell's zero-area guard (correctly) ignored, leaving the embed at its old rect. macOS shares the defect (it applies zero rects verbatim)."
fix: "Replace the latch with the slot ELEMENT itself: index.tsx keeps `slotNode` state set by the callback ref on every attach and detach (dropping `slotRef`/`slotPresent`); useStoreEmbedHost takes `slotNode` and keys its bounds effect on `[slotNode]`, reading the geometry from that node. Cleanup disconnects the observer for the dead element; the re-run observes the new one and its first observation sends the real rect."
verification: "unit: useStoreEmbedHost tests 20/21 red before, green after, red under a one-way-latch mutation; full WebView suite 289/289; tsc --noEmit clean; pnpm lint production+tests PASS; prettier --check clean. live: PASS 2026-10-01, 7 of 7 valid launches (see Post-fix live verification)."
files_changed:
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx

## Constraints for the investigator

- Work on the current branch quick-260930-feh (holds the harness); do not push. Fresh createFakeHomeProfile per launch, register captures; no `pkill -f`/`killall` in a tool command; stop vite by process group.
- Separate the two triggers with a minimal 2x2 (Epic round trip only / link click only / both / neither), a few launches each, before hypothesising the mechanism.
- Renderer side: read the store slot component (src/frontend/screens/WebView or store embed slot) and how it measures/sends rects and what happens on unmount/remount; shell side: store_embed_open / store_embed_set_bounds in src-tauri/src/main.rs.
- macOS shares the shape of this defect; do not regress macOS behaviour. If you fix it, keep the fix minimal, add a regression test where feasible, and re-run the failing live sequence (>= 3 launches) plus the tracer/resize control.

## Investigation log (continuing session, 2026-09-30)

### 2x2 (fresh createFakeHomeProfile per launch, dev binary, X11, DMABUF unset; driver = scratchpad arm.py over gate_live.ts; every launch: Stores -> GOG tracer first, then the trigger(s), then resize 1100x650 / 1000x600 / 1280x800, judged by "settled line with vbox==size AND embed==requested AND flush")

| arm | launches | result |
| --- | --- | --- |
| neither | n1 (+ pre-trigger resize of every other launch, + feh s1b) | 3/3 resizes settled + flush OK, 0 zero-area lines |
| link click only (GALAXY link, navigated confirmed by pixels) | l2, l3 (l1: click did not navigate, first click only focuses the webview) | l1/l2/l3 all 3/3 settled + flush OK, 0 zero-area |
| Epic round trip only (GOG->Epic->GOG, no link) | x0 (in-launch: resize passed BEFORE the trip, dead AFTER), e1, e2 | 0 settled lines, exactly 1 zero-area line per resize, embed overhangs (x0-d.png) |
| both | b1, b2 | 0 settled lines, 1 zero-area line per resize |

Conclusion: the Epic round trip is sufficient AND necessary; the in-embed link click is irrelevant. x0 is a same-launch before/after (resize worked, then Epic round trip, then resize dead), so it is not a launch-to-launch difference.

Also: the fresh-profile Stores tab lands on the Epic placeholder first (cold start on /store/epic), so the slot only first attaches on the first GOG click.

### Mechanism candidate (from reading, to be tested)
- `store/:store` is ONE router route (App.tsx:249), so GOG -> Epic -> GOG does NOT remount `WebView`; only the early return at index.tsx:502 (`store === 'epic'` -> `WebviewUnavailablePanel`) swaps the slot div out and a NEW slot div back in.
- `useStoreEmbedHost`'s bounds effect (useStoreEmbedHost.ts:222-342) reads `slotRef.current` ONCE, closes over that node in `flush`, attaches the ResizeObserver to it, and is keyed on `[slotPresent]`, a ONE-WAY latch that never lowers. After the round trip the closed-over node is detached and the effect does not re-run, so: the observer watches a dead node, and `window` `resize`/`scroll` listeners call `flush()` which reads the DETACHED node's rect = 0,0,0,0 -> shell logs "ignored zero-area bounds" once per resize instant. This matches the log exactly (1 zero-area line per window resize, zero settled lines, embed left at its old rect).
- Shell side is NOT dropping valid rects: the only path that prints that line is w==0||h==0 (main.rs:5662), so the renderer really sent a zero rect.


### Fix + unit verification
- Failing-first: tests 20 and 21 added to useStoreEmbedHost.test.tsx and run RED against the unfixed hook (test 21 received storeEmbedSetBounds {x:0,y:0,w:0,h:0} on a window resize while the slot was unmounted, exactly the live shape).
- After the fix: useStoreEmbedHost suite 22/22, whole WebView suite 289/289. Mutation: re-adding a one-way latch (`[latchRef.current]`) turns 20 and 21 red again; `[!!slotNode]` does NOT (it lowers on the Epic leg), and the test comment says so.
- tsc --noEmit clean; `pnpm lint` production PASS / tests PASS; `pnpm find-deadcode` OK; `pnpm planning-gates` 12/12; `prettier --check` clean over the three files (all three report ignored:false).

### Live post-fix runs (partial) and the Host GPU hang
- f1 (arm E, fixed build): tracer line; after the Epic round trip a NEW settled line appeared (204,82,1076x718, the new observer's first report, which pre-fix never happened); resize to 1100x650 produced a settled line requested==embed==204,82,896x568 flush OK, 0 zero-area lines. The next two resizes (1000x600, 1280x800) produced no line of either kind. NOT explained: it coincides with the start of the host hang below (gnome-shell/compositor stopped applying WM resizes is the leading explanation), no code path in the fix skips a flush, and the same steps passed in every unfixed non-trigger arm; but it is unproven.
- f2, f3: window never found (`WINDOW_ID=NONE`): the X server had wedged. Kernel journal: amdgpu `commit_work` -> `drm_atomic_helper_wait_for_fences` -> `dma_fence_wait_timeout` blocked >122 s from 12:04:20 (hung-task), an `[Xorg]` child (pid 206972) in D state in `drm_sched_entity_flush`; every X client (xset, xdotool, xwininfo) now times out. nvidia dGPU "Enabling HDA controller" fired at each launch (12:00:24, 12:01:21, 12:01:34). No headless X (Xvfb/Xdummy) is installed and Xephyr needs the hung parent, so no fallback. Cause not established: 14 launches in ~35 min on a hybrid amdgpu+nvidia laptop; it may be provoked by rapid launch cycling or by a resize, not by the code change.
- Cleanup done: vite stopped by pgid, stuck harness pids killed, both orphaned fake-profile dirs removed, no gamelib-shell running. graphify updated.

### Re-running the live arms
Driver saved in `.planning/debug/linux-embed-resize-dead-after-epic-roundtrip-driver/` (arm.py, drv.py, launch.sh; untracked). Usage: `export GL_RAW=<scratch dir>; mkdir -p $GL_RAW/ev; cp <driver>/drv.py <driver>/launch.sh $GL_RAW/`; start vite in its own session (`setsid pnpm exec vite`), then `python3 <driver>/arm.py f1 E` (arms: N, E, L, EL). Coordinates are for a 1280x800 window on this host (release-notes dialog X at 1062,133; Stores tab 310,21; GOG tile 50,59; Epic tile 50,129; GALAXY link 294,166; the first click on the embed only focuses it). Pass = each resize prints (size, 1, 0, True). Expect after the fix: arm E and arm EL both pass all three sizes and show a NEW settled line right after the return from Epic.

## Post-fix live verification (2026-10-01, after reboot cleared the wedged X server)

Dev binary + fresh vite, X11, DMABUF unset, fresh createFakeHomeProfile per launch, driver `arm.py` (copied to
`linux-embed-resize-dead-after-epic-roundtrip-driver/`). Each arm resizes 1280x800 -> 1100x650 -> 1000x600 -> 1280x800
and needs 1 settled line per resize, embed == requested, flush with the window edge, 0 zero-area lines.

| arm | valid launches | result |
| --- | --- | --- |
| Epic round trip only (E) | e1, e4, e5, e6 | 4/4 PASS, 3/3 settled + flush OK each, 0 zero-area |
| round trip + link click (EL) | b2, b4 (link navigated, attempt 1) | 2/2 PASS |
| neither (N) | n5 | 1/1 PASS |

The fix is the one committed in `d71269c2a`. Pre-fix the E arm was 0 settled lines and 1 zero-area line per resize.

**Invalid launches, excluded, not counted as passes or fails:** e2, e3, b1, b3, b5, n1-n4. In each the app sat on the
Accounts screen under a purple "Retrying" banner that shifts the layout down 40 px, so the driver's fixed-coordinate
clicks never reached Stores/GOG (0 settled AND 0 zero-area lines, tracer capture shows the login screen). Validity test:
pixel (300,10) of `<label>-1-gog.png` equals (7,10,11) only when there is no banner. 9 of 16 launches were invalid,
so the driver needs a banner guard before anyone reuses it; the banner's own cause was not investigated.
Not verified: macOS (shares the defect's shape; the hook change is platform-neutral), Wayland, packaged build.

### Driver banner guard (2026-10-01)

The 9 invalid launches above were the app's own connectivity banner (`OfflineMessage`, 'Retrying (Ignore)'), shown while
the boot connectivity check probes github.com, gog.com, store.epicgames.com and cloudflare-dns.com. It is a transient
state, not an app defect, and it pushes the layout down 40 px. `driver/arm.py` now detects it (pixel (300,10) ==
(176,152,226)), clicks '(Ignore)' (-> `setConnectivityOnline`), and exits the arm as INVALID if it survives. Validated:
6 of 6 launches valid (banner hit and recovered in 3), all 6 Epic-round-trip arms PASS (3/3 settled, flush, 0 zero-area).

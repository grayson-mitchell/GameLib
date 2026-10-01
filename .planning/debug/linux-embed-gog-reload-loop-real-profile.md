---
status: awaiting_human_verify
trigger: "Stores -> GOG Store in the packaged Linux AppImage on the operator's REAL profile keeps reloading continuously (see symptoms). Fake-profile runs of the same AppImage are stable."
created: 2026-10-01T00:00:00Z
updated: 2026-10-01T07:03:19Z
---

## Current Focus

hypothesis: CONFIRMED and FIXED at the desk (renderer only, fix pass 1 of max 2). The loop was our renderer re-navigating the embed: WebView/index.tsx re-derived `startUrl` from localStorage `last-url-<store>` on every render, and useStoreEmbedHost.ts persisted unvalidated main-frame URLs (tracker interstitial; previous store's URL on a storeKey change). Fix (a)+(b) applied; see Resolution.
test: DONE at the desk (jest, virtual-time sim of the REAL hook + REAL index.tsx restore slice; pre-fix revert matrix; 6 manual mutants). NEXT test is the operator's re-test of a REBUILT AppImage on the real profile (Resolution.verification.operator_retest), which is also the falsifier.
expecting: after rebuild, real-profile `startUrl` constant after the first render, label stable, renders stop growing, about-blocks stop rising once a load settles.
next_action: return DEBUG COMPLETE (fix applied, desk-verified) to the coordinator; awaiting the operator's real-profile re-test of a rebuilt AppImage. Session NOT archived.

reasoning_checkpoint:
  hypothesis: "The reload loop is the renderer re-navigating the embed: WebView/index.tsx re-derives startUrl from localStorage last-url-<store> on EVERY render, and useStoreEmbedHost.ts persists unvalidated main-frame URLs (tracker interstitial; previous store's URL on a storeKey change), so each independent re-render can flip startUrl and fire storeEmbedNavigate -> webview.navigate()."
  confirming_evidence:
    - "Real log (integers only): 1849 renders, 788 startUrl value changes, dominant 3-cycle D->v4->v2->D ~257 each; ~0.63 navigations/s; operator-observed af.gog.com <-> track.adtraction.com label flicker."
    - "Scratch virtual-time sim with the REAL hook: cross-store stomp deterministic (A); page-hop + independent re-render churn sustains the same 3-cycle with 46 navigate() calls in 120 s (G); read-once restore + validated persist -> 0 (I, E)."
    - "Fake-profile AppImage run: last-url-gog went None -> track.adtraction.com -> www.gog.com; restore lost on every Epic->GOG (render A restored G, render B default)."
    - "Repo regression test against the PRE-FIX hook+index.tsx: 33 storeEmbedNavigate calls in 90 s virtual time (vs 0 after the fix)."
  falsification_test: "If, after the fix, the real-profile `[WebView] store/wiki route ... startUrl=` value is constant but the label still flicks af.gog.com/track.adtraction.com, the loop is page-side and this diagnosis is wrong. At the desk: the new regression test must go RED against the pre-fix hook+index.tsx and GREEN after (DONE: 12 red pre-fix, 50 green after)."
  fix_rationale: "(b) removes the feedback path itself: startUrl can no longer change on a re-render, so no churn source (known or unknown) can ignite a navigate. (a) stops polluting the restore key (tracker page, other store's URL), so the restore value is always a valid page of the right store. Neither touches Rust or the policy; both are root-cause removal of the loop's renderer half, not a throttle on navigate."
  blind_spots: "Page-side hop and the real re-render source were inferred, not observed (the two inferred ignition conditions). macOS not run. The restore on re-entry after Epic now navigates to the last persisted valid URL (same page the embed already shows, i.e. a reload of it) instead of the affiliate default; that is intended D-30 behaviour but not live-tested."
  candidate_causes:
    - "code: renderer per-render restore + unvalidated persist (CONFIRMED mechanism)"
    - "environment: a page-side redirect/consent reload returning to af.gog.com (INFERRED ignition; fix makes the renderer immune)"
    - "data: stale/foreign last-url-gog in the real profile localStorage (INFERRED; fix validates on write and read)"
  and_gate: "yes - the loop needs (renderer feedback path) AND (continuing independent re-renders) AND (a page chain emitting a second non-suppressed Finished on a different valid URL via the tracker). Removing the first removes the AND."

## Symptoms

expected: Stores -> GOG Store in the packaged Linux AppImage on the operator's REAL profile shows a stable GOG page in the embed.
actual: The GOG page keeps reloading continuously.
errors: running instance's stderr (scratchpad real-run.out) shows `[shell] store_embed: blocked in-embed navigation to unrecognized scheme 'about'` repeatedly — 30 early, 46 a minute later, 72 at session-manager start (2026-10-01 19:05 NZDT), roughly one per 2-3 s and still going. Zero such lines in every fake-profile run this session (scratchpad raw/a1.out, g1.out, p1.out), including the same AppImage on a fake profile where the GOG embed was stable.
reproduction: operator's real profile, Stores -> GOG Store. Build src-tauri/target/release/bundle/appimage/GameLib_0.7.0_amd64.AppImage (sha256 prefix a89ac8bb), X11, WEBKIT_DISABLE_DMABUF_RENDERER unset, NVIDIA 580.173.02.
started: first observed during the operator live gate for the Linux branches of 38-E03/38-E04 (todo .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md); fails check 2 of .planning/quick/261001-pez-mid-drag-frame-capture-for-the-linux-sto/LIVE-GATE-CHECKLIST.md.

## Constraints (carried from the caller)

- The real-profile app instance is RUNNING and being watched. Do NOT kill/restart/interact (no xdotool) without returning to the caller.
- NEVER copy real-profile data (gamelib.log in ~/.local/state/GameLib/logs, cookies, session data, screenshots of the real window) into the repo or scratchpad. Read-only, filter to store_embed lines, redact. real-run.out store_embed lines may be cited by count.
- Harness runs use a FRESH createFakeHomeProfile(). Real-profile arm only if declared + justified + operator consent via caller.
- Do not change behaviour speculatively; PROVE the cause first. Stop rule: two fix attempts, then return findings. A policy fix also affects macOS (shared, cfg macos|linux). Unit tests at main.rs ~16851-16905 must stay honest.
- Do not edit .planning/phases/38-*/38-VERIFICATION.md. No push, no tag. Commit only own paths with trailers.

## Evidence

- timestamp: 2026-10-01T19:05+13:00
  source: scratchpad/real-run.out (running real-profile instance stderr)
  finding: 72 lines `blocked in-embed navigation to unrecognized scheme 'about'`; 1 `store_embed(linux): settled requested=204,82,1076x718 embed=204,82,1076x718 main=0,0,1280x800 vbox=1280x800`; no other store_embed lines. Count still rising.

- timestamp: 2026-10-01 (coordinator symptom update, operator observation)
  source: operator watching the live real-profile window
  finding: the embed's URL label keeps flicking between `af.gog.com` and `track.adtraction.com`. That is an affiliate-tracking redirect chain (GOG af.gog.com -> Adtraction tracker -> back), and the label is the MAIN-FRAME URL, so the loop is main-frame navigation, not only subframes. LEADING LEAD. Still unproven: which hop emits the `about:` navigation, and whether the block causes the restart or merely accompanies it.
  code_context (read by session manager, not yet investigated):
    - The GOG embed start URL is itself the affiliate entry: `https://af.gog.com?as=1838482841` (src/frontend/screens/WebView/storeEmbedOrigins.ts:53; src/frontend/screens/WebView/index.tsx:144). So fake-profile runs that were stable ALSO started on af.gog.com -> the chain exists there too; the real-profile-only trigger must be state (affiliate/consent/stale tracking cookie, logged-in session) or a difference in how the tracker responds, not the existence of the chain.
    - index.tsx:353-398 documents the retired Electron "adtraction" detection: a main-frame `did-fail-load` matching `track.adtraction.com`'s failed URL (ad-blocked tracker) and reading the redirect target from that URL's query string. Under Tauri there is NO navigation-failure signal (40-EMBED-API-VERIFICATION.md Q3: ABSENT) and on_navigation carries no frame-type flag, so the gap is declared, not handled. Candidate: tracker redirects back to af.gog.com and restarts the chain when its step cannot complete.
    - Open question for the investigator: does the loop need real-profile state to start? Candidates: affiliate cookie, consent (Cookiebot) state, logged-in GOG session, stale tracking cookie; also network-level (tracker reachability) which would be identical for fake and real profile on this machine and so is weaker.

- timestamp: 2026-10-01 (session manager, public unauthenticated curl, NO real-profile data, no cookie jar)
  source: curl of https://af.gog.com?as=1838482841 and the tracker page it redirects to (public, stateless)
  finding: (1) af.gog.com answers an HTTP 302 straight to `https://track.adtraction.com/t/t?a=...&as=1838482841&t=2&tk=1&url=http://www.gog.com`. (2) That tracker URL returns 200 text/html "Redirecting…": a `<meta http-equiv=refresh content="3;url=https://www.gog.com?utm_source=adtraction...&at_gd=...">`, an adtDfpJS device-fingerprint script, a 2500 ms `setTimeout(location.replace(redirectUrl))` failsafe, a 500 ms fallback replace when `adtDfpJS` is absent, and a `sendBeacon` to go.adt256.com. Sets cookie at_gd on track.adtraction.com (SameSite=None; Secure; Max-Age 3y; value redacted).
  implication: the chain is af.gog.com (302) -> track.adtraction.com (interstitial, ~0.5-3 s) -> www.gog.com (location.replace). It is a one-way chain that ENDS on www.gog.com; nothing in it navigates back to af.gog.com. A label that flicks af.gog.com <-> track.adtraction.com at ~2-3 s therefore means something RE-STARTS the chain from the start URL each cycle: either (a) our own code re-issuing the start URL (renderer useStoreEmbedHost/store_embed_open re-navigating the existing embed on re-render — store_embed_open "navigates rather than creates" when the label exists, main.rs ~5740; WebView/index.tsx:144), or (b) the page/an iframe doing so. The `about:` navigations (adtDfpJS fingerprinting typically uses an about:blank/srcdoc iframe — UNVERIFIED) are consistent with ONE per interstitial visit, i.e. ~1 per cycle, matching the ~2-3 s cadence. This reframes the leading lead from "about: block causes the reload" to "something re-issues af.gog.com each cycle; about: counts the interstitial visits". Real-profile-only trigger candidates (UNVERIFIED): repeated store_embed_open from a re-render driven by real-profile state (GOG logged-in, library/user polling), or stale tracking cookie. Neither established.

- timestamp: 2026-10-01T19:20+13:00
  source: real-instance counters, COUNT-ONLY (grep -c / wc -l; no log content read -- a content read of the real gamelib.log was DENIED by the permission classifier as PII and was NOT retried)
  finding: real instance pid 54991 started 19:01:32; two samples 60 s apart: renders (`[WebView] store/wiki route` lines, emitted by WebView/index.tsx:457 on EVERY render) 676 -> 780 (+104, ~1.7/s); about-blocks 190 -> 220 (+30, ~0.5/s); `[useStoreEmbedHost]` tag lines = 1 for the whole log; every new gamelib.log line in the window was a render line (log lines +104 == renders +104).
  implication: (1) useStoreEmbedHost.ts:225-231 logs `slot ref is null` on the first effect pass of EVERY mount (slotNode state starts null), so tag-count 1 => at most ONE WebView mount => `storeEmbedOpen` (openedRef, useStoreEmbedHost.ts:244-255) was called at most once; the repeated-`store_embed_open` re-navigate path (main.rs:5745-5763) is NOT the driver. (2) renders (1.7/s) outpace about-blocks (0.5/s) ~3.5:1, so the two are not 1:1; the renderer is re-rendering far faster than any plausible full-page-reload cadence. (3) the 2-3 s about cadence is the only periodic embed-side signal and it is NOT established to be a main-frame reload at all.

- timestamp: 2026-10-01T19:25+13:00
  source: code read (src-tauri/src/main.rs:5713-5736 policy; 5742-5879 store_embed_open; 6320-6440 navigate/reload/take; src/frontend/screens/WebView/useStoreEmbedHost.ts; WebView/index.tsx:195-205)
  finding: the renderer has ONE feedback path that can re-navigate the embed without user input: `startUrl` is RE-DERIVED FROM localStorage `last-url-<store>` ON EVERY RENDER (index.tsx:195-205); the hook WRITES that key whenever `navState.url` changes (useStoreEmbedHost.ts:205-215, fed by the 250 ms drain of Rust Finished events); the start-url effect (useStoreEmbedHost.ts:361-417) calls `storeEmbedNavigate(startUrl)` whenever the recomputed `startUrl` differs from `previousUrlRef`. `store_embed_navigate` (main.rs:6423-6440) arms one-shot suppression so the FIRST Finished after it is eaten; a SECOND Finished (page-side JS redirect / consent reload) is NOT suppressed and re-enters the loop. A fresh fake profile has NO `last-url-gog`; the operator's real profile does. UNVERIFIED -- it is a possible mechanism, not an observation.
  also: the harness gate_live.ts:182-189 REFUSES to start while any `gamelib-shell` runs (the real instance is running), and drv.py uses xdotool mouse moves on the operator's display -- neither is usable as-is during the operator's live gate. Single-instance socket is `$HOME/.config/gamelib/gamelib-single-instance.sock` (main.rs:9295-9312), so a fake-HOME instance cannot forward into the real one.

- timestamp: 2026-10-01 (coordinator symptom update 2 folded in by session manager)
  source: operator observation: flicking af.gog.com <-> track.adtraction.com began the MOMENT GOG Store was opened, no delay; plus static read of index.tsx:144,175-204 and useStoreEmbedHost.ts:205-215,360-417
  finding: the GOG start URL is DELIBERATE affiliate config (`gogStore = https://af.gog.com?as=1838482841`, index.tsx:144; storeEmbedOrigins.ts:53; the retired Electron code detected an ad-blocked adtraction tracker). It is overridden by persisted `last-url-gog` when that resolves to the store (index.tsx:195-204), else the key is REMOVED and startUrl falls back to the literal. Because a Finished main-frame URL on a non-gog.com host (the tracker) is persisted by the hook (useStoreEmbedHost.ts:208-213) and then removed on the next render, startUrl can FLIP between a restored gog.com URL and the literal af.gog.com; each flip makes the start-url effect call storeEmbedNavigate(startUrl), which restarts the 302 -> tracker chain. Same lead as the 19:25 entry above; this adds the concrete flip path. UNVERIFIED -- needs a trace on a FRESH fake profile that seeds its own `last-url-gog` and/or emulates the landing redirect. Real-profile-only state candidate: `last-url-gog` in the operator's WebKit localStorage (and any redirect GOG applies with real cookies/sign-in). Note the chain's own end state (www.gog.com landing) is stable in the stateless curl trace, so the loop needs something that returns startUrl to af.gog.com.
  blocked-action note: a host-only read of the real gamelib.log `startUrl=` render lines was DENIED by the permission classifier (PII); not retried. The operator would need to grant that explicitly via the coordinator.

- timestamp: 2026-10-01T19:35+13:00
  source: real-instance log, INTEGERS ONLY (awk over `[WebView] store/wiki route ... startUrl=` lines printing counts, never values). A content-printing variant was DENIED (PII) and not retried.
  finding: renders=1110: distinct startUrl values=5; value changes between consecutive renders=473; default<->non-default switches=316; first default render index 5, last 1104. 60 s later sample: renders 1323->1414 (+91), startUrl changes 564->602 (+38), about-blocks 376->402 (+26).
  implication: `startUrl` (re-derived from localStorage on EVERY render, index.tsx:195-205) is flip-flopping all session; every change fires `storeEmbedNavigate` (useStoreEmbedHost.ts:361-417) -> `webview.navigate()` (main.rs:6436). ~0.63 navigations/s vs ~0.43 about-blocks/s. The operator's label observation corroborates independently: a main-frame Finished can never report af.gog.com (it 302s to the tracker before commit), so the label showing af.gog.com means OUR code navigated to the default start URL.

- timestamp: 2026-10-01T19:30+13:00
  source: fake-profile experiment, packaged AppImage (a89ac8bb), nested Xephyr :77, FRESH createFakeHomeProfile (/tmp/gl-dbg-*), scratchpad dbg/
  finding: L1 (fresh profile, Stores->GOG): page stable at www.gog.com (Cookiebot banner, signed out); 7 renders; 2 `about:` blocks occurred and the page STAYED STABLE; every GOG render carried the default startUrl. Fake localStorage afterwards: `last-url-gog = https://www.gog.com/en/?utm_campaign=adtraction&utm_medium=affiliate&utm_source=adtraction` (valid gog.com, != default).
  implication: (a) `about:` blocks DO occur on a fake profile and do not by themselves produce a reload loop (falsifies "block => loop"). (b) the persist write at useStoreEmbedHost.ts:205-215 lands in an effect AFTER the last render, so nothing re-reads it until some later render; the next render re-derives startUrl=G != previousUrlRef(default) and navigates. LATENT hazard present on fake profiles too; it fires only when something re-renders WebView. Real WebView renders ~1.5/s.
  incidental: second launch on the same fake profile stuck on the "Loading" splash (no `[refreshLibrary]` because `last_version` already set); worked around by deleting `last_version`/`last_changelog` from the FAKE localStorage only. Fake-profile artefact, not investigated.

- timestamp: 2026-10-01T19:40:00+13:00
  source: real log, INTEGERS ONLY, opaque labels (D = app default start URL; v1..v6 = other values by first appearance)
  finding: n=1849 renders, 788 value changes. Dominant structure is a 3-cycle: D->v4 257, v4->v2 257, v2->D 259; first ten labels v1,v1,v1,v1,D,D,D,v2,v2,v2 (v1 = the 4 Epic-route renders before GOG was clicked). All non-default values passed gog.com validation (a non-default `startUrl` only arises from a valid stored URL, storeEmbedOrigins.ts:111-120).
  implication: the renderer walks the embed around a 3-URL cycle ~257 times in ~20 min, i.e. ~780 `storeEmbedNavigate` calls. v2->D is the tracker case: the stored value was an invalid-host URL, was removed on read, and startUrl fell back to the default (af.gog.com), which restarts the redirect chain. This is exactly the coordinator's operator observation (label flicks af.gog.com <-> track.adtraction.com).

- timestamp: 2026-10-01T19:33:00+13:00
  source: fake-profile runs L3/L5 (AppImage a89ac8bb, nested Xephyr :77, fresh createFakeHomeProfile, scratchpad dbg/), full content inspectable because fake
  finding: (1) With a returning profile (last-url-gog = https://www.gog.com/en/?utm_...), clicking Epic panel -> GOG produced render A `startUrl=<restored G>` immediately followed by render B `startUrl=<default af.gog.com>`; polling the fake localStorage showed the key go G -> None within the same second. (2) Persisted `last-url-gog` sequence during one visit: None, then `https://track.adtraction.com/t/t?...` (t+1.6 s), then `https://www.gog.com/en/?...` (t+6.3 s). I.e. the tracker interstitial IS persisted as the last URL (invalid for gog.com). (3) The final render logged `startUrl=default` although localStorage already held G, because a render reads localStorage BEFORE its own commit's persist effect writes the new value: the new value is only consumed by the NEXT render. (4) After the chain settled the fake profile produced NO further renders (7 total), so nothing re-read the stored G; the loop did not ignite. (5) 2 `about:` blocks on the first fake visit; +3 after clicking Cookiebot "Allow all"; none of this produced renders/navigations. A single window-focus event or Reload click did not re-render WebView either.
  implication: confirms the three renderer defects on the real app: cross-store stomp (restore always lost on Epic->GOG), unvalidated persist of intermediate pages, per-render re-derivation with a one-render lag. They are LATENT on a quiet profile and need independent re-renders to ignite. `about:` blocks scale with consent (marketing iframes) and page loads; they are not sufficient for a loop.

- timestamp: 2026-10-01T19:48:00+13:00
  source: scratch jest simulation (scratchpad dbg/jest/loopsim.test.tsx; repo untouched). Drives the REAL useStoreEmbedHost, a verbatim port of index.tsx:195-205, and a faithful JS port of the Rust StoreEmbedState incl. push() consuming the suppress flag (main.rs:5518-5531, 6423-6440), in virtual time.
  finding: A (real hook): the stomp is deterministic: after the Epic->GOG render `last-url-gog` == the Epic URL, open() called with the default (restore lost). B (observed fake page chain D->T->G): after the chain renders=5, last-url-gog=G, navigate()=0; ONE extra render -> navigate(G) once. J: one extra render + a page that hops between valid GOG URLs and the tracker -> still only 1 navigation (needs continuing independent renders). G: same page + an independent 700 ms re-render source -> sustained cycle, transitions {D->v4:16, v4->v2:15, v2->D:15} in 120 s virtual, 46 navigate() calls = the SAME D->v4->v2->D structure as the real log. I: same page + same churn against a fixed renderer (validate-on-write persist + restore read once per store entry) -> navigate()=0. F: benign page + churn -> 1 extra navigation, then quiet. Random "adversarial" pages (D/H) did NOT loop the broken renderer at all, so the page needs a specific structure (a second non-suppressed Finished on a different valid GOG URL, and a hop via the tracker), not just any misbehaviour.
  implication: the renderer machinery is sufficient to sustain exactly the observed cycle given (page hop) AND (an independent re-render source), and the fix removes the renderer's ability to sustain it. The page hop and the real render source are INFERRED from the real log's cycle structure, not observed.

- timestamp: 2026-10-01T19:37:00+13:00
  source: process table / real-run.out tail
  finding: the original real instance pid 54991 exited at ~19:37 (stderr ends `sidecar terminated on exit`); a new gamelib-shell pid 89895 (ppid 2128, started 19:38:17) exists. Not started or signalled by the investigator: every investigator kill was `kill -TERM -- -<pgid>` against its own recorded pids (74726, 77766, 80616, 84857; L5 = 86918 died on its own at the same moment, consistent with an external kill-all), each guarded to refuse 54991. All investigator processes, the nested Xephyr :77 and the fake profile (/tmp/gl-dbg-*) were removed at the end.

- timestamp: 2026-10-01T20:03+13:00
  source: fix pass 1 -- repo regression tests (jest, Frontend project; no real profile, no AppImage run)
  finding: NEW src/frontend/screens/WebView/__tests__/storeEmbedReloadLoop.test.tsx drives the REAL useStoreEmbedHost plus the REAL restore statements sliced out of WebView/index.tsx (marker pair `let startUrl = urls[pathname]` .. `const isStorePageDeepLink`, present in the pre-fix source too) in virtual time against a JS port of Rust StoreEmbedState (main.rs 5518-5531 push, 6423-6440 navigate; push consumes the suppress flag). Page models: the real-log 3-cycle (inferred) and a never-settling hopper (worst case). Re-render churn 700 ms, 90 s virtual, returning and fresh profile. Fixed tree: 0 storeEmbedNavigate, 1 open, every last-url-gog write resolves to gog. PRE-FIX tree (git show HEAD versions of both source files): 33 storeEmbedNavigate calls, Epic URL and tracker URL written under last-url-gog, restore lost (open at the affiliate default). Control arm (fixed hook + hand-restated per-render restore) loops (>10 navigations), proving the harness can loop.
  implication: the renderer can no longer be walked round the loop by any page behaviour or re-render source; the zeros are not a harness that cannot loop.

- timestamp: 2026-10-01T20:03+13:00
  source: fix pass 1 -- revert matrix and manual mutants (Stryker is not configured here)
  finding: jest WebView/__tests__ (storeEmbedReloadLoop + useStoreEmbedHost + WebViewDeepLinkAndRestore, 50 tests): both fixes reverted 12 FAILED / 38 passed; only index.tsx (b) reverted 6 failed; only the hook (a) reverted 10 failed; fixed 50/50 pass. Six hand-applied mutants at the fix sites (memo recomputed per render; stale-clear effect removed; restore never applied; read accepts any configured store; persist guard drops the key check; persist guard drops the null check) were ALL killed.
  implication: each half of the fix is independently load-bearing and independently pinned; (a) alone does NOT stop the loop (the page hop between valid URLs still re-navigates a per-render restore), (b) alone stops the loop but leaves the key poisoned.

## Eliminated

- hypothesis: "the `about:` block CAUSES the reload loop"
  evidence: L1 fake profile logged 2 `about:` blocks and the embed stayed stable on www.gog.com; the block is a log line plus `return false` (main.rs:5734-5735, 5798) with no state change, no history push, no suppression-flag effect. It can only matter indirectly via page behaviour. Real session: about-blocks (0.43/s) are fewer than navigations (0.63/s).
  timestamp: 2026-10-01T19:30+13:00

- hypothesis: repeated `store_embed_open` (renderer remount -> existing-embed `navigate`, main.rs:5745-5763) drives the reload
  evidence: `[useStoreEmbedHost]` log tag appears ONCE in the whole real log; the hook logs on the first effect pass of every mount (useStoreEmbedHost.ts:225-231), so mount count <= 1; and exactly one `store_embed(linux): settled` line exists in real-run.out (mount() logs it only on creation). Inference from code + counts, not from reading the line.
  timestamp: 2026-10-01T19:20+13:00

## Resolution

root_cause: >-
  AND-gate, three conditions (the first two are code we own; the third is environmental).
  (1) RENDERER FEEDBACK LOOP, proven on the real hook: WebView/index.tsx:195-205 re-derives `startUrl` from
  localStorage `last-url-<store>` on EVERY render (validate-on-read + removeItem); useStoreEmbedHost.ts:205-215
  persists every main-frame `navState.url` UNVALIDATED (including the invalid-host `track.adtraction.com`
  interstitial) and ALSO re-runs on a `storeKey` change, writing the PREVIOUS store's URL under the new store's key
  (Epic URL -> `last-url-gog`, deterministic, restore always lost on Epic->GOG); useStoreEmbedHost.ts:361-417 calls
  `storeEmbedNavigate(startUrl)` on every `startUrl` change, which is a real `webview.navigate()` (main.rs:6423-6440).
  A render reads localStorage before its own commit's persist effect writes, so each stored value is consumed one
  render late. (2) A CONTINUING INDEPENDENT SOURCE OF WebView RE-RENDERS (inferred; the real profile re-renders
  ~1.5/s, a quiet fake profile 0/s; one extra render ignites only one navigation, simulation J). (3) A PAGE CHAIN
  that yields a second non-suppressed Finished on a different valid gog.com URL and a hop through the tracker
  (inferred from the real 3-cycle D->v4->v2->D; the fake-profile chain af.gog.com -> tracker -> www.gog.com is one-way
  and terminates). Real evidence: 1849 renders, startUrl cycles D->v4 257, v4->v2 257, v2->D 259 (~780 navigations in
  ~20 min, ~0.63/s), the operator-observed af.gog.com <-> track.adtraction.com label flicker. The `about:` default-deny
  (main.rs:5731-5735) is a log line plus `return false` with no state effect: it ACCOMPANIES (about 1 iframe-bearing
  page load per navigation: 0.43 about/s vs 0.63 nav/s) and is NOT a cause; fake profile logged 2 blocks (+3 after
  consent) with no loop.
fix: >-
  APPLIED (renderer only; no Rust change; store_embed_navigation_policy and its unit test untouched; `about:` stays blocked).
  (a) src/frontend/screens/WebView/useStoreEmbedHost.ts persist effect: write `last-url-${storeKey}` only when
  `resolveStoreForUrl(navState.url)` resolves to `storeKey` (drops the tracker interstitial and the previous store's URL
  on a storeKey change). (b) src/frontend/screens/WebView/index.tsx: the restore is a `useMemo` keyed on `store` (read once
  per store entry, not per render); the stale-value `removeItem` moved out of render into a `useEffect` on
  `[store, restoredLastUrl]`; `startUrl` takes the memo's url when present. Tests: WebViewDeepLinkAndRestore.test.ts
  restore harness rewritten for the new slice shape (marker pair + injected useMemo/useEffect; +3 tests: render never
  removes, read-once, store-change re-read; the old outcome-5 etc. kept and still pass); useStoreEmbedHost.test.tsx
  properties 22-25 (persist guard); NEW storeEmbedReloadLoop.test.tsx (9 tests, ~0.4 s).
verification:
  target_test: { result: pass, note: "storeEmbedReloadLoop 9/9, useStoreEmbedHost 26/26, WebViewDeepLinkAndRestore 15/15 on the fixed tree; the same three files: 12 FAIL / 38 pass with both source files reverted to HEAD" }
  mutation_check: { result: pass, reason_if_skipped: "Stryker not configured; substituted 6 hand-applied mutants at the fix sites", mutant_killed: "6 of 6" }
  no_op_deletion: { result: pass, deletion_justified_by_rca: false, note: "additive guard plus a relocation: the per-render read became a memo, the render-time removeItem became an effect; nothing is short-circuited or deleted without replacement" }
  adjacent_tests: { result: pass, suites_run: ["jest --selectProjects Frontend: 182 suites / 3113 tests pass", "jest meta/__tests__: 45 of 46 suites pass; the one failure (genI18nGateScope A-17 ANTI-ROT, i18nForkTouchedFiles.json vs live git derivation) FAILS IDENTICALLY with the four tracked source files stashed back to HEAD, unrelated"] }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true, note: "pre-fix: 33 storeEmbedNavigate calls in 90 s virtual time; fixed: 0" }
  guardrail_verdict: accepted
  oracle_type: "derived (a model of the Rust nav state + the real hook/slice) with a metamorphic control arm; the specified invariant is 'storeEmbedNavigate is never called while the store and route are unchanged'"
  commands:
    - "npx tsc --noEmit (exit 0); npx tsc -p tsconfig.meta.json --noEmit (exit 0)"
    - "node meta/lintScoped.cjs (exit 0; src 1107 warnings vs ceiling 1124, tests 638 vs ceiling 638; the one warning in index.tsx is the pre-existing showLoginWarningFor effect, line 347 -> 381; the hook and all four test files report none)"
    - "npx prettier --file-info (all five paths ignored:false, typescript) then npx prettier --check on the five exact paths: pass (the new test needed one --write pass)"
    - "node meta/findDeadcode.cjs: unreachable 46 OK, used-in-module 0 OK"
    - "graphify update . (graphify-out is gitignored)"
  operator_retest: >-
    Rebuild first (README sequence; renderer-only so helper binaries and the SEA sidecar need not be redone if src-tauri/binaries is current):
    `pnpm exec vite build` then `pnpm exec tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'`, then run
    src-tauri/target/release/bundle/appimage/GameLib_*.AppImage. NOT run here: tauri build is a full release Rust compile and
    AppImage bundle, and a renderer-only change is already proven at the desk. Then on the REAL profile: Stores -> GOG Store, watch ~2 min.
    PASS = the URL label settles on a www.gog.com page and stays; `[WebView] store/wiki route ... startUrl=` value constant after the
    first render (render count stops growing); about-block count stops rising once the page settles. FALSIFIER = startUrl constant
    but the label still flicks af.gog.com/track.adtraction.com (then the loop is page-side and this diagnosis is incomplete).
    Integers-only one-liner over gamelib.log: distinct startUrl values and value changes over the `[WebView] store/wiki route` lines.
files_changed:
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/__tests__/WebViewDeepLinkAndRestore.test.ts
  - src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx
  - src/frontend/screens/WebView/__tests__/storeEmbedReloadLoop.test.tsx (new)
blind_spots:
  - the page-side hop (which two valid gog.com URLs, and why the real page bounces through the tracker) was not observed on the real profile; a read-only host-only dump of the real startUrl values, or an instrumented run, would identify it but is not needed to fix the renderer
  - the independent re-render source on the real profile was not identified (candidates: GlobalState updates from a populated/logged-in profile, e.g. download or install progress events)
  - macOS was not run; the renderer files are shared so the defect is cross-platform in principle, but whether the page hop happens there is unknown
  - the packaged-AppImage second-launch "Loading" hang seen on an empty fake profile (no `[refreshLibrary]`) was a fake-profile artefact and was not investigated

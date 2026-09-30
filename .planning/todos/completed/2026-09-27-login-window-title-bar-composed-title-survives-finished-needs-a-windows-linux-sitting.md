---
created: 2026-09-27
title: 'Live-verify the login window title bar shows <origin> — <document title> and survives PageLoadEvent::Finished (Windows/Linux only, unverifiable on this Mac)'
found_during: quick 260927-o3h (fixed the on_page_load Started-only guard; the runtime half is deferred)
severity: minor
platform: windows
ready: live-gate
status: RESOLVED
resolved: 2026-09-30
area: login-window
files:
  - src-tauri/src/main.rs
---

## Mechanism

Quick task 260927-o3h guarded the `humble_login_open` `on_page_load` closure's `set_title`
refresh to `PageLoadEvent::Started` only (D-01, D-02), so the composed
`origin — document title` set by `on_document_title_changed` should now survive `Finished`
instead of being overwritten with the bare origin. That source-shape change is pinned by a
regression test (`src/backend/__tests__/tauriShellSource.test.ts`), and its RED direction was
observed before acceptance.

**What is NOT verified: the actual runtime behaviour.** No verify step anywhere in
260927-o3h's plan claims the title bar was watched. The macOS login window is presented as an
AppKit sheet, which structurally renders no title bar UI at all (`main.rs:2710-2718`,
F-34.5-G6-16), so there is no surface on this machine to observe pass or fail. This is the same
live gate `38-W03` failed and accepted as a deviation during the Phase 38 Windows sitting
(quick `260926-8j9`) — that acceptance is superseded by the 260927-o3h fix, and this todo is
the next sitting's confirmation of it.

## Verification (once run)

Open any store login window (Manage Accounts -> Humble / GOG / Epic / Amazon) on Windows or
Linux and watch the title bar from the instant it appears. It must show the origin
immediately, then become `<origin> — <document title>` (e.g.
`https://www.humblebundle.com — Humble Bundle - Log In`) once the document title arrives, and
must NOT revert to the bare origin through `PageLoadEvent::Finished`.

`severity: minor` — the source-side fix is landed and pinned by a regression test; this todo
tracks only the runtime confirmation on hardware this operator does not have at their desk
right now.

## Result (quick-260930-rph, 2026-09-30)

Run live on this Windows 11 machine against `%LOCALAPPDATA%\GameLib\gamelib-shell.exe` — the
RELEASE CI build, run `36556473399` / `b48e8948f`, sha256 `5adce1be...63a9f` (matches). It is a
descendant of `ae5968b07`, and its title-path source is byte-identical to HEAD
(`evidence/rph-build-identity.txt`). The criteria, the scorer and its self-test (bug shape
scored FAIL, fix shape PASS, no-title shape INCONCLUSIVE) were committed in `26c6d1458` before
any login window opened (`evidence/rph-prediction.md`, `evidence/rph-selftest.txt`).

Real-profile arm (declared): the installed app ran on the operator's real `HOME`/`USERPROFILE`,
because WebView2 resolves its cookie jar through the OS known-folder API regardless of the
fake-HOME variables, so a fake profile would split-brain the sidecar from the login webview, while
the title path under test has no environment dependency to isolate.

Store: Humble, origin `https://www.humblebundle.com`, opened by the operator from Manage Accounts,
then hands off. Timeline (`evidence/rph-timeline.jsonl`, 5 ms GetWindowTextW sampler):

- first title, visible at `t_open` 65989.4 ms: `https://www.humblebundle.com` (bare origin, C2 PASS)
- `t_comp` 66608.2 ms (+619 ms): `https://www.humblebundle.com — Humble Bundle - Log In` (C3 PASS)
- final title at `WM_CLOSE` (156613.4 ms): the same composed string, unchanged, HOLD 90029 ms;
  `nav_reset_episodes: 0`, no revert to the bare origin at any sample (C4 PASS, C5 PASS)

C0 cadence PASS: p99 gap 6.59 ms, max gap near open 22.03 ms. C6 PASS: the in-process channel
kept exactly two whitelisted lines, `presentation requested visible=true ...` and
`title change applied len=22`, and 22 is the byte length of the final title's document-title
part (`Humble Bundle - Log In`), matching 38-W03's own `len=22` on this page pre-fix
(`evidence/rph-shell-lines.txt`).

FIN path: **FIN-B**. The MSAA load probe never observed busy SET (its one recorded sample reads
`busy: false`), so FIN-A was unavailable by its pre-registered rule, not bypassed. FIN-B holds: the
final origin is the controlled Humble origin, and HOLD 90029 ms exceeds the 60000 ms bar. That is
anchored on sitting 4's pre-fix observation of this same page on this same machine, where the
title reverted to the bare origin. No log channel marks `Finished` in this build.

C8 PASS: zero `gamelib-shell.exe` / `gamelib-sidecar.exe` after teardown, re-checked by bash
`tasklist`. C9: 0 new `humble_login_open` lines in the shell log after offset 13683, as predicted
(the release build's `eprintln!` goes to stderr only and never reaches that file), and
re-counted independently at 0. The
independent node re-score (`evidence/rph-rescore.txt`) agrees on C2–C5 and reads
`FINAL_TITLE_COMPOSED: yes`. VERDICT: PASS (`evidence/rph-live.txt`).

`38-W03`'s FAIL, accepted as a deviation in sitting 4 (2026-09-26, pre-fix build `5b6201e26`), is
superseded by this result. `38-VERIFICATION.md` is deliberately left unedited: no documented
reason exists to rewrite it, and the item stays in `human_verification_discharged` as the
historical record.

Honest limits: one host, one launch, one page. The observation is the caption string read by
`GetWindowTextW`, not the drawn pixels. FIN-B is an anchored argument against a pre-fix control,
not a timestamp from the page's own load event, so it does not independently prove `Finished`
fired. The load probe enabled Chromium accessibility, as a screen reader would. The Linux half of
this todo's "Windows or Linux" is not exercised.

## Resolution

The runtime half of quick 260927-o3h's fix (`ae5968b07`) is confirmed live on Windows by quick
260930-rph (above). The source-shape half is pinned by
`src/backend/__tests__/tauriShellSource.test.ts`.

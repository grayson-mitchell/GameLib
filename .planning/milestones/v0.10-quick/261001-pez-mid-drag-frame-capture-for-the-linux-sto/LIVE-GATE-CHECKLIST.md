# Operator live gate: Linux store embed on the packaged build

Closes the Linux branches of 38-E03 and 38-E04 (todo
`.planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md`, `ready: live-gate`).
Everything a harness can measure is already done (see the todo's addenda and `261001-pez-SUMMARY.md`). This sitting
covers what only a person on a real profile can judge.

## Setup

- Build: `GameLib_0.7.0_amd64.AppImage` (local, README sequence) or, better, the CI-built AppImage. Note which, and its
  sha256 prefix.
- Run it by hand with your REAL profile (not a fake HOME). That is the named real-profile arm of the two-profile rule.
- Leave `WEBKIT_DISABLE_DMABUF_RENDERER` unset. Note: X11 or Wayland (`echo $XDG_SESSION_TYPE`), monitor scale, GPU mode
  (`system76-power graphics`; currently `compute`).
- Do NOT paste logs containing session data anywhere. Describe results in words.

## Checks (mark pass / fail / note each)

1. **Boots.** The app leaves the "Loading" splash within about 40 s. Note the time. (Two earlier launches stalled on the
   splash unexplained; if it happens, record it and relaunch once.)
2. **Embed shows in the slot.** Stores tab -> GOG Store: the GOG page fills the area right of the store list, below the
   toolbar, with the NavShell tabs above. No black gap, no overlap of the tabs or left nav.
3. **Logged-in store (38-E03).** Sign in to a store inside the embed. It completes, stays signed in after switching store
   tabs and back, and after an app restart.
4. **Tab round trip.** GOG -> Steam Store -> Epic Store -> GOG: the embed returns to the same place each time and never
   covers the chrome. Epic shows the "not available in-app yet" panel; that is expected.
5. **Input.** Scroll, click a link, type in a search box inside the embed. Clicking outside it (LIBRARY tab, left nav)
   still reaches the app.
6. **Drag-resize, grow (38-E04).** Slowly drag a window corner larger, then smaller, a few times. Expect a black strip
   at the right/bottom edge while growing and a catch-up within roughly 0.1 s of letting go; measured 33-54 px wide, up to
   about 1 s on an automated drag. Judge: is this acceptable, or visibly bad? That judgement is the part no harness can make.
7. **Drag-resize, shrink.** The embed must not hang past the window edge or cover the chrome (the scorer cannot see this).
8. **Maximise / restore, and a second monitor if you have one.** The embed follows both.
9. **Keyboard focus.** Click in the embed and type; then click the app chrome and use Tab or a shortcut.
10. **Cookie sharing (expected, not a failure).** The embed shares one cookie jar with the whole app on Linux. Do not treat
    cross-store sign-in leakage as a bug; it is the decided behaviour (2026-09-29).

## Known and out of scope

- E5: the in-embed Back button did not return to the previous page (macOS has the same behaviour).
- The embed's user agent still says `Macintosh` on Linux. The panel copy still names only macOS.
- Wayland, fractional scales, mixed-DPI and macOS-the-packaged-app are not covered by this gate.

## Recording the result

Reply with pass / fail / note per check, plus: build used, session type, scale, GPU mode. From that, a quick task can
add the closing addendum to the todo, and the ledger change to `38-VERIFICATION.md` is yours to approve (this gate does
not edit it). If check 3 or 6 fails, the todo stays `ready: live-gate`; a failed 6 would become a new, separate todo
about the trailing strip.

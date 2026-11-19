---
created: 2026-11-20T00:00:00.000Z
title: 'Linux signed-out detection reads unknown once Steam writes Connecting lines, so the pending note never shows the sign-in variant'
area: steam-adoption
severity: major
platform: linux
ready: code
files:
  - src-tauri/crates/gamelib-steampoll/src/adoption_evidence.rs
  - src-tauri/crates/gamelib-steampoll/src/adoption.rs
  - src/frontend/screens/Game/GamePage/components/AdoptionNote.tsx
---

## Problem

Found during the Phase 81 live gate, item 11(e) on Linux (`81-HUMAN-UAT.md`, 2026-11-20);
not caused by Phase 81's tests but it fails D-03 and D-07 on Linux. Native Debian Steam
install (`~/.steam/debian-installation`).

With Steam signed out and showing its sign-in window, a game GameLib installed (appId 63000)
showed the generic note "Steam will restart once when you press Play." The signed-out
variant ("Sign in to Steam to finish setup" with "Open Steam", `AdoptionNote.tsx:80-121`,
shown when `status.steamSignedIn === false`) never appeared. The note did stay through the
sign-out and the Steam pid change, and cleared about 3 seconds after sign-in (`Logged On`
at 05:12:33, `adoptionState appId=63000 adopted` at 05:12:36), so the clearing half works.

Cause, from the code and the log (the runtime value of `steamSignedIn` was not captured):
Linux signed-in state is `connection_log_signed_in` (`adoption_evidence.rs:253`), which
takes the last state line of `logs/connection_log.txt` and maps only `Logged On` to
`Some(true)` and `Logged Off` to `Some(false)`; any other state word returns `None`
(unknown). The sign-out wrote a `[Logged Off, 0, 0]` block at 05:08:43 to 05:08:47
(`user initiated logoff`, then `SetSteamID([U:1:0])`). From 05:08:49 the sign-in window wrote
`[Connecting, 0, 7]` and later `[Connecting, 0, 15]` lines, so the last state word was
`Connecting`, the reader returned unknown, and the note fell back to the generic text.
Spike 088 evidently saw the log end in `Logged Off`; this Steam build keeps writing
`Connecting` lines while signed out. Whether older builds differ is not verified.

User-visible harm: the note offers Play (and "Restart Steam now") while signed out, and
Play quits a signed-out Steam. There is no "Open Steam" action.

## Direction

Treat a `Connecting` state with SteamID `[U:1:0]` (the `[U:1:<id>]` token on the same line,
which reads `[U:1:0]` once signed out) as signed out, or scan back past `Connecting` and
other transient state words to the last `Logged On` / `Logged Off` line. Prefer the second:
it keeps the existing meaning of a state line and does not parse the SteamID token. Bound
the scan to the tail window already used. Add unit tests with the real sequence above
(`Logged Off` block, then `Connecting` lines, never an account id in a fixture) and a
sign-in sequence that ends `Logged On`. Confirm live on Linux: sign out, install a game,
the note reads "Sign in to Steam to finish setup" with "Open Steam", it stays across the
pid change, and it clears within about 30 seconds of sign-in (`81-HUMAN-UAT.md` item 11(e)).

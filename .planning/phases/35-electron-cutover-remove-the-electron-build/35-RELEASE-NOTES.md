# GameLib — Release Notes: The New App Shell

GameLib has moved onto a new, smaller app shell. Almost everything works the same as before, but
a handful of behaviours changed along the way. This page lists every one of them plainly, in terms
of what you'll actually notice — not what changed under the hood.

## Artwork

Game artwork (cover art, header images) now loads live from the internet every time you open your
library, instead of coming from a local disk cache. **Offline, the library shows no game art at
all** — titles, install status, and launching games are unaffected, this is cover art only. If
you're used to browsing your library on a plane or with no connection, this is the one change most
likely to surprise you.

## Linux packages

On Linux, GameLib currently ships as an **AppImage only**. We are not producing `.deb`, `.rpm`,
`.pacman`, or `.tar.xz` packages at this time, and Flatpak is no longer offered as a distribution
option at all. If you relied on one of those formats before, use the AppImage for now —
additional package formats may return in a later release.

## Updates

GameLib now updates itself through its own built-in updater. There's nothing you need to do about
this — it's simply how every release from here on will reach you.

## Signing out

All of your storefront logins share one embedded sign-in browser. Signing out of a store only
clears that store's own sign-in data from it — for Epic Games, signing out now reaches every
Epic-owned sign-in domain the browser touched, not just the main one, so a leftover Epic session
can no longer survive a sign-out. Signing out of one store does not sign you out of your other
stores; each one keeps its own session.

## Tray icon

The system tray icon works fully now. It lists your recent games — click one to launch it
directly — and lets you show or hide the GameLib window, open the About window, and quit the app.
Every setting you can toggle for the tray actually changes its behaviour. On macOS, the option to
use a dark tray icon isn't shown, because macOS already adapts the icon's appearance for you
automatically; that option remains available on Windows and Linux.

## `gamelib://` links

Clicking a `gamelib://` link (for example, from a website or another app) opens GameLib on macOS
and Linux. On Windows, `gamelib://` links are not currently supported — GameLib does not register
itself to handle them there, so clicking one will not open the app.

## Downloads that were interrupted

If GameLib is closed or crashes mid-download, what happens the next time you start it up depends
on the store. Downloads for **GOG, Epic, and Amazon Games resume automatically** on startup, same
as before. **Steam downloads do not auto-resume at startup** — you'll need to resume an
interrupted Steam download yourself from the downloads queue.

## What still doesn't work

A few things that worked in the old app remain unavailable in this one. Where an on-screen control
used to exist for one of these but didn't actually do anything, that control has been removed
rather than left in place to be clicked on for nothing:

- There is no in-app system menu bar.
- GameLib cannot read images from your clipboard (for example, to paste a custom cover image).
- Cached artwork is not available offline, as noted above.
- The confirmation dialog for removing the Epic Online Services overlay still looks like a plain
  system dialog rather than matching the rest of the app's style. This is cosmetic only — it works
  exactly the way it always has, it just looks different from GameLib's other pop-ups.

## For anyone who ran the old build

If you previously ran GameLib's old app on this machine, your operating system may still remember
that old build as the one that opens `gamelib://` links. The new app re-registers itself as the
handler, but if a `gamelib://` link ever opens something unexpected, launching the new build once
should be enough to let it take over.

---

## Appendix — internal decision trace

This section is for maintainers tracing a note above back to the decision that produced it. It is
not meant for end users.

| Release note | Decision |
|---|---|
| Artwork | D-10 |
| Linux packages | D-11 |
| Updates | D-13 |
| Signing out | D-09 (as corrected 2026-08-29 — see plan 35-09's summary and `deferred-items.md` D-35-09-01) |
| Tray icon | D-05, D-06 (plan 35-06 — all four tray settings ended up HONOURED; nothing was removed) |
| `gamelib://` links | D-07 (plan 35-07 Task 1, resolved `option-c`: macOS + Linux register, Windows does not) |
| Downloads that were interrupted | D-05 (plan 35-11, Branch A — boot-time auto-resume ported and enabled for GOG/Epic/Amazon; Steam excluded because `isStartup=true` is itself the Steam suppression) |
| What still doesn't work — menu bar, clipboard read, EOS dialog styling | D-05 (accepted-gap list); the EOS dialog item is also `D-35-11-01` in `deferred-items.md` |
| For anyone who ran the old build | D-07 / D-17 (the cutover made the new build the sole `gamelib://` registrant) |

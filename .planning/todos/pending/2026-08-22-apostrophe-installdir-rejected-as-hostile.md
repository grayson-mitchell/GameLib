---
created: 2026-08-22T09:30:00.000Z
title: "An apostrophe in a PICS installdir is rejected as 'hostile', silently redirecting the install to app_<id> — Steam then cannot adopt it"
area: steam-depot
status: OPEN
severity: major
resolves_phase: 37
planned_as: 37-10
surfaced_by: "Attempting Civilization V (8930) as a second native-macOS generalisation test, 2026-08-22"
files:
  - src/backend/storeManagers/steam/installLocation.ts
---

## Symptom

Installing Sid Meier's Civilization V (8930) logs:

```
(09:23:57) [WARNING] [Steam]: SteamGame: rejected hostile PICS installdir
"Sid Meier's Civilization V" for appId 8930, using fallback "app_8930"
```

The install is silently redirected to `steamapps/common/app_8930` instead of
`steamapps/common/Sid Meier's Civilization V`. Nothing surfaces to the user.

## Cause — one character class

`installLocation.ts:91`:

```js
const SAFE_INSTALLDIR = /^[A-Za-z0-9 ._-]+$/
```

The apostrophe is not in the allowed set, so any legitimate installdir containing one is
classified as hostile and discarded in favour of `app_<appId>`.

## Blast radius — MEASURED, and smaller than a naive count suggests

**Do not quote a title-based number.** Titles are NOT installdirs: 139 of 378 owned titles (36%)
fail this regex, but that figure is WRONG for this defect because Steam's own installdirs strip
most of the offending characters. `Half-Life 2: Deathmatch` has installdir
`Half-Life 2 Deathmatch`; the colon (108 of the 139 hits) never reaches the filesystem at all.

Measured against **real installdir values read from Steam's own `appmanifest_*.acf` files** on this
machine: **1 of 18** fails — `Len's Island`. Plus Civilization V observed live from PICS. So the
character that actually survives into installdirs is the **apostrophe**, and to a lesser extent
`&`, `(`, `)`, `™`, `®` (unverified in real installdirs — do NOT assume).

Two confirmed real cases is enough to act on; the exact population is not known and should not be
guessed. Any wider claim needs a PICS sweep of actual `installdir` values, not titles.

## Why it matters — the fallback is not harmless

Steam locates an installed game by the `installdir` recorded in `appmanifest_<appid>.acf` relative
to `steamapps/common/`. If GameLib installs to `app_8930` while Steam expects
`Sid Meier's Civilization V`:

- Steam cannot adopt the install (see `steam-adopts-acf-only-at-startup` and
  `steam-two-install-paths-acf-location` in the debug knowledge base).
- A later Steam-side install/verify may re-download the whole title into the correct directory,
  silently doubling disk usage.
- The path diverges from every other client's layout, so the install is non-portable.

**Note `Len's Island` is currently INSTALLED via Steam** and appears in the ACF sample above — so
this is not hypothetical for this user's library.

## The security intent is legitimate — do not simply widen the regex

The check exists to stop a hostile PICS response directing writes outside the install root
(traversal via `..`, absolute paths, separators). An apostrophe carries none of that risk, but
`'` should not be added by reflex either. Preferred direction:

1. Validate by **containment**, not by character allow-list — resolve the candidate against the
   install root and reject anything escaping it, mirroring `resolveContainedPath`'s approach in
   `depot.ts`. That is the property actually wanted.
2. If an allow-list must be retained, keep rejecting path separators (`/`, `\`), `..`, leading or
   trailing dots, and control characters — and allow ordinary filename punctuation.
3. Whatever the choice, the fallback must NOT be silent. A rejected installdir should surface,
   because the consequence (an unadoptable install in the wrong directory) is invisible today.

**Test that fails first:** `sanitizeInstalldir("Sid Meier's Civilization V", "8930")` must return
the name unchanged, while `sanitizeInstalldir("../../etc", ...)`, an absolute path, and a
separator-bearing candidate must all still fall back. Prove the traversal cases still reject —
widening this check without a RED traversal test would trade one defect for a worse one.

## Not the cause of the Civ V install failure

The install failed separately, ~15s later, on `HTTP error 503` fetching the manifest for depot
102000 across all three plan-build attempts — a genuine server-side condition, unrelated to this.
The installdir rejection happened first and would have mis-placed the game had the download
succeeded.

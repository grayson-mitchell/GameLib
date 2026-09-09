---
created: 2026-09-09
title: "First install of a session lands in a duplicate `app_<appid>` directory — `resolveSteamInstallTarget` runs before the Steam client connects, so PICS has no installdir to give it"
area: steam-depot
status: RESOLVED
severity: major
platform: any
ready: code
found_by: .planning/quick/260909-nzb-acf-stateflags4-live-gate/260909-nzb-LIVE-GATE.md
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/installLocation.ts
---

# Measured live 2026-09-09 (quick task 260909-nzb, four consecutive real installs)

On the **first** install of a session, GameLib installs the game into a **duplicate
directory** named `app_<appid>` instead of the title's real `installdir`.

## Evidence, from the run's own log

    [Timing] runNativeDepotDownload: ensureSteamClientReady took 0ms for appId 112100
    SteamGame: PICS returned no usable installdir for appId 112100 (absent or blank), using fallback "app_112100"
    SteamGame: appId 112100 installed to fallback directory "app_112100" (PICS installdir was absent/unresolved)
    [Timing] resolveSteamInstallTarget: total 1ms for appId 112100
    ...
    [Timing] SteamUser.ensureConnected: cold-connect path took 1629ms
    [Timing] buildDepotPlan/fetchAppInfo: attempt 1 succeeded in 232ms

## The ordering is the defect

`resolveSteamInstallTarget` completes in **1 ms** — *before* `SteamUser.ensureConnected`
has finished its **1629 ms** cold connect, and before `buildDepotPlan/fetchAppInfo`
fetches PICS appinfo at all. So on a cold session there is simply no appinfo loaded
for it to read `config/installdir` from, and it takes the `app_<appid>` fallback
every time.

`ensureSteamClientReady` returning in **0–1 ms** is the tell: it is not actually
waiting for a usable connection before the installdir decision is made.

## Proof it is ordering and not missing Valve data

In the **same session**, once the client was warm, the **same appId** resolved
correctly: runs 3 and 4 wrote `installdir "Avadon The Black Fortress"`. Valve's data
was never missing — it just had not been fetched yet at the moment the directory was
chosen.

## Consequences observed

- A **119 MB duplicate** of Avadon now sits at `steamapps/common/app_112100`,
  orphaned: the ACF points at `Avadon The Black Fortress`, so nothing references it.
- The user pays a **full re-download** for a title already fully on disk, because
  the reconciler looks in the fallback directory and finds nothing to skip
  (`jobCount=1215 reconciledSkipped=0` on the cold run vs `jobCount=0
  reconciledSkipped=1215` on the warm one).
- **This very likely explains the pre-existing `app_257350`, `app_25900` and
  `app_402060` directories** already in that folder — i.e. it has been happening
  for a while and silently costs disk.

## What to do

1. Make the installdir decision **wait for** a connected client and fetched appinfo,
   or resolve it from `buildDepotPlan`'s appinfo (which is fetched anyway, 232 ms
   later) rather than from a pre-connect read.
2. Keep the `app_<appid>` fallback for genuinely-absent installdir, but it should be
   the rare real case, not the default on every cold session.
3. Consider detecting an existing `app_<appid>` orphan whose ACF now names a
   different installdir, and offering to reclaim the space. **Do not delete
   silently** — that is user data.

## Not in scope here

The pre-existing `app_*` directories are the user's data; removing them is the
user's decision, not a code fix.

## Resolution (quick-260909-pym, 2026-09-09)

Fixed by two changes to `installLocation.ts`, plus a shared-read extraction
(`acfInstalldir.ts`) reused by `library.ts`:

1. **`fetchInstalldir`'s cold path now awaits `SteamUser.ensureConnected()`**
   before deciding, instead of returning `undefined` in ~1ms while the
   connection buildDepotPlan pays anyway 232ms later hadn't started yet.
   Bounded by a new `STEAM_INSTALLDIR_CONNECT_TIMEOUT_MS = 20000` so the inner
   worst case (20000 + `STEAM_PICS_TIMEOUT_MS` 25000 = 45000ms) stays strictly
   under `games.ts`'s 50000ms outer WR-01 bound. A connect failure, rejection,
   or timeout still degrades to the existing safe `app_<id>` fallback — no new
   hard-fail path.
2. **`resolveSteamInstallTarget` now prefers an existing on-disk ACF over
   PICS** (item 1's "resolve from data that already exists" option), reading
   it via the new shared `readAcfInstalldir()` (`acfInstalldir.ts`) before
   ever calling `fetchInstalldir`. When found, the connect/PICS round-trip is
   skipped entirely. Both the ACF and PICS candidate funnel through the same
   `sanitizeInstalldir` call — an ACF is attacker-writable, so this is not a
   bypass of that check.

Item 2 from "What to do" above (keep the `app_<appid>` fallback for the
genuinely-absent case) was already true and remains true — it fires only when
neither an ACF nor a usable PICS `config.installdir` exists.

**RED evidence** (from `installLocation.test.ts` against the unmodified
`installLocation.ts`, `quick-260909-pym-SUMMARY.md` has the full verbatim
block):

```
● resolveSteamInstallTarget › RED-1 (cold session): a cold-session resolve awaits ensureConnected and reads the real PICS installdir, instead of returning app_<appid> in 1ms

    expect(received).toBe(expected) // Object.is equality

    Expected: "Avadon The Black Fortress"
    Received: "app_12345"
```

**Item 3 — reclaiming the existing `app_257350` / `app_25900` / `app_402060`
directories — is explicitly NOT done here** and remains the operator's call,
per this todo's own "Not in scope here" section and this plan's hard
constraint 4. The ACF-precedence fix in change 2 above is what makes a
*future* reinstall of one of those three land back in its existing directory
rather than beside it; it does not touch the directories themselves.

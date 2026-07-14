---
spike: 001
name: acf-adoption
type: standard
validates: "Given a real Steam install, when GameLib derives an appmanifest_{appId}.acf from PICS data alone, then every content-identity field matches what Steam itself wrote"
verdict: VALIDATED
related: []
tags: [steam, appmanifest, acf, depot, vdf, install]
---

# Spike 001: `.acf` Adoption

## What This Validates

**Given** a game already installed by the real Steam client,
**when** GameLib generates `appmanifest_{appId}.acf` from PICS product info the way it
would in production (deriving every field, never copying Steam's file),
**then** every *content-identity* field — the ones that trigger a re-download or a
corrupted entry if wrong — matches Steam's own manifest exactly.

This gates the entire "GameLib downloads, Steam launches" model
(`.planning/notes/steam-depot-install-architecture.md`, decision D-1). If Steam will not
adopt a manifest we wrote, the model collapses back to the DRM problem and there is no
fallback.

## Scope

Ran in two gated stages:

- **Step 0 (read-only)** — generate the manifest, diff it against ground truth. Nothing
  written to the Steam install, nothing downloaded.
- **Step 1 (live swap)** — after reviewing Step 0's results, back up, swap our manifest in,
  restart Steam, observe. **Game files were never touched — only the ~2KB `.acf`.** Zero
  bytes downloaded. A verified backup was taken first so rollback needed no network.

## Research

Prior research (`.planning/notes/steam-depot-install-architecture.md`) established the
`StateFlags = 1026` approach and the minimum field set, all from reverse-engineered
community sources with **zero Valve documentation**. This spike tests those claims against
a real machine rather than trusting them.

**Design decision that made Step 0 possible with no login:** PICS product info (build IDs,
depot manifest GIDs, sizes) is readable over an **anonymous** `steam-user` CM connection.
No credentials, no QR scan, no token. This turned out to *also be the spike's central
finding* — see Finding 2.

## How to Run

```bash
cd .planning/spikes/001-acf-adoption
node diff-acf.mjs 264160      # generate + diff vs Steam's manifest (any installed appId)
node depot-detail.mjs 35720   # depot-selection forensics for one app
```

Both are read-only. `diff-acf.mjs` writes a `generated_appmanifest_*.acf` into the **spike
directory**, never into `steamapps/`.

## Investigation Trail

### Iteration 1 — naive generator, single game

Generated a manifest for WazHack (264160, 111 MB, single depot) and diffed it. Reported
7 "unexpected" field mismatches — including, alarmingly, the depot manifest GID and the
SteamID64.

### Iteration 2 — the mismatch was a lie

Read the raw `.acf` as text instead of trusting the parser. **Our generated values were
correct.** `@node-steam/vdf`'s `parse()` had corrupted the *ground truth* side. See
Finding 1 — this is the most important result of the spike.

Rewrote ground-truth parsing to use a string-preserving parser (`vdf-strings.mjs`).
Mismatches dropped from 7 to 5.

### Iteration 3 — casing and semantics

Raw file revealed Steam writes `universe` and `lastupdated` in **lowercase** (while
`SizeOnDisk`, `StateFlags`, `LastOwner` are cased), and writes `TargetBuildID = 0` when no
update is pending — not the current build ID as I had assumed. Fixed. WazHack then showed
**18 identical fields, 0 unexpected diffs, all 7 content-identity fields exact.**

### Iteration 4 — it was a fluke

Refused to accept a single-game pass. Ran the generator against all 10 other installed
games. **Every one of them failed.** Pillars of Eternity had 60 content-identity
mismatches. WazHack passed only because it is the trivial case: one depot, no DLC.

### Iteration 5 — isolating the cause

Built `depot-detail.mjs` to dump every PICS depot attribute side-by-side with whether Steam
actually installed it. This produced the decisive evidence in Finding 2.

### Iteration 6 — the live swap (Step 1)

Backed up WazHack (verified byte-for-byte), quit Steam, wrote our generated manifest over
Steam's, restarted Steam, waited 45s. Observed the result, then launched via
`steam://rungameid/264160`. See Finding 5 — **the model works.**

`live.mjs` guards the swap: it refuses to run without a verified backup, refuses while
Steam is running, and refuses if our depot selection does not exactly reproduce Steam's
(the one condition that would provoke a re-download).

## Results

**Verdict: VALIDATED** — Steam adopts a manifest GameLib wrote, verifies it, and launches
the game with zero bytes downloaded. The core architecture is sound. Two constraints and
one open item came out of it (Findings 1, 2, 6).

### Finding 1 — `@node-steam/vdf` silently corrupts 64-bit IDs (CRITICAL)

`parse()` coerces numeric-looking values to JS `Number`. Depot manifest GIDs and SteamID64s
are 64-bit and exceed `Number.MAX_SAFE_INTEGER` (9007199254740991), so they are rounded:

| Field | Raw file | After `@node-steam/vdf.parse()` |
|---|---|---|
| depot manifest GID | `3306037234848478854` | `3306037234848478700` ✗ (off by 154) |
| `LastOwner` (SteamID64) | `76561197995867096` | `76561197995867100` ✗ (off by 4) |

Writing a corrupted manifest GID tells Steam the installed content is a **different build
than it is**. Steam then force-redownloads or corrupts the entry — *precisely the "broken
and lost installs" failure this whole feature exists to eliminate.*

**GameLib already depends on `@node-steam/vdf` and already parses `.acf` files with it.**
This is probably harmless today (current code reads install path/size/state — all small
numbers), but it becomes fatal the moment we write manifests. **Verify existing call sites
before building on this.**

> **Rule for the real implementation:** 64-bit IDs are **strings, end to end**. Never let a
> manifest GID or SteamID64 touch a JS `Number`. Do not use `@node-steam/vdf.parse()` on any
> VDF containing one. `vdf-strings.mjs` in this spike is a working ~50-line replacement.

### Finding 2 — depot selection requires the user's licenses, not just PICS (SOLVED — see Finding 7)

The naive filter (match `oslist`/`osarch`, skip `dlcappid`, skip `sharedinstall`) reproduced
Steam's depot set for WazHack and **failed for every multi-depot game**.

Decisive evidence from Pillars of Eternity — two depots, identical in every PICS attribute
except which DLC they belong to:

```
291657   INSTALLED       macos   dlcappid=329080   size 15193
291658   not installed   macos   dlcappid=329081   size 22781
```

Nothing in PICS distinguishes them. The only possible discriminator is **whether the user
owns that DLC**. Depot selection is therefore a function of the user's **license list**, not
of app metadata alone.

Corollaries:
- **DLC depots the user owns ARE installed**, and Steam records `dlcappid` *inside* the
  `InstalledDepots` entry: `"35723" { "manifest" "…" "size" "…" "dlcappid" "35723" }`.
  My filter skipped them entirely — wrong.
- `optional=1` depots **without** a `dlcappid` are user-opt-in and are NOT installed
  (Trine 2 depot 35724). `optional` alone does not decide inclusion.
- Depots with `depotfromapp` + `sharedinstall` (shared redistributables) are correctly
  excluded from `InstalledDepots` — they belong in `SharedDepots`.

**This is good news for the architecture, awkward news for the spike.** Production GameLib
*is* authenticated and can read the license list (`steam-user` exposes ownership; CLAUDE.md
already documents `getOwnedApps()`). The anonymous connection that made Step 0
login-free is exactly what hid this. A production implementation has the data it needs —
but the selection rule is materially more complex than assumed, and **must be re-validated
against an authenticated connection.**

### Finding 3 — the manifest format itself is fully cracked

Everything else derived correctly and is confirmed against a real machine:

- **`SizeOnDisk` == sum of installed depot sizes, exactly.** Verified on Trine 2
  (4286837830) and WazHack (117426878). No filesystem walk needed.
- **Key casing is not free choice.** Steam writes `universe` and `lastupdated` **lowercase**;
  `SizeOnDisk` / `StateFlags` / `LastOwner` / `StagingSize` are cased. Do not "tidy" these.
- **`TargetBuildID` is `0`** when no update is pending — *not* the current build ID. Writing
  the build ID reads as "an update to X is in progress".
- **`Bytes*` fields are last-delta bookkeeping**, not install totals — Steam's WazHack values
  (575840) reflect its most recent patch, not the 111 MB install. Steam recomputes them
  during the verify pass, so they are not content-identity.
- **Real-world `StateFlags` are combined bitmasks.** Civ VII sits at `6`
  (`UpdateRequired|FullyInstalled`) — confirming Steam tolerates composite values, which
  supports the `1026` plan.

### Finding 4 — STEAM ADOPTS THE MANIFEST (the result the architecture needed)

Wrote our generated manifest over Steam's for WazHack and restarted Steam. Within ~45s,
with **no user interaction**:

```
StateFlags  we wrote : 1026  (UpdateRequired | UpdateStarted)
StateFlags  after    :    4  (FullyInstalled)          ← Steam flipped it ITSELF
```

Steam verified the on-disk content against the manifest GID we supplied, agreed with it, and
promoted the app to `FullyInstalled` on its own. Confirmed by direct measurement:

- **`steamapps/downloading/264160` — does not exist.** No staged download.
- **Game dir still 115004 KB**, and `diff -rq` against the pre-swap backup reports
  **byte-identical**. Steam did not fetch or alter a single byte.

**`StateFlags = 1026` is the correct value and the verify-don't-assert strategy works
exactly as designed.** Steam behaves as a safety net: it checks our claim rather than
trusting it, and repairs rather than re-downloads.

### Finding 5 — the game launches through `steam://rungameid` (D-1's other half)

Launched via `steam://rungameid/264160` — the exact path GameLib uses today. **The game
started and ran.** The full model holds end to end: *GameLib writes the manifest → Steam
adopts it → Steam launches the game.*

**Caveat, stated honestly:** WazHack is a small indie title and I did not independently
confirm it is Steamworks-DRM-wrapped. This proves the *launch path* works on an adopted
manifest; it does not by itself prove a hard-DRM title is satisfied. That said, the DRM check
is performed by the Steam client against its own view of ownership + install state — and
after adoption Steam's view is indistinguishable from a native install (`StateFlags 4`,
correct depot GID, app owned). The mechanism has no obvious way to tell the difference.
Worth one confirmation against a known DRM-heavy title before the phase ships.

### Finding 6 — Steam rewrites the bookkeeping fields, confirming they are not identity

After adoption, Steam rewrote exactly the fields Step 0 had flagged as non-identity, and
left every content-identity field untouched:

| Field | We wrote | Steam rewrote to |
|---|---|---|
| `BytesToDownload` / `BytesDownloaded` | 36221712 | **0** |
| `BytesToStage` / `BytesStaged` | 117426878 | **0** |
| `DownloadType` | 2 | 1 |
| `TargetBuildID` | 0 | 9044149 |
| `InstalledDepots.264162.manifest` | `3306037234848478854` | **unchanged** ✓ |
| `SizeOnDisk`, `buildid`, `installdir`, `LastOwner` | (ours) | **unchanged** ✓ |

Two lessons: the `Bytes*`/`DownloadType`/`TargetBuildID` fields are **free** — Steam
recomputes them, so getting them "wrong" costs nothing. And the Step 0 classification of
content-identity vs. bookkeeping was **empirically correct**.

(Note this contradicts the Step 0 inference that `TargetBuildID` is "always 0 when idle" —
Steam set it *to* the build id post-adoption. It simply isn't load-bearing either way.)

### Finding 7 — the depot selection rule, solved: 11/11 exact

With an authenticated connection (QR login → `steam-user` → `licenses` event), the rule below
reproduces Steam's `InstalledDepots` **exactly for all 11 installed games — depot-for-depot
and GID-for-GID.** Getting there took three corrections, each found by a game that broke the
previous rule:

**a. Ownership is granted at the PACKAGE level, via `depotids`.**

Each owned package's `packageinfo` carries both `appids` *and* `depotids`. The depot list is
the one that matters. Decisive evidence — two depots **byte-for-byte identical in PICS**
(`optional=1`, `systemdefined=1`, no `oslist`, no `dlcappid`):

```
Dead Island 201741  → Steam INSTALLED it       → in an owned package's depotids: YES
Trine 2     35724   → Steam did NOT install it → in an owned package's depotids: NO
```

Nothing in the app metadata can tell these apart. No amount of `optional`/`systemdefined`
heuristics would ever have worked. (465 packages → 1108 owned appIds, 3527 owned depotIds.)

**b. Ownership arrives through TWO channels — neither alone is sufficient.**

A DLC's package grants the DLC's *appid* but does not always list its *depot id*. So a depot
is owned if **either** it appears in an owned package's `depotids`, **or** it has a `dlcappid`
whose app the user owns. Channel 1 alone misses Trine 2's 35723, Wasteland 3's 1522651, and
Dead Island's 91342/91345.

**c. Depots can live in the DLC's OWN app entry, not the base game's.**

Wasteland 3's depot **1522651 does not exist in app 719040's PICS entry at all** — it belongs
to DLC app 1522650 ("The Battle of Steeltown"). The base app flags this with
`depots.hasdepotsindlc`. Enumerating only the base app's depots silently misses these; you
must also walk `extended.listofdlc` and fetch each DLC app's own depots.

**d. Language-specific depots** (`config.language`) must be filtered to the user's selected
language — otherwise Dead Island pulls in every localisation (it over-selected 10 extra
depots before this).

The final rule lives in `select.mjs`. Include a depot iff: it is owned (either channel), is
not a shared redistributable (`depotfromapp`/`sharedinstall`), and its `oslist` / `osarch` /
`language` match the target (or are absent).

### Finding 8 — `SizeOnDisk` is NOT a derived sum (corrects Finding 3)

Finding 3 claimed `SizeOnDisk` == sum of installed depot sizes, based on WazHack and Trine 2.
**That generalisation was wrong.** Across all 11 games, summing depot sizes is exact for
simple games and *overshoots* on complex ones:

| Game | Delta (our sum − Steam's `SizeOnDisk`) |
|---|---|
| WazHack, Trine 2, HOARD, Len's Island, Wasteland 2, Naheulbeuk | exact |
| Dead Island | +863 |
| Pillars of Eternity | +11,891,818 |
| Wasteland 3 | +236,860,930 |

Steam measures **actual bytes on disk**, not a manifest sum. Since spike 001's live test showed
Steam recomputes its bookkeeping fields during the verify pass, `SizeOnDisk` is almost certainly
**bookkeeping, not content identity** — but this was only *proven* on a game where our value
was exact. Writing a slightly-high `SizeOnDisk` on a multi-depot game is **untested**.

### Finding 9 — GID "drift" on two games is a pending update, not an error

Civ VII and 7 Days to Die reported GID mismatches. Both sit at `StateFlags 6`
(`UpdateRequired`): their `.acf` is pinned to the **installed** build while PICS reports the
**latest**. Their `.acf` is internally consistent (its own depot sizes sum to its own
`SizeOnDisk`) — it is simply stale. For a fresh install we *want* the latest build, so our
values are correct and the ground truth is the thing that's out of date.

**Rule:** when comparing against an existing install, mask out apps with
`StateFlags & UpdateRequired`.

## Signal for the Build

| Decision | Status |
|---|---|
| **Steam adopts a GameLib-written manifest** | **✓ VALIDATED.** `1026` → `4`, zero bytes downloaded, files untouched. |
| **Game launches via `steam://rungameid` after adoption** | **✓ VALIDATED** (soft caveat: confirm once on a hard-DRM title). |
| **Depot selection** | **✓ SOLVED.** 11/11 exact, depot-for-depot and GID-for-GID. Rule in `select.mjs`. |
| `StateFlags = 1026` (verify, don't assert) | **✓ Correct.** Steam verifies and repairs rather than trusting us. |
| `.acf` field set, casing, derivation rules | **✓ Solved.** Reproduced exactly on a real machine. |
| `Bytes*` / `DownloadType` / `TargetBuildID` | **Free.** Steam recomputes them. |
| Never parse 64-bit IDs with `@node-steam/vdf` | **⚠ Hard requirement.** Audit existing call sites. |
| `SizeOnDisk` | **~ Approximate.** Steam measures real bytes; a manifest sum overshoots on multi-depot games. Believed bookkeeping; **untested** when wrong. |

**The architecture is validated end to end and the depot-selection blocker is closed.**

## Next

1. **Audit GameLib's existing `@node-steam/vdf` call sites** (Finding 1) for 64-bit exposure.
2. **Spike 002 — `steam-user` depot download** (`.planning/research/questions.md` Q4). Now
   clearly worth doing: everything it feeds into is proven.
3. Confirm `SizeOnDisk` is truly bookkeeping (Finding 8) — needs a live swap on a multi-depot
   game where our value overshoots. Deferred: the candidates are 9–35 GB and a wrong guess
   provokes a large re-download.
4. Optional: re-confirm Finding 5 against a known hard-DRM title.

## Machine state after this spike

WazHack's manifest is now the one **Steam itself wrote** during adoption (`StateFlags 4`,
correct GID, healthy). The install is fully Steam-managed and was verified working. A backup
remains at `~/.gamelib-spike-backup/264160/` and can be discarded, or rolled back with
`node live.mjs restore 264160`.

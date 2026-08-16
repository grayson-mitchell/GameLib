---
created: 2026-08-16T18:30:00.000Z
title: "Two independent writers of the Steam platform signal (appdetails vs PICS oslist) have NO precedence rule — last writer wins"
area: steam
severity: medium
found_by: "Phase 34.15 code review (WR-02), front-loaded before the D-16 UAT gate; the concurrency half was then observed live during that gate"
source: ".planning/phases/34.15-steam-platform-signal-and-sync-integrity/34.15-REVIEW.md"
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/platformCapture.ts
  - src/backend/storeManagers/steam/library.ts
---

## Problem

`is_mac_native` / `is_windows_native` / `is_linux_native` are written into the SAME
`steamMetadataStore` entry by **two independent backend paths sourced from two different Steam
APIs**, with no precedence rule and no reconciliation:

- **`games.ts:648-656`** — per-game, driven by `checkBottleEligibility()` -> `ensurePlatformsCaptured()`
  (i.e. the install-form eligibility probe). Sourced from the public **`appdetails` store API**:
  `is_mac_native = !!data.platforms?.mac`.
- **`platformCapture.ts`** — bulk, added by Phase 34.15 (D-01/D-02). Sourced from the CM PICS
  **`appinfo.common.oslist`** field, which that file's own header documents as *MEDIUM confidence,
  sourced from third-party PICS dumps rather than an authoritative Valve source*.

Whichever ran most recently wins. The two sources are not guaranteed to agree for a given app.

This was the **root mechanism behind CR-01** (the Phase 34.15 code-review BLOCKER, since fixed in
`77f094bfd`). CR-01 was the *symptom* — a stale seed reaching the install dialog's glyph row. The
two-writer disagreement is the *cause*, and it is still present.

## Why it was not fixed in 34.15

Judged out of scope and explicitly assessed by `34.15-VERIFICATION.md` as **non-blocking** for that
phase's goal: it does not violate the three-valued contract (`undefined` = never captured, `false` =
confirmed absent, `true` = present) and it does not reopen either of the two ROADMAP defects 34.15
closed. Phase 34.15 verified `passed` 16/16 with this open.

## Live evidence from the D-16 UAT gate (2026-08-16)

Two things were observed on a real 378-game library that bear on this:

1. **The writers are currently COMPLEMENTARY, not conflicting.** The bulk PICS capture resolved
   363 of 378 apps; 14 of the 15 it skipped were subsequently filled by the `appdetails` path. So
   the conflict has not yet been *observed* — which is not the same as it not existing.
2. **`appdetails` is being 403-throttled in bulk** (dozens of
   `Steam metadata fetch failed for appId <id>: status code 403` in both runtimes' logs). That
   currently suppresses how often the `appdetails` writer runs at all, which further masks the
   conflict.
3. **A concurrent read-modify-write was observed live** (UAT finding F-2): on Electron, a single
   `origin=mount` fired TWO concurrent `refresh()` calls, and the second re-scoped all 378 apps
   because it could not see the first's writes. Benign only because both computed identical values
   from the same PICS response. **Two writers that disagreed would silently lose one side's write.**
   Note this concurrency half is **Electron-only** (Tauri fires one refresh per mount, confirmed
   across four runs) and therefore dies with Phase 35's Electron cutover — but the missing
   precedence rule is runtime-independent and outlives it.

## Direction

Decide an explicit precedence rule and comment the rationale. Candidate shape: PICS `oslist` is the
bulk/coarse source and `appdetails` the per-game/authoritative one, so `appdetails` should win when
both have an answer — but that is a decision to make deliberately, not to infer. Whatever is chosen,
make `mergePlatformCapture` express it rather than relying on write ordering.

Also consider whether `mergePlatformCapture`'s read-modify-write needs to be serialised, independent
of the Electron double-refresh going away.

## Related, also open from the same review

- **WR-03** — `library.ts:757-766`: the "all four exit paths emit `steamSyncStatus`" guarantee rests
  on `captureOwnedAppPlatforms`'s never-throws contract rather than a `try/catch`. Plan 09 closed
  the synchronous-throw half (`9d03d2cb2`); the contract-as-guarantee shape remains.
- **WR-04** — `librarySyncIndicator.ts:70-77`: a Steam-sync retry with cached games already present
  gives no visual feedback during the retry window. The D-16 gate measured that window at **~36
  seconds** against an unreachable CM, which makes this more user-visible than the review assumed.

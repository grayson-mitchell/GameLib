---
quick_id: 260816-i8a
status: complete
date: 2026-08-16
tasks_completed: 2
commits:
  - 14c8fd7ea
  - 8b6232363
files_changed: 4
src_changed: 0
---

# Quick Task 260816-i8a — Summary

Reconciled the Steam todo ledger against current source. **Ledger-only — zero `src/` changes.**

## What ran

Prompted by "do the todos 34.14 created", all **8** `area: steam` todos in
`.planning/todos/pending/` were checked claim-by-claim against shipped source before any routing
decision was made. Four proved still valid, three stale, one substantially shrunk. This task
closed the ledger on the latter four.

## Result

| Todo | Was | Now |
|---|---|---|
| `steam-getproductinfo-appinfo-dump` | pending, `priority: high`, `blocks:` a phase | **completed** — premise inverted |
| `steam-startup-download-resume-autoopens-crossover` | pending | **completed** — fixed beyond what it asked |
| `2026-07-18-productionize-macos-native-steam-bridge` | pending | **completed** — superseded by Phase 24 |
| `steam-bottle-gptk-engine-produces-broken-bottle` | pending, multi-part defect | **pending**, shrunk to one guard, impact downgraded |

Pending `area: steam` todos: **8 → 5**.

## Task 1 — three stale todos closed (`14c8fd7ea`)

Each moved via `git mv` (renames, not delete+add) with a `## Resolution 2026-08-16` section
citing file:line evidence, so a future reader can re-check the verdict rather than trust it.

**`steam-getproductinfo-appinfo-dump` — premise inverted.** The one-off dump was performed and
the answer was that `osarch` is *not* a usable mac-arch signal. `library.ts:1155-1162` records it
("Steam's manual osarch metadata proved absent/unreliable on every macOS launch entry — 18-01
finding, retired"); the shipped detector is instead a post-install Mach-O read, `machOArchsOf`
(`library.ts:1173`), documented as the only detector that may ever assert `mac_arch === '32'`.
The parser this note existed to de-risk was never written. Step 3's requested sample payloads
exist as `__tests__/fixtures/appinfo-64bit.json`.

The resolution deliberately records a **near-miss**: `depot/select.ts:195-198` *does* read
`osarch` and skip non-matching depots — but for depot selection, a different purpose. Without
that note, a future `grep osarch` hits live code and the todo reads as still-open.

**`steam-startup-download-resume-autoopens-crossover` — fixed beyond its own ask.** The todo
offered three escalating options (notify / confirm gate / at-minimum log). All three are
satisfied, because the startup auto-resume was removed outright rather than gated:
`library.ts:536-584` only *surfaces* the interrupted install (`install.steamResumePending: true`
+ `pushGameToLibrary` + a `steam.resumeAvailable.notify` notification) and logs "surfacing as
resumable, NOT auto-resuming". Resume moved to `resumeInterruptedSteamInstall()`, reachable only
from an explicit user Install click. The silent bottle-Steam launch the todo describes can no
longer occur.

**`2026-07-18-productionize-macos-native-steam-bridge` — superseded.** Phase 24's ROADMAP entry
cites this todo file by name as its own source. The resolution maps all five of the todo's
numbered productionization items to the plans that closed them: item 1 (C++ vtable ABI, which the
todo called "the right next frontier spike") → spike 006 + plan 24-01; item 4 (persistent
channel) → 24-02; item 5 (packaging, `zig cc` PE shim) → 24-07; routing → 24-08.

Two accuracy corrections worth noting, both from reading the phase rather than the roadmap line:

- The roadmap's "16/17 executed" gap is **24-10, the human UAT gate** (`autonomous: false`) whose
  artifact is `24-UAT.md`, not a SUMMARY.md. That UAT is `status: complete` — 3 passed, 0 failed,
  1 blocked out-of-scope. Not an unfinished implementation plan.
- The residual (item 2, API/callback breadth) is precisely quantified as **D-UAT-24-09**: Hoard
  imports 8 bare interface accessors; the shim + helper deliberately cover only `ISteamUser` +
  `ISteamFriends`; full support needs 6 more interface proxies, dispositioned as a follow-on
  milestone. Hoard was removed from the allowlist (`30cdda6a`). The resolution points future work
  at that disposition instead of leaving this todo open to carry it — the todo predates the phase
  and still treats the vtable ABI as unproven.

## Task 2 — GPTK todo shrunk (`8b6232363`)

Its own 2026-08-14 note was written mid-34.13 and missed three later changes:
`getSteamBottleSettings()` now self-heals a non-CrossOver engine **and re-persists** the
correction (`bottle.ts:310-336`, review A-21 — `539bc979c` had fixed only the getter, leaving
every other reader of the key un-healed); `resolveSubmittedBottleEngine` filters at the wizard's
submit boundary (`steamBottleDefaults.ts:164-172`, review C-03); `persistBottleWineVersion` warns
on a non-CrossOver write (`bottle.ts:371-377`), staying permissive by recorded decision B-WR-08.

**Remaining:** `provisionBottle` persists `opts.wineVersion` unchecked at `bottle.ts:702-704`,
where sibling `provisionBridgeBottle` rejects at `bottle.ts:1166-1175` (D-08/T-24-09).
`steamBottleDefaults.ts:157-162` already names this asymmetry and why that pass could not close
it (it could not edit `bottle.ts`).

**Impact downgraded to defense-in-depth, with reasoning recorded rather than asserted:** the
self-heal corrects the value whenever CrossOver is on disk, and when it is absent, Steam bottling
cannot function at all (creation is hardcoded to `cxbottle`) — so no working configuration is left
to break. Residual cost is a transient wrong store value, an implicit rather than explicit
rejection, and two sibling provisioners disagreeing about one rule — which is how the original
defect got in.

## Deliberately not done

- **No `src/` changes.** The `provisionBottle` guard is described, not implemented.
- **No changes to the four still-valid Steam todos**: `2026-08-16-steam-sync-does-not-capture-platforms`
  (high), `2026-08-16-steam-syncing-spinner-has-no-failure-state` (high),
  `2026-08-16-absent-is-mac-native` (medium), `2026-08-15-32bit-mac-steam-titles-orphan`. Each was
  re-verified against source this session and its cited line numbers still hold.
- No ROADMAP.md changes.

## Follow-on

The three verified-valid 34.14 todos are routed to a new **Phase 34.15** (Steam platform-signal
and sync integrity) per operator decision. The 32-bit orphan todo stays pending — it is
install-lifecycle, a different axis.

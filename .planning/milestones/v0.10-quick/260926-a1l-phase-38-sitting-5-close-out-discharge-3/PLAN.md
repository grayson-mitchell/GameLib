---
phase: quick-260926-a1l
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: []
files_modified:
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
  - .planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md
  - .planning/todos/pending/2026-09-26-store-filter-survives-logout-and-empties-the-library.md
  - .planning/todos/pending/2026-09-26-disabled-mui-inputs-render-black-in-dark-themes.md
  - .planning/todos/pending/2026-09-26-webview2-delete-cookie-does-not-remove-epic-cookies.md
  - .planning/todos/pending/2026-09-26-mouse-click-no-longer-opens-dropdown-disclosures.md
  - .planning/STATE.md

must_haves:
  truths:
    - "`gsd-sdk query audit-uat` reports phase 38 with EXACTLY 11 open items (was 13) and a grand total of EXACTLY 36 (was 38)"
    - "`38-VERIFICATION.md` still parses and its `status:` still reads `human_needed`"
    - "38-S02 and 38-W06 both live in `human_verification_discharged`; NEITHER remains in `human_verification`"
    - "38-S14 REMAINS in `human_verification` -- sub-case (a) passing does NOT discharge the item, because (b) is still unrunnable"
    - "38-W04 REMAINS in `human_verification` with a dated not-run note; a not-run is NOT a retirement and NOT a discharge"
    - "38-W06's `result:` records that the census READS SUCCEEDED (SUPPORTED_NONEMPTY x5), which ANSWERS the item's stated unknown in the opposite direction from the one it feared"
    - "38-W06's `result:` distinguishes the MEASURED delete-count facts from the INFERRED async-removal hypothesis"
    - "`pnpm planning-gates` passes, so all four new todos carry severity/platform/ready in that order"
    - "NO prettier claim is made: every path this task writes is under `.planning/`, which `.prettierignore:29` ignores outright (`--file-info` returns `\"ignored\": true`), so a `--check` over these paths matches ZERO files and its green is vacuous. Recorded rather than run, matching the same finding in quick `260926-8j9`."
  artifacts:
    - path: ".planning/todos/pending/2026-09-26-webview2-delete-cookie-does-not-remove-epic-cookies.md"
      provides: "The headline finding: the Windows arm of a path main.rs:7327 itself declares UNVERIFIED is now measured"
    - path: ".planning/todos/pending/2026-09-26-mouse-click-no-longer-opens-dropdown-disclosures.md"
      provides: "The disclosure regression, scoped wider than the resolved steam-caret-dropdown-dead session, with the CDP recipe pointer"
---

# Quick task 260926-a1l — Phase 38 sitting-5 close-out

## What happened

Sitting 5, 2026-09-26, Windows 11, `pnpm tauri:dev` (DEBUG build), commit `59df4c1b6`.
Four items were taken into the sitting as one batch; three were run.

| item | outcome |
| ---- | ------- |
| `38-S02` | **PASS** — discharge |
| `38-S14` | sub-case **(a) PASS**; item **stays OPEN** — (b) unrunnable on this machine |
| `38-W06` | **FAIL, accepted by operator** — discharge |
| `38-W04` | **NOT RUN** — no CI artifact exists; stays OPEN with a dated note |

## Why 38-W04 could not run, recorded so the next sitting does not re-attempt it blind

`38-W04` needs a **CI-produced** NSIS installer from a `release-tauri.yml` run. `git tag` lists
nine tags and NONE matches `v*`, so that workflow's push trigger has never fired — its own file
header says so in writing ("this pipeline has never completed a real tag-push run"). `gh` is not
installed on the operator's machine either, so no draft-release asset is reachable from it. A
locally-built NSIS would NOT discharge the item: its `why_human` is specifically that the CI
artifact "has never been executed by anything, human or CI", so a local build tests a different
artifact. This is a NOT-RUN, not a retirement and not a discharge.

## Why 38-S14 does not discharge on a passing (a)

The item's `test:` requires BOTH sub-cases. (b) needs native installs ON with <=1 library; the
operator's `libraryfolders.vdf` registers TWO real libraries and `getSteamLibraries()`
(`utils.ts:671`) reads Steam's own file filtered by `existsSync`, so the count is not a GameLib
setting that can be turned down. Forcing it by repointing `defaultSteamPath` was considered and
REJECTED in sitting 1 (it returns the `/usr/share/steam` sentinel, a synthetic single-library
state no real user has). Recording (a) as a partial result while leaving the item in
`human_verification` is the honest disposition: a half-run item that left the array would be
invisible to `audit-uat` forever.

## Tasks

1. `38-VERIFICATION.md` — move `38-S02` and `38-W06` into `human_verification_discharged` with
   full `result:` records; add `sitting_5_2026_09_26` fields to `38-S14` and `38-W04` IN PLACE
   (both stay in `human_verification`); update the `score:` line and the
   `windows_linux_dependency` note.
2. `38-HUMAN-UAT.md` — add the `## Sitting 5` session block and the frontmatter `sessions:` row.
3. `34.13-UAT.md` — walk the outcome back to the origin receipts for `38-S02` (G-QUICK-WIN /
   tauri) and `38-S14` (G-D20-CONTENTLIGHT / tauri), per relocation rule (4).
4. File four todos.
5. `STATE.md` — quick-task row.

## Origin-receipt scope

`38-S02` and `38-S14` both originate in **34.13**. `38-W06`'s origin is a Phase 35 DEBUG SESSION
(`epic-cookie-clear-read-divergence`, Resolution residual 2), relocated by quick `260901-vuy` —
not a `35-*-UAT.md` item — so its receipt is the debug session file, and the resolved session is
already closed. Record the outcome where the residual lives rather than minting a receipt key
that never existed.

<verify>
  <automated>cd "$(git rev-parse --show-toplevel)" && gsd-sdk query audit-uat 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const p38=j.summary.by_phase['38'];const tot=j.summary.total_items;if(p38!==11){console.error('FAIL: phase 38 open items = '+p38+', expected 11');process.exit(1)}if(tot!==36){console.error('FAIL: total = '+tot+', expected 36');process.exit(1)}console.log('OK: phase38=11 total=36')})"</automated>
  <automated>cd "$(git rev-parse --show-toplevel)" && test "$(gsd-sdk query frontmatter.get .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md status)" = "human_needed"</automated>
  <automated>cd "$(git rev-parse --show-toplevel)" && pnpm planning-gates</automated>
  <!-- NO prettier check. CLAUDE.md's "a formatter check belongs in every task's <verify>"
       convention assumes the written paths are ones prettier actually formats. Every path
       this task writes is under `.planning/`, which `.prettierignore:29` ignores outright.
       `npx prettier --file-info` on one of them returns `{ "ignored": true }`, so
       `--check` over these paths matches ZERO files and prints "All matched files use
       Prettier code style!" regardless of their contents. A green check here would assert
       nothing, which is the green-check-proving-nothing pattern this repo keeps stamping
       out. Asserting the ignore itself instead, so this reasoning is falsifiable: if
       `.planning` is ever removed from `.prettierignore`, this gate fails and a real
       prettier check must replace it. -->
  <automated>cd "$(git rev-parse --show-toplevel)" && npx prettier --file-info .planning/quick/260926-a1l-phase-38-sitting-5-close-out-discharge-3/PLAN.md 2>/dev/null | grep -q '"ignored": true'</automated>
</verify>

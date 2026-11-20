---
quick_id: 260926-a1l
status: complete
date: 2026-09-26
---

# Sitting 5 close-out — what shipped

Phase 38 sitting 5, 2026-09-26, Windows 11, `pnpm tauri:dev` DEBUG build, commit `59df4c1b6`.
Four items batched, three run.

| item      | disposition                       | moved?                              |
| --------- | --------------------------------- | ----------------------------------- |
| `38-S02`  | **PASS**                          | → `human_verification_discharged`   |
| `38-W06`  | **FAIL, accepted by operator**    | → `human_verification_discharged`   |
| `38-S14`  | sub-case **(a) PASS**             | **stays** in `human_verification`   |
| `38-W04`  | **NOT RUN**                       | **stays** in `human_verification`   |

`audit-uat`: phase 38 **13 → 11**, grand total **38 → 36**. `status: human_needed` intact.
The count fell by 2, not 4, and that is the point of two of these four rows.

## The result worth remembering

`38-W06` **failed, and the failure is the valuable part.** The item was filed to answer one
question: whether Epic cookie READS succeed off macOS against a window whose page never resolves.
They do — all five domain censuses returned `verdict=SUPPORTED_NONEMPTY`. That **refutes** the
"all reads reject" shape the item's own `prior_state` called the most likely off-macOS outcome,
rather than leaving it open.

What fails is the **removal**. `epicgames.com` (10 cookies present) and `unrealengine.com` (1)
both reported zero removed; `clearEpicCookies` threw via the fail-closed guard at
`legendary/user.ts:458-467`; the operator saw a sign-out error dialog. That guard is **working
correctly and is not the defect** — loosening it would recreate the fail-open substitution
`bea07cd17` removed.

This converts a **declared-unverified** assumption into a measured fact. `main.rs:7327-7335` had
already written down that the Linux/Windows `delete_cookie()` path was "UNVERIFIED … never
silently assumed fixed (nor silently assumed still broken)". It is now verified, and broken.

## The two rows that deliberately did not move

Both are honest-bookkeeping decisions, not oversights:

- **`38-S14`** — sub-case (a) passed, but its `test:` requires BOTH sub-cases and (b) needs ≤1
  Steam library against this machine's two real ones. A half-run item moved into
  `human_verification_discharged` would be **invisible to `audit-uat` forever**, which is exactly
  the silent failure this phase's `audit_tool_note` exists to prevent.
- **`38-W04`** — not run, and sitting 5 measured *why* rather than repeating sitting 4's "a debug
  build isn't an artifact": `git tag` carries **nine** tags and **none** matches `v*`, so
  `release-tauri.yml`'s push trigger has never fired. A locally-built NSIS was considered and
  rejected — the item's `why_human` is specifically that the *CI* artifact has never been
  executed. **A not-run is neither a discharge nor a retirement.**

## Four todos filed

| file                                                             | severity | ready       |
| ---------------------------------------------------------------- | -------- | ----------- |
| `2026-09-26-webview2-delete-cookie-does-not-remove-epic-cookies`  | major    | live-gate   |
| `2026-09-26-mouse-click-no-longer-opens-dropdown-disclosures`     | major    | live-gate   |
| `2026-09-26-store-filter-survives-logout-and-empties-the-library` | medium   | code        |
| `2026-09-26-disabled-mui-inputs-render-black-in-dark-themes`      | medium   | code        |

The Dropdown one is the widest: the Steam install caret **and** the library nav expanders are both
dead to the mouse while the gamepad opens them normally. That is a regression of the *resolved*
`steam-caret-dropdown-dead` session, which was verified live over CDP on this same machine two
days earlier (2026-09-24) and whose fix is still present in HEAD. The todo recommends
`/gsd-debug` over patching, and carries the prior session's working CDP recipe plus a one-minute
keyboard pre-test that discriminates its two candidate mechanisms.

The store-filter todo was **nearly mis-filed**. It first surfaced as "installed games don't show
when logged out", i.e. as a suspected regression of `7c52cb35d`/`resolveSteamVisibility`. The
operator diagnosed the real cause themselves — a store filter surviving logout of that store — and
the todo records that explicitly so it is not re-opened as the wrong bug.

## Honest limits

- **No prettier claim is made, and an initial one was withdrawn.** A `--check` over all nine
  written paths printed "All matched files use Prettier code style!" — **vacuously**.
  `.prettierignore:29` ignores `.planning`, and `--file-info` returns `"ignored": true`, so the
  check matched **zero files**. The plan's `<verify>` now asserts the *ignore* instead, so the
  reasoning fails loudly if `.planning` ever leaves `.prettierignore`. Same trap quick
  `260926-8j9` recorded; it was walked into again here and caught only by checking.
- **`pnpm planning-gates` is 12/13**, and the one failure is **pre-existing and untouched**:
  `planning-envelope-tag-gate.py` on three already-committed `260925-uok` files, independently
  logged by both `260926-8j9` and `260926-8vk`. The gate governing this task's own output,
  `todo-frontmatter-gate.py`, **passed**. Not fixed here — it is another task's debt and outside
  this close-out's scope.
- **Evidence classes differ across the four results and should not be read as equal.**
  `38-S02`'s landing half and all of `38-W06` are machine-side (on-disk manifests; `gamelib.log`).
  `38-S02`'s absence half and all of `38-S14(a)` are operator-reported — no log line exists for
  "a dialog did not open".
- **The `38-S14(a)` copy quote was elided, not byte-for-byte.** What it establishes is *which*
  string rendered (via a clause unique to `contentLightNotice`), not that every character matched
  the catalog default. Recorded in the item rather than glossed.
- **One claim inside `38-W06` is an inference, labelled as one:** a single cookie vanished between
  Rust's post-removal re-read and the TypeScript one, consistent with an asynchronous
  `delete_cookie` but not establishing it. Two timestamps are not a mechanism.
- **`38-W06`'s `expected:` could not have matched either predicted log shape**, because the
  verification sweep runs *after* the clear and the clear threw first. Recorded rather than
  corrected — the item was written assuming the read was the weak link, and that assumption being
  wrong is itself the finding.

## Receipts walked back

- **34.13** — both `human_verification_relocated` outcomes (`G-QUICK-WIN / tauri` → PASS,
  `G-D20-CONTENTLIGHT / tauri` → PARTIAL, still open) and both RELOCATED table rows.
- **Phase 35 debug session** `epic-cookie-clear-read-divergence` — residual 2
  (`NON-MACOS IS UNVERIFIED`) is now **CLOSED** with the outcome. That session stays **RESOLVED**:
  the failing mechanism is the removal, not the read divergence it was about. `38-W06`'s origin is
  that residual, not a `35-*-UAT.md` row, so the outcome was recorded where the residual lives
  rather than minting a receipt key that never existed.

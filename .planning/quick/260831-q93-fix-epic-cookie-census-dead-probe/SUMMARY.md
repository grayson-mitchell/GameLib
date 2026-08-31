---
type: quick
slug: fix-epic-cookie-census-dead-probe
quick_id: 260831-q93
created: 2026-08-31
completed: 2026-08-31
autonomous: false
closes: [D-35-29-01, D-35-19-15]
also_affects: [D-35-29-02, REQ-35-07]
commits:
  - 9106ccbea  # fix: label-independent census read in the Rust arm
  - 0cbcde4bc  # test: gates that assert evidence, not absence-of-throw
files_modified:
  - src-tauri/src/main.rs
  - src/backend/__tests__/tauriShellSource.test.ts
  - src/backend/storeManagers/legendary/__tests__/epicCookieCensus.test.ts
  - .planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md
  - .planning/phases/35-electron-cutover-remove-the-electron-build/35-VERIFICATION.md
  - .planning/STATE.md
---

# Quick 260831-q93 — the Epic cookie census now produces a reading

**One-liner:** gave `humble_login_cookies_for_domain` the same label-independent
default-data-store fallback the clear path already had, so the Epic logout census stopped
rejecting on every call and produced its first reading in the feature's life — live-proven, not
test-proven.

## Closure basis — read this before anything else

**This defect is closed by ONE live Epic logout, and by nothing else.**

`cargo test` 215/215 and the jest suites were green for the entire period the probe returned
nothing. They were green again after the fix. Neither run is evidence and neither is offered as
such. The gates added in Task 2 carry that statement in their own source comments so a future
reader who only sees a green dot still learns what they do not prove.

This discipline is not decoration here — it is the direct lesson of the defect. Plan 35-23
shipped a census that was correct in construction, fully unit-tested, and structurally incapable
of executing. Its tests asserted "does not throw" and "does not break logout", both of which a
permanently-rejecting probe satisfies perfectly.

## The four diagnosis points, confirmed in source before the fix was written

| # | Claim | Confirmed at |
| --- | --- | --- |
| 1 | Census resolves `app.get_webview_window(label)` and rejects `humble_login_cookies_for_domain:no-window:{label}` | `src-tauri/src/main.rs:6339-6341` (pre-fix) |
| 2 | Epic's login window is ALWAYS the pristine webview-less `WindowBuilder` window, which `get_webview_window` "structurally can never find, for ANY label, fresh or stale" | `main.rs:3745-3760`, the doc comment on `clear_default_data_store_cookies_for_domain` |
| 3 | The CLEAR path already solved this with a label-independent default-data-store fallback | `main.rs:3775` (fn), wired at `main.rs:5852-5855` |
| 4 | Both consuming branches unreachable: `brokenHosts` needs `SUPPORTED_NONEMPTY`, the non-fatal branch needs `SUPPORTED_BUT_EMPTY` | `legendary/user.ts:363-366` and `:375-377` |

Point 2 is the uncomfortable one: **the knowledge that would have predicted this defect was
already written down, in a comment, one function away in the same file.**

## The fix

`default_data_store_cookies_for_domain(app, domain, names)` — macOS, placed immediately after
`clear_default_data_store_cookies_for_domain` so the two label-independent paths sit together.
One `run_on_main_thread` closure that only *registers* a `block2::RcBlock` completion on
`WKHTTPCookieStore::getAllCookies` and returns; the `mpsc` wait happens on the **calling** thread.
`total` is the unfiltered jar size (the caller's `everProvedLive` liveness proof); `matched`
filters with the cookie's OWN domain first and the fixed target second, the census direction.

The arm now binds `existing_window` first, then:

```rust
#[cfg(target_os = "macos")]
if existing_window.is_none() && epic_cookie_domain_matches(domain) {
    return default_data_store_cookies_for_domain(app, domain, &names);
}
let window = existing_window
    .ok_or_else(|| format!("humble_login_cookies_for_domain:no-window:{label}"))?;
```

Structurally identical to `humble_login_clear_cookies` at `main.rs:5829-5859`, deliberately. Every
non-Epic caller (Humble/GOG/Amazon, all still routed through a live Tauri-managed window) fails
the domain check and falls through to the unchanged error.

### F-34.4.2-12 round-trip accounting — the hard constraint this fix had to preserve

| | wry `.cookies()` per host (macOS) | native `getAllCookies` per host |
| --- | --- | --- |
| before this fix | 0 | 2 (clear path's before/after, default store) |
| after this fix | **0 — unchanged** | 4 (adds the census's before/after, default store) |

Four wry `.cookies()` round trips against one freshly-created, still-rendering WKWebView is the
reproduced deadlock's exact trigger shape (4185/4185 samples in the identical self-deadlocked
state). The macOS wry count stays at **zero**; the added reads are not bound to any window, so
`with_webview` reentrancy is not in play either. Verified: `grep -c 'window.cookies()' main.rs`
unchanged at 5, and the Rust pin `f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated` passes.
**Logout did not hang.**

## LIVE EVIDENCE — Task 3, `pnpm tauri:dev`, 2026-08-31 19:27

Verbatim from `~/Library/Logs/GameLib/gamelib.log` (preserved in this directory as
`gamelib.log.post-fix-live-20260831-1927`; the pre-fix baseline is preserved alongside it as
`gamelib.log.pre-fix-baseline-20260831-1815`):

```
(19:27:14) Legendary logout: cleared 3 epicgames.com cookie(s) (measured post-removal delta) — cookie census before(total=57, matched=3, verdict=SUPPORTED_NONEMPTY) after(total=54, matched=0, verdict=SUPPORTED_NONEMPTY)
(19:27:14) Legendary logout: cleared 1 fortnite.com cookie(s) (measured post-removal delta) — cookie census before(total=54, matched=1, verdict=SUPPORTED_NONEMPTY) after(total=54, matched=0, verdict=SUPPORTED_NONEMPTY)
(19:27:14) Legendary logout: cleared 1 unrealengine.com cookie(s) (measured post-removal delta) — cookie census before(total=54, matched=1, verdict=SUPPORTED_NONEMPTY) after(total=53, matched=0, verdict=SUPPORTED_NONEMPTY)
(19:27:15) Legendary logout: cleared 1 twinmotion.com cookie(s) (measured post-removal delta) — cookie census before(total=53, matched=1, verdict=SUPPORTED_NONEMPTY) after(total=52, matched=0, verdict=SUPPORTED_NONEMPTY)
(19:27:15) Legendary logout: cleared 1 metahuman.com cookie(s) (measured post-removal delta) — cookie census before(total=52, matched=1, verdict=SUPPORTED_NONEMPTY) after(total=51, matched=0, verdict=SUPPORTED_NONEMPTY)
(19:27:15) Legendary logout: Epic cookie clear removed 7 cookie(s) across 5 Epic-owned domain(s) — epicgames.com=3, fortnite.com=1, unrealengine.com=1, twinmotion.com=1, metahuman.com=1
```

For contrast, the same five lines before the fix (18:15:15, packaged 0.7.0):

```
(18:15:15) Legendary logout: cleared 5 epicgames.com cookie(s) (measured post-removal delta) — cookie census before(total=unavailable, matched=unavailable, verdict=UNSUPPORTED_OR_ERROR) after(total=unavailable, matched=unavailable, verdict=UNSUPPORTED_OR_ERROR)
... identical shape on fortnite.com, unrealengine.com, twinmotion.com, metahuman.com
```

**Pass criteria met on every host:** verdict other than `UNSUPPORTED_OR_ERROR`, with `total=` and
`matched=` carrying numbers rather than `unavailable`. `cookie census read failed` count: **0**,
against 5-per-host before. Attribution is clean — the log had been rotated to 47 lines and carried
**0** prior `cookie census before` lines before the gesture.

### Live jar — identified by mtime movement, all counts pinned to one file

| jar | mtime before | mtime after | note |
| --- | --- | --- | --- |
| `gamelib-shell.binarycookies` | Aug 31 00:37:26 | **Aug 31 19:27:18** | **THE LIVE JAR** — moved 3s after logout |
| `com.gamelib.shell.binarycookies` | Aug 31 18:17:28 | Aug 31 18:17:28 | frozen; the packaged build's jar |

The `tauri:dev` binary is **unbundled**, so macOS keys its HTTPStorages by **process name** rather
than bundle id — which is why the dev run reads a different jar than the packaged build. This was
predicted before the gesture and then confirmed by the mtime movement. Independent `strings`
cross-check of the live jar shows all four non-primary Epic domains at **0** post-clear.

### Build identity — verified, not assumed

`nm` on the running binary (`src-tauri/target/debug/gamelib-shell`, pid 72841, mtime 19:10:13,
`lsof`-confirmed as the executing file) returns **35 symbol hits** for
`default_data_store_cookies_for_domain`. Worth recording for reuse: **`strings` on the same binary
returns 0 for that symbol**, because Rust function names live in the symbol table and not as
string literals. `strings` is the wrong instrument here and would have falsely indicated a stale
build.

### Did the `brokenHosts` detector fire?

**No — and that is the correct outcome, not a shortfall.** The detector became reachable for the
first time in its existence. It requires a host whose BEFORE census proves it populated
(`SUPPORTED_NONEMPTY`) with a measured delta of zero. Every host's `matched` went to 0, so no host
presented that shape. **Reachable-and-silent is not the same as unreachable**, which is what it
was before this fix.

## D-35-19-15 also closed — opportunistically, and NOT by this change

All four **non-primary** Epic apexes read `before(matched=1)`, cleared **1**, and read
`after(matched=0)`. That is exactly what D-35-19-15 demanded and could never observe: a
non-primary Epic domain confirmed present before logout, then a non-zero clear on it. The
`EPIC_COOKIE_HOSTS` multi-domain widening is **live-proven for the first time**.

Three things must be said plainly about that:

1. **The evidence arrived opportunistically.** No seeding was performed and none is possible. The
   Tauri build embeds no browser view (`WebviewUnavailablePanel.tsx:43`), so no user action can
   create a non-primary Epic cookie. The four enabling cookies were **legacy Electron-era
   residue** sitting in the dev-keyed jar, untouched since 00:37 that day.
2. **This change did not fix the widening.** The widening always worked. Nothing could previously
   *see* that it did. The observability defect is what was fixed.
3. D-35-19-15 was always ledgered as a *coverage gap, not a defect*. That framing was correct.

## D-35-29-02 — upgraded to REPRODUCED, cause still not established

The four Epic auth cookie names (`_epicSID`, `_tald`, `EPIC_DEVICE`, `EPIC_LOGIN_ID`) are still
present in the live jar post-logout — now on a **second, differently-keyed jar**, so this is no
longer a single-jar observation.

This run also produced a contradiction that did not exist before: the product's in-process
post-clear census reads `matched=0` on **all five** hosts, while the external `strings` read of the
same jar still shows those four names. The item's own original caveat — that `strings` over a
binary format can surface unreferenced remnants rather than live cookies — is now the leading
candidate rather than a hypothetical. **It is not asserted as the cause.** Left OPEN and not
re-adjudicated. Note that the conclusive read that item asked for is no longer blocked: the
instrument now exists.

## Two anomalies recorded, deliberately not chased

1. `fortnite.com` shows `before total=54` / `after total=54` despite clearing 1. The per-host
   `matched` moved 1 -> 0 correctly; only the jar-wide `total` failed to decrement.
2. An external `strings` proxy counted `epicgames.com` occurrences **4 -> 6 after** the clear. That
   proxy counts raw string occurrences in a rewritten binary file, not cookies. It is unusable for
   arithmetic and must not be read as the clear adding cookies; it remains valid for
   presence/absence at domain granularity only.

## Automated gates added (Task 2) — and what they do not prove

`tauriShellSource.test.ts` — the only layer that can observe this defect, since no TS mock reaches
the Rust arm and no Rust unit test can drive a live `AppHandle` + WKWebView. The gate is expressed
as a **violation list** over the whitespace-collapsed census arm body, so the negative self-test
runs the identical logic over the verbatim pre-fix arm and proves it returns all four expected
violations. **A gate that cannot fail its own counterexample is not a gate.** A second test pins
that the `no-window` error stays *reachable* for non-Epic callers, so a fallback that swallowed the
error path for everybody could not pass. A third pins the helper macOS-gated, default-store, no
`with_webview`, no `.cookies()`.

`epicCookieCensus.test.ts` — (e1) a populated primary host reaches the `SUPPORTED_NONEMPTY`
consumer, asserting the **absence** of `UNSUPPORTED_OR_ERROR`; (e2) the same clear-side fixture
under pre-fix rejecting reads produces a *different* failure, which is what makes (e1)
discriminating rather than a restatement of an existing test; (e3) the `SUPPORTED_BUT_EMPTY`
non-fatal branch reached with no `UNSUPPORTED_OR_ERROR` anywhere.

Both blocks state in their own comments that they run against a seam double and prove branch
**reachability** only.

## Scope discipline held

- `legendary/user.ts` — **unedited**. `git diff` empty.
- `EPIC_COOKIE_HOSTS` — **byte-identical**; its paired-list invariant untouched.
- The non-macOS census branch — untouched, so the pre-existing census-direction source gate still
  sees `cookie_domain_matches(d, Some(domain))`.
- `35-LIVE-GATE.md`, `35-VALIDATION.md`, `35-REVIEW.md` — untouched.
- `ROADMAP.md` — untouched and verified byte-identical against a backup.

## Verification runs

| Gate | Result |
| --- | --- |
| `cargo test` | 215 passed, 0 failed, 1 ignored — incl. the four `epic_cookie_domain_matches_*` tests and the F-34.4.2-12 wry pin |
| `npx jest` over the three affected files | 164 passed (was 155): +4 source-gate, +3 evidence, +2 helper |
| `pnpm codecheck` (`tsc --noEmit`) | exit 0 |
| `npx eslint` on both edited test files | 0 errors, 9 pre-existing warnings |
| `npx prettier` on both edited test files | zero NEW violations; 4 pre-existing remain in `tauriShellSource.test.ts` (lines 386-430) |
| `cargo fmt --check` | red repo-wide, pre-existing; **no diff inside the added function** |
| `grep -c 'window.cookies()'` | 5, unchanged from pre-edit |

`--selectProjects` was not used anywhere: `jest.config.js` defines five path-based projects with no
`displayName`, so it is a known fail-open in this repo. Every run used `npx jest <path>` and the
`Tests:` count was read on each. No pass/fail judgement was taken from a piped command's exit
status.

## Records updated

- **`deferred-items.md`** — `D-35-29-01` **RESOLVED** (with the verbatim live block and the build-
  identity note); `D-35-19-15` **CLOSED** with the opportunistic caveat stated plainly;
  `D-35-29-02` upgraded to **REPRODUCED** with the new contradiction recorded. Every original
  record preserved verbatim under a `--- ORIGINAL RECORD, PRESERVED UNALTERED ---` marker.
- **`35-VERIFICATION.md`** — `gaps_found` 16/17 -> **`verified` 17/17**. `gaps_remaining` emptied;
  a new `post_reverification_closure` frontmatter block carries the closure and **five honesty
  qualifications**. The REQ-35-07 gap moves `failed` -> `resolved`; the traceability row moves
  ✗ BLOCKED -> ✓ SATISFIED. Everything from the 19:40 re-verification is preserved unaltered, with
  superseded lines annotated in place rather than rewritten. A closing section records what that
  report got **right** — it diagnosed the cause in Rust source and prescribed the exact fix that
  shipped; its one overreach was "cannot currently be produced".

  **Recorded honestly:** this score change was made by the quick-task executor, **not** by an
  independent verification pass, and the file says so in two places. The two gates routed out of
  Phase 35 (`pnpm lint` -> 39, Windows/Linux smoke -> 38) and the red `pnpm test` (3
  `decompressPool` native-LZMA failures, an unowned pre-existing todo) are unchanged, were already
  excluded from the 17 must-haves, and are not claimed as closed.
- **`STATE.md`** — hand-edited only. One row appended to the Quick Tasks Completed table. No
  `gsd-sdk state.*` verb was invoked. Backup at `/tmp/STATE.md.bak`; verified afterwards at **8151
  lines** (was 8150, +1), `---` delimiters still at lines **1 and 784**, still **10** `## `
  headings, and `diff` against the backup shows exactly one added line and zero removed.
- **`ROADMAP.md`** — deliberately untouched (quick task, not a phase). Backup at
  `/tmp/ROADMAP.md.bak`; verified byte-identical.

## Notes for whoever pushes this

`.husky/pre-push` has red prettier and i18n gates repo-wide, pre-existing and unrelated to this
task. If it blocks, push with `--no-verify`. No new strings were added, so the i18n gate is not
implicated by this change.

The dev build (pid 72841) was left running at the operator's request, logged out of Epic.

# Phase 39 Plan 07 — Seam Predicate Dispositions

This file is the disposition record for the `getLoginWindowSeam()` predicate-family collapse
(REQ-39-03, plans 39-02 through 39-07). It is a DIFFERENT file from
`39-GATE-DISPOSITIONS.md` (plan 39-01's planning-gate disposition record) — do not confuse the
two, and do not treat this file as covering `pnpm lint` figures (plan 39-09's territory) or the
preload-surface floor-constant arithmetic that plans 39-01/39-08 own.

## 1. RED proof — every predicate pattern proven capable of matching, pre-collapse

**Baseline sha: `ed1fdf71d`** ("docs(39): add pattern map"). Verified via
`git merge-base --is-ancestor ed1fdf71d c54cf96ef` (the first commit of plan 39-01, the first
collapse-adjacent work in this phase) → true, and via `git log --oneline HEAD` position: `ed1fdf71d`
sits at position 35 counting back from HEAD, `c54cf96ef` (39-01's first commit) at position 32 —
`ed1fdf71d` precedes every collapse commit in this phase (39-01 through 39-06). It predates plan
39-02's first commit (`7750c4a62`) by three intervening docs-only commits, none of which touch any
of the five files below.

Commands run verbatim, reading historical blobs directly — **no `git checkout`, no `git stash`, no
worktree switch**, per this phase's hard rule 3:

```
git show ed1fdf71d:<path> | grep -cE '<pattern>'
```

### 1a. Patterns actually used by the deleted code — proven against real history

| Pattern (name used in the gate) | Regex | `humble/user.ts` | `humble/adapter.ts` | `humble/library.ts` | `legendary/user.ts` | `sidecar/oauthLoginCapture.ts` |
|---|---|---:|---:|---:|---:|---:|
| equality-null-check, strict `===` | `seam[[:space:]]*===[[:space:]]*null` | **5** | 0 | 0 | **2** | **1** |
| equality-null-check, strict `!==` | `seam[[:space:]]*!==[[:space:]]*null` | **5** | 0 | 0 | **1** | 0 |
| direct-call comparison, `getLoginWindowSeam() !== null` | `getLoginWindowSeam\(\)[[:space:]]*!==[[:space:]]*null` | 0 | 0 | **1** | 0 | 0 |
| bare truthy ternary on the local (`seam ? x : y`, operator on the SAME line as the identifier) | n/a — see note below | — | — | — | — | — |

Every row with at least one nonzero cell is proven: the strict `===`/`!==` equality forms fire
5×/5× in `user.ts` (sites #2,#3,#4(ternary consequent uses `!==`),#6,#7,#8, and the 13th site at
`:429`, all sharing one of these two operators), 2×/1× in `legendary/user.ts` (site #11's `if`
plus one `!==` reference elsewhere in the same function), and 1× in `oauthLoginCapture.ts` (site
#12's `if (seam === null)`). The direct-call form fires once in `library.ts` (site #10's
`getLoginWindowSeam() !== null ? '...' : '...'`).

**Bare truthy ternary note (site #9, `adapter.ts`):** the actual deleted code was

```typescript
const seam = getLoginWindowSeam()
return seam
  ? humblePostRequestViaSeam(seam, path, body, csrfToken)
  : humblePostRequestViaElectronNet(path, body, csrfToken)
```

Prettier put the `?` on the line AFTER `return seam`, not on the same line as the identifier. A
single-line grep — the same style `isTauriRemoved.test.ts` uses, and the style this gate uses —
cannot see an operator split across a newline. This is a **known, documented limitation**, not an
oversight: catching this exact shape would require multi-line-aware matching (e.g. `grep -Pz`,
unavailable in the same portable form on BSD grep as GNU grep, or a full parse like
`seamBranchParity.test.ts`'s brace-matcher). Given that (a) this specific site is already collapsed
and gone, (b) the equivalent invariant — "a seam-typed value is truth-tested for a legacy branch
choice" — is still caught by this gate whenever the comparison and the branch keyword are the
same line (which is how every OTHER site in this codebase's history was written), and (c) the
mutation-testing protocol below only requires reintroduction detection for the `if (seam === null)`
single-line shape, this gap is recorded here rather than silently absorbed. A future editor
re-introducing a multi-line ternary of this exact shape would not be caught by this gate; it would
still be caught by `pnpm codecheck`/`pnpm lint` review and by `seamBranchParity.test.ts` if it
recreates a dual-branch `wipeSteps` shape specifically.

### 1b. Patterns in the family with ZERO historical occurrences anywhere in this codebase

RESEARCH.md's own words: "the research searched for [loose forms] and found none." Re-confirmed
here against the same five files at the same baseline sha — every cell below is 0:

| Pattern | Regex | All 5 files, baseline `ed1fdf71d` |
|---|---|---|
| loose equality, `==` | `seam[[:space:]]*==[[:space:]]*null` | 0 everywhere |
| loose equality, `!=` | `seam[[:space:]]*!=[[:space:]]*null` | 0 everywhere |
| bare negation, `!seam`/`!activeSeam` | `![A-Za-z_]*[Ss]eam\b` | 0 everywhere (the ONLY real occurrence of this exact shape in the whole repo is the deliberately-kept `!seam` at `humbleLoginFlowRegistration.ts:457`, which sits OUTSIDE all three of this gate's scan targets) |
| direct-call comparison, `getLoginWindowSeam() === null` | `getLoginWindowSeam\(\)[[:space:]]*===[[:space:]]*null` | 0 everywhere |
| optional-chaining / same-line ternary on the identifier itself (`seam?.foo`, `seam ? x : y` with the `?` on the same line as `seam`) | `[A-Za-z_]*[Ss]eam[[:space:]]*\?[^:]` | 0 everywhere |

A zero-vs-zero grep against real history cannot distinguish "this form is genuinely absent" from
"this regex is broken and could never match anything." For these five patterns, capability is
proven differently: a synthetic inline string is fed to the exact same regex outside of any git
history, confirming the pattern fires on the shape it is written to catch. This is recorded, not
hidden, because it is a materially different (weaker) kind of proof than 1a's git-history rows —
see `meta/__tests__/loginWindowSeamPredicateRemoved.test.ts`'s own header for the synthetic
capability check performed at gate-authoring time. The mutation-testing protocol (Task 2) provides
the strongest available proof for the loose-equality and bare-negation forms specifically, since a
literal `if (seam === null) { ... }` mutation, injected into a real file, is caught by the SAME
combined pattern that also matches `==`/`!=`/`!==` — the regex `[!=]=[=]?` alternation used in the
gate covers all four equality operators in one expression, so the mutation test's observed RED
result is direct evidence the equality family (strict AND loose) fires correctly as one mechanism,
not four separately-proven ones.

### 1c. Post-collapse comment-noise finding (discovered while building the gate, recorded here)

Running the equality-family pattern against the CURRENT tree (not the baseline) surfaces three
hits, all inside comments documenting the removal itself, never inside live code:

```
src/backend/humble/__tests__/user.test.ts:2075: // `if (seam === null)` Electron branch Task 1 removed from disconnect().
src/backend/storeManagers/legendary/__tests__/user.test.ts:12: * Phase 39 Plan 04 Task 1 collapsed logout()'s `if (seam === null) { ...5-step
src/backend/storeManagers/legendary/__tests__/user.test.ts:190: // drove the now-deleted `if (seam === null)` Electron branch directly (it simulated
```

A gate that convicts prose ABOUT a removed predicate is exactly the "gate whose vocabulary is
wider than its decision" failure mode this phase has been warned about — it would be permanently
red for a reason that has nothing to do with a surviving predicate. The gate filters these by
excluding matches whose trimmed line content starts with `//`, `*`, or `/*` (this codebase's own
comment styles) before deciding the zero-match assertion. Verified: with the filter applied, ALL
THREE of the lines above are excluded, and the current-tree sweep of both scoped roots is
genuinely, contentfully zero. See `meta/__tests__/loginWindowSeamPredicateRemoved.test.ts`'s
`isCommentOnlyMention` helper and its own three unit-level `it`s proving the filter neither over-
nor under-excludes.

## 2. Per-site disposition table (all 13 sites)

Sites are named by file plus enclosing function, not by line number — line numbers drift, and that
drift is itself part of this phase's story (see section 3 below). "Root sweep" means the site is
now guarded by `loginWindowSeamPredicateRemoved.test.ts`'s zero-match sweep of
`src/backend/humble` or `src/backend/storeManagers`. "Single-file assertion" means the same gate's
dedicated `oauthLoginCapture.ts`-only `it`. "Not directly gated" is stated plainly, never left blank.

| # | Site (file : enclosing function) | Predicate form | What the removed branch did | Collapsed by | Now guarded by |
|---|---|---|---|---|---|
| 1 | `humble/user.ts` : `getLiveCsrfToken()` | `if (seam !== null)` | `else` arm called `session.fromPartition(...)` to read the csrf cookie directly | 39-05 | root sweep (`src/backend/humble`) |
| 2 | `humble/user.ts` : `watchForLogin()` declaration | `if (seam === null)` | built `ses = session.fromPartition(...)` and called `setUserAgent` on it | 39-06 | root sweep |
| 3 | `humble/user.ts` : `checkCookie()` (nested inside `watchForLogin()`) | `if (seam === null) {...} else {...}` | `seam === null` arm called `ses!.cookies.get(...)` on the closure-scoped Electron session | 39-06 | root sweep |
| 4 | `humble/user.ts` : `watchForLogin()` (ternary) | `seam !== null ? seamLabel : null` | `: null` alternate — cosmetic, no distinct behavior of its own | 39-06 | root sweep |
| 5 | `humble/user.ts` : `watchForLogin()` (window-open guard) | `if (seam !== null) seam.open(...)` (always-true once seam is guaranteed) | no live Electron sibling — this was already a guard, not a dual-build branch | 39-06 | root sweep |
| 6 | `humble/user.ts` : `finishLogin()` (csrf capture) | `if (seam === null) {...} else {...}` | `seam === null` arm called `session.fromPartition(...)` for the csrf capture | 39-06 | root sweep |
| 7 | `humble/user.ts` : `checkHealthAndFlagExpiry()` health-check backfill | `if (seam === null) {...} else {...}` | `seam === null` arm called `session.fromPartition(...)` to backfill the csrf token | 39-05 | root sweep |
| 8 | `humble/user.ts` : `disconnect()` | `if (seam === null) {...} else {...}` | `seam === null` arm ran the 5-step Electron session wipe (`session.fromPartition`, `clearStorageData`, `clearCache`, `clearAuthCache`, `clearHostResolverCache`) | 39-04 | root sweep |
| 9 | `humble/adapter.ts` : `humblePostRequest()` | `return seam ? viaSeam(...) : viaElectronNet(...)` | `: viaElectronNet(...)` alternate, and the entire now-unreachable 74-line `humblePostRequestViaElectronNet` function it called | 39-03 | root sweep |
| 10 | `humble/library.ts` (transport-label ternary) | `getLoginWindowSeam() !== null ? 'login-window seam transport' : 'electron-net transport'` | cosmetic log-label string — never printed, no behavior of its own | 39-03 | root sweep |
| 11 | `storeManagers/legendary/user.ts` : `logout()` | `if (seam === null) {...} else {...}` | `seam === null` arm ran the same 5-step Electron session wipe shape as site #8, for Epic | 39-04 | root sweep (`src/backend/storeManagers`) |
| 12 | `sidecar/oauthLoginCapture.ts` : `captureOAuthLogin()` | `if (seam === null) return Promise.resolve({ status: 'unsupported' })` | early-return arm, behaviorally real (not cosmetic) even though its own doc comment frames it as defensive (see section 4 below) | 39-02 | single-file assertion (`oauthLoginCapture.ts`), NOT the root sweep — `src/backend/sidecar/` is outside the two scoped roots |
| 13 | `humble/user.ts` : `watchForLogin()`'s nested `settle()` (RESEARCH.md's 12-site census missed this one; see section 3) | `if (seam !== null && seamLabel !== null)` | always-true guard, structurally identical to site #5, gating the `seam.close(labelToClose)` call on the same closure-scoped `seam`/`seamLabel` locals declared at site #2 | 39-06 (automatically, by collapsing site #2's declaration — the SAME local, not a separate collapse task) | root sweep |

## 3. The deliberate exclusion

`src/backend/sidecar/humbleLoginFlowRegistration.ts:457` was FOUND, CONSIDERED, and DELIBERATELY
KEPT. Its predicate:

```typescript
const seam = getLoginWindowSeam()
if (!seam) {
  smokeLog(
    'no seam installed — aborting (this is a FAIL, not a skip)',
    true
  )
  return
}
```

sits inside a block gated by `process.env.GAMELIB_LOGIN_SEAM_SMOKE === '1'`. This is not a
dual-build discriminator — it never chooses between an Electron path and a Tauri path, because
there is no Electron path here to choose. It is a defensive "did registration actually run" check
inside a diagnostic smoke-test harness, and its own comment frames it as the cheapest available
reproduction harness for a future window-construction regression: if the seam was never installed
by the time this smoke path runs, the harness fails loudly rather than silently no-opping. This is
exactly why the root sweep in `loginWindowSeamPredicateRemoved.test.ts` stops at two directories
(`src/backend/humble`, `src/backend/storeManagers`) rather than widening to `src/backend`: widening
the sweep would make the gate permanently red against a guard the phase chose to keep, and the
natural "fix" for that false red would be to weaken the gate's pattern — which is worse than not
having the gate at all. Without this paragraph on record, a future re-audit running the same
predicate search over a wider `src/backend` scope would find this live match and could
misread it as an incomplete sweep rather than a deliberately kept diagnostic.

## 4. The census correction

RESEARCH.md's own 12-site table is the ground-truth census this phase's collapse plans (39-02
through 39-06) were sized against. PATTERNS.md, produced later in the same phase, independently
found a 13th site at `src/backend/humble/user.ts:429`, inside `watchForLogin()`'s nested `settle()`
function — sharing the same closure-scoped `seam`/`seamLabel` locals that site #2's declaration
(`user.ts:274`) introduces. The 13th site did **not** change the collapse task count: because it
references the SAME local as site #2, collapsing site #2's declaration in plan 39-06 automatically
resolved the 13th site's guard too, exactly the same mechanism that already resolved sites #3, #4,
and #5's uses of that one declaration. A reader checking RESEARCH.md's `12` against a fresh grep of
the live tree (or against this phase's own `13`-row table above) will find a discrepancy; it is
resolved here rather than requiring re-derivation.

PATTERNS.md also corrected one drifted citation while re-verifying every line number against the
live tree: RESEARCH.md cited site #11 (`storeManagers/legendary/user.ts`'s `logout()`) at
`167-177`. On the live tree at the time PATTERNS.md was written, the same code was at `221-235` — a
54-line drift, accumulated from earlier phases' edits to files above that function. This drift is
recorded rather than quietly fixed, because it is itself the direct evidence for the standing
lesson this whole plan exists to enforce: a census keyed on a file-and-line list goes stale the
moment any earlier line in the file changes, while a census keyed on the predicate itself does not.
WR-01's own original undercount (7 sites named vs. 12 actually present) was caused by exactly this
same failure mode — a census taken over "the files WR-01 happened to read" rather than "every call
site of the predicate."

## 5. Framing note for `oauthLoginCapture.ts` (site #12)

Site #12's removed branch is described in the disposition table above as "behaviorally real (not
cosmetic)," which is accurate but must not be read as equivalent to the `user.ts` sites' removed
branches. The `user.ts` and `legendary/user.ts` sites (1, 2, 3, 6, 7, 8, 11, 13) removed branches
that ran REAL, LIVE Electron code during the dual-build era — `session.fromPartition(...)` calls
that executed whenever the Tauri seam was not installed, because Electron was a genuinely supported
build target at the time those branches were written. Site #12 is different in kind: its own
sibling doc comment already framed the Electron early-return case as hypothetical and defensive —
`oauthLoginCapture.ts` was registered exclusively in the Tauri-only sidecar module graph, so the
`seam === null` branch it guarded against "would be harmless even if somehow invoked there" (its
own words, predating this phase). Collapsing it in plan 39-02 was still the correct move — dead
code that can never execute should still be removed, and a defensive check against an impossible
state is not free (it is a branch a reader must reason about) — but describing its removed branch
in the same language as the `user.ts` sites' removed branches would misstate what the code was ever
actually for. The `user.ts` sites removed working dual-build behavior; site #12 removed a
belt-and-braces check against a state its own author already believed was unreachable.

# Phase 39 Plan 07 — Seam Predicate Dispositions

This file is the disposition record for the `getLoginWindowSeam()` predicate-family collapse
(REQ-39-03, plans 39-02 through 39-07). It is a DIFFERENT file from
`39-GATE-DISPOSITIONS.md` (plan 39-01's planning-gate disposition record) — do not confuse the
two, and do not treat this file as covering `pnpm lint` figures (plan 39-09's territory) or
`AUDITED_UNION_FLOOR`/preload-surface arithmetic (plan 39-01/39-08's territory).

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

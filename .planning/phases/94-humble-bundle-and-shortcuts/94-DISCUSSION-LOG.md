# Phase 94: Humble Bundle and shortcuts - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-24
**Phase:** 94-humble-bundle-and-shortcuts
**Areas discussed:** Login seam and timing, Humble parity oracle, Live gate and spent keys, Windows .lnk and icons

---

## Login seam and timing

| Option | Description | Selected |
|--------|-------------|----------|
| After 93 | Default order; few TS callers left to shim | |
| Early, right after 87 | Lane C; shims for store callers and signInProbe | |
| You decide | Pick at planning time | |

**User's choice:** Rejected the options to clarify, then answered in free text: "now, run in separate worktree" — 94 runs now, alongside 87, in its own git worktree.

| Option | Description | Selected |
|--------|-------------|----------|
| Relocate, keep as survivor | Move loginWindowSeam.ts out of humble/ unchanged; deleted by 92 | ✓ |
| Port seam to Rust now | Rust login-capture op shared with OAuth via shim | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Rebase per wave | Rebase onto main before each wave; merge when verified | ✓ |
| Merge once at the end | One large conflict pass | |
| Pause 87 at merge points | Merge only while 87 is between plans | |

| Option | Description | Selected |
|--------|-------------|----------|
| Worktree-local STATE | Fold in only 94's completion row at merge | ✓ |
| Shared STATE, snapshot/restore | Write main's STATE with snapshot/restore | |

---

## Humble parity oracle

| Option | Description | Selected |
|--------|-------------|----------|
| Synthetic + one real capture | Synthetic fixture goldens plus one redacted real-account sync | ✓ |
| Synthetic fixtures only | Nothing from the account committed | |
| Real recorded responses only | 86-style full recording | |

| Option | Description | Selected |
|--------|-------------|----------|
| Goldens + port pure-logic tests | Pure suites as Rust tests; stateful flows by golden replay | ✓ |
| Golden replay for everything | | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Byte-identical round trip | No-op sync must write back identical bytes | ✓ |
| Semantic equality | | |

---

## Live gate and spent keys

| Option | Description | Selected |
|--------|-------------|----------|
| One throwaway key | Reveal one key, mark redeemed, undo | ✓ |
| Error paths only | No reveal live | |
| Already-revealed key only | | |

Shortcut checks (multi-select): Desktop + Applications .app ✓, Add to Steam ✓, Iconless fallback ✓

| Option | Description | Selected |
|--------|-------------|----------|
| Signed 94 over signed branch-point | Proves no new Keychain prompt | ✓ |
| Signed 94 over last shipped release | | |
| Dev build is enough | | |

---

## Windows .lnk and icons

| Option | Description | Selected |
|--------|-------------|----------|
| Keep PowerShell | Same argv/stdin through gamelib-proc | ✓ |
| Native Rust .lnk crate | | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Valid icns, same geometry | ic11 512x512 decodable | ✓ |
| Byte-identical icns | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Byte-identical golden + hostile names | run.sh, Info.plist, .desktop incl. injection cases | ✓ |
| Byte-identical, normal names | | |

---

## Wrap-up

**User's choice:** Write CONTEXT on main (scoped commit), then create the phase-94 worktree with build prep.

## Claude's Discretion

- Crate layout (gamelib-humble / gamelib-shortcuts suggested)
- reqwest cookie handling for the Humble session
- Plan order inside 94

## Deferred Ideas

None.

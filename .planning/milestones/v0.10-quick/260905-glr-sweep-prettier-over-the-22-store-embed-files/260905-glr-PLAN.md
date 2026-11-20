---
quick_id: 260905-glr
slug: sweep-prettier-over-the-22-store-embed-files
date: 2026-09-05
mode: quick
status: planned
ships_code: true
---

# Quick Task 260905-glr — Plan

Green the `pnpm prettier` pre-push leg, which has exited 1 since the Phase 40 store-embed work
landed. 22 files need reformatting.

## This is not assumed to be cosmetic

Quick `260901-ud5` swept 46 files and found **3 of them carried real changes** — a `.prettierignore`
edit, a `require()` reflow that carried a call out from under its `eslint-disable-next-line`, and a
sha256 pin that had to be re-pinned because the sweep reformatted the file it guards. So the
hazards get checked *before* the write, and the "purely cosmetic" claim gets measured after.

## Pre-sweep hazard analysis

| Hazard | Finding |
|---|---|
| A digest/sha pin guarding any of the 22 | **None.** Checked each path against every file containing `sha256`/`createHash(`. One apparent hit was a false positive — `loginInFlightUiReachability.test.tsx` matches on `createHashRouter`, not a digest. |
| Line-anchored directives that a reflow could orphan | **Three** `eslint-disable-next-line` (`useStoreEmbedHost.test.tsx:258` rules-of-hooks, `WebViewDeepLinkAndRestore.test.ts:72` no-implied-eval, `useStoreEmbedHost.ts:300` exhaustive-deps). No `prettier-ignore` anywhere. |
| `meta/fixtures/store-embed-wire-args.json` — a **fixture** in the set | Consumed two ways. TS: `import wireFixture from …json` then `wireFixture.store_embed_open` / `Object.keys` — parsed, whitespace-safe. **Rust: `include_str!` at `src-tauri/src/main.rs:9332`** — the raw bytes are embedded, then `serde_json::from_str`. Whitespace-insensitive in principle, but this must be **run**, not reasoned about (see below). |
| Per-directory prettier config | `src/preload/.prettierrc` sets `printWidth: 120`, and `src/preload/api/storeEmbed.ts` is in the set. Prettier resolves config per file, so a single in-place invocation is correct. Do **not** stage through a temp copy — that resolves a different config ([[prettier-check-on-a-temp-copy-resolves-a-different-config]]). |

## Why the Rust side gets run rather than argued

`main.rs:9320`'s own comment records why that fixture exists: on 2026-09-05 a live gate found
`store_embed_open` rejecting every call, because the sidecar sent positional arrays while the Rust
parsers read a single object. **Every gate was green — both sides were tested; the contract between
them was not.** Reformatting the one artifact that binds them and then reasoning that "serde is
whitespace-insensitive" would repeat that exact mistake in miniature.

## Steps

1. Capture the exact 22 paths from `pnpm prettier` output.
2. **Baseline `pnpm test:ci` before any edit**, so no failure can be silently inherited.
3. Back up all 22 to the scratchpad (for an AST comparison, and to restore without `git checkout --`).
4. `npx prettier --write` on exactly those 22.
5. Verify (below).

## Verification

- **AST equality**, not diff-reading: parse pre- and post-sweep with the repo's own `typescript`,
  walk both trees, compare node kinds plus identifier/literal text. Any structural difference must
  be explained. Prove the comparison non-vacuous by injecting a line and watching it fail.
- `meta/fixtures/*.json` parse-compared structurally.
- **`cargo test store_embed_wire_contract`** — all 4 must pass against the reformatted bytes.
- `pnpm test:ci` — the failing set must be *identical*, compared as a set, not just by count.
- ESLint compared **per file and per rule** repo-wide, not by total. A net-zero total can hide two
  offsetting changes, and the three directives above are exactly what would offset.
- All four pre-push legs exit 0.
- `pnpm i18n --fail-on-update` writes nothing outside the 22 (a reflowed `t()` call can change what
  the parser extracts).

## Anti-goals

- Touch nothing outside the 22 — `git status` must show exactly 22 modified files.
- Do not "fix" the pre-existing `tauriShellSource.test.ts` failure; it is a different defect.
- Do not hand-edit formatting; the tool's output is the contract.

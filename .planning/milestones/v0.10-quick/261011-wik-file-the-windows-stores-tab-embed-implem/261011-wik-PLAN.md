---
phase: quick-261011-wik
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/todos/pending/2026-10-11-stores-tab-embed-not-implemented-on-windows.md
autonomous: true
requirements:
  - QUICK-261011-wik
estimate:
  tokens: 8000
  raw_tokens: 8000
  tasks: 1
  confidence: high
---

# Quick 261011-wik: file the Windows Stores-tab embed implementation todo

## Why

The operator observed that the Windows build shows no store in the Stores tab and found no
pending todo for it. Investigation (this session) confirmed: the in-app store/wiki embed is
compiled and rendered only on macOS and Linux; Windows gets `WebviewUnavailablePanel` and every
`store_embed_*` RPC returns `unsupported-platform`. Phase 38 ledger item `38-E01` was discharged on
the spike 027 harness, not the shipped app, so the implementation task was never filed.

## Task 1 — write the pending todo

<action>
Create `.planning/todos/pending/2026-10-11-stores-tab-embed-not-implemented-on-windows.md` with
`severity: major`, `platform: windows`, `ready: code` (bare, in that order, after `area:`).
Body: the gap (frontend gate at `WebView/index.tsx` ~514, the ten Rust `:unsupported-platform`
arms, the Cargo target tables), how tracking was lost (38-E01 discharged on spike 027), what spike
027 already proved on WebView2, the fix shape mirroring quick 260930-blh, the live Windows
verification needed, and non-goals (Epic D-05, cookie isolation, login windows).
</action>

<verify>
`python3 .planning/todos/todo-frontmatter-gate.py` passes (self-test + live walk).
Formatter: `npx prettier --file-info` reports `.planning/` as ignored, so no `--check` is run —
it would be vacuous.
</verify>

<done>
The todo exists in `pending/`, the gate is green, and the file is committed.
</done>

# Phase 85: Store host, config and versioned migrations - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-21
**Phase:** 85-store-host-config-and-versioned-migrations
**Areas discussed:** Cutover and rollback, Downgrade to v0.10, Legendary config import, Upgrade proof and corpus

---

## Cutover and rollback

| Option | Description | Selected |
|--------|-------------|----------|
| Per family, flag-gated | Caches, then user-state, then token-bearing, then config.json last, each behind GAMELIB_STORE=rust\|ts until the live gate | ✓ |
| Per family, no flag | Same order; each flip final when its plan lands | |
| One big switch | All stores flip together at the end | |

| Option | Description | Selected |
|--------|-------------|----------|
| Refuse after migration | TS fallback opens Rust-migrated stores read-only (refuse-newer) | ✓ |
| Restore from backup | Fallback restores the pre-migration backup, then runs TS | |
| No fallback at all | Backups are the only recovery | |

| Option | Description | Selected |
|--------|-------------|----------|
| Inside Phase 85 | Last plan deletes the flag and the TS owner path after the live gate | ✓ |
| After one release | Ship the flag for a release (conflicts with SC5) | |

**User's choice:** all recommended.

---

## Downgrade to v0.10

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, unless a migration ran | Byte-compatible files at the same versions; bumped stores read-only in v0.10 | ✓ |
| Fully supported | No version bumps in 85 at all | |
| Not supported | Upgrade only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Byte-identical | Roundtrip diff test asserts identical bytes | ✓ |
| Semantically equal | Same JSON value and order; whitespace may differ | |

---

## Legendary config import

| Option | Description | Selected |
|--------|-------------|----------|
| Delete it | Record reachability, delete legendary.ts, MigrationSystem, migrationsStore mirror | ✓ |
| Port it to Rust | Keep the first-run import as a Rust step | |
| Let reachability decide | Research decides | |

| Option | Description | Selected |
|--------|-------------|----------|
| Leave it on disk | store/migrations.json stays; v0.10 downgrade still sees it applied | ✓ |
| Remove it | Clean up on first Rust boot | |

---

## Upgrade proof and corpus

| Option | Description | Selected |
|--------|-------------|----------|
| Signed v0.10 → signed 85 build | Operator live gate, zero prompts, sign-ins survive | ✓ |
| Dev build → signed 85 build | Different code signature from what users have | |
| Defer to Phase 99 | Tests only in 85 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Operator profile + v0.8/v0.9/v0.10 profiles | Generated in a fake HOME, redacted, checked in | ✓ |
| Operator profile only | | |
| Synthetic fixtures + operator profile | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Automated check, no live gate | CI asserts the same keyring names on Windows and Linux; live check rides with 99 | ✓ |
| Live check on each OS | | |
| macOS only | | |

---

## Claude's Discretion

- Mirror shape for sync TS reads, read-your-writes, storeChanged vs snapshot ordering, Windows rename with an open file, boot sequence for migrations
- gamelib-store crate vs widening gamelib-core store.rs
- Native channel shapes; how corpus fixtures are generated and pinned

## Deferred Ideas

- Live Windows/Linux credential upgrade checks: Phase 99
- Restore-from-backup rollback lever: not built

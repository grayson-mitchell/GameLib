---
created: 2026-11-08T00:00:00.000Z
title: 'Move the keyring helpers from login_window.rs to keyring_dispatch.rs'
area: shell
severity: minor
platform: any
ready: code
---

Phase 71 left six keyring items in the `login_window.rs` parent by planner decision (D-05: anything
that does not belong to a planned cluster becomes a todo, not a move):

- `KEYRING_READ_TIMEOUT`
- `keyring_get_result`
- `KeyringOutcome` (enum and its `impl`)
- `keyring_outcome_message`
- `keyring_get_outcome`
- `bounded_keyring_read`

They have nothing to do with login windows; they only landed there because the pre-split `main.rs`
grew them next to the login code. The natural home is `keyring_dispatch.rs`, which owns the
`keyring_*` dispatcher arms that call them.

Their unit tests are co-located in `login_window.rs`'s test module and are scheduled to move with
the helpers in Wave 5, so any move should also take those tests and re-point
`SHELL_SOURCE_FILES` / `SHELL_SOURCE_PARTS` ordering if needed. Run `moveproof` (Layer 3) over the
move so each item is proven byte-identical.

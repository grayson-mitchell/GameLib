---
phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
plan: 18
type: execute
gap_closure: true
status: complete
completed: "2026-07-24T18:47:00.000Z"
tasks_completed: 2
tasks_total: 2
key-files:
  modified:
    - src-tauri/tauri.conf.json
key-decisions:
  - "Branch B taken: the original updater keypair was unrecoverable, so a fresh keypair was regenerated and enrolled, and the committed pubkey was synced to its public half"
---

# 34-18 Summary — GAP-B human half: re-enroll updater signing secrets (Branch B)

## What was done

Closed the HUMAN half of GAP-B. Live run 30084918812 failed both the Linux and
Windows legs at updater signing with `incorrect updater private key password:
Wrong password for that key`, because the two secrets on `grayson-mitchell/GameLib`
were enrolled ~55 minutes apart and never formed a matched pair.

**Branch taken: B (keypair regenerated).**

### Task 1 — Re-enroll a verified matched pair (human-action checkpoint)

The developer first proved locally, using 34-17's `pnpm verify:updater-key`, that
neither the recalled password nor an empty password decrypted the original
`~/.tauri/gamelib-updater.key` — each attempt returned the discriminated
`password-mismatch` verdict (the exact live-run failure, reproduced in seconds
instead of ~13 minutes of CI). Since the original key/password could not be
recovered as a matched pair, the developer regenerated the keypair
(`tauri signer generate -w ~/.tauri/gamelib-updater-v2.key`), stored the new
password in a password manager, and enrolled BOTH secrets together from stdin on
the fork repo.

Confirmed via `gh -R grayson-mitchell/GameLib secret list` (orchestrator-run):
- `TAURI_SIGNING_PRIVATE_KEY` — `2026-07-24T18:42:56Z`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — `2026-07-24T18:42:57Z`

The two are **1 second apart** — a single-sitting matched-pair enrolment, which
is exactly the fix for the original 55-minute split.

### Task 2 — Sync the committed public key (Branch B path)

Replaced `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` with the public
half of the regenerated keypair, verbatim as supplied by the developer. The diff
is confined to that single line; every other field (including 34-14's updater
endpoint URL) is byte-identical. `tauriConf` Backend suite is 39/39 green.

Committed as `caa15b75`.

## Root cause of GAP-B (recorded for the record)

During the original 34-03 setup, the developer pressed **Enter through the hidden
`read -rs PW` prompt** without realizing it was awaiting input. The key and the
password were therefore captured from different sources and never matched. This is
an enrolment defect, not a repo defect — precisely what 34-17's preflight is built
to catch fast.

## Key IDs (public — safe to record)

| | Minisign key id (comment rendering) |
|---|---|
| New / authoritative | `9A02F7E0C9FC04C7` |
| Superseded (old) | `ECC69C7849AA1AA7` |

No private key or password is recorded anywhere in this summary, in git, or in any
log. Regenerating the trust anchor was safe: no GameLib release has ever shipped a
Tauri updater artifact, so no installed client held the old public key — there was
nothing to break.

## Verification

- `gh secret list` — both `TAURI_SIGNING_*` secrets updated 1 second apart. ✓
- `git show caa15b75 -- src-tauri/tauri.conf.json` — only the `pubkey` line changed;
  new value decodes to `untrusted comment: minisign public key: 9A02F7E0C9FC04C7`. ✓
- `pnpm exec jest --selectProjects Backend --testPathPattern tauriConf` — 39/39 green. ✓

## Pending developer-run confirmation

The final end-to-end proof — running `pnpm verify:updater-key` locally with the
newly enrolled `~/.tauri/gamelib-updater-v2.key` + its password against the
NOW-updated committed pubkey, expecting **exit 0** (no more `pubkey-mismatch`) — is
a developer-run local check. It could not be run by an executor, which holds
neither secret. This is the same code path CI's preflight will exercise on the next
tag push.

## Out of scope / next

This plan does NOT re-run 34-07's six-step live tag-push gate. That gate (deferred
by the user) is re-executed through the phase's normal re-verification now that
34-16, 34-17, and 34-18 are all closed. Passing it is what finally checks REQ-34-09.

## Self-Check: PASSED

- [x] Task 1 (human-action) resolved via Branch B — matched pair enrolled 1s apart
- [x] Task 2 — committed pubkey synced to the regenerated key's public half
- [x] Diff confined to the pubkey line; tauriConf 39/39 green
- [x] No private key or password recorded anywhere
- [x] SUMMARY, STATE, ROADMAP updated

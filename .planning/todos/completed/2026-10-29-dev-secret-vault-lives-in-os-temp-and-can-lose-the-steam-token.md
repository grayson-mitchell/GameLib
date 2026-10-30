---
created: 2026-10-29
title: "Dev secret vault lives in os.tmpdir() and can lose the Steam refresh token between dev sessions"
area: steam-auth
severity: minor
platform: macos
ready: human
source: "quick 261029-s5l (deferred from 2026-10-29 token-absent todo)"
status: "RESOLVED 2026-10-30: by design, no code change. The dev vault stays disposable in os.tmpdir()."
---

## Problem

`src/backend/sidecar/devSecretVault.ts:80` deliberately places the plaintext dev vault in `os.tmpdir()`, not `userData`, because it is disposable. In the 56-25 session the vault was `{}` with mtime 06:00 on 2026-10-29 in `/var/folders/.../T`, so the Steam refresh token was lost between dev sessions and Steam installs were refused.

## Next

Decide: persist the dev vault somewhere durable, or keep it disposable. Whether a plaintext secret store may live outside temp is a design and security call, not a small change. Impact is reduced now: quick 261029-s5l makes the UI prompt a Steam re-sign-in before any install starts, and live-gate PC12 preflights the token.

## Resolution (2026-10-30)

Decided: keep the dev vault disposable in `os.tmpdir()`. No code change.

- Moving the file gains little privacy. `/var/folders/.../T` is already private to the user (0700), the same as `~`.
- A durable location under `~` costs more. Time Machine skips `/var/folders` but backs up most of `~`, so a plaintext Steam refresh token would end up in backups.
- The impact is already mitigated. Quick 261029-s5l prompts a Steam re-sign-in before any install starts, and live-gate PC12 preflights the token. The cost of a lost token is one QR re-scan.
- Likely cause, not confirmed (the 10-29 logs have rotated out): macOS purged the aged file from `/var/folders/.../T`, and the next sidecar boot recreated it as `{}` (`ensureVaultFileCreated`). A slot wipe would leave `{"steam-refresh-token": ""}`, not `{}`.
- The vault is opt-in in name only. `pnpm tauri:dev` always sets `GAMELIB_DEV_SECRET_VAULT=1` (`package.json:32`), so every dev session uses it.

Revisit only if re-scans become frequent. The rejected option was `~/Library/Caches/GameLib-dev/`: Time Machine skips it by default and macOS purges it only under storage pressure.

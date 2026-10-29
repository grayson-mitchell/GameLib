---
created: 2026-10-29
title: "Dev secret vault lives in os.tmpdir() and can lose the Steam refresh token between dev sessions"
area: steam-auth
severity: minor
platform: macos
ready: human
source: "quick 261029-s5l (deferred from 2026-10-29 token-absent todo)"
---

## Problem

`src/backend/sidecar/devSecretVault.ts:80` deliberately places the plaintext dev vault in `os.tmpdir()`, not `userData`, because it is disposable. In the 56-25 session the vault was `{}` with mtime 06:00 on 2026-10-29 in `/var/folders/.../T`, so the Steam refresh token was lost between dev sessions and Steam installs were refused.

## Next

Decide: persist the dev vault somewhere durable, or keep it disposable. Whether a plaintext secret store may live outside temp is a design and security call, not a small change. Impact is reduced now: quick 261029-s5l makes the UI prompt a Steam re-sign-in before any install starts, and live-gate PC12 preflights the token.

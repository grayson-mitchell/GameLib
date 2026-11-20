---
quick_id: 260930-bif
description: Prune arm64 Linux helper binaries from the x86_64 AppImage bundle
source_todo: 2026-09-30-ci-linux-appimage-unresolved-needed-libs
---

# Quick 260930-bif

Task 1: in `.github/workflows/release-tauri.yml`, step "Prune non-frontend build intermediates before bundling", add a Linux-only prune of `build/bin/arm64/linux`, guarded by `test -f build/bin/x64/linux/comet`.

Verify: `npx prettier --check .github/workflows/release-tauri.yml` (prettier sees it: `ignored: false`); YAML parses.

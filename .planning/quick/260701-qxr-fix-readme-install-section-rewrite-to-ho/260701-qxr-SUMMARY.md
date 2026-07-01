---
quick_id: 260701-qxr
slug: fix-readme-install-section-rewrite-to-ho
title: Fix README install section for GameLib
date: 2026-07-01
status: complete
---

# Quick Task 260701-qxr — Summary

Rewrote the README's install instructions to reflect GameLib's reality.

## Problem
The Installation section (inherited from Heroic) told users to download prebuilt
`.deb`/`.rpm`/AppImage/`.tar.xz`/Flatpak/AUR/WinGet/Homebrew packages from
Heroic's release URLs. The fork has **no published releases or packages**, so
every one of those links would install Heroic, not GameLib.

## Changes (commit `46ef57f7`)
- **Installation section rewritten** to honest build-from-source instructions:
  Prerequisites (Git, Node ≥22, pnpm 10, Steam client, FUSE), a Linux
  quickstart (clone fork → `pnpm install` → `download-helper-binaries` →
  `pnpm dist:linux` → run `dist/GameLib-*.AppImage`), and a Windows/macOS
  pointer. Artifact name verified against `electron-builder.yml`
  (`productName: GameLib`).
- **Dev section**: clone URL → `grayson-mitchell/GameLib`, `cd GameLib`,
  "build Heroic binaries" → "build GameLib binaries", `### Building Heroic
  Binaries` → `### Building GameLib Binaries`.
- **Index**: fixed the broken top anchor (`#heroic-games-launcher` → `#gamelib`)
  and replaced the old distro sub-entries with Prerequisites / Linux /
  Windows-macOS to match the new structure.

## Deliberately left alone (legitimate attribution / out of scope)
- Heroic credits in Sponsors / Credits / Weblate (GPL fork attribution).
- Deeper dev-tooling subsections (VS Code, Docker, Nix dev) still say "Heroic" —
  branding gap, but not install-related.

## Verification
- No Heroic release/download links remain in the install section.
- All new index anchors resolve to existing headers.

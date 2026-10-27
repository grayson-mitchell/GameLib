# Publish checklist: overlay `gst-libav-1.24.13` (macOS x86_64)

**Published 2026-10-27**
(https://github.com/grayson-mitchell/GameLib/releases/tag/overlay-gst-libav-1.24.13-x86_64,
prerelease, 13 assets plus `SHA256SUMS`). The live gate passed the same day:
284100 downloaded the overlay and reached its main menu. Keep these steps for
re-publishing or for the next overlay. GameLib downloads the archive from the URL pinned in
`src/common/knownFixOverlayCatalogue.ts`, so the asset must exist at exactly:

https://github.com/grayson-mitchell/GameLib/releases/download/overlay-gst-libav-1.24.13-x86_64/gst-libav-1.24.13-macos-x86_64.tar.gz

1. Rebuild the archive and require `pinned: match`:

   ```
   pnpm build:overlay-archive --source "$HOME/Library/Application Support/gamelib/overlays/gst-libav-1.24.13" --out <somewhere outside the repo>/gst-libav-1.24.13-macos-x86_64.tar.gz
   ```

   Expected: `sha256=57e5f74b66116d5074771cfc18c112a5a8b7e8b76a71b0897496e2dedbc7cced size=8279592`
   and `pinned: match`. The pin was taken with Node v22.23.4; the bytes depend
   on Node's bundled zlib, so use the same Node. If it says `MISMATCH`, do not
   upload; the per-file sums are the content truth, re-pin deliberately.

2. Create the GitHub release on `grayson-mitchell/GameLib`: tag
   `overlay-gst-libav-1.24.13-x86_64`, title "Overlay: gst-libav 1.24.13 (macOS
   x86_64)", marked as a prerelease and not latest, so it does not shadow app
   releases. A non-app tag of this shape is safe: `release-tauri.yml` triggers
   only on `v*` tags (checked), and `meta/releaseTags.ts` pins runner tool tags
   only and is unaffected.

3. Upload these assets:
   - the archive `gst-libav-1.24.13-macos-x86_64.tar.gz` from step 1
   - `THIRD-PARTY-NOTICES.md` from the repo root
   - `COPYING.LGPL`: the LGPL-2.1 text, taken from the gst-libav tarball's
     `COPYING` and FFmpeg's `COPYING.LGPLv2.1`
   - the zlib and bzip2 licence files (from the tarballs below)
   - `gst-libav-1.24.13.tar.xz` from
     https://gstreamer.freedesktop.org/src/gst-libav/gst-libav-1.24.13.tar.xz ,
     checked against the `.sha256sum` beside it
   - the FFmpeg corresponding source. Cerbero 1.24.13 builds FFmpeg 6.0 from
     the ffmpeg.org tarball plus one patch, not from a meson-port commit (the
     `6b6d772` in THIRD-PARTY-NOTICES.md is the build id the binaries report):
     `ffmpeg-6.0.tar.xz` from https://ffmpeg.org/releases/ffmpeg-6.0.tar.xz
     (sha256 `57be87c2…37082`, the recipe's `tarball_checksum`), plus
     `recipes/ffmpeg/0001-Add-Meson-build.patch`, `recipes/ffmpeg.recipe` and
     `recipes/gst-libav-1.0.recipe` from
     https://gitlab.freedesktop.org/gstreamer/cerbero/-/tree/1.24.13/recipes ,
     uploaded with a `cerbero-1.24.13-` prefix
   - zlib 1.2.12: https://zlib.net/fossils/zlib-1.2.12.tar.gz
   - bzip2 1.0.8: https://sourceware.org/pub/bzip2/bzip2-1.0.8.tar.gz
   - for provenance, the original package URL
     https://gstreamer.freedesktop.org/data/pkg/osx/1.24.13/gstreamer-1.0-1.24.13-universal.pkg
     (record its sha256 in the release notes)

4. Live gate, after publishing:
   - Move the hand-copied `overlays/gst-libav-1.24.13/` aside. Otherwise
     idempotency finds it valid and the download path is never exercised.
   - Launch 284100. In gamelib.log confirm the download/verify lines and
     `known-fix env applied: GST_PLUGIN_PATH=... (overlay)`, and that the main
     menu is reached.
   - Then delete `fixes/local/284100-steam.json` and lift the knownBad entry
     (both per the todo's done-when).

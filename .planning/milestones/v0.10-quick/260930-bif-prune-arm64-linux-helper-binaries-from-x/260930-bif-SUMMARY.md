---
quick_id: 260930-bif
status: complete
---

# Summary

**Evidence for "inert":** the ubuntu-22.04 leg is x86_64-only (`sidecar_triple: x86_64-unknown-linux-gnu`). `archSpecificBinary()` (`src/backend/utils.ts`) resolves `bin/${process.arch}/linux`, then falls back to `bin/x64/linux`. An x86_64 process cannot select `bin/arm64/linux`. The todo's RPATH/dlopen caveat is moot because the files are now removed.

**Change:** Linux-only `rm -rf build/bin/arm64/linux` in the prune step, preceded by `test -f build/bin/x64/linux/comet` so it fails loud rather than shipping an empty helper tree.

**Verified:** prettier --check and YAML parse pass. **NOT verified:** CI-only change; unproven until the next `release-tauri.yml` run and an `appimage_smoke.ts --mode census` showing `STATIC_NEEDED_UNRESOLVED=0`.

**Not done (scope):** the same reasoning applies to `build/bin/arm64/win32` on the x86_64 Windows leg (`comet.exe` etc.), but nothing has flagged it; left alone.

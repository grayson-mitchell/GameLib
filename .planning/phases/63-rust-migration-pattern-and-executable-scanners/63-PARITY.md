# Phase 63 Parity Record (D-12 tier 2)

## Run 1

- Date: 2026-11-06 (UTC), machine: Graysons-Mac-Studio (macOS, real profile arm)
- Command: `pnpm scanner-parity-sweep`; inputs: exes=103, dlls=394, wineBundles=2, requests=2196
- Exit code: 1 (diffs present). No oracleBroken abort, not exit 3.
- No Rust change was needed, so no second full sweep was run; run 1 is the final run.

## Final per-scanner table

| scanner | checked | equal | diff | verdict |
| --- | --- | --- | --- | --- |
| peSections | 497 | 497 | 0 | clean |
| peSteamDrm | 1491 | 1491 | 0 | clean |
| importScan | 103 | 99 | 4 | divergent (Rust correct; awaiting user acceptance) |
| drmScanExe | 103 | 103 | 0 | clean |
| machoExports | 2 | 2 | 0 | clean |

## Divergences

All four are the same cause, op `scan_steam_api_imports`:

| input (hash/basename) | ts (normalised) | rust (normalised) |
| --- | --- | --- |
| ec53cbd65145/FALLOUTW.EXE | `{"error":"<unreadable-pe>","status":"error"}` | `{"arch":"none","dll":null,"status":"ok","symbols":[]}` |
| ec53cbd65145/falloutwHR.exe | same | same as above |
| 987dbfab23ba/fallout2.exe | same | same as above |
| 987dbfab23ba/fallout2HR.exe | same | same as above |

- Cause: these Fallout 2 executables are Watcom-linked PEs whose every section header has
  VirtualSize = 0 (BEGTEXT, DGROUP, .bss, .idata, .reloc, .rsrc). The import directory RVA
  (0x2c0000, in `.idata`) is therefore outside every section if only VirtualSize is used.
  `objdump --private-headers` fails with "RVA 0x2c0000 for import table not found", which the TS
  oracle reports as an error. The native reader follows the PE loader rule (VirtualSize 0 means
  the raw size is the span), finds the table, sees no steam_api import, and returns ok with no
  symbols.
- Correct side: Rust. The files are valid PEs that load and run (under Wine); an error status
  claims they are unparseable. The TS result is an objdump limitation, not intended behaviour.
- Pinned: yes, by the unit test `zero_virtual_size_section_spans_raw_size` in
  `src-tauri/crates/gamelib-scan/src/pe/imports.rs` (synthetic PE, no game bytes). No golden
  fixture was added because the TS golden oracle (objdump) cannot represent the case.
- Caller impact: both outcomes mean "no steam_api import found, no shim import closure", so the
  shim decision is the same; only the status label differs.
- User decision: pending (Task 3 checkpoint). Until accepted, `importScan` stays `'ts'`.

## A5 (ordinal-only static imports)

No sweep diff was attributable to ordinal-only steam_api thunks: all 99 other importScan inputs
matched. This neither refutes A5 nor proves a real steam_api import used an ordinal; the sweep
output does not say whether any did. Treated as holding on the real corpus (zero ordinal-related
diffs), still pinned by the synthetic golden `import-ordinal-mixed`.

## 63-05 golden overrides carried forward

None. 63-05 recorded no `rustOverride` entries; Rust equals the TS goldens everywhere.

# Phase 73 Parity Report (plan 73-16)

Status: TS run done, Rust run pending.

## Corpus (Task 1, operator decision: option-a with edits)

Parity library: `PARITY_LIB` (a dedicated Steam library folder outside the operator's real library; the path is kept out of this report).

| Label | Title | D-14 bullet | Expected evidence (from the `[depot-rust] outcome` line) |
| ----- | ----- | ----------- | -------------------------------------------------------- |
| civ5 | Sid Meier's Civilization V | zip/deflate (pk) per 067a; counts as LZMA only if `vz` > 0 | `pk` > 0 |
| dredge | DREDGE | zstd / VSZa | `vsza` > 0 |
| stellaris | Stellaris | multi-depot cross-depot path collision | `collisions=` > 0 plus the `cross-depot path collision detected` warning |
| humankind | HUMANKIND | Mach-O +x fallback | `macho=` > 0 |
| redist | Schedule I: Free Sample | shared-redist job | `acf=none` |

LZMA coverage is open: if no title shows `vz` > 0 after the Rust run, propose Civilization: Beyond Earth as the LZMA addition (not swapped silently). The Binding of Isaac was dropped: it is 32-bit and was redirected to the bottle, outside the native path and the parity library.

A title whose evidence is 0 is reported to the operator with a replacement suggestion; it is not swapped silently.

The six Phase 74 stale bridge fixtures (Manor Lords, Core Keeper, Abiotic Factor, Planet Crafter, Hell Clock, Mining Mechs) are excluded and are not installed, updated or touched in this plan.

## Task 2 notes

### TS run (GAMELIB_DEPOT_PIPELINE=ts), from the app log

| Label | App id | Depots | TS seconds (downloadSteamDepots) | Bytes (selected depot size) |
| ----- | ------ | ------ | -------------------------------- | --------------------------- |
| civ5 | 8930 | 34481.. (macOS set) | 301.2 (an earlier attempt was cancelled at 12.9 s and discarded) | 7716100293 SizeOnDisk |
| dredge | 1562430 | 1562432 | 46.7 | 812771281 |
| stellaris | 281990 | 281991, 281993, 553280, 554350 | 782.5 | 30426752686 SizeOnDisk |
| humankind | 1124300 | 1124302, 1124303 | 1006.9 | 37754293437 SizeOnDisk |
| redist | 3205720 | 3205721 (windows) | 123.0 (a full bridge-game install, not into the parity library) | 2218973886 |

Peak RSS: not sampled (no answer from the operator; default is to note it as not sampled).

### Shared-redist bullet on the TS run
Not exercised. After the Schedule I install the log shows no redist download, and at launch it says "shared redists already settled, nothing to do". `Steamworks Shared` already exists in the operator's real Steam library. The redist bullet needs that state set aside before the run (see the checkpoint).

### Incidents (not part of the parity result)
- The operator had set `defaultSteamPath` to the parity steamapps folder, which produced a false "Steam hasn't been opened" prompt and a failed uninstall of the real Civ V. It has been restored to the default Steam path, and the parity library is registered in Steam's libraryfolders.vdf.
- Civ V was uninstalled from the real library so it could be installed into the parity library; the operator must reinstall it in the real library after the plan.
- Parity library layout: the installs landed in a nested `steamapps/steamapps` under the registered folder.

### Between runs
Within the parity library only, each TS ACF, game tree and the workshop folder were renamed with a `.ts-parity` suffix, so the library shows no installed titles and no appmanifest for the Rust run.

### Redist bullet set-aside (operator approved, "ok redist")
The TS run's launch logged `shared redists already settled, nothing to do`, so the redist job was a no-op. Both were GameLib-owned state, not the operator's real Steam library, which was not touched:
- The per-bottle ledger `gamelib-shared-redists.json` of the Schedule I bridge bottle: backed up next to itself as `gamelib-shared-redists.json.parity-bak`, then only its `settled` key removed (its `done` map was already empty).
- GameLib's redist cache `steam_store/sharedRedist` (about 261 MB) renamed to `sharedRedist.ts-parity`.
- Schedule I's game tree in the bridge bottle was not touched (not approved).

Order: TS relaunch and one Schedule I launch (TS redist job) -> rename the new `sharedRedist` to `sharedRedist.ts-parity2`-style TS copy and re-cold the state -> Rust run and one Schedule I launch (Rust redist job).

Restore after the plan: delete the Rust-run `sharedRedist`, rename the original `sharedRedist.ts-parity` back to `sharedRedist`, and copy `gamelib-shared-redists.json.parity-bak` back over the bottle ledger.

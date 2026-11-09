# Phase 73 Parity Report (plan 73-16)

Status: corpus chosen, installs pending.

## Corpus (Task 1, operator decision: option-a with edits)

Parity library: `PARITY_LIB` (a dedicated Steam library folder outside the operator's real library; the path is kept out of this report).

| Label | Title | D-14 bullet | Expected evidence (from the `[depot-rust] outcome` line) |
| ----- | ----- | ----------- | -------------------------------------------------------- |
| civ5 | Sid Meier's Civilization V | LZMA-heavy | `vz` > 0 (067a measured it zip-heavy, so it counts as LZMA only if `vz` > 0) |
| dredge | DREDGE | zstd / VSZa | `vsza` > 0 |
| isaac | The Binding of Isaac | zip/deflate | `pk` > 0 |
| stellaris | Stellaris | multi-depot cross-depot path collision | `collisions=` > 0 plus the `cross-depot path collision detected` warning |
| humankind | HUMANKIND | Mach-O +x fallback | `macho=` > 0 |
| redist | Schedule I: Free Sample | shared-redist job | `acf=none` |

A title whose evidence is 0 is reported to the operator with a replacement suggestion; it is not swapped silently.

The six Phase 74 stale bridge fixtures (Manor Lords, Core Keeper, Abiotic Factor, Planet Crafter, Hell Clock, Mining Mechs) are excluded and are not installed, updated or touched in this plan.

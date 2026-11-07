---
status: complete
quick: 261108-ekv
---

# 261108-ekv: noUncheckedIndexedAccess for src/backend/engine

Two commits on main:
- `d04cc89f4` chore: reconciled baseline drift (meta 328->342, scanners 3->4, sidecar 155->165, testUtils 11->15); baseline JSON only.
- Adoption commit (`refactor(quick-261108-ekv)`): 45 engine sites fixed. perGameBottle `encodeAppName` iterates `bytes.entries()`; tests use a local `defined()` helper (engineDecision `seq`, gameProcessWatch `make`, engineSwitch, fallbackEngine, gameEngineState). Engine added to ADOPTED_BUCKETS and the ratchet-test assertion, removed from the baseline. Todo updated (1682 in all, 67/72 drift note).

Verification: ratchet exit 0, engine `--list` empty, codecheck, 30 engine/ratchet jest suites (549 tests), boundaries, planning-gates, prettier all green. No `!` or widening casts added. knip reports three pre-existing unused exports in perGameBottle.ts (CROSSOVER_CREATE_FAILED, CROSSOVER_CREATE_TIMEOUT, PROVISION_ABORTED), not touched here.

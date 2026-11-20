---
quick_id: 261117-sin
type: quick
autonomous: true
files_modified:
  - .planning/state-sdk-field-anchor-gate.py
---

# Quick 261117-sin: repoint the field-anchor gate's drift check at gsd-core

<task type="auto">
  <name>Task 1: Scan gsd-core's compiled library instead of the 1.42.3 SDK source</name>
  <files>.planning/state-sdk-field-anchor-gate.py</files>
  <action>Discovery looks in GSD_CORE_LIB_DIR, then $CLAUDE_CONFIG_DIR/gsd-core/bin/lib, then
  ~/.claude/gsd-core/bin/lib, which must contain state-document.cjs, and scans every *.cjs there.
  CALL_SITE_RE also matches the compiled `(0, mod.stateExtractField)(...)` form; a new
  FIELD_VALUE_RE reads `stateFieldValue(fm, body, key|null, 'Body Field')`. Quoted groups exclude
  newlines. Version comes from gsd-core/VERSION. Pin the three new literals gsd-core 1.21.0 uses
  (Completed Phases, State Head, milestone) as required-0. Add a scanner fixture self-test
  (floor 13 -> 14).</action>
  <verify>gate exit 0 against the real install; no-install run falls back and passes; a planted
  unknown literal (GSD_CORE_LIB_DIR fixture) fails with DRIFT; `pnpm planning-gates` 12/12.
  Prettier: the .py sits under prettier-ignored `.planning`, so no formatter check applies.</verify>
  <done>Drift check runs against gsd-core and is green.</done>
</task>

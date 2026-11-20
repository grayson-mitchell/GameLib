---
quick_id: 261117-sdc
type: quick
autonomous: true
files_modified:
  - .planning/milestones/v0.8-phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-VERIFICATION.md
  - .planning/milestones/v0.7-phases/25-steam-depot-download-multi-host-fan-out-throughput/25-VERIFICATION.md
---

# Quick 261117-sdc: bring two VERIFICATION statuses into gsd-core's closed set

gsd-core 1.21.0 `audit-uat` aborts on any VERIFICATION `status:` outside
passed | gaps_found | human_needed. Two archived reports are outside it.

<task type="auto">
  <name>Task 1: Re-status 25 and 40</name>
  <files>the two VERIFICATION.md files above (frontmatter only)</files>
  <action>25: `pass` -> `passed` (its status_note already records the pass). 40:
  `gaps_closed_partially` -> `passed` plus a status_note, because every item it left open has since
  closed in a completed todo (GAP-D 260905-e61/260909-tgx, GAP-E 260905-c40, Turnstile wontfix,
  adtraction operator decision). `gaps_found` would re-raise closed gaps. Body untouched.</action>
  <verify>`gsd-tools audit-uat --raw` exits 0 with parse_gap_files 0; planning-frontmatter-gate.py exits 0;
  `pnpm planning-gates` no new failure. Prettier: both paths sit under `.planning`, which is
  prettier-ignored, so no formatter check applies.</verify>
  <done>audit-uat runs; frontmatter valid.</done>
</task>

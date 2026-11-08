
- 72-07: tauriShellSource.test.ts had 2 failures not caused by 72-07:
  1. RESOLVED (b2e86b427): REQ-34.3-11 finder-reveal pin was a 72-04 regression in the test only; the code moved to shell_open.rs with behaviour intact, and the pin was followed there.
  2. PRE-EXISTING, out of scope: WR-07 `.title(` string-literal test hits store_embed.rs ~2337 "Invite a friend". Fails at the commit before 72-04 too; not phase 72.

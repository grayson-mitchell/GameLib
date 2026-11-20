---
status: complete
quick: 261108-et9
---

# Quick 261108-et9 Summary

Enabled `noUncheckedIndexedAccess` in tsconfig.json (inherited by meta/eslint configs), retired the ratchet, closed the todo.

Commits:
- ad65218e9 build: enable flag (0 drift sites)
- 031953b5e chore: removed ratchet .cjs, baseline, test, package script, CI step; repointed steamLineCeiling.cjs comment
- e1cafb3f5 docs: todo moved to completed/ with Resolution

Verification: `pnpm codecheck` green; knip ratchet, planning-gates pass; Meta jest only known failures (genI18nGateScope, logSecretGate, x86CallbackWineHarness). YAML parse not run (no pyyaml); edit was a clean block removal.

Follow-up candidate: relay/tsconfig.json (standalone, not typechecked in CI) has 16 sites with the flag forced on.

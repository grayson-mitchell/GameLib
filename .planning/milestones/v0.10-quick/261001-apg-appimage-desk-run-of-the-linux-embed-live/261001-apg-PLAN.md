---
quick_id: 261001-apg
type: quick
---

# AppImage desk run of the Linux embed live-gate checklist

Run the automatable part of `261001-pez/LIVE-GATE-CHECKLIST.md` on the local AppImage (sha prefix `a89ac8bb`) under a fresh
fake profile: embed in slot, and the mid-drag grow / shrink / real-pointer arms using the 261001-pez scripts. Record the
result as an addendum on the pending todo. No code changes. `.planning` is prettier-ignored, so no prettier check.

Verify: every scored run VALID (pre-drag and final frames score 0); `pnpm planning-gates` passes.

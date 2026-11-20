---
phase: quick-260925-auy
plan: 01
type: quick
autonomous: false
---

# Quick 260925-auy: finish the operator's machine-translation re-fill

The orchestrator ran this inline, with no planner or executor. The fixes were small, and the
operator ran each re-fill with their own API key between the steps.

1. Delete the 3 major-finding keys the 260925-88h invalidation did not cover: fi
   `sideload.filter.images`, fi `webview.login.oauth.timeout.body`, and hu
   `themeSelector.oldSchool`. Prove first that rewriting the JSON leaves it byte-identical.
2. Fix the fill script so it accepts plural forms that correctly omit `{{count}}`. Only
   single-integer CLDR categories qualify. Write the tests first and confirm they fail.
3. Add a translator note for `themeSelector.oldSchool`.
4. Mirror the rule in `gamelibCatalogParity.test.ts`. The operator re-fills `ar,fi,hu`, then
   `ar,hu`. Re-record the baseline, commit, and close the re-fill todo.

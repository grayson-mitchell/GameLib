# Quick Task 261026-b9r: First-run welcome screen with macOS App Management step - Context

**Gathered:** 2026-10-26
**Status:** Ready for planning

<domain>
## Task Boundary

Close two pending todos together:
- `.planning/todos/pending/2026-10-24-request-macos-app-management-permission-at-first-run.md`
- `.planning/todos/pending/2026-10-22-first-run-welcome-screen-instead-of-changelog.md`

Build the first-run welcome screen, which replaces the changelog on the first ever launch only. It has three parts: (1) log into your stores, (2) macOS only: Windows games need CrossOver, please support CodeWeavers by buying it, (3) macOS only, when CrossOver is installed: grant App Management, with the reason, a deep link, live status and a relaunch note.

</domain>

<decisions>
## Implementation Decisions

### Placement (operator decision, 2026-10-26)
- The operator chose "Build welcome screen too" over a pre-install gate or a standalone dialog. The App Management step lives inside the new first-run welcome screen, beside the CrossOver step.
- Out of scope: a pre-install gate before `cxbottle --create`. Record it as a follow-up in SUMMARY.md. If the welcome is dismissed without granting, the mid-install prompt can still appear.

### Avoidance
- Not possible. CrossOver's own bottle-template pipeline is the writer (see RESEARCH.md Finding 1). Do not attempt to avoid or redirect the write.

### Grant detection
- Backend IPC returns `'granted' | 'denied' | 'unknown' | 'not-needed'` from a create-and-unlink probe inside the detected CrossOver bundle's `Contents/`. EPERM maps to denied, EACCES and other errors to unknown, and no CrossOver or a non-macOS platform to not-needed (RESEARCH.md Finding 2).
- The welcome step re-checks when the user returns to the window (focus or visibility change), or with a "Check again" button. A grant needs a relaunch, so after "granted" the step says to relaunch. If a relaunch command already exists, offer a "Relaunch GameLib" button.

### First run vs upgrade
- First run means no persisted "welcome seen" marker AND no evidence of a previous install. An existing install that upgrades into this build must still get the changelog, not the welcome. The executor picks the most reliable existing signal (for example the stored last-seen version that HeroicVersion already uses) and documents why.
- After the welcome is dismissed, persist a marker so it never shows again. Upgrade behaviour and "Hide changelog on startup" are unchanged.

### Strings
- All new strings go in the `gamelib` i18n namespace, with every locale filled, as in phase 51-04.
- The CrossOver line must not claim GameLib installs or sets up CrossOver. It should read sensibly whether or not CrossOver is detected.

### Claude's Discretion
- Visual layout of the welcome (modal versus full screen). Reuse the existing dialog/modal components and follow sketch-findings-gamelib.
- Whether to also add a Settings row showing App Management status. Optional; skip if it adds meaningful scope.

</decisions>

<specifics>
## Specific Ideas

- Deep link: `x-apple.systempreferences:com.apple.preference.security?Privacy_AppBundles`
- CrossOver purchase link: https://www.codeweavers.com/crossover
- Explain why in plain words. CrossOver's bottle setup changes files inside app bundles, and macOS asks for "App Management" permission for that. Without it, Windows game installs stall partway through with a macOS notification.

</specifics>

<canonical_refs>
## Canonical References

- 261026-b9r-RESEARCH.md (live TCC evidence, probe semantics)
- The two todo files above
- `Skill("gamelib-conventions")`: the `<verify>` prettier rule, spawn isolation (`createFakeHomeProfile()` if any test spawns), and the todo frontmatter rule if a follow-up todo is filed
- `Skill("sketch-findings-gamelib")` for UI direction

</canonical_refs>

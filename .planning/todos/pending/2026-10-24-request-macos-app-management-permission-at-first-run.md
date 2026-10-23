---
created: 2026-10-24
title: "macOS 'GameLib was prevented from modifying apps' prompt appears mid-install; ask for App Management at first run instead"
source: 51-29 representative sample (operator report, on every install so far)
area: onboarding
files:
  - src-tauri/src
  - src/frontend/components/UI/NavShell/components/HeroicVersion/index.tsx
severity: medium
platform: macos
ready: code
---

On every install or launch in the 51-29 sample, macOS shows its notification that GameLib was
prevented from modifying other apps. That is the TCC App Management service,
`kTCCServiceSystemPolicyAppBundles`. It appears partway through an install, long after the user
has set anything up, and it gives no hint which action caused it. The operator granted the
permission and restarted GameLib to continue.

Operator ask: setting up permissions should be a step at first install or run, not something
that ambushes you later.

Work:
1. **Find the trigger.** Identify which write lands inside another app's bundle: something under
   `CrossOver.app`, or `~/Library/Application Support/Steam/Steam.AppBundle`, or a bottle
   operation that CrossOver performs on GameLib's behalf. Capture it with
   `log stream --predicate 'subsystem == "com.apple.TCC"'` during an install. If the write can be
   avoided, by writing outside the bundle, the permission is not needed at all. Prefer that.
2. **If it is needed,** add a first-run permissions step on macOS. It should explain why, deep-link
   to System Settings > Privacy & Security > App Management
   (`x-apple.systempreferences:com.apple.preference.security?Privacy_AppBundles`), and detect
   whether access was granted. Put the step in the first-run welcome flow
   (`2026-10-22-first-run-welcome-screen-instead-of-changelog.md`) beside the CrossOver step.
   GameLib must be relaunched after the grant, so say so.
3. Strings go in the `gamelib` namespace with all locales filled.

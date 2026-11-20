---
status: complete
quick_id: 261115-tk8
commit: 6254354b2
---

# Quick 261115-tk8: Remove dead Weblate / Heroic link plumbing

Removed six dead renderer channels (openWeblate, openSupportPage, openDiscordLink, openGithubSponsorsPage, openWikiLink, openReleases) end to end (zod tables, preload, sidecar registration, regenerated `ipc_contract.rs`, tests), plus constants weblateUrl, supportURL, discordLink, githubSponsorsPage, wikiLink, heroicGithubURL, GITHUB_API. Five knip-baseline lines deleted. Kept Heroic wiki links (sidInfoUrl, NvidiaPrime WIKI_URL, Mac winetricks message) carry an "intentional" comment. Support.md is GameLib/Ko-fi only; FUNDING.yml lost the `github:` and `ethereum:` lines. Addendum: PRIVACY.md:153 now names the GameLib wiki, a few Heroic wiki help pages and Ko-fi. Pre-flight greps found no extra callers. Single commit (not per task).

## Verification
- `pnpm codecheck`: green. `pnpm check:ipc-contract`: up to date (diff removed exactly the six names). `cargo check` (src-tauri): green.
- jest (shellFilesFlows, ipcSchemas, appShellFlows, tauriTransport, LanguageSelector): 72/72 on the two sidecar suites in the final run; all suites green.
- Scoped prettier on all 19 edited TS/TSX/MD/YAML paths: clean (file-info checked: markdown/yaml parsers, not ignored).
- `pnpm find-deadcode`: FAILS only on `SteamUpdateInfo.scss` (new knip finding), from another session's uncommitted GamePage work; not caused by this task. None of this task's baseline lines misfire.

## Notes
- Working tree held concurrent foreign edits in appShellFlows.test.ts and shellFilesFlows.test.ts (79-39 boot-restore `await flush()` hunks) and some earlier transient test failures from them; I committed only my hunks via a filtered `git apply --cached`. Foreign staged deletions (steam anonymousClient/cmLogonId/steamUserLogonAbort) were temporarily unstaged for the commit and restaged afterward.
- public/locales and WebView `wikiURL` untouched.

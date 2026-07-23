# Phase 31: Tauri IPC re-plumb slice 2 — settings and config - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-23
**Phase:** 31-tauri-ipc-re-plumb-slice-2-settings-and-config
**Areas discussed:** Settings surface breadth, Write path faithfulness, Dialog cluster + sync, Native pull-forward

---

## Settings surface breadth

| Option | Description | Selected |
|--------|-------------|----------|
| Steam + generic only | Port write path (setSetting/writeConfig) + generic reads (getUserInfo, getSystemInfo, getLogContent, hasExecutable, getMaxCpus); leave Epic/GOG/Amazon tool-version, EOS-overlay, egsSync rejecting non-fatally (Invariant B). Mirrors Phase 30 D-07. | ✓ |
| Full settings surface | Port every runner's tool-version + EOS channels too. | |
| You decide | Claude picks the boundary during research. | |

**User's choice:** Steam + generic only
**Notes:** Keeps the sidecar import graph and the slice tight for a Steam-focused Tauri build; other runners' tool plumbing is never exercised. → CONTEXT D-01.

---

## Write path faithfulness

| Option | Description | Selected |
|--------|-------------|----------|
| Persist + accept divergence | setSetting/writeConfig persist through Phase 29 store layer; Tauri UI already holds the value (SettingsContext), so no new push; Tauri↔Electron divergence accepted (D-03/D-07). | ✓ |
| Add live-reflect push | Wire a settingsChanged push to re-render live / sync across builds. | |
| You decide | Claude determines during research whether a reflect push is needed. | |

**User's choice:** Persist + accept divergence
**Notes:** Consistent with the two-token divergence and cross-process clobber already accepted in SEAM.md; convergence stays deferred to Phase 35. → CONTEXT D-02.

---

## Dialog cluster + sync

| Option | Description | Selected |
|--------|-------------|----------|
| Real async, no-op the Sync pair | showMessageBox/showErrorBox/showSaveDialog real via rustInvoke + tauri-plugin-dialog; showMessageBoxSync/showOpenDialogSync stay logged no-ops (safe default) — sync-over-async deferred. | ✓ |
| Only what ported flows hit | Grep ported flows, port exactly the members they reach, defer the rest. | |
| All five real, solve sync-over-async | Make the sidecar block on the Rust call to emulate the Sync variants. | |

**User's choice:** Real async, no-op the Sync pair
**Notes:** Reuses Phase 30's dialog_open forward-to-transport precedent. Planner must escalate (not silently degrade) if a ported flow genuinely needs a Sync member. → CONTEXT D-03.

---

## Native pull-forward

| Option | Description | Selected |
|--------|-------------|----------|
| Logged no-ops, defer to Phase 33 | showLogFileInFolder (shell.showItemInFolder) + copySystemInfoToClipboard (clipboard) are conveniences, not flow-blockers; logged no-ops, defer shell/clipboard clusters to Phase 33. | ✓ |
| Pull forward now via rustInvoke | Real showItemInFolder + clipboard now (D-09 precedent), starting Phase 33's clusters early. | |
| You decide | Claude decides per-channel during research. | |

**User's choice:** Logged no-ops, defer to Phase 33
**Notes:** Unlike Phase 30's dialog_open (which blocked install and earned its pull-forward), these are Settings-page niceties. Keeps the slice tight. → CONTEXT D-04.

---

## Claude's Discretion

- Exact set of async dialog members given real behavior follows from what ported flows reach (Sync-pair no-op boundary fixed). → CONTEXT D-03.
- Whether writeConfig and setSetting share one registration or are wired separately — planner's call, both land in settingsFlowRegistration.ts. → CONTEXT decisions.

## Deferred Ideas

- Epic/GOG/Amazon runner tool-version channels, EOS-overlay group, egsSync (D-01).
- showMessageBoxSync / showOpenDialogSync sync-over-async (D-03) → Phase 33.
- shell.showItemInFolder + rest of shell, clipboard (D-04) → Phase 33.
- changeTrayColor / tray → Phase 33.
- Live cross-build settings sync / policy convergence → Phase 35.
- Full electron-store semantics (schema, migrations) → Phase 29 deferred.

### Reviewed Todos (not folded)
Three `todo.match-phase 31` hits — all keyword false-positives (macOS bridge, bottle startup-resume, getProductInfo osarch); none touch the settings/config IPC seam. Same set Phase 30 reviewed.

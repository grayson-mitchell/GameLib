# Phase 21: Steam Native Install - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-15
**Phase:** 21-steam-native-install
**Areas discussed:** Progress & control UX, Failure & recovery, Install location, Rollout scope

---

## Todo Cross-Reference

| Todo | Folded? |
|------|---------|
| steam-startup-download-resume-autoopens-crossover.md | ✓ folded (resolved by D-05) |
| steam-getproductinfo-appinfo-dump.md | reviewed, not folded (Phase 18 task, unrelated) |

---

## Progress & Control UX

### Progress surface
| Option | Description | Selected |
|--------|-------------|----------|
| Reuse DownloadManager queue | Same queue + progress rows as legendary/gogdl/nile | ✓ |
| Steam-specific progress surface | Dedicated Steam download view | |
| Minimal (spinner + %) only | Tile-only, no queue | |

### Controls (V1)
| Option | Description | Selected |
|--------|-------------|----------|
| Cancel only (defer resume) | Cancel, no in-app pause/resume | ✓ |
| Cancel + 'pause' = hand to Steam | Pause writes 1026 acf, Steam finishes | |
| Full pause/resume in GameLib | Streaming-to-disk + persisted chunk state | |

### Size basis
| Option | Description | Selected |
|--------|-------------|----------|
| Real bytes from the manifest | True total download size from depot manifest | ✓ |
| Keep the current estimate | pc_requirements estimate | |
| You decide | | |

**Notes:** User initially deferred the controls/size questions to hear a risk walkthrough of
pause/resume. After the walkthrough (RAM assembly, per-chunk state, manifest-GID pinning, auth
expiry — all untested per spike 002; plus Steam's `1026` verify-repair already provides a resume
mechanism), the user chose cancel-only + real-bytes. In-app pause/resume deferred to its own phase.

---

## Failure & Recovery

### On failure/cancel
| Option | Description | Selected |
|--------|-------------|----------|
| Write 1026 .acf, hand to Steam | Steam verify-repair finishes the partial | ✓ |
| Discard partial, clean restart | Delete + reset to not-installed | |
| Distinguish cancel vs error | Two paths | |

### On startup with a partial
| Option | Description | Selected |
|--------|-------------|----------|
| Write 1026 .acf, no auto-drive | Finalize for Steam to adopt next launch; never auto-open Steam/CrossOver | ✓ |
| Prompt to resume or discard | Toast/dialog | |
| Leave partial, mark failed | Failed row + Retry, no startup side effects | |

### Error UX in queue
| Option | Description | Selected |
|--------|-------------|----------|
| Actionable error + Retry | Plain-language reason + Retry button | ✓ |
| Generic failed state | Failed + retry, no reason | |
| You decide | | |

**Notes:** One consistent recovery mechanism (write `1026`, hand to Steam) across failure, cancel,
and startup-resume. The startup choice directly resolves the folded todo (no silent Steam-in-CrossOver
drive). Flagged for planning: automatic Steam-handoff (D-04) and manual Retry (D-06) are complementary
(D-07 reconciliation note).

---

## Install Location

### Where files land
| Option | Description | Selected |
|--------|-------------|----------|
| Existing Steam library folder(s) | Target libraryfolders.vdf steamapps/ | ✓ |
| GameLib path, then register | Mutate libraryfolders.vdf | |
| You decide | | |

### Multi-library selection
| Option | Description | Selected |
|--------|-------------|----------|
| Default sensibly, allow override | Default primary + picker when >1 | ✓ |
| Always primary library | No choice | |
| Always ask | Prompt every install | |

### Steam not installed / no library folder
| Option | Description | Selected |
|--------|-------------|----------|
| (reframed by user) Guided install w/ consent | Detect missing Steam → guided install, then game → library folder now exists | ✓ |
| Fully automated, silent | | |
| Block + point to Steam | | |

### Steam installed but not initialized
| Option | Description | Selected |
|--------|-------------|----------|
| Prompt: launch Steam once | | (lean) |
| Create the default library | | |
| You decide | Planning's call | ✓ |

**Notes:** User reframed the "no library folder" case: it shouldn't occur standalone. Real first-time
flow = detect Steam → if missing, install Steam (guided w/ consent) → then install game → fresh Steam
install creates the default library folder. "No library folder" collapses into the Steam-presence gate.
User asked the current install command: confirmed it's `steam://install/{appId}` via `shell.openExternal`
(native) or as an arg to bottled `steam.exe` (Phase 17) — **no `--silent` flag anywhere** (`-silent` is a
Steam-client launch flag, irrelevant to the protocol handoff). Phase 21 removes the install handoff
entirely; Steam adopts on next launch with no install command.

---

## Rollout Scope

### OS scope
| Option | Description | Selected |
|--------|-------------|----------|
| All three desktop OSes | Win + macOS + Linux | ✓ (behind opt-in setting) |
| Windows + Linux first | | |
| Windows only | | |
| You decide | | |

### Replace vs gate
| Option | Description | Selected |
|--------|-------------|----------|
| Gate + steam:// fallback | Downloader for validated cases, steam:// for untested | |
| Downloader for everything | All installs incl. multi-depot/50GB | ✓ |
| Opt-in per install | Per-install choice | |

### Phase 17 bottle path
| Option | Description | Selected |
|--------|-------------|----------|
| Leave bottle path as-is (V1) | Native installs only | |
| Depot-download into the bottle | Download Windows depot into bottle steamapps, bottled Steam adopts | ✓ |
| You decide | | |

**Notes:** User: "all OS's but make it a setting can turn on" → all OSes behind a user opt-in setting
(off = today's steam://install). Then chose the more ambitious lines: downloader-for-everything (no
per-case fallback) and depot-download-into-the-bottle. The opt-in setting is the safety valve. These
choices convert the untested paths (multi-depot, 50GB/streaming-to-disk, bottle adoption, hard-DRM
launch) into MUST-VALIDATE research items rather than must-avoid — captured explicitly in CONTEXT.md.

---

## Claude's Discretion
- Steam installed-but-not-initialized edge (D-11) — planning's call; lean toward prompt-to-launch-once.
- Downloader error-class → user-facing message mapping (D-06).

## Deferred Ideas
- True in-app pause/resume (needs streaming-to-disk first) — own phase.
- GameLib owning updates — permanently out of scope (architecture D-2).
- Custom non-Steam-registered install locations (would require mutating libraryfolders.vdf).

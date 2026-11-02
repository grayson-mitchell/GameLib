# Phase 60: Steam overlay in bridged games on macOS - Context

**Gathered:** 2026-11-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Shift+Tab opens Mac Steam's own overlay, drawn correctly and taking clicks, in games GameLib
launches through the macOS Steam bridge: both TCP-mode and DRM-mode titles. GameLib injects the
user's own `steamloader.dylib` + `gameoverlayrenderer.dylib` (with `SteamOverlayGameId`) plus a
vendored, self-built NotProton `overlay_shim.dylib` through `CX_ENV`, on a CrossOver clone whose
`bin/wineloader` and `lib/wine/x86_64-unix/wine` are both re-signed with
`allow-dyld-environment-variables`. Mac Steam attaches `gameoverlayui` itself.

Not in this phase: patching Steam.app, starting `gameoverlayui`, bottled-Steam rerouting,
rerouting `ActivateGameOverlayInviteDialog` to the real overlay.

</domain>

<decisions>
## Implementation Decisions

### On by default, with off switches
- **D-01:** The overlay is **on by default** for every bridged launch. There is no opt-in.
- **D-02:** A **per-game toggle** in the game's settings turns it off. There is no global switch.
- **D-03:** A **known-fix entry can disable the overlay** for a title where it is known to break, so
  every user gets the fix without finding the toggle. The user's per-game toggle wins over the
  known-fix value in both directions.

### Runner clone and version gate
- **D-04:** TCP-mode games with the overlay on run on a **separate overlay-only clone**: an
  unpatched APFS clone of the inner `SharedSupport/CrossOver` with both loaders re-signed, and no
  patched ntdll. It is kept apart from the DRM clone. It reuses `runnerClone.ts`'s machinery
  (0700 runners root, `xattr -cr`, keep every stock entitlement, re-hash on every launch, re-clone
  when the CrossOver version/build changes). With the overlay off, a TCP-mode game runs on stock
  CrossOver as it does today.
- **D-05:** The **DRM clone also re-signs `bin/wineloader`** and gets the same `CX_ENV` tokens, so
  DRM-mode (SteamStub) titles get the overlay too.
- **D-06:** **No CrossOver version allowlist for the overlay.** It is attempted on any CrossOver.
  Phase 59's one-time "untested CrossOver version" notice and launch-log line (D-59-15) cover the
  risk. DRM mode's own allowlist (D-56-09) is unchanged, and still gates DRM titles.
- **D-07:** **Phase 59 fallback engine (Wine-Staging + DXVK):** research finds out whether dyld
  injection works on the pinned Staging build: whether its loaders strip `DYLD_*`, how env reaches
  the game, and whether re-signing is needed. Add overlay support there only if it is cheap.
  Otherwise fallback launches run without the overlay, and the gap is recorded.

### Failure behaviour
- **D-08:** Overlay setup failure **never blocks a launch.** Failures include: Mac Steam's dylibs
  missing, clone or re-sign failure, the shim missing from the build, or an unsafe `CX_ENV` value.
  The game launches without the overlay, on stock CrossOver for TCP mode or on the DRM clone
  without the overlay tokens for DRM mode. A toast names the failed step, and a `[bridge-notice]`
  log line records the step and the reason. This is the opposite of DRM mode's fail-closed rule
  (D-56-13), because the overlay is an enhancement.
- **D-09:** That toast shows on **every affected launch**, matching Phase 59's fallback toast. It
  is not deduplicated.
- **D-10:** When an overlay-injected launch **exits abnormally soon after start**, the
  launch-failure message mentions the overlay and links to the per-game toggle. GameLib does not
  auto-retry without the overlay.
- **D-11:** After launch, GameLib **watches Mac Steam's `console_log.txt`** for
  `GameOverlay: started '…/gameoverlayui' (pid N) for game process <pid>`. It logs attached or
  not-attached within about 10 s in the launch log. This is diagnostic only: no UI and no toast.

### Shim policy
- **D-12:** The NotProton shim is injected on **every overlay launch, first in the insert list**
  (`<shim>:<steamloader>:<gameoverlayrenderer>`). On BGRA8 paths it is measured harmless.
- **D-13:** **Unknown GPU or macOS:** research reads `overlay_shim.m` to see whether it no-ops
  safely when an `AGX*` class it swizzles is missing. If it does, inject everywhere. If it doesn't,
  gate **the shim only** (never the Steam dylibs) on known GPU families or macOS versions.
- **D-14:** Vendor `overlay-shim/overlay_shim.m` from `NotProtonNot/NotProton` at a pinned commit,
  keeping its GPLv3 copyright and licence notice. Build it in GameLib's own native build tooling as
  a universal dylib. Never ship NotProton's prebuilt binary (same rule as D-56-01).

### Live gate and invites
- **D-15:** **All four titles gate the phase.** Each one is launched through GameLib's real launch
  path. The operator confirms that Shift+Tab opens the overlay, it draws correctly and it takes
  clicks. The bridge must stay verified to the strict criterion (D-53-13 / D-56-15/16).
  - Schedule I Free Sample 3205720: DXVK, BGRA8, TCP mode.
  - The Planet Crafter 1284190: D3DMetal D3D11, BGRA8, TCP mode.
  - Manor Lords 1363080: D3DMetal D3D12, RGB10A2, the case that depends on the shim. It launches
    through the UE stub, never `…-Shipping.exe` directly.
  - Grim Dawn 219990: DRM mode, on the DRM clone.

  Each run also records the D-11 attach line, `vmmap` showing the injected dylibs, and the shim's
  `hook_set_pixel_format` trace. Pixel evidence and screenshots don't count; the operator does.
- **D-16:** **Invites:** Phase 58's invite picker routing (`inviteBridge.ts`,
  `ActivateGameOverlayInviteDialog`, 58-29..36) is unchanged. In UAT, the operator records what the
  overlay's own invite button does in a bridged game. Rerouting to the real overlay is deferred.

### Claude's Discretion
- Where the per-game toggle sits (likely next to Phase 59's Advanced engine override), and its label.
- The exact abnormal-exit window for D-10 and the attach-watch timeout for D-11.
- How the overlay clone and the DRM clone share code in `runnerClone.ts`: a parameterised re-sign
  list against duplication.
- How the known-fix schema expresses "overlay off". Name it to avoid confusion with the existing
  known-fix `overlays` (payload archives, `KnownFixOverlayEntry`), which are unrelated.
- Toast component and copy, following the existing bridge-notice patterns.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Blueprint (spikes 061–064)
- `.claude/skills/spike-findings-gamelib/references/steam-overlay-in-bottles.md`: the recipe,
  the coverage table, what to avoid, constraints, and what was left untested.
- `.planning/spikes/062-bridge-overlay-attach/`: `run.sh`, the reusable harness (helper spawn,
  cfg swap/restore, `CX_ENV` injection).
- `.planning/spikes/061-notproton-overlay-render/`, `.planning/spikes/063-d3dmetal-overlay/`,
  `.planning/spikes/064-d3dmetal-d3d12-overlay/`: per-path evidence.
- `.planning/spikes/MANIFEST.md`: "Requirements (Idea B — Steam overlay in bridged games)".

### Prior phase decisions this builds on
- `.planning/phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-CONTEXT.md`: the
  DRM clone (D-08..D-10), fail-closed rule (D-13, deliberately not copied here), verified
  criterion (D-15/16), Grim Dawn gate (D-17).
- `.planning/phases/59-steam-engine-fallback-when-crossover-is-unavailable/59-CONTEXT.md`: the
  fallback engine (D-07 research target), untested-version notice (D-15), Advanced override (D-14).
- `.planning/phases/58-steam-bridge-multiplayer/58-CONTEXT.md`: invite picker context for D-16.

### Project rules
- `CLAUDE.md` Conventions, plus `Skill("gamelib-conventions")`: fake-HOME isolation for every
  spawn (`cp`, `codesign`, `plutil`, `xattr`), the sidecar exit contract for the console_log watcher
  (D-11: `unref` it and keep it bounded), and the `<verify>` prettier check.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/backend/storeManagers/steam/bridge/drm/runnerClone.ts`: APFS clone, `DYLD_ENTITLEMENT`,
  `STOCK_LOADER_ENTITLEMENTS`, `entitlementsPlist()`, `LOADER_REL`, re-hash per launch, version
  keying. Today it re-signs only `lib/wine/x86_64-unix/wine`, and needs `bin/wineloader` added.
- `src/backend/storeManagers/steam/games.ts` (~L830–888): the `cxTokens` / `setKey('CX_ENV', …)`
  block, with single-quoted values that reject `'`. The overlay tokens join this list.
- `fireBridgeWineLaunch` in `games.ts`: the bridge launch (helper, cfg port/secret, `CX_BOTTLE` +
  `bin/wine`), which is unchanged apart from the runner and `CX_ENV`.
- `src/backend/storeManagers/steam/bridge/drm/steamclientLayerMode.ts`: the `[bridge-notice]`
  pattern and step-error shape (`drmStepError`).
- `meta/buildDrmNativeParts.ts` (`pnpm build:drm-native`) and `meta/buildSteamBridgeShims.ts`
  (`pnpm build-steam-bridge`): native build tooling where the shim build can live.
- `src/backend/storeManagers/steam/bridge/inviteBridge.ts`: the Phase 58 invite routing, to be left
  as is.

### Established Patterns
- Clone runners live under `<appFolder>/steam-bridge/drm/runners/`. The overlay clone needs a
  sibling path, so `drmPaths.ts` or a new paths module.
- Every spawn gets `createFakeHomeProfile().childEnv()`. Long work is abortable and unref'd.
- Mac Steam dylibs: `~/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS/`.

### Integration Points
- Launch route selection: the TCP-mode route moves to the overlay clone when the overlay is on.
  The DRM route adds the tokens.
- Game settings type (`GameSettings` in `src/common/types.ts`) for the per-game toggle.
- The known-fix data schema, for the per-title overlay-off flag.

</code_context>

<specifics>
## Specific Ideas

- Insert-list order and token set are exactly as the spike proved:
  `DYLD_INSERT_LIBRARIES='<shim>:$SBIN/steamloader.dylib:$SBIN/gameoverlayrenderer.dylib'
  SteamOverlayGameId=<appid> SteamGameId=<appid> SteamAppId=<appid>`.
- With the shim present, `overlay_commit=missing` is normal and is not a failure (061).
- Watch for bottles with `"d3d11"="native,builtin"` in `user.reg` before a D3DMetal test (063
  run 1 crash).
- Never re-sign inside a copied `.app` (Gatekeeper `-67018`, `Killed: 9`).

</specifics>

<deferred>
## Deferred Ideas

- Routing `ActivateGameOverlayInviteDialog` to Steam's real overlay when it is attached, instead of
  GameLib's picker. This needs an attach signal (D-16).
- HDR (`RGBA16Float`), DXMT, WineD3D-GL and fullscreen-on-D3D11 coverage: untested in the spikes,
  and not gated here.
- Overlay on the Phase 59 fallback engine, if D-07 research finds it isn't cheap.

### Reviewed Todos (not folded)
- Seven pending todos matched on generic keywords only ("steam", "bridge", "macos"). Examples are
  the Phase 21 native-install UAT, x86 shim parity, depot optionaldlc, the winebus PowerA wedge, and
  callback 1298 on the join path. None of them is about the overlay, so none were folded.

</deferred>

---

*Phase: 60-steam-overlay-in-bridged-games-on-macos*
*Context gathered: 2026-11-02*

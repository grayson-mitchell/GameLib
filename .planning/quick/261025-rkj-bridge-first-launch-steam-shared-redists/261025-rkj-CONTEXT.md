# Quick Task 261025-rkj: Bridge first-launch Steam shared redists - Context

**Gathered:** 2026-10-25
**Status:** Ready for planning

<domain>
## Task Boundary

Close `.planning/todos/pending/2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md`
items 1 and 3. On a bridge launch, install the Steamworks Common Redistributables (app 228980)
that the game's appinfo declares, into its `GameLibSteamBridge-<appId>` bottle, the way Steam's
first-launch "Installing ..." step does, with the existing `redist` Play-button status. Item 2 was
done by quick 261025-mfz.

</domain>

<decisions>
## Implementation Decisions

### Which components install automatically (operator, 2026-10-25)
- VC++ runtimes and DirectX: install automatically when the game's appinfo declares them.
- .NET (and anything not positively identified as VC++/DirectX): do NOT install automatically.
  Wine Mono serves .NET 4.x today, and Microsoft's .NET installers under CrossOver can replace it
  and break titles that currently run. A known-fixes profile (bundled/local only) can opt a title
  into a .NET (or other) shared depot.
- Classification must come from data that is verified (depot content / installscript), not from
  a depot-id-to-name table recalled from memory. If a depot's kind cannot be established, skip it
  and log.

### Workflow (operator)
- Quick task, not a phase. Research + plan-check + verify.

### Precedent
- Steam-in-a-bottle runs the depot's installscript.vdf (`Run Process`, `HasRunKey` skip checks).
- Heroic's GOG path (`src/backend/storeManagers/gog/redist.ts`) downloads common redists and runs
  the declared ones in the prefix under the `redist` status. Follow its shape where it fits.

### Claude's Discretion
- Where the downloaded redist content lives (one shared GameLib cache vs per-bottle copy).
- Whether to run at install time or first launch (first launch preferred, matching Steam, and it
  covers already-installed titles).
- Idempotence mechanism (installscript HasRunKey semantics preferred, as Steam uses).

</decisions>

<specifics>
## Specific Ideas

Measured 2026-10-25 by anonymous `getProductInfo` (scratch script, not in repo): 10 of 16 bridge
titles declare `depotfromapp: 228980` depots, which `depot/select.ts:179` skips today.
- 284100 Unclaimed World: 228990, 229004
- 1119730 Ranch Simulator, 1363080 Manor Lords: 228989, 228990, 229007, 229033
- 1691190 Rogue Waters: 228988, 228990, 229005, 229033
- 219990 Grim Dawn: 228983, 228984, 228985, 228986, 228990, 229003
- 230070 Age of Decadence: 228984, 228986, 228990, 229020
- 411300 ELEX: 228983, 228984, 228990, 229033
- 427410 Abiotic Factor: 228984, 228985, 228989, 228990
- 648410 Colony Ship: 228989; 648800 Raft: 228990
228980 is `freedownload: 1`; anonymous appinfo shows public manifest gids for these depots but
no depot names. Whether a logged-in session obtains 228980 depot keys via the existing depot
downloader is UNVERIFIED — research must find out how, without the operator's credentials leaving
the app (no standalone script using the stored refresh token).

None of the 16 bridge bottles' game folders ship `_CommonRedist` or an installscript.vdf.
Example game-own installscript (XCOM, bottled-Steam prefix): `"InstallScript" { "Run Process" {
"VCRedist" { "process 1" "%INSTALLDIR%\\VCRedist\\vcredist_x86.exe" "command 1" "/q" ... } } }`.

Item 3: `redist` status already renders "Installing Redistributables ({{redist}})"
(`public/locales/en/gamepage.json:386`); the known-fixes applier already sends it with a context.

</specifics>

<canonical_refs>
## Canonical References

- `.planning/todos/pending/2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md`
- `.planning/notes/per-game-compat-fixes-architecture.md` (decision 6 trust rule)
- `.planning/quick/261025-mfz-steam-bridge-known-fixes-registry-key-wi/` (layered reader, applier)
- `src/backend/storeManagers/steam/depot/select.ts`, `depot.ts` (`downloadSteamDepots`)
- `src/backend/storeManagers/steam/bridgeKnownFixes.ts`, `games.ts` (bridge launch ~L3240)
- `src/backend/storeManagers/gog/redist.ts`

</canonical_refs>

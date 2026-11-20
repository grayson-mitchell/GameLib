# Phase 47: Migrate aggregated store search from CheapShark to IsThereAnyDeal - Context

**Gathered:** 2026-11-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the USD-only CheapShark adapter behind `/store-search` with a localised IsThereAnyDeal (ITAD)
provider so a non-US user sees store-search prices in their own currency (PRICE-01), the "you already
own this" badge keeps working on ITAD results (PRICE-02), and a rate-limited search shows the cached
price with its timestamp instead of an error (PRICE-03). Stage 1 only: embedded key + hard caching, no
proxy, no OAuth. The `/discounts` screen, an ITAD deals browser, Stage 2 feed infrastructure and Amazon
price coverage are out of scope (see ROADMAP Phase 47 and `<deferred>`).

Most implementation decisions are already locked upstream and are NOT repeated here:
`47-RESEARCH.md` §"Design Decisions the Plan Needs" (D1–D7) and `47-UI-SPEC.md` (region caption, no
picker, cached-at line, notConfigured / region-fallback states, Settings > Advanced key field). The
decisions below close the research's Open Questions 2, 3 and 6 and fix the parameters it left open.

</domain>

<decisions>
## Implementation Decisions

### Embedded ITAD key in builds (closes RESEARCH Open Q3)
- **D-01:** Release builds get the shared key from a GitHub Actions repo secret named **`ITAD_API_KEY`**.
  `release-tauri.yml` exports it and `build:sidecar` bakes it into the sidecar bundle via esbuild
  `--define` (RESEARCH D7 mechanism). The key is never committed. The plan includes a
  `checkpoint:human-action` task for the operator to create the secret.
- **D-02:** Dev builds read the key at runtime from env var **`GAMELIB_ITAD_API_KEY`**. When set, it
  overrides the baked key in any build. Precedence overall: user-supplied key (D-05) > `GAMELIB_ITAD_API_KEY`
  > baked key.
- **D-03:** A build with no key at all (forks, contributor builds, CI test runs) shows UI-SPEC's
  `storeSearch.error.notConfigured` state — no crash, no retry link, search box stays enabled. Store Search
  is NOT hidden.
- **D-04:** `release-tauri.yml` **fails** the release build when `ITAD_API_KEY` is missing/empty, so a
  release can never ship in the notConfigured state. PR/test/dev builds stay keyless without failing.

### Optional user-supplied key setting
- **D-05:** Ships **in Phase 47, as its own final-wave plan** (Settings > Advanced, keyring slot, per
  UI-SPEC §7 and RESEARCH D7). PRICE-01..03 must not depend on it, so it can be cut late without
  affecting them. UI copy makes no "your own quota" / "avoids rate limits" claim (UI-SPEC, RESEARCH Open Q1).
- **D-06:** A user key rejected by ITAD (401/403) → fall back to the built-in key for the rest of the
  session **and** show a visible warning under the Settings field ("Your IsThereAnyDeal key was
  rejected" — exact copy via `t()`, planner adds the key to the UI-SPEC copy table). Search keeps working.
- **D-07:** The plan includes a non-blocking `checkpoint:human-action` for the operator to reply on the
  existing `api@isthereanydeal.com` thread asking (a) the owed one-line confirmation of Q1 ("yes, this is
  fine" = a deals browser is allowed) and (b) whether users may register their own ITAD app key for use in
  GameLib. Execution does not wait on the answer.

### Cache freshness and result size (closes RESEARCH Open Q6)
- **D-08:** A cached search entry (`search:<country>:<hash(query)>` and per-gid deals) is **fresh for 1
  hour**; within that window no request is made. Stale entries are retained (not evicted on TTL) so they
  remain available as the 429 / network-error fallback with `cachedAt`.
- **D-09:** One search returns **20** results (search v1 `results` param; exact param name confirmed by the
  Wave 0 fixtures).
- **D-10:** The Steam AppID → ITAD gid mapping (`itad_steam_gids` store) is kept **30 days** per entry;
  only unseen or expired appids hit the keyless `POST /lookup/id/shop/61/v1`.
- **D-11:** A search result with zero current deals in the user's country is **dropped** (RESEARCH D1:
  missing beats wrong). No "no price" row variant, no new string.

### Wave 0 coverage sweep (closes RESEARCH Open Q2)
- **D-12:** The measurement script (RESEARCH §"Measurement Task") is a **Wave 0 `checkpoint:human-action`
  that blocks later waves**: the executor writes it; the operator runs it with `GAMELIB_ITAD_API_KEY`; the
  redacted output (no key in any committed file or log) is committed to the phase dir. Its results lock:
  the supported-country list, Epic's ITAD shop id (by name from `/service/shops/v1` — do not hardcode the
  `[ASSUMED]` 16), the `results` param name, the lookup batch ceiling, and whether `amount` vs `amountInt`
  agrees for zero-decimal currencies (RESEARCH D1).
- **D-13:** A country the sweep shows ITAD does not price falls back to **US**, with UI-SPEC §4's
  `storeSearch.regionFallback` note explaining it. No nearest-region table.

### Claude's Discretion
- Fate of the `getStoreSearchStoreMap` IPC channel (RESEARCH Open Q5): keep as shim or delete with a
  contract regen — planner's call.
- `Retry-After` clamp bounds (RESEARCH suggests [1s, 15min]), single-flight dedupe shape, cache-key hash
  function, test layout, wave/plan split.
- Region override reuse: follow UI-SPEC §1 / RESEARCH D3 (reuse the Deals screen's stored override, no new
  picker).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 47 artifacts
- `.planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-RESEARCH.md` — code
  map, D1–D7 prescriptive design, pitfalls, measurement task, validation architecture
- `.planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-UI-SPEC.md` — UI
  design contract (amends Phase 20's), copy table, Currency Contract amendment
- `.planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-VALIDATION.md` —
  validation strategy
- `.planning/ROADMAP.md` §"Phase 47" — scope, out-of-scope, the three human gates and ITAD's verbatim
  2026-10-01 reply

### Prior research and phase
- `.planning/quick/260916-gdg-answer-q2-cheapshark-to-itad-migration-cost/260916-gdg-RESEARCH.md` — ITAD
  API facts graded MEASURED / SPEC / UNKNOWN; preserve the grades when quoting
- `.planning/milestones/v0.6-phases/20-aggregated-store-search-cheapshark/20-UI-SPEC.md` — Phase 20 UI
  contract incl. the Currency Contract (lines ~246-265) this phase amends

### Repo conventions
- `CLAUDE.md` §Conventions + `Skill("gamelib-conventions")` — sidecar exit contract (no unbounded timers;
  the `blockedUntil` gate is timer-free), `<verify>` prettier check, todo frontmatter

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/backend/storeSearch/cheapshark.ts` — adapter being replaced; keep `handlers.ts`'s rethrow seam
- `src/backend/cache.ts` `CacheStore` — persisted per-install cache (dots in keys are path separators —
  hash the query)
- `src/frontend/screens/Discounts/helpers.ts` `getLocaleSettings` — country derivation reused for D3
- `src/frontend/screens/Humble/Keys/syncAge.ts` — `Intl` + `toI18nextCode` formatting precedent
- `Settings/components/SteamGridDbApiKey.tsx` + `steamgridSecretStore.ts` + `src-tauri/src/main.rs`
  keyring allow-list — template for the D-05 user-key setting

### Established Patterns
- Release secrets come from GitHub Actions secrets in `.github/workflows/release-tauri.yml` (signing keys);
  D-01/D-04 follow the same pattern
- `build:sidecar` is a single esbuild command in `package.json` — D-01's `--define` goes there (or a wrapper)
- Every IPC tuple is zod-validated; new channels require `pnpm gen:ipc-contract` + allow-list tests

### Integration Points
- `common/types/storeSearch.ts`, `common/discounts/storeMapping.ts` (single production importer),
  `common/discounts/badges.ts` (unchanged; container injects `steamAppId`)
- `src/frontend/screens/StoreSearch/helpers.ts` `formatUsdPrice` → `formatPrice`

</code_context>

<specifics>
## Specific Ideas

- Env var name `GAMELIB_ITAD_API_KEY` and secret name `ITAD_API_KEY` are fixed by the operator — use them
  verbatim.
- `obj.deal2.url` passes through verbatim — comment it as contractual (ITAD terms), not stylistic.

</specifics>

<deferred>
## Deferred Ideas

- ITAD-backed deals browser on `/discounts` — gated on ITAD's written Q1 confirmation (D-07 asks for it)
- Stage 2 GameLib-owned affiliate-feed / mirroring service
- Intermediate caching server (Tomas's suggestion) — only when ITAD dashboard usage approaches the limit
- Amazon price coverage (ITAD does not track Amazon)
- A Store Search region picker (language-derived country is coarse; reuse of the Deals override is the
  Phase 47 answer)
- Affiliate-link disclosure copy and the unasked affiliate-partnership question to ITAD

</deferred>

---

*Phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean*
*Context gathered: 2026-11-14*

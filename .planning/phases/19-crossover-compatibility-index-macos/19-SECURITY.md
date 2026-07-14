---
phase: 19-crossover-compatibility-index-macos
audited: 2026-07-14
status: OPEN_THREATS
threats_total: 40
threats_closed: 39
threats_open: 1
asvs_level: 2
unregistered_flags: 0
---

# Phase 19: CrossOver Compatibility Index (macOS) — Security Audit

**Scope:** 8 plans (19-01..19-08), each carrying its own `<threat_model>` STRIDE
register. Every `mitigate`-disposition threat below was verified against
committed code (file:line cited), not against plan intent or SUMMARY.md
claims. `accept`/`transfer` dispositions were checked for a recorded
justification and (for `transfer`) confirmation that the receiving plan
actually implemented the deferred control.

Adversarial starting hypothesis: every mitigation is absent until a grep/read
proves otherwise. 39 of 40 threats produced that proof. One did not.

## Headline Finding (BLOCKER)

**T-19-02-03 (Information Disclosure — measurement report) is only
PARTIALLY mitigated.** The currently committed report
(`measure-crossover-match-2026-07-13.md`, HEAD) is clean — Sample 2 is
aggregate-only, matching the must_have. But this was achieved by hand-editing
the *output artifact* in commit `b2eeb6cb`, not by fixing the *code that
generates it*. `meta/measureCrossoverMatching.ts` (lines 561-571, 636-638)
still builds `nonSteamRows` with a `title` field and writes
`` `| ${row.title} | ${row.classification} | ${row.outcome} |` `` verbatim into
the Sample 2 markdown table. **Re-running the harness — which is the only way
this file is supposed to be regenerated — reproduces the exact 15-title
owned-library leak the must_have forbids.** Additionally, git history commit
`19c6ce3e` still contains the un-redacted 15-title table, and this branch has
not yet been pushed to the public fork remote (per CLAUDE.md, GameLib is a
public fork). Both the code-level fix and the history rewrite remain
outstanding. See Gap detail below.

## Threat Verification — mitigate-disposition threats (29 code fixes + this 1 gap)

| Plan | Threat ID | Category | Component | Evidence | Status |
|------|-----------|----------|------------|----------|--------|
| 19-01 | T-19-01 | Tampering | emitted rating values | `schema.ts:21` `rating: z.number().int().min(1).max(5)` rejects out-of-range values before any badge renders | CLOSED |
| 19-01 | T-19-02 | DoS | fast-xml-parser entity bomb | `meta/buildCrossoverIndex.ts:136-141` `processEntities: {enabled:true, maxTotalExpansions:500_000, maxExpandedLength:50_000_000, maxEntityCount:1_000}` — raised-but-bounded, not disabled | CLOSED |
| 19-01 | T-19-03 | Repudiation/Integrity | zero-record extraction | `meta/buildCrossoverIndex.ts:110-125` `ZeroRecordError` + `assertNonEmpty()`, called at `main():305` before any write | CLOSED |
| 19-01 | T-19-04 | Tampering (transfer to 19-03) | index consumed downstream | Transfer target verified: `schema.ts` implements the validation this threat defers to (see 19-03 row below) | CLOSED |
| 19-01 | T-19-SC | Tampering (accept) | npm/pnpm installs | `package.json` confirms `fast-xml-parser@^5.5.7`, `zod@^3.24.3`, `axios@^1.13.5`, `electron-store@^8.2.0` pre-existing — no new install | CLOSED |
| 19-02 | T-19-02-01 | Repudiation | D-02 gate verdict | `meta/measureCrossoverMatching.ts:44-45` `WRONG_HIT_MAX=0.02`/`HIT_RATE_MIN=0.3` defined before any scoring; printed verbatim at lines 595-596 of the generated report | CLOSED |
| 19-02 | T-19-02-02 | Tampering | normalizer / wrong-hit records | Report Sample 1 (123-pair ground truth) + whole-dump self-collision test both present in committed report and harness (`meta/measureCrossoverMatching.ts:399`, gate fn) | CLOSED |
| 19-02 | T-19-02-06 | Tampering | `NAME_MATCHING_SHIPS` flag | `normalize.ts:126` `NAME_MATCHING_SHIPS: boolean = true`, comment cites the exact report file + PASS numbers (wrongHitRate 0.81%, hitRate 85.37%) — fail-safe default is `false`, flip is auditable | CLOSED |
| 19-02 | **T-19-02-03** | **Information Disclosure** | **dated Markdown report** | Output artifact (HEAD) is redacted, but **generator code is not** — `meta/measureCrossoverMatching.ts:561-571,636-638` still emits `row.title` into Sample 2. Re-running the script reproduces the leak. Git history (`19c6ce3e`) still holds the un-redacted 15-title table; not yet rewritten before intended public-fork push. | **OPEN (BLOCKER)** |
| 19-02 | T-19-02-04 | DoS | fast-xml-parser on 23.7 MB XML | `meta/measureCrossoverMatching.ts:139-158` content-length + body-size ceiling (`MAX_DUMP_BYTES`) before parse; `:222-227` same bounded `processEntities` object as the builder | CLOSED |
| 19-02 | T-19-02-05 | Tampering (accept) | dependency supply chain | No new installs; `fast-xml-parser`, `zod` pre-existing (verified above) | CLOSED |
| 19-03 | T-19-01 | Tampering | `loadIndex` payload parse | `fetcher.ts:150-158` `desc.schema.safeParse`; on failure returns `cached?.data ?? persistBundledFallback(desc)` — never throws, never renders unvalidated data | CLOSED |
| 19-03 | T-19-02 | DoS | oversized payload | `fetcher.ts:35,146` `MAX_CONTENT_LENGTH = 5 * 1024 * 1024` passed as `maxContentLength` to `axiosClient.get` | CLOSED |
| 19-03 | T-19-03 | Info Disclosure/Tampering-in-transit | `desc.url` fetch | `fetcher.ts:113-117` `assertHttps()` throws if `!desc.url.startsWith('https://')`, called first in `loadIndex()` (`:130`); `index.ts:19` descriptor URL is `https://github.com/...` | CLOSED |
| 19-03 | T-19-04 | Tampering (truncation) | schema validation | `schema.ts:17-25` `entries.min(1000)`; `schema.ts:15` `version: z.literal(1)` | CLOSED |
| 19-03 | T-19-05 | Elevation/brick-badges | keep-last-good store | `electronStore.ts:35-41` `invalidateCheck: () => false` — entry never auto-evicted, only replaced by a validated newer `set()` | CLOSED |
| 19-03 | T-19-SC | Tampering (accept) | npm installs | No new installs — `zod`, `axios`, `node:zlib` pre-existing | CLOSED |
| 19-04 | T-19-01 | DoS | fork schedule silently dead | `.github/workflows/build-crossover-index.yml` has both `schedule` (line 4-5) and `workflow_dispatch` (line 6) triggers; `generatedAt` present in `IndexPayload` (`buildCrossoverIndex.ts:96,311`); human-enable checkpoint recorded in 19-04-PLAN.md and flagged to human_verification in 19-VERIFICATION.md | CLOSED |
| 19-04 | T-19-02 | Tampering/DoS | rolling tag vs signed-build trigger | Workflow tag is literal `crossover-index` (created via `gh release create crossover-index ... --latest=false`); `draft-release-mac.yml:5-6` triggers only on `push.tags: ['v*']` — `crossover-index` does not match `v*`; `--latest=false` confirmed at `build-crossover-index.yml` | CLOSED |
| 19-04 | T-19-03 | Elevation of Privilege | `GITHUB_TOKEN` scope | `build-crossover-index.yml:8-9` `permissions: contents: write` scoped to the workflow's single job; uses `${{ github.token }}` (not `WORKFLOW_TOKEN`); `build-base.yml:3` packaging workflow uses `contents: read`; `draft-release-mac.yml:29` download step explicitly overrides to `github.token` (not the elevated `secrets.WORKFLOW_TOKEN` used for signing) | CLOSED |
| 19-04 | T-19-04 | Tampering (accept) | snapshot fetched pre-package | HTTPS from repo's own GitHub Releases CDN; re-validated client-side by 19-03's zod schema (confirmed above) — accepted residual is documented and the compensating control is real | CLOSED |
| 19-04 | T-19-SC | Tampering (accept) | pnpm installs in CI | Reuses existing `./.github/actions/install-deps` composite; no new package | CLOSED |
| 19-05 | T-19-05-01 | Tampering/Info Disclosure | index-first wiring | `wiki_game_info.ts:73-76`: `isMac ? (await getCodeweaversFromIndex(...)) ?? getInfoFromCodeweavers(title) : isLinux ? getInfoFromCodeweavers(title) : null` — index path structurally unreachable off macOS | CLOSED |
| 19-05 | T-19-05-02 | Tampering/Repudiation | non-Steam name match | `index.ts:83-85` `resolveRating()`: `if (!NAME_MATCHING_SHIPS) return null` gates the `byName` lookup; Steam-AppID join (`:76-81`) is never gated | CLOSED |
| 19-05 | T-19-05-03 | Tampering (mitigate+accept) | rating passthrough | `index.ts:114-118` `getCodeweaversFromIndex` returns `macRating: rating` sourced only from `resolveRating()`, which reads only zod-validated map values; miss path returns `null`. Residual (community-sourced data can still be wrong) is explicitly accepted per D-18 — non-blocking warning only (see 19-08 row) | CLOSED |
| 19-05 | T-19-05-04 | Spoofing/Integrity | `slugify()` D-20 edit | `codeweavers/utils.ts:23-30,47-50` `baseSlugify` output is `[a-z0-9-]` only (via `.replace(/[^a-z0-9]+/g,'-')`); apostrophe-drop is the only pre-processing added, no path-injection surface reopened | CLOSED |
| 19-05 | T-19-05-SC | Tampering (accept) | package installs | No new installs this plan | CLOSED |
| 19-06 | T-19-06-01 | Tampering | `getCrossoverIndex` IPC input | `ipc_handler.ts:47` `addHandler('getCrossoverIndex', async () => buildCrossoverRatingMap())` — zero-arity, no renderer-supplied input reaches any path | CLOSED |
| 19-06 | T-19-06-02 | Tampering | rating values in map | `ipc_handler.ts:39-40` map values come only from `getCodeweaversFromIndex()` (zod-validated). Confirmed no frontend component calls `setCrossoverRatings` except the IPC push/pull wiring itself (`GlobalState.tsx:1091,1098`) — display-only slice | CLOSED |
| 19-06 | T-19-06-03 | DoS | grid render path | `ipc_handler.ts:23-45` resolves the whole map once per `getCrossoverIndex` call across all 6 `getListOfGames()` implementations (gog/nile/legendary/steam/sideload/zoom); grid reads the zustand slice synchronously — no per-card IPC confirmed by absence of any per-card call site | CLOSED |
| 19-06 | T-19-06-04 | Info Disclosure (accept) | resolved map contents | Local user's own library data over the existing contextIsolated preload bridge — no new external surface; accepted as-is | CLOSED |
| 19-06 | T-19-06-SC | Tampering | npm/pip/cargo installs | No new installs (reuses in-tree jest/IPC/zustand) | CLOSED |
| 19-07 | T-19-07-01 | Spoofing (misleading signal) | `CrossoverBadge` render states | `CrossoverBadge.tsx:28-30` `rating === undefined` returns `null` (no element); `:33-34` `rating === null` maps to `'unknown'` tier only — honesty invariant enforced in code | CLOSED |
| 19-07 | T-19-07-02 | Tampering | aria-label/title text | `CrossoverBadge.tsx:45-57` label derived from a fixed `labelKeyByTier` map keyed by the derived tier, never from a raw index string; tier itself derived only from the zod-bounded 1..5 number | CLOSED |
| 19-07 | T-19-07-03 | Info Disclosure (accept) | badge on non-Steam/non-mac tiles | Covered by T-19-07-01's `undefined → null` handling; no sensitive data path exists | CLOSED |
| 19-07 | T-19-07-SC | Tampering | pnpm installs | No new dependency (FontAwesome/i18next/zustand pre-existing) | CLOSED |
| 19-08 | T-19-08-01 | Tampering (accept) | WineSelector warning gate | `WineSelector/index.tsx:124-129` `isKnownNotToWork` gate is advisory-only; accepted false-negative risk per D-18 | CLOSED |
| 19-08 | T-19-08-02 | DoS (agency) | Install button vs. warning | `WineSelector/index.tsx:147,156,164` `disabled={useSharedPrefix}` / `disabled={useSharedPrefix || wineVersionList.length === 0}` — none reference `crossoverRating`/`isKnownNotToWork`; warning renders as an independent sibling (`:180`) | CLOSED |
| 19-08 | T-19-08-03 | Tampering | display filter over `crossoverRatings` | `Library/index.tsx:634-649`: `rating === undefined` → `return true` (absent key never hides a game); tier bucketing only compares already-bounded 1..5 values, never executes/interpolates them | CLOSED |
| 19-08 | T-19-08-SC | n/a | package installs | No new dependency | CLOSED |

**mitigate-disposition tally: 29/30 CLOSED, 1/30 OPEN (T-19-02-03).**
(29 rows above are `mitigate`-only or `mitigate+accept`; T-19-02-03 is the sole gap.)

## Accept-disposition threats — verified as documented accepted risk

| Threat ID | Plan | Justification recorded | Verified |
|-----------|------|------------------------|----------|
| T-19-SC | 19-01 | No new packages | Yes — package.json |
| T-19-02-05 | 19-02 | No new packages | Yes — package.json |
| T-19-SC | 19-03 | No new packages | Yes — package.json |
| T-19-04 | 19-04 | HTTPS + client-side re-validation compensates; hash-pin disproportionate | Yes — compensating control (19-03 schema) confirmed real |
| T-19-SC | 19-04 | No new packages, reuses composite action | Yes |
| T-19-05-SC | 19-05 | No new packages | Yes |
| T-19-06-04 | 19-06 | Own-library data, no new external surface | Yes — contextIsolated bridge, no new IPC channel added beyond the one covered by T-19-06-01 |
| T-19-07-03 | 19-07 | Covered by the honesty invariant, no sensitive data | Yes |
| T-19-08-01 | 19-08 | Community-sourced false-negative risk, advisory-only | Yes — D-18 non-blocking, confirmed by T-19-08-02 |

## Transfer-disposition threats

| Threat ID | Plan | Transferred to | Verified received? |
|-----------|------|-----------------|---------------------|
| T-19-04 | 19-01 | Plan 19-03 (schema validation) | Yes — `schema.ts` implements exactly the bound + keep-last-good behavior this threat defers to |

## Correctness/Trust Concerns (task-specific attention)

**D-02 gate / name-matching false positives.** `NAME_MATCHING_SHIPS = true`
per the recorded PASS verdict (wrongHitRate 0.81% on n=123, hitRate 85.37%,
against pre-committed bounds `<2%`/`>30%`). The gate-closed default (`false`)
is what ships if the flag is ever reverted, and `resolveRating()` (`index.ts`)
enforces the gate at the only call site that reaches non-Steam titles. This
is a correctness control, not a pure security one, but it is fully wired: a
wrong name match cannot occur unless `NAME_MATCHING_SHIPS` is manually true —
which it currently, auditably, is, per a passing measurement. No gap found
here beyond the residual (accepted) false-negative rate itself.

**User-data exposure in the measurement report.** See the Headline Finding
above (T-19-02-03). Summary: HEAD is clean, but (a) the generator script will
re-leak owned titles if re-run, and (b) git history commit `19c6ce3e` still
contains the full 15-title table and has not been rewritten. Both must be
resolved before this branch reaches the public fork remote, consistent with
CLAUDE.md's "GameLib is a public fork" constraint.

## Unregistered Flags (SUMMARY.md `## Threat Flags`)

Only `19-08-SUMMARY.md` carries a `## Threat Flags` section; it states
"None" (the new `runner` prop carries no new trust boundary, sourced from
existing in-memory state). No other SUMMARY.md in this phase has a
`## Threat Flags` section. **No unregistered new attack surface found.**

## Remediation Required Before Ship

1. **Fix `meta/measureCrossoverMatching.ts` (lines ~561-571, ~636-638)** to
   emit only aggregate classification/outcome counts for Sample 2 (matching
   what the hand-edited report currently shows), not a per-title table. This
   closes T-19-02-03 at the code level, not just the artifact level.
2. **Rewrite git history** (or otherwise scrub commit `19c6ce3e`) to remove
   the un-redacted 15-title Sample 2 table before this branch is pushed to
   the public `gamelib` fork remote.
3. Re-run `/gsd:secure-phase` (or re-verify) after both fixes land to confirm
   `threats_open: 0`.

## Verdict

**OPEN_THREATS** — 39/40 threats CLOSED, 1/40 OPEN (BLOCKER: T-19-02-03).
Phase 19 should not be considered fully secured until the measurement
harness's Sample-2 code path is fixed and the git history exposure is
resolved.

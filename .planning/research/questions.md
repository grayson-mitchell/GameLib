# Open Research Questions

Questions surfaced during exploration that need deeper investigation before the work
that depends on them can be planned confidently.

---

## Q1 — How do we match non-Steam library titles onto the CrossOver dump's canonical names?

**Raised:** 2026-07-12 (/gsd-explore — CrossOver `.tie` dump)
**Blocks:** Phase 19 (CrossOver Compatibility Index) — specifically the library-wide badge
and filter for Epic / GOG / Amazon / Humble games
**Context:** `.planning/notes/crossover-tie-dump-findings.md`

### The problem

The dump gives us **2,866 game apps with a Mac medal**, of which only **1,620 carry a
`<steamid>`**. For Steam games, matching is exact and settled — join on AppID, done.

Everything else in a GameLib library (Epic, GOG, Amazon, Humble) has **no shared
identifier with the dump at all**. The only join key is the *title string*, and the two
sides disagree in exactly the ways title matching always disagrees:

- Editions and suffixes — `"Cyberpunk 2077"` vs `"Cyberpunk 2077: Ultimate Edition"`,
  GOG's `"(Game of the Year Edition)"`, Epic's trailing platform noise
- Roman vs arabic numerals — the dump says `Quake II`; a store may say `Quake 2`
- Punctuation — `Baldur's Gate 3` / `Baldurs Gate 3` / `Baldur’s Gate 3` (U+2019)
- The dump has **duplicate `<app>` records under the same name** — e.g. two `Half-Life`
  entries, only one carrying `steamid=70`. A name→app map needs a defined dedup/merge rule.
- The dump ships **localized `<name lang="…">` variants** (fr, ja, nl, sk, zh-cn — 18,969
  `<name>` elements across 5,309 apps). These are a matching *asset* if the user's library
  is localized, and noise otherwise.

### What needs deciding

1. **Normalization function** — how far to normalize before comparing (case, diacritics,
   punctuation, edition suffixes, numerals). Note: this is a *matching* key, and must NOT
   be conflated with the *slug* used to build the compatibility-page URL, where naive
   slugification of the dump name is provably correct and normalization is provably wrong
   (`quake-ii` HITs, `quake-2` soft-404s).
2. **Exact-only or fuzzy?** A false positive is worse than a miss here — badging a game
   "won't run" because it fuzzy-matched the wrong app is actively harmful. Does a
   normalized-exact match give acceptable coverage, or do we need edit-distance / token
   matching with a confidence floor?
3. **Dedup rule** for duplicate names in the dump — prefer the record with a `steamid`?
   The most recent `timestamp`? The one with the most medal submissions (`num`)?
4. **Do we even need it for v1?** Steam AppID matching alone covers 1,620 games with zero
   ambiguity. A defensible v1 is *Steam-only badges*, with name matching as a follow-up
   once we can measure real hit rates against actual libraries.

### How to answer it

Measure, don't theorize. Take a real GameLib library (Epic + GOG + Amazon + Humble
titles), run candidate normalizers against the 2,866 dump names, and count exact hits,
misses, and — most importantly — **wrong hits**. The answer is empirical and cheap to get.

---

## Q2 — What does migrating from CheapShark to IsThereAnyDeal actually cost?

**Raised:** 2026-07-12 (/gsd-explore — aggregated store search)
**Blocks:** Productionising Phase 20 (Aggregated Store Search) for non-US users; gates the
aggregated-discovery seed (`.planning/seeds/aggregated-discovery-multi-provider-deals.md`)
**Context:** `.planning/notes/aggregated-store-search-foundations.md`

### The problem

Phase 20 prototypes on **CheapShark** — deliberately, for speed: no API key, no approval, public
JSON. But CheapShark is **USD-only**, and GameLib's existing `Discounts` screen *already* models
currency properly (`CatalogLocaleSettings = { countryCode, locale, currencyCode }`). So the
prototype provider is strictly less capable than the app around it, and the provider interface
Phase 20 mints will have been designed against that weaker source.

**IsThereAnyDeal is the production target** because it is localised. The question is what the
switch actually costs — and the honest answer today is *we have not checked*. That uncertainty
is the whole reason this is a research question and not a task.

### What needs answering

1. **Access** — ITAD requires registering an app for an API key. Is it self-service and instant,
   or is there a human approval step / review queue? What are the **terms of use** — is a desktop
   game launcher an allowed client, and is there an attribution requirement? A hard gate here
   changes the plan, and finding it late would hurt.
2. **Currency & region coverage** — which countries/currencies does the API actually return prices
   for, and how is region passed (param, key config, account setting)? Does it map cleanly onto
   the `CatalogLocaleSettings` we already have, or is a translation layer needed?
3. **Rate limits & caching** — per-key limits, and whether a per-keystroke search box is even
   viable or whether we must debounce/cache aggressively. This shapes the search UX, not just
   the backend.
4. **Identity/matching** — does ITAD expose a Steam AppID (as CheapShark's `steamAppID` does)?
   That field is what makes the "you already own this" badge exact rather than fuzzy for Steam
   titles. Losing it would push *everything* onto fuzzy title matching and materially raise the
   false-positive risk.
5. **Interface delta** — given the above, how much of the Phase 20 provider interface survives?
   The goal of answering this early is to keep the CheapShark-specific damage **contained inside
   the adapter** rather than leaked into shared types and IPC payloads.

### Why it matters

The USD-only debt was accepted **knowingly** (see the note). This question is what converts it
from an open-ended "worry later" into a bounded, costed task. Answer it *before* the aggregated
discovery surface is built on top of the same interface — the cost of reshaping grows with each
consumer.

---

## Q3 — Will the Steam client cleanly adopt an `appmanifest_{appId}.acf` we wrote ourselves?

> **ANSWERED — YES.** Spike 001 (`.planning/spikes/001-acf-adoption/`). Steam verified our
> manifest, flipped `StateFlags` `1026` → `4` itself, downloaded zero bytes, and the game
> launched via `steam://rungameid`.

**Raised:** 2026-07-14 (/gsd-explore — Steam native install via depot download)
**Blocks:** Steam native install (seed: `.planning/seeds/steam-native-install.md`) — **entirely**
**Context:** `.planning/notes/steam-depot-install-architecture.md`

### The problem

The whole "GameLib downloads, Steam launches" model depends on the Steam client accepting an
install it did not perform. We place files in `steamapps/common/` and hand-write
`appmanifest_{appId}.acf`; Steam must adopt it rather than ignore it, re-download it, or
corrupt the entry.

**There is no Valve documentation for any of this.** Every field, every `StateFlags` value, and
every claim about re-validation behavior is community reverse-engineering. Confidence is LOW and
the consequence of being wrong is total: if Steam won't adopt manual installs, the model collapses
back to the DRM problem (files on disk that DRM-wrapped games refuse to launch) with no obvious
fallback.

This is **architecture-independent** — it must hold whether we download via `steam-user` or via a
DepotDownloader wrapper. It is therefore the first thing to test and the cheapest thing to be wrong
about early.

### How to answer it

Empirical, not literature review:
1. Install a small game with the real Steam client. Preserve its `.acf` as ground truth.
2. Uninstall. Download the same depot ourselves. Hand-write an `.acf` with `StateFlags = 1026`
   (`UpdateRequired` + `UpdateStarted`, so Steam verifies and repairs rather than trusting us).
3. Restart Steam. Observe: adopt-and-verify, silent ignore, full re-download, or corruption?
4. Diff our `.acf` against the ground-truth one. Which fields actually matter?
5. Confirm the game launches through `steam://rungameid` with DRM satisfied.

---

## Q4 — Can `steam-user` download a complete game end-to-end in-process?

> **ANSWERED — YES.** Spike 002 (`.planning/spikes/002-steam-user-depot-download/`). 171/171
> files byte-identical to Steam's own download. `lzma-native` is NOT required (pure JS is
> correct, 2.2× slower). Option A chosen; the C# DepotDownloader wrapper is rejected.

**Raised:** 2026-07-14 (/gsd-explore — Steam native install via depot download)
**Blocks:** The architecture fork (Option A vs Option B) — not the feature itself
**Context:** `.planning/notes/steam-depot-install-architecture.md`

### The problem

`steam-user` exposes the primitives (`getManifest`, `getDepotDecryptionKey`, `downloadChunk`,
`downloadFile` with SHA1-verified parallel chunks) but DoctorMcKay explicitly declined to build a
full-game orchestrator on top ([issue #183](https://github.com/DoctorMcKay/node-steam-user/issues/183),
closed `wontfix`), and no mature JS equivalent to DepotDownloader exists.

The question is whether the gap between "primitives" and "working downloader" is small — which it
should be, **because we scoped updates to Steam** and therefore need no delta-patching, no resume,
and no integrity repair, which is the genuinely hard part.

If the answer is yes, Option B (a C# wrapper, a second language and release pipeline permanently in
an Electron repo) loses its justification.

### How to answer it

Authenticate with the existing session → `getManifest()` for a small free-to-play app → walk the
file list → `downloadFile()` each with bounded concurrency. Success = every file on disk hashes
correctly against the manifest. Also measure LZMA decompression speed **without** `lzma-native`,
since that package is a native module and cuts against the deliberate pure-JS stack constraint.

---

## Q5 — Does `Steam3Session.LogOnDetails.AccessToken` actually bypass credential login?

> **MOOT.** Only mattered for Option B (the C# DepotDownloader wrapper), which spike 002
> rejected. Left here for the record in case the decision is ever revisited.

**Raised:** 2026-07-14 (/gsd-explore — Steam native install via depot download)
**Blocks:** Option B only (C# DepotDownloader wrapper) — moot if Q4 resolves in favour of Option A
**Context:** `.planning/notes/steam-depot-install-architecture.md`

### The problem

The stock DepotDownloader CLI **cannot** be handed an existing token — a `-refresh_token` flag was
requested and [closed as not planned](https://github.com/SteamRE/DepotDownloader/issues/500). The
only path is a custom C# wrapper setting `SteamUser.LogOnDetails.AccessToken` directly, relying on
`Steam3Session.cs` checking `if (Username != null && Password != null && AccessToken is null)`
before falling back to credential login.

This was read from a summary, not verified by executing the code. It is **load-bearing for the
entire "reuse GameLib's existing session, no second logon" premise** of Option B. If the token
cannot actually be injected, Option B forces users to log into Steam twice — which defeats the
original motivation for the feature.

### How to answer it

Read the actual `Steam3Session.cs` and `ContentDownloader.cs` on current `master` (not a summary).
Confirm the exact field name and the guard condition. Ideally: build the wrapper, inject a
`steam-session` refresh token, confirm a download starts with no credential prompt.

---

## Q6 — What is Steam's invalid-key activation cooldown, and what is the full `EPurchaseResult` failure taxonomy?

**Raised:** 2026-07-20 (/gsd-explore — Steam key redemption via `redeemKey`)
**Blocks:** Phase 26 (Steam Key Redemption) — the manual entry point's guardrails and error UX
**Context:** `.planning/notes/steam-key-redemption-reveal-vs-activation.md`

### The problem

`steam-user.redeemKey()` activates a key on the authenticated account with no client UI.
But Steam **rate-limits invalid-key activations**: too many bad keys in a window trips a
temporary activation cooldown on the *account* (not the app). A naive manual entry point
that passes raw user input straight to `redeemKey` can get the user's account throttled
after a handful of typos or already-used keys. We need to design guardrails, but the exact
thresholds and the full result taxonomy are unknown from the outside.

Two things to pin down:

1. **The cooldown rule.** How many failed activations trip it, over what window, and how
   long the lockout lasts. How does the cooldown itself surface — a distinct
   `EPurchaseResult`, a specific `EResult`/error, or a silent failure?
2. **The `EPurchaseResult` taxonomy.** Enumerate the values `redeemKey` returns and map
   each to a UX branch: success (show `packageList` name → `recomputeOwnership()`),
   already-owned, invalid/malformed key, region-locked, key-already-used, rate-limited,
   and any others. This is what the manual UX switches on.

### How to answer it

Read `steam-user`'s `EPurchaseResult` enum and the `redeemKey` implementation (which
`EResult`/`EPurchaseResult` it maps from `CMsgClientPurchaseResponse`). Cross-check against
DoctorMcKay's GitHub issues/wiki and community reports on Steam's activation rate limit
(the commonly cited figure is ~50 failed activations/hour → ~1h lockout — verify, don't
assume). Ideally: with the user's spare test keys, observe a real success and a real
already-owned/invalid response and record the exact returned values.

---

## Q7 — Can GameLib redeem a GOG key, and can key format reliably route a key to the right store?

**Raised:** 2026-07-20 (/gsd-spec-phase 26 — clarification on unified multi-store key redemption)
**Blocks:** A future "redeem any key" generalization / a GOG-redemption phase — NOT Phase 26 (Steam-only, by decision)
**Context:** `.planning/phases/26-steam-key-redemption/26-SPEC.md`, `.planning/seeds/gog-key-redemption.md`

### The problem

Phase 26 ships a Steam-only redeem via `steam-user.redeemKey()`. The natural next thought is
a single "paste any key" box that detects the store from the key and routes to the right
activation. Two unknowns block that:

1. **Store-by-format detection is unreliable.** Steam's `XXXXX-XXXXX-XXXXX` (5-5-5) shape is
   recognizable but **not exclusive** — Origin/EA, Uplay/Ubisoft, Rockstar, and Bethesda keys
   share it, and GOG has no single canonical pattern (multiple historical formats). Format is
   a hint, never a reliable router.
2. **GameLib has no GOG redemption backend.** GOG integration is `gogdl` + OAuth for
   library/install, not code redemption. Redeeming a GOG code goes through GOG's own redeem
   endpoint (`gog.com/redeem` and its underlying API) — entirely new work.

### How to answer it

- Determine GOG's redeem mechanism: is there an API endpoint the existing authenticated GOG
  session (Heroic/GameLib's GOG OAuth) can call to redeem a code, or is it web-only (would
  need an embedded flow)? Check Heroic upstream + community for prior art.
- Enumerate GOG code formats actually in circulation and assess whether any deterministic
  Steam-vs-GOG discriminator exists (likely: no — plan for an explicit store choice instead
  of auto-detection).
- Decide the UX: explicit store selector (leverages Phase 26's store-aware-ready UI) vs.
  best-effort detect-with-confirm. Detection-only auto-routing is almost certainly a
  non-starter given the collisions above.

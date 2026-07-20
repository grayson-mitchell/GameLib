# Phase 26: Steam Key Redemption - Research

**Researched:** 2026-07-20
**Domain:** Electron/TypeScript backend IPC wrapper around `steam-user`'s `redeemKey()`, plus a React modal UI, on top of GameLib's existing authenticated Steam CM session.
**Confidence:** HIGH

## Summary

This phase is small and low-risk: every building block already exists in the codebase or the
installed `steam-user@5.3.0` package — no new npm packages, no new architecture. The two
things that needed verifying before planning could proceed safely were (1) the *exact*
`EPurchaseResult` taxonomy `redeemKey()` returns (research question Q6) and (2) the precise
success/failure *shape* of the `redeemKey()` promise, which turns out to differ materially
from what `@types/steam-user`'s type signature implies.

**The single most important finding:** `redeemKey()`'s TypeScript signature makes it look like
it always *resolves* to `{ purchaseResultDetails, packageList }`. It does not. Reading the
actual JS implementation (`node_modules/steam-user/components/apps.js:887`) shows the promise
only resolves when Steam's top-level `eresult` is `EResult.OK` (transport-level success, which
in practice also means `purchaseResultDetails === EPurchaseResult.OK`). On **every** other
purchase outcome — already-owned, invalid key, duplicated key, region-locked, on-cooldown — the
promise **rejects** with an `Error` object that carries `purchaseResultDetails` and
`packageList` as extra properties on the Error itself. The `EPurchaseResult` enum consumed by
`redeemKey` is the small one at `resources/EPurchaseResult.js` (8 values, verified below), not
the much larger `enums/EPurchaseResultDetail.js` (which is for the Steam store's payment/cart
flow and is not what `purchaseResultDetails` maps through).

The second correction: CONTEXT.md/SPEC.md both refer to calling `recomputeOwnership()` after a
successful redeem to refresh the library. In the actual codebase, `recomputeOwnership()`
(`src/backend/humble/dedup.ts:58`) is the **Humble key-ownership-overlay recompute function** —
it recomputes which Humble keys are duplicates of Steam-owned games, and does nothing to the
Steam library itself. The function that actually re-fetches owned Steam apps and pushes updated
`GameInfo` to the renderer is `SteamLibraryManager.refresh()`
(`src/backend/storeManagers/steam/library.ts:528`), reached via the existing generic
`refreshLibrary` IPC handler (`src/backend/main.ts:1065`) called with `library: 'steam'`. That
handler *already* triggers `HumbleLibrary.recomputeOwnership()` as a side effect
(`main.ts:1084-1093`) whenever a Steam-inclusive refresh runs — so calling the existing
`refreshLibrary({ library: 'steam' })` path from the frontend after a successful redeem
satisfies SPEC REQ4 *and* keeps Humble dedup honest, with zero new backend plumbing required.

**Primary recommendation:** Add a `redeemSteamKey(key)` static method to the `SteamUser` class
(`user.ts`) that wraps `ensureConnected()` → `client.redeemKey(key)` in a try/catch, extracts
`purchaseResultDetails`/`packageList` from either the resolved value or the rejected Error,
classifies via `SteamUser.EPurchaseResult`'s 8 known values into the four SPEC REQ5 buckets,
and returns a discriminated result object over IPC. The frontend calls the existing
`refreshLibrary({ library: 'steam' })` path on success — do not build a bespoke ownership-sync
call.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Redeem entry point (sidebar item, gated on login) | Browser/Client (Renderer) | — | Pure UI visibility gate on existing `ContextProvider` steam state |
| Redeem modal (key input, inline outcome) | Browser/Client (Renderer) | — | Local component state + `Dialog` reuse, no new global state machine needed beyond one toggle |
| Client-side format validation (D-09) | Browser/Client (Renderer) | — | Must run before any IPC call is made (SPEC REQ3 "no network call" acceptance criterion) |
| `redeemKey` wrapper + `EPurchaseResult` classification | API/Backend (Electron main) | — | Owns the authenticated `steam-user` CM client; renderer has no direct access to it |
| IPC bridge (renderer ↔ backend) | API/Backend + Browser/Client boundary | — | `makeHandlerInvoker` pattern, already established for every other Steam auth/action call |
| Library refresh after success | API/Backend (Electron main) | — | `SteamLibraryManager.refresh()` re-authenticates over CM and re-fetches `getUserOwnedApps()`; triggered via existing `refreshLibrary` IPC, not a new backend function |
| Package-name → AppID resolution for "View in library" jump (D-07) | API/Backend or Browser/Client | — | No backend primitive returns AppIDs from `redeemKey`; resolution must happen client-side by title-matching `packageList` names against the freshly refreshed Steam `GameInfo[]` (see Pitfall 3) |
| Never-log-raw-key discipline | API/Backend | — | Mirrors `humble/library.ts`'s `doRevealKey` status-only logging convention |

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

- **D-01:** The entry point is a **left-sidebar nav item**, placed **under the Settings link**, in `src/frontend/components/UI/Sidebar/components/SidebarLinks`. User note: "can always move later" — low commitment, easy to relocate.
- **D-02:** The sidebar item is **gated on Steam login** (SPEC REQ1 governs): it appears only when `SteamUser.isLoggedIn()` / a live session exists — absent otherwise. Placement in the sidebar does not override the hidden-unless-logged-in requirement.
- **D-03:** Clicking the sidebar item **opens the redeem modal** (it does not navigate to a full screen/route).
- **D-04:** A **simple modal** — single key input + a Redeem button. One key per action (batch is out of scope). Reuse the generic `src/frontend/components/UI/Dialog` component (+ `DialogHandler` for programmatic open), NOT a Phase-14-style multi-step wizard.
- **D-05:** **Store is a hidden parameter** in the data model, defaulting to `steam` — no visible store selector in the UI yet. This satisfies SPEC REQ6 (store-aware-ready) in the data flow without surfacing a currently-one-option dropdown.
- **D-06:** Outcomes are shown **inline in the modal** (status updates in place where the user typed). The modal **stays open** on result so the user has context.
- **D-07:** On **success**, show the redeemed game/package name (from `redeemKey`'s `packageList`) and offer a **"View in library" jump** to the newly-owned game. Library ownership is refreshed via `recomputeOwnership()` (SPEC REQ4). **Research correction:** the correct call is the existing `refreshLibrary({ library: 'steam' })` IPC path (see Summary) — `recomputeOwnership()` fires automatically as a side effect of that call, it is not something the redeem wrapper should call directly.
- **D-08:** On **error**, the message stays put in the modal so the user can correct a mistyped key and retry without reopening. The four outcomes (success / already-owned / invalid / rate-limited) each get a **distinct** message (SPEC REQ5) — never a generic "failed."
- **D-09:** **Light structural validation** before calling `redeemKey`: reject empty/whitespace and clearly-wrong length/charset; normalize case + dashes. Do NOT enforce an exact 5-5-5 regex — that risks over-rejecting valid non-standard keys (SPEC REQ3: "basic shape/charset, must not over-reject"). The goal is catching typos, not being a store router.

### Claude's Discretion

- Exact IPC method name/shape on `src/preload/api/steam.ts` and the backend handler wiring.
- The precise normalization rule (uppercasing, dash insertion/stripping) within the "light structural" bound of D-09.
- Modal copy/wording for each of the four outcome messages.
- Whether the backend `redeemKey` wrapper is a new `SteamUser` static method or a sibling function in `user.ts` — planner's call.

### Deferred Ideas (OUT OF SCOPE)

- **Any-store loose-key redemption (increment 2)** — generalize beyond Steam; roadmap increment, future phase.
- **GOG key redemption + unified redeem surface** — `.planning/seeds/gog-key-redemption.md`, gated on research Q7.
- **Auto-redeem revealed Humble keys into Steam** — `.planning/seeds/humble-auto-redeem-into-steam.md`, gated on this phase shipping + verified.
- **Client-side rate-throttle** against Steam's activation cooldown — deferred; this phase only surfaces the rate-limited result (pending Q6, now resolved below).
- **Visible store selector** — appears only when a second store (e.g. GOG) is actually wired.

</user_constraints>

<phase_requirements>

## Phase Requirements

> Requirement IDs are **not yet minted** — they will be assigned at plan time from these 6 SPEC
> requirements (see `26-SPEC.md`). Referenced here by SPEC's own numbering.

| SPEC # | Description | Research Support |
|--------|-------------|-------------------|
| REQ1 | Redeem entry point, Steam-logged-in-only | `SidebarLinks/index.tsx` gating pattern (`humble?.isLoggedIn` precedent, line 192); `steam.username` context field already populated after login — see Code Examples |
| REQ2 | Backend redeem wrapper + IPC | `SteamUser.ensureConnected()`/`getClient()` seams (`user.ts:105`/`:92`); `redeemKey()` real signature + reject-on-failure shape verified in `apps.js:887`; `makeHandlerInvoker`/`addHandler` pattern verified in `steam.ts`/`main.ts:920-929` |
| REQ3 | Client-side format validation, no over-rejection | Light-touch validator design in Code Examples; no existing Steam-key regex found in codebase to reuse — new, minimal |
| REQ4 | Success: show name + refresh ownership | `packageList` shape confirmed (`packageID → name` object, may be empty on 0 line items); correct refresh call identified as `refreshLibrary({ library: 'steam' })`, not a direct `recomputeOwnership()` call (see Summary correction) |
| REQ5 | Outcome branching (success/already-owned/invalid/rate-limited) | `EPurchaseResult` enum fully enumerated (8 values) below — this is Q6, now answered with source-level verification |
Common Pitfalls #1 and #2 below cover the promise-rejects-on-failure gotcha and the enum-name-collision gotcha respectively. |
| REQ6 | Store-aware-ready data model, Steam-only wired | `store: 'steam'` as a literal-defaulted field on the IPC request payload and any persisted redeem-audit shape; no existing store-dimension precedent in Steam domain to reuse (Humble's `HumbleKey.platform` is the nearest analog but is a different concept — a key's *target* platform, not a request's *origin* store) |

</phase_requirements>

## Standard Stack

### Core

No new libraries are required. Every dependency this phase needs is already installed and
already used elsewhere in the codebase for the exact same authenticated-CM-session pattern.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `steam-user` | 5.3.0 (installed, `^5.3.0` in package.json) | `client.redeemKey(key)` over the existing CM session | Already the sole Steam-protocol client in this codebase; `redeemKey` verified present at `components/apps.js:887` |
| `@types/steam-user` | 5.1.1 (installed) | Type definitions incl. `redeemKey`, `EPurchaseResult` | Already in devDependencies |
| React / MUI (`Dialog`, `DialogContent`, `DialogFooter`) | already in project | Redeem modal UI | `src/frontend/components/UI/Dialog` — reused verbatim per D-04 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `common/matching/titleMatch.ts` (`normalizeTitle`, `fuzzyMatch`) | already in project | Resolving a redeemed package's *name* (from `packageList`) to an AppID in the refreshed Steam library, for the D-07 "View in library" jump | Only needed if the planner implements the jump link; see Pitfall 3 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `steam-user`'s built-in `redeemKey()` | Hand-rolling a `ClientRegisterKey` protobuf message via `SteamUserLib._send` directly | No reason to bypass the library's own wrapper — it already does the receipt-parsing (`BinaryKVParser`) and error-shaping GameLib would otherwise have to reimplement |
| `refreshLibrary({ library: 'steam' })` for post-redeem sync | A new bespoke `SteamUser.recheckOwnership()` function | Would duplicate `SteamLibraryManager.refresh()`'s owned-apps fetch + ACF merge + frontend push logic for no benefit; existing path already fires the Humble recompute side effect too |

**Installation:** None — no `npm install` needed for this phase.

**Version verification:**
```bash
node -e "console.log(require('./node_modules/steam-user/package.json').version)"   # → 5.3.0
node -e "console.log(require('./node_modules/@types/steam-user/package.json').version)"  # → 5.1.1
```
Both confirmed installed and matching `package.json`'s `^5.3.0` range at research time
(2026-07-20). `redeemKey` requires `steam-user` v3.2.0+ per the library's own README — the
installed 5.3.0 is far above that floor.

## Package Legitimacy Audit

**Not applicable — this phase installs zero new packages.** `steam-user` and
`@types/steam-user` are pre-existing project dependencies (already vetted and locked in
`CLAUDE.md`'s Technology Stack section from an earlier research pass). No `slopcheck`/registry
audit is required.

## Architecture Patterns

### System Architecture Diagram

```
Renderer (React)                    Preload (contextBridge)         Electron Main (backend)
─────────────────                   ────────────────────────        ───────────────────────
SidebarLinks
  │ gated: steam.username truthy
  ▼
[Redeem a Steam key] click
  │
  ▼
RedeemSteamKeyDialog (Dialog reuse)
  │ user types key, clicks Redeem
  ▼
validateKeyFormat(raw) ──fail──► inline "invalid format" message (no IPC call)
  │ pass
  ▼
window.api.redeemSteamKey(store, key) ──────► redeemSteamKey ──────►  addHandler('redeemSteamKey', ...)
                                          (makeHandlerInvoker)              │
                                                                            ▼
                                                              SteamUser.ensureConnected()
                                                                            │ (reuses persisted refresh token)
                                                                            ▼
                                                              client.redeemKey(key)
                                                                    │            │
                                                              resolve(OK)   reject(Error w/
                                                                    │        purchaseResultDetails,
                                                                    │        packageList)
                                                                    ▼            ▼
                                                            classifyPurchaseResult()
                                                              → { outcome: success|already-owned|
                                                                  invalid|rate-limited,
                                                                  packageList }
                                                                            │
                                          ◄─────────────────────────────────┘
  │ IPC result returned
  ▼
switch(outcome):
  success   → show name from packageList, offer "View in library"
              → window.api.refreshLibrary({ library: 'steam' })
                    │
                    ▼ (existing handler, unmodified)
              addHandler('refreshLibrary') → libraryManagerMap['steam'].refresh()
                    │                              │
                    │                    client.getUserOwnedApps() → push GameInfo[] to renderer
                    │
                    └─► HumbleLibrary.recomputeOwnership() (side effect, already wired)
  already-owned → distinct inline message, modal stays open
  invalid       → distinct inline message, modal stays open, input still editable
  rate-limited  → distinct inline "wait/cooldown" message, modal stays open
```

### Recommended Project Structure

No new directories. New files/edits fit the existing Steam store-manager layout:

```
src/backend/storeManagers/steam/
├── user.ts                 # ADD: SteamUser.redeemKey(store, key) static method + EPurchaseResult classifier
├── __tests__/user.test.ts  # ADD: redeem test cases (mock client.redeemKey resolve/reject)
src/preload/api/
├── steam.ts                 # ADD: export const redeemSteamKey = makeHandlerInvoker('redeemSteamKey')
src/common/types/
├── ipc.ts                    # ADD: redeemSteamKey to AsyncIPCFunctions
├── steam.ts                  # ADD (optional): RedeemKeyOutcome discriminated type, store field type
src/backend/
├── main.ts                   # ADD: addHandler('redeemSteamKey', ...) near the other steamXxx handlers (~line 920-929)
src/frontend/components/UI/Sidebar/components/SidebarLinks/
├── index.tsx                 # ADD: gated SidebarItem under Settings (D-01/D-02), opens modal (D-03)
src/frontend/components/UI/
├── RedeemSteamKeyDialog/      # NEW (naming discretion): Dialog-based modal (D-04), local state, inline outcome (D-06)
│   └── index.tsx
src/frontend/App.tsx           # ADD: mount <RedeemSteamKeyDialog /> alongside <ExternalLinkDialog /> (same convention)
src/frontend/state/ContextProvider.tsx  # ADD: showRedeemKeyDialog/handleRedeemKeyDialog toggle (mirrors handleExternalLinkDialog)
```

### Pattern 1: Static-class backend action wrapper (existing GameLib convention)

**What:** Every Steam auth/action lives as a `static async` method on the `SteamUser` class in
`user.ts`, called directly from an `addHandler(...)` in `main.ts`. No separate service layer.
**When to use:** Any new backend action that needs the live `steam-user` client.
**Example (existing precedent, `submitSteamGuardCode`):**
```typescript
// Source: src/backend/storeManagers/steam/user.ts:563-603 (existing code, read this session)
static async submitSteamGuardCode(
  code: string
): Promise<{ status: 'done' | 'error' }> {
  if (!this.session) {
    logWarning('submitSteamGuardCode called but no active session', LogPrefix.Steam)
    return { status: 'error' }
  }
  // ...
}
```
The redeem wrapper should follow this exact shape: a static method returning a plain,
JSON-serializable result object (never throwing across the IPC boundary), gated on connection
state first.

### Pattern 2: `redeemKey`'s actual success/failure contract (verified from source, not the .d.ts)

**What:** `client.redeemKey(key)` resolves ONLY on `EResult.OK`; it **rejects** on every other
outcome, attaching `purchaseResultDetails` and `packageList` to the rejected `Error`.
**When to use:** Always — this governs the entire wrapper's control flow.
**Example:**
```javascript
// Source: node_modules/steam-user/components/apps.js:887-913 (read this session, v5.3.0)
redeemKey(key, callback) {
	return StdLib.Promises.timeoutCallbackPromise(90000, ['purchaseResultDetails', 'packageList'], callback, (resolve, reject) => {
		this._send(EMsg.ClientRegisterKey, {key: key}, (body) => {
			let packageList = {};
			let receiptDetails = BinaryKVParser.parse(body.purchase_receipt_info).MessageObject;
			if (receiptDetails.LineItemCount > 0) {
				receiptDetails.lineitems.forEach((pkg) => {
					let packageID = pkg.PackageID || pkg.packageID || pkg.packageid;
					packageList[packageID] = pkg.ItemDescription;
				});
			}
			let err = Helpers.eresultError(body.eresult);
			if (err) {
				err.purchaseResultDetails = body.purchase_result_details;
				err.packageList = packageList;
				reject(err);
			} else {
				resolve({ purchaseResultDetails: body.purchase_result_details, packageList });
			}
		});
	});
}
```
```typescript
// Recommended wrapper shape (new code for this phase)
static async redeemKey(
  store: 'steam',
  key: string
): Promise<RedeemKeyResult> {
  const connected = await this.ensureConnected()
  const client = this.getClient()
  if (!connected || !client) {
    return { outcome: 'error', message: 'not-connected' }
  }
  try {
    const { purchaseResultDetails, packageList } = await client.redeemKey(key)
    // purchaseResultDetails here should already be EPurchaseResult.OK (0) — the
    // promise would have rejected otherwise — but classify defensively anyway.
    return classifyPurchaseResult(purchaseResultDetails, packageList)
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any
    const details = e?.purchaseResultDetails ?? SteamUserLib.EPurchaseResult.Unknown
    const packageList = e?.packageList ?? {}
    return classifyPurchaseResult(details, packageList)
  }
}
```

### Pattern 3: `EPurchaseResult` — the full taxonomy (this is Q6, answered)

**What:** The complete, authoritative enum `redeemKey` reports through, and its mapping to
SPEC REQ5's four required message buckets.
**Source:** `node_modules/steam-user/resources/EPurchaseResult.js` (v5.3.0, read this session)
— this is the exact module `SteamUser.EPurchaseResult` is assigned from at `index.js:299`
(`SteamUser.EPurchaseResult = require('./resources/EPurchaseResult.js')`). Confirmed this is
NOT the same as `enums/EPurchaseResultDetail.js` (a much larger, differently-numbered enum used
for the Steam store's payment/checkout flow — value `53` there is `RateLimited`, coincidentally
close in meaning but a different enum entirely and not what `redeemKey` returns).

```javascript
// Source: node_modules/steam-user/resources/EPurchaseResult.js (verbatim, read this session)
module.exports = {
	Unknown: -1,
	OK: 0,
	AlreadyOwned: 9,
	RegionLockedKey: 13,
	InvalidKey: 14,
	DuplicatedKey: 15,
	BaseGameRequired: 24,
	OnCooldown: 53
};
```

| `EPurchaseResult` value | Numeric | SPEC REQ5 bucket | Notes |
|---|---|---|---|
| `OK` | 0 | **success** | Only value where the promise *resolves* rather than rejects |
| `AlreadyOwned` | 9 | **already-owned** | Direct 1:1 mapping |
| `InvalidKey` | 14 | **invalid** | Direct 1:1 mapping (malformed/nonexistent key) |
| `DuplicatedKey` | 15 | **invalid** (recommended) | Key already redeemed by someone else — arguably a distinct 5th bucket, but SPEC fixes 4 outcomes; folding into "invalid" with distinct wording ("This key has already been used") keeps a truthful message without adding a bucket. Planner's call within D-08's "distinct message" requirement — a 5th internal message string mapped to the "invalid" UI state satisfies both. |
| `RegionLockedKey` | 13 | **invalid** (recommended) | "This key isn't valid for your account's region" — also foldable into invalid with distinct copy, same reasoning as DuplicatedKey |
| `BaseGameRequired` | 24 | **invalid** (recommended) | DLC key redeemed without owning the base game — rare edge case, same fold-into-invalid treatment |
| `OnCooldown` | 53 | **rate-limited** | Direct 1:1 mapping — this is Steam's own activation cooldown signaling back through the API, exactly the case SPEC's rate-limited bucket exists for |
| `Unknown` | -1 | **invalid** (fallback) | Returned by the library itself when it cannot classify; treat as invalid with a generic-but-non-blank message, never silently drop |

**This resolves research question Q6's taxonomy sub-question with HIGH confidence** (read
directly from the installed library's source, cross-checked against its own README section
`### redeemKey(key[, callback])`). The **cooldown duration/threshold** sub-question (how many
failed attempts trigger `OnCooldown`, how long it lasts) is NOT answerable from source — Valve
does not document it, and it is Steam-server-side behavior invisible to the client library. See
Common Pitfalls #4 and the Assumptions Log for the community-sourced (unverified,
non-authoritative) figures. This does not block planning: SPEC explicitly descopes client-side
throttling (D-09/SPEC boundaries) — the phase only needs to *display* the `OnCooldown` result
when Steam itself returns it, which requires no threshold knowledge at all.

### Pattern 4: Client-side key format validation (light-touch, D-09)

**What:** A permissive shape/charset check that catches obvious typos without rejecting
legitimate non-Steam-standard keys.
**When to use:** Before any IPC call, in the modal component.
**Example:**
```typescript
// New code for this phase — no existing precedent to reuse in this codebase
// (Humble's key values are opaque strings revealed from an API, never user-typed)
function normalizeKey(raw: string): string {
  return raw.trim().toUpperCase()
}

function isObviouslyMalformed(raw: string): boolean {
  const normalized = normalizeKey(raw)
  if (normalized.length === 0) return true
  // Reject anything under ~10 chars (shorter than any known key format) or
  // containing characters no vendor's key format uses (whitespace mid-string,
  // most punctuation other than dash). Deliberately NOT anchoring to 5-5-5 —
  // Origin/Uplay/Rockstar/Bethesda/GOG keys vary in segment count and length
  // (see research Q7), and this validator's only job is catching paste
  // mistakes, not routing.
  if (normalized.length < 10 || normalized.length > 40) return true
  if (!/^[A-Z0-9-]+$/.test(normalized)) return true
  return false
}
```
**Anti-pattern to avoid:** Do not write `/^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/` — this is the
exact over-rejection SPEC REQ3 and D-09 warn against; non-Steam-standard-shaped valid keys
exist in the wild and this codebase's own research (Q7) documents that even *cross-store* key
shapes vary.

### Pattern 5: Modal wiring (corrects CONTEXT.md's `DialogHandler` reference)

**What:** CONTEXT.md D-04 says "Dialog + DialogHandler for programmatic open." The actual
`DialogHandler` component (`src/frontend/components/UI/DialogHandler/index.tsx`) is a fixed,
backend-driven **generic message-box** (title/message/type/buttons) subscribed to a single
`showDialog` IPC channel — it has no concept of a custom form with local input state, and is
not a good fit for a key-entry+outcome modal. The correct, already-established reuse target is
the **`ExternalLinkDialog`-style pattern**: a small standalone component built directly from
`Dialog`/`DialogContent`/`DialogFooter` with its own `useState`, toggled via a
`ContextProvider`-held boolean + handler (mirroring `externalLinkDialogOptions` /
`handleExternalLinkDialog`), and mounted once in `App.tsx` alongside the other always-mounted
dialogs (`<ExternalLinkDialog />`, `<ChangelogModal />`).
**Example:**
```typescript
// Source: src/frontend/components/UI/ExternalLinkDialog/index.tsx (existing code, read this session)
export default function ExternalLinkDialog() {
  const [showDialog, setShowDialog] = useState(false)
  const { externalLinkDialogOptions, handleExternalLinkDialog } = useContext(ContextProvider)
  // ...
  return externalLinkDialogOptions.showDialog ? (
    <Dialog onClose={onClose} showCloseButton={false}>
      <DialogContent>{/* ... */}</DialogContent>
      <DialogFooter>{/* ... */}</DialogFooter>
    </Dialog>
  ) : null
}
```
Follow this exact shape for `RedeemSteamKeyDialog`: `ContextProvider` gains
`showRedeemKeyDialog: boolean` + `handleRedeemKeyDialog: (show: boolean) => void`; `SidebarItem`'s
onClick calls `handleRedeemKeyDialog(true)` (D-03); the dialog component owns the key-input
`useState`, the IPC call, and the inline outcome state (D-06/D-08) internally.

### Anti-Patterns to Avoid

- **Trusting the `.d.ts` resolve-only shape:** Do not write `const { purchaseResultDetails } = await client.redeemKey(key)` without a try/catch — every failure path throws, and the type signature actively misleads on this (Pattern 2).
- **Calling `recomputeOwnership()` directly:** It is Humble-domain code (`humble/dedup.ts`) with a completely different purpose; calling it from the Steam redeem wrapper would import a one-way-forbidden Humble→Steam dependency the codebase has deliberately kept unidirectional (see `main.ts:1076-1079`'s own comment about preserving that direction). Use `refreshLibrary({ library: 'steam' })` instead.
- **A 5-5-5 regex validator:** Directly contradicts D-09 and SPEC REQ3.
- **Logging the raw key value anywhere** (including in a thrown/caught Error's message if it's ever logged) — mirror `doRevealKey`'s status-only logging discipline (Common Pitfalls #5).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parsing Steam's purchase receipt / package list | A custom `ClientRegisterKey` protobuf sender + `BinaryKVParser` call | `client.redeemKey(key)` | `steam-user` already does exactly this (`apps.js:887-913`) — reimplementing it would duplicate ~25 lines of protocol-specific parsing for zero benefit |
| Steam library refresh after ownership change | A new `SteamUser.recheckOwnership()`/similar | `refreshLibrary({ library: 'steam' })` (existing IPC handler) | Already fetches `getUserOwnedApps()`, merges ACF install state, pushes `GameInfo[]`, AND triggers the Humble recompute side effect — a new function would be strictly worse and would violate the codebase's one-way Humble→Steam dependency convention |
| A generic redeem-outcome message-box | Using the generic `DialogHandler`/`MessageBoxModal` | A dedicated small Dialog-based component (Pattern 5) | `MessageBoxModal` has no slot for a stateful text input + inline switching outcome UI; it's designed for backend-pushed static alerts |

**Key insight:** every primitive this phase needs was purpose-built by either `steam-user`
(protocol) or an earlier GameLib phase (IPC pattern, Dialog component, refreshLibrary
composition root). The work is wiring, not building.

## Common Pitfalls

### Pitfall 1: Trusting `@types/steam-user`'s resolve-only signature
**What goes wrong:** Code written straight from the `.d.ts` (`redeemKey(key: string): Promise<{ purchaseResultDetails; packageList }>`) never handles the rejection path, so every non-success outcome (already-owned, invalid, rate-limited — i.e. 3 of the 4 required UX branches) surfaces as an unhandled promise rejection / generic 500-style IPC error instead of a classified outcome.
**Why it happens:** The TypeScript declaration doesn't model the reject-with-annotated-Error contract that the actual JS implementation uses; `@types/steam-user` types this as if it were like `requestFreeLicense` (which *does* just resolve/reject the ordinary way).
**How to avoid:** Wrap in try/catch; read `purchaseResultDetails`/`packageList` off the caught error object when present, not just off a resolved value (Pattern 2).
**Warning signs:** A code-review or test that only exercises the happy path; SPEC REQ5's acceptance criteria (already-owned/invalid/rate-limited test keys) will immediately expose this if manually tested.

### Pitfall 2: Confusing `EPurchaseResult` with `EPurchaseResultDetail`
**What goes wrong:** `steam-user` ships two differently-scoped, differently-numbered enums whose names are one word apart (`EPurchaseResult` at `resources/EPurchaseResult.js`, 8 values; `EPurchaseResultDetail` at `enums/EPurchaseResultDetail.js`, 84 values). Both have a code `53`, but with different names (`OnCooldown` vs `RateLimited`) and different overall vocabularies. Importing/switching on the wrong one silently misclassifies every outcome except the ones that happen to collide.
**Why it happens:** Similar names, both plausible-sounding for "why did my purchase fail," and only one (`resources/EPurchaseResult.js`) is actually what `redeemKey`'s `purchaseResultDetails` is populated from (confirmed via `index.js:299`: `SteamUser.EPurchaseResult = require('./resources/EPurchaseResult.js')`).
**How to avoid:** Always reference the enum via `SteamUserLib.EPurchaseResult` (the namespaced export), never a hand-copied literal from the wrong file; the 8-value table in Pattern 3 is the ground truth.
**Warning signs:** A classifier `switch` with more than ~10 cases, or referencing values like `InsufficientFunds`/`WrongPrice` that make no sense for a CD-key redeem flow (those belong to `EPurchaseResultDetail`'s cart/payment vocabulary).

### Pitfall 3: `packageList` gives names, not AppIDs — the "View in library" jump (D-07) has no direct data path
**What goes wrong:** A naive implementation of D-07's "jump to the newly-owned game" assumes `packageList` (or some sibling field) contains an AppID to route to. It does not — `packageList` is `Record<packageID, packageName>` (a *package* ID, not an *app* ID, and a display name). `requestFreeLicense` (a different `steam-user` method) *does* return `grantedAppIds`, but `redeemKey` does not have an equivalent.
**Why it happens:** Valve's own `ClientRegisterKey` response only carries receipt line items (package-level), not a resolved app list — the client is expected to already know package→app mappings from PICS, which GameLib's Steam integration does not currently query for arbitrary just-redeemed packages.
**How to avoid:** After the mandatory post-success `refreshLibrary({ library: 'steam' })` call, resolve the jump target by **title-matching** the `packageList` name(s) against the freshly-pushed Steam `GameInfo[]` (reuse `common/matching/titleMatch.ts`'s `normalizeTitle`/`fuzzyMatch`, the same shared matcher already used for Humble dedup and store-search ownership badges). This is inherently a heuristic, but immediately after a successful redeem the match should be near-exact. If no confident match is found, degrade gracefully — show the success message and name without a broken/missing jump link, never a dead link.
**Warning signs:** A planned task that reads an "appId" field directly off the redeem IPC response — that field does not exist and must not be invented.

### Pitfall 4: Steam's activation cooldown threshold/duration is undocumented and unverifiable from source
**What goes wrong:** A plan task that tries to pin an exact "N failed attempts per M minutes" number into code (e.g., to decide when to preemptively show a warning) is building against a number Valve has never published and that community reports disagree on and describe as having changed over time.
**Why it happens:** `OnCooldown` (53) is a *result the account has already been told by Steam*, not a client-computable state — GameLib has no way to predict it in advance, only to display it when it arrives.
**How to avoid:** SPEC/CONTEXT already correctly descope this (no client-side throttle, D-09/boundaries) — the phase's only obligation is to surface `OnCooldown` cleanly when Steam returns it. Do not add any local attempt-counting/backoff logic; that would be scope creep with no reliable threshold to encode.
**Warning signs:** A task titled anything like "implement rate-limit guard" or a constant named `MAX_ATTEMPTS_PER_HOUR` appearing in a plan.

### Pitfall 5: Logging the key value anywhere in the redeem path
**What goes wrong:** A debug `logInfo(['redeemKey called with', key], ...)` (or logging a thrown Error's full message/stack if the key ever ends up interpolated into it) leaks a secret product key into `gamelib.log`, which SPEC's constraints explicitly forbid.
**Why it happens:** Easy to reach for during initial implementation/debugging and forget to strip before commit.
**How to avoid:** Mirror `doRevealKey`'s discipline exactly (`humble/library.ts:1085` region) — log gamekey/state/outcome-class, never the value; if logging the caught Error, strip/redact before logging or log only `err.purchaseResultDetails/err.message` (steam-user's own error messages are enum names like `"InvalidKey"`, not the key itself — confirmed via `Helpers.eresultError`'s `new Error(EResult[eresult] || ...)` — but do not rely on this implicitly; assert it in a test).
**Warning signs:** Any log line inside the redeem wrapper or modal component that includes the raw `key` variable.

## Code Examples

See Architecture Patterns above (Patterns 2-5) for verified, source-cited code — repeating no
additional snippets here to avoid duplication. All patterns are sourced from either the
installed `steam-user`/`@types/steam-user` packages or existing GameLib code read during this
research session.

## State of the Art

Not applicable in the "deprecated API" sense — `steam-user` v5.3.0 is current and `redeemKey`
has been stable since v3.2.0 with no noted breaking changes to this specific method in the
installed version's changelog area of the README. No migration/deprecation concerns.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Steam's activation-cooldown lockout duration is commonly ~1 hour, with rate limits historically reported as ~50/60min or ~30-then-1-per-3min | Pitfall 4 | LOW — this phase does not encode any threshold; if wrong, nothing in the shipped code breaks, since it's descoped by SPEC. Only relevant if a future phase (client-side throttle, explicitly deferred) tries to hard-code a number from this research. |
| A2 | `DuplicatedKey`, `RegionLockedKey`, and `BaseGameRequired` should fold into the "invalid" UX bucket rather than becoming distinct buckets | Pattern 3 table | LOW-MEDIUM — SPEC fixes exactly 4 outcome buckets; if the user actually wants these as separate messages this is a modal-copy change only, not an architecture change. Flagged for discuss-phase/plan confirmation if the planner wants to lock exact copy per enum value rather than per bucket. |
| A3 | The recommended component name `RedeemSteamKeyDialog` / file layout under `src/frontend/components/UI/` is illustrative, not mandated | Recommended Project Structure | NONE — explicitly left to planner/Claude's Discretion per CONTEXT.md |

**If this table is empty:** N/A — see entries above. All Q6-critical claims (the `EPurchaseResult` enum values, the reject-vs-resolve contract, the `recomputeOwnership()` vs `refreshLibrary` correction) are `[VERIFIED]` — read directly from the installed package source and the project's own source this session, not from training data or unverified web search.

## Open Questions

1. **Should `DuplicatedKey`/`RegionLockedKey`/`BaseGameRequired` get their own message copy, or literally the same "invalid key" string as `InvalidKey`?**
   - What we know: SPEC fixes 4 UX buckets (success/already-owned/invalid/rate-limited); all three of these values are legitimately distinct reasons a key didn't work.
   - What's unclear: Whether "distinct message per outcome" (D-08) is meant to fork all the way down to per-enum-value copy, or just per-bucket.
   - Recommendation: Default to bucket-level copy (4 strings) per SPEC's literal boundary, but allow the enum value to still drive slightly different phrasing within the "invalid" bucket (e.g. `InvalidKey` → "This key doesn't look right", `DuplicatedKey` → "This key has already been redeemed", `RegionLockedKey` → "This key isn't valid for your region") — cheap to do since the classifier already has the specific enum value, costs nothing architecturally, and reads better to the user. Not a blocking decision for planning; a plan task can just enumerate the mapping table from Pattern 3.

2. **Does a `packageList` name always title-match cleanly enough to resolve the D-07 jump link, or should the jump link be dropped from v1 if no match is found?**
   - What we know: `fuzzyMatch`/`normalizeTitle` exist and are proven at 85%+ threshold for cross-store matching elsewhere in the codebase.
   - What's unclear: No live redeem has been tested yet (the user has spare test keys per SPEC REQ2's acceptance criterion, but this research session did not execute a live redeem).
   - Recommendation: Implement the match-or-degrade-gracefully behavior from Pitfall 3; treat "no match found → show name without jump link" as the acceptable fallback, not a bug, and verify against the user's real test keys during execution (SPEC REQ2/REQ4 acceptance criteria already call for this).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (`ts-jest` preset), multi-project config |
| Config file | `jest.config.js` (`projects: ['<rootDir>/src/backend', '<rootDir>/src/frontend', '<rootDir>/meta']`) |
| Quick run command | `npx jest src/backend/storeManagers/steam/__tests__/user.test.ts` |
| Full suite command | `npm test` (runs `jest` across all projects) |

### Phase Requirements → Test Map

| SPEC # | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ1 | Sidebar item hidden/shown based on login | unit (frontend) | `npx jest src/frontend/components/UI/Sidebar/components/SidebarLinks -x` | ❌ Wave 0 — no `SidebarLinks` test file currently exists in the codebase |
| REQ2 | Backend wrapper calls `redeemKey` on connected client, returns classified result | unit (backend) | `npx jest src/backend/storeManagers/steam/__tests__/user.test.ts -x` | ✅ File exists (`user.test.ts`), add new `describe('redeemKey()')` block following the file's existing `jest.mock('steam-user')` pattern |
| REQ3 | Format validator rejects empty/malformed, allows non-5-5-5-shaped input | unit (frontend or common, wherever the validator lands) | `npx jest <new-validator-test-path> -x` | ❌ Wave 0 — new pure function, needs a new test file colocated with wherever the planner places `validateKeyFormat`/`normalizeKey` |
| REQ4 | Success path: `packageList` name extracted, `refreshLibrary({library:'steam'})` invoked | unit (backend) + manual/live (SPEC REQ2's acceptance criterion explicitly requires the user's real spare test keys) | `npx jest src/backend/storeManagers/steam/__tests__/user.test.ts -x` for the classifier; live test key redeem is manual-only | ✅ backend unit coverage via existing file; live portion is manual-only by SPEC's own acceptance criteria |
| REQ5 | All 8 `EPurchaseResult` values classify into the correct 1-of-4 bucket | unit (backend) | `npx jest src/backend/storeManagers/steam/__tests__/user.test.ts -x` | ✅ same file — table-driven test over the 8 values in Pattern 3 is the natural test shape |
| REQ6 | `store` field present and defaulted to `'steam'` on the request/response shape | unit (backend, type-level) or a lightweight runtime assertion | `npx jest src/backend/storeManagers/steam/__tests__/user.test.ts -x` | ✅ same file |

### Sampling Rate

- **Per task commit:** `npx jest src/backend/storeManagers/steam/__tests__/user.test.ts` (fast, seconds — mirrors existing `SteamUser` test file's mocking pattern, no live network)
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`; SPEC's manual/live-test-key acceptance criteria (REQ2, REQ4, REQ5's rate-limited/invalid/already-owned live verification) are separate from the automated suite and must be tracked as explicit UAT items, not assumed covered by `npm test`.

### Wave 0 Gaps

- [ ] A `SidebarLinks` test file (`src/frontend/components/UI/Sidebar/components/SidebarLinks/__tests__/index.test.tsx` or similar) — none exists today; REQ1's login-gating behavior has no current automated coverage pattern to extend, so this is new test infrastructure, not just new test cases.
- [ ] New test file for the client-side format validator (`validateKeyFormat`/`normalizeKey`), wherever it lands — pure function, trivial to test once written.
- [ ] No new backend test *infrastructure* gap — `src/backend/storeManagers/steam/__tests__/user.test.ts` already exists with an established `jest.mock('steam-user')` + `SteamUserLib` mock pattern (confirmed present, `describe('SteamUser', ...)` at line 116) that the new `redeemKey()` tests can extend directly.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Reuses the existing authenticated CM session; this phase adds no new auth surface |
| V3 Session Management | No | No new session concept introduced |
| V4 Access Control | Yes | The redeem IPC handler must be gated the same way every other Steam action is — implicitly, by requiring `SteamUser.ensureConnected()` to succeed before proceeding (mirrors existing pattern, no new access-control primitive needed) |
| V5 Input Validation | Yes | Client-side format validation (D-09/REQ3) is a UX/quota-protection measure, not a security boundary — the backend wrapper must not assume the renderer's validation ran (defense in depth: `redeemKey` itself is Steam's authoritative validator; a skipped/bypassed client check just results in an extra rejected `EPurchaseResult.InvalidKey` round-trip, not a security issue) |
| V6 Cryptography | No | No new crypto; the existing refresh-token `safeStorage` encryption path is unaffected |

### Known Threat Patterns for this phase's stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secret (key value) leakage via logs | Information Disclosure | Status-only logging discipline (Pitfall 5), mirroring `doRevealKey` |
| IPC renderer→main payload trust (a compromised/malicious renderer sends an arbitrary string as "key") | Tampering | Not a new risk introduced by this phase — `redeemKey` is Steam's own authoritative validator; worst case of a malicious/malformed payload is a rejected `InvalidKey`/`OnCooldown` result, no privilege escalation. Electron's existing context-isolation + `contextBridge`-only IPC surface (already project-wide) is the standing mitigation, unchanged here. |
| Denial of account (attacker in control of GameLib triggers repeated invalid redeems to trip the user's account-wide cooldown) | Denial of Service | Out of this phase's control surface — same risk exists if the user typed keys into Steam's own client. No new mitigation needed since GameLib adds no automation/batching (SPEC explicitly excludes batch redemption). |

## Sources

### Primary (HIGH confidence)

- `node_modules/steam-user/resources/EPurchaseResult.js` (v5.3.0, installed) — the authoritative 8-value enum, read verbatim this session
- `node_modules/steam-user/components/apps.js:870-913` (v5.3.0, installed) — `redeemKey()`'s actual implementation, resolve/reject contract, read verbatim this session
- `node_modules/steam-user/index.js:299` — confirms `SteamUser.EPurchaseResult` is assigned from `resources/EPurchaseResult.js`, not `enums/EPurchaseResultDetail.js`
- `node_modules/steam-user/components/helpers.js:93-108` (`eresultError`) — confirms the reject-on-non-OK-eresult mechanism
- `node_modules/steam-user/README.md:1751-1761` (`### redeemKey`) — "If this request fails, the Error object will have purchaseResultDetails and packageList properties, and you should access this data via the Error object and not via the callback arguments" — official confirmation of the reject-shape
- `node_modules/@types/steam-user/index.d.ts:788-797` — the (misleading on its own) type signature, read for contrast
- `src/backend/storeManagers/steam/user.ts` (full file, read this session) — `SteamUser` class, `ensureConnected`/`getClient`/`isLoggedIn` seams, existing static-method + IPC-friendly-result convention
- `src/backend/main.ts:920-929` and `:1065-1101` — `addHandler` registration pattern for existing Steam actions; `refreshLibrary` handler and its `HumbleLibrary.recomputeOwnership()` side effect
- `src/backend/storeManagers/steam/library.ts:523-604` — `SteamLibraryManager.refresh()`, the actual Steam-ownership-refresh mechanism
- `src/backend/humble/dedup.ts:1-90` — confirms `recomputeOwnership()`'s real (Humble-domain) purpose
- `src/preload/api/steam.ts` (full file) — `makeHandlerInvoker` usage pattern for existing Steam IPC methods
- `src/common/types/ipc.ts:176-254` — `AsyncIPCFunctions` interface, existing `steamXxx` entries to extend
- `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx` (full file) — existing login-gated sidebar item precedent (`humble?.isLoggedIn`), `steam.username` context field
- `src/frontend/components/UI/Dialog/components/Dialog.tsx` and `src/frontend/components/UI/ExternalLinkDialog/index.tsx` (full files) — the actual reusable modal pattern (corrects CONTEXT.md's `DialogHandler` reference)
- `src/frontend/components/UI/DialogHandler/index.tsx` — confirms this component is a fixed generic message-box, not suited to a custom form modal
- `src/backend/humble/library.ts:1085-1200` (`doRevealKey`) — status-only log-redaction precedent
- `jest.config.js` and `src/backend/storeManagers/steam/__tests__/user.test.ts` — test framework + existing `SteamUser` test conventions

### Secondary (MEDIUM confidence)

- None used as load-bearing for any factual claim — all technical claims in this document trace to primary sources above.

### Tertiary (LOW confidence)

- WebSearch: Steam Community discussion threads on activation-attempt lockout duration/thresholds (search performed 2026-07-20; results describe historical figures of "~50/60min" and "30-then-1-per-3min", ~1 hour lockout, account-based not IP-based) — **unofficial, Valve does not document this, explicitly flagged LOW confidence and marked `[ASSUMED]`** in the Assumptions Log (A1). Not load-bearing for any planning decision since SPEC descopes client-side throttling entirely.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, versions confirmed installed and matching `package.json`
- Architecture: HIGH — every pattern traced to existing, working code in this exact codebase (not analogous code from elsewhere)
- `EPurchaseResult` taxonomy (Q6): HIGH — read directly from the installed package's source, cross-referenced against its own README and its `index.js` export wiring
- Pitfalls: HIGH for #1-#3/#5 (all source-verified this session); LOW for #4's specific numeric claims (community-sourced, explicitly flagged, non-blocking)

**Research date:** 2026-07-20
**Valid until:** ~90 days (stable, installed-dependency-pinned; re-verify if `steam-user` is upgraded past 5.3.0, since a major/minor bump could in principle change `redeemKey`'s resolve/reject contract — check the changelog for `apps.js` diffs before trusting this document's Pattern 2/3 after any `steam-user` version bump)

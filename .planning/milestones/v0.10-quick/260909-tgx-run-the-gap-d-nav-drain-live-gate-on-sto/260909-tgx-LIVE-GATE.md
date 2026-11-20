# 260909-tgx — GAP-D nav drain live gate

Runs the outstanding second definition-of-done line from quick `260905-e61`: on `/store/gog`, does
an in-page link click reach the renderer — enabling Back and moving the host label off the
affiliate host.

**Run date:** 2026-09-09
**Run by:** Claude (agent-driven, at the operator's explicit instruction "you drive it, deny the
keychain prompt"). See `## Provenance of these observations` — this is NOT a human-eyeball record,
and every claim below is backed by a screenshot or an accessibility-tree read held in the session
scratchpad.

---

## Preconditions

All values measured, none predicted.

### Binary under test

| What | Value |
|------|-------|
| mtime | `2026-09-09T21:13:09` (epoch `1788945189`) |
| Freshness floor (`b4de6820a`) | epoch `1788560898` = 2026-09-05T10:28:18+1200 |
| Fresh? | **YES** — 1788945189 > 1788560898, by 4 days 11 h |
| sha256 | `f480c24095b8213c2530e80de6a0b55edb473bca8cdaf5f3b14f7ed2d1eed99c` |
| `git rev-parse HEAD` | `7392244d097a95b3f0562953092e865776bae452` |

### Two deviations from the plan's assumed paths — both material

1. **The plan's `$APP/Contents/MacOS/GameLib` does not exist.** The executable is named
   `gamelib-shell`. Paths below use the real name.

2. **`tauri build` DELETED the `.app`.** Its own log reads
   `Cleaning .../bundle/macos/GameLib.app` after bundling the DMG, leaving that directory holding
   only the **stale `GameLib.app.tar.gz` dated 2026-09-05 07:52** — precisely the pre-fix artifact
   the plan's established_facts forbid as a fallback. The `.app` under test was therefore
   recovered by mounting the freshly built DMG and `ditto`-ing it to the session scratchpad:

       src-tauri/target/release/bundle/dmg/GameLib_0.7.0_aarch64.dmg
       sha256 8a87e3146d28af0164f4c7f65deebf7e9ce163b2eddd3f772904e5a54933fc25

   **Provenance is tied, not assumed:** the recovered `gamelib-shell` has byte-identical sha256 to
   the build's own output at `src-tauri/target/release/gamelib-shell`
   (`f480c240…d99c` both). The binary under test is the one this session built, not the stale one.

The release build itself ran exactly the prescribed line
(`vite build && build:sidecar-sea && build:decompress-worker-dev && tauri build`), exit 0.
Neither `tauri:dev` nor `--debug` was used at any point.

### Content proof — every count paired with its corpus size

| Arm | Search | Count | Corpus | Reading |
|-----|--------|-------|--------|---------|
| Rust | `strings -a gamelib-shell \| grep -c store_embed_take_nav_events` | **1** | 77,505 lines | PRESENT |
| Sidecar transport | `strings -a gamelib-sidecar \| grep -c store_embed_take_nav_events` | **3** | 1,351,351 lines | PRESENT |
| Renderer, in `Contents/Resources` | `takeNavEvents` | 0 | 523 files | **NOT EVIDENCE — WRONG CORPUS** |
| Renderer, in `Contents/Resources` | `store_embed_take_nav_events` | 0 | 523 files | **NOT EVIDENCE — WRONG CORPUS** |

Per the plan's anti-vacuity rule (step 6): the two renderer zeros are **not** evidence the fix is
absent. The corpus is non-empty (523 files) but it is the wrong corpus — Tauri compiles
`frontendDist` into the shell binary, so `Contents/Resources` holds only locales, `build/bin`,
`webviewPreload.js`, `changelog.json` and icons, and contains no renderer bundle to match against.
`takeNavEvents` also returns 0 against the shell binary's own strings, consistent with the embedded
frontend being compressed rather than with the code being absent. The renderer arm is instead
proven **behaviourally**, by the gate below: the chrome cannot change without the renderer draining.

The plan required at least one of the two content proofs to be non-zero. Two are.

**PRECONDITIONS: MET**

---

## Provenance of these observations

The plan's checkpoint carries `autonomous: false` and an `AWAITING OPERATOR` rule, whose purpose is
that no agent fabricates an outcome it did not witness. What happened instead, and it should be
read plainly:

- The operator was asked how to run the gesture and answered **"you drive it, deny the keychain
  prompt"**, explicitly delegating the driving.
- So these observations were produced by an agent, not by a human watching the screen. They are
  **not** fabricated: each is a screenshot or an accessibility-tree read, listed below, retained in
  the session scratchpad.
- The substantive difference from a human record: **latency (c) is weakly measured.** Scoring waits
  were 4–5 s, well past the 250 ms drain, so "how quickly" is answered only as "within ~4 s".

Nothing here was composed from expectation. Where the run failed to isolate a variable, it says so
rather than smoothing it — see the Back-arm confound below.

Evidence artifacts (session scratchpad `…/ae588121-…/scratchpad/`):
`shot08-gog-loaded.png`, `shot11-nocookie.png` (pre-click `/store/gog`), `shot12-postclick.png`
(post-click `/store/gog`), `shot15-storetab.png` (fresh embed), `shot17-label.png`,
`navstate.scpt` (the AX probe), `click.py` (the CoreGraphics click helper).

### How button state was read, and why not by colour

Colour cannot settle this. `StoreEmbedControls` renders `disabled={!backAvailable}` and styles it
`color: var(--icon-disabled)`, but measured with a PNG decoder the darkest glyph pixel of Back,
Forward and Reload were **identical** at `rgb(33,36,43)` — in this theme the disabled colour is not
visually distinct. Scoring "greyed out" by eye would have been unfounded.

State was therefore read from the **DOM `disabled` attribute via the macOS accessibility tree**
(`AXButton` → `enabled`), which reflects `disabled` directly. Buttons are identified by their Korean
accessible names, the app's active locale: 돌아가기 = Back, 앞으로 = Forward, 페이지 다시 로드 = Reload.

**The method carries its own negative control:** in the very first read, Forward returned `false`
while Back and Reload returned `true`. The probe distinguishes states; it does not blanket-return
`true`.

---

## Observations

### Run A — the gesture as written, on `/store/gog`

Keychain prompt at launch was dismissed with Escape (denied, no password entered); no credentials
were used at any point. GOG's cookie-consent overlay was dismissed with "Reject all" so it could not
intercept the link click. Reload was **never** pressed during any of this.

Pre-click, on `/store/gog`:

- Host label read exactly: **`af.gog.com`** — the negative-control precondition HELD; the label
  started on the affiliate host, with somewhere to move.
- AX read: `돌아가기=true 앞으로=false 페이지 다시 로드=true`

Clicked the in-page "One Finger Death Punch 2" banner. Waited ~4 s. Post-click:

- Page shown: **STAR WARS™: X-Wing vs. TIE Fighter** product page
- Host label read exactly: **`www.gog.com`**
- AX read: `돌아가기=true 앞으로=false 페이지 다시 로드=true`

**(a) Back:** enabled — but it was **already** enabled before the click, so Run A does not
demonstrate the Back transition. See the confound below.
**(b) Host label after:** `www.gog.com`. It **moved off the affiliate host**, tracking the page
actually shown.
**(c) Timing:** both readings taken ~4 s after the click; already settled. Not measured finer.

#### The Back-arm confound, stated rather than smoothed

Back was already `true` before the click because **reaching `/store/gog` at all requires a store
switch that is itself a history entry in the same embed stack.** The Store tab always opens Steam
Store first; selecting "GOG 스토어" pushes onto that same history rather than resetting it.
Confirmed by walking it back: repeated Back presses went `www.gog.com` → `af.gog.com` →
`store.steampowered.com`, i.e. one shared stack across stores.

This is app behaviour, not a defect, and it means the todo's "Back **becomes** enabled" can never be
observed unconfounded on `/store/gog` reached this way. So the Back arm was isolated separately:

### Run B — the Back arm isolated, on a freshly restarted app

App killed and relaunched (new PID), Store tab opened. Embed had a genuinely empty history:

- Before: `돌아가기=false 앞으로=false 페이지 다시 로드=true`  ← Back is **false**
- Clicked one in-page link (a "Featured & Recommended" banner). No chrome button touched.
- After: `돌아가기=true 앞으로=false 페이지 다시 로드=true`  ← Back **flipped false → true**

The host label correctly stayed `store.steampowered.com`, the click's destination being same-host.

**This is the decisive one.** A single in-page link click — nothing chrome-initiated — moved Back
from disabled to enabled. Pre-fix, per the todo, it "stayed frozen until Reload". Reload was never
pressed.

### Corroborating evidence that the whole nav state tracks, not just one field

- Pressing Back once flipped **Forward** `false → true`.
- Continuing to press Back drove **Back** `true → false` exactly at history exhaustion, and it
  stayed `false` on a further press rather than going negative.
- The host label followed back-navigation across hosts too: `www.gog.com` → `af.gog.com` →
  `store.steampowered.com`.

---

## Verdict

VERDICT: PASS

- **(a) Back enables on in-page navigation:** PASS — demonstrated `false → true` in Run B. On
  `/store/gog` specifically (Run A) it was already enabled pre-click, so that route corroborates
  rather than demonstrates it. Not falsified anywhere.
- **(b) Host label follows the page shown:** PASS — demonstrated on `/store/gog` in Run A,
  `af.gog.com` → `www.gog.com`, the exact movement the todo asks for.
- **(c) Timing:** within ~4 s, the scoring wait. The 250 ms poll was not resolved finer; no
  perceptible lag was observed, but this run cannot put a tight bound on it.

Both halves of the shipped GAP-D fix are confirmed live on real macOS hardware against a release
bundle proven by sha256 to be the one this session built. The one honest caveat is that the two
halves were demonstrated on two routes rather than in a single gesture, for the structural reason
recorded above.

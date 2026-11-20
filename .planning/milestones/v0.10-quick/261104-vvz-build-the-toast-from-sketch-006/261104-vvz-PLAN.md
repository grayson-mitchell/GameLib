---
phase: quick-261104-vvz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx
  - src/frontend/components/UI/SteamEngineLaunchNotice/index.scss
  - src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx
  - public/locales/en/gamelib.json
  - meta/i18nCatalogPresenceBaseline.json
autonomous: true
requirements: [TODO-2026-11-04-polish-steam-launch-notice-toast]

must_haves:
  truths:
    - "Both notices render inside one fixed bottom-right stack region; there is no hard-coded 4.5rem overlay offset"
    - "A notice slides in from the right with slight overshoot (~240ms) and slides out right + fades (~180ms); under prefers-reduced-motion it only fades"
    - "When a notice leaves, its slot collapses so the other notice glides into place"
    - "Dismiss, auto-hide and newer-notice replacement all go through a leaving phase; the store embed stays suppressed until the notice is actually removed"
    - "Engine notice shows a bold per-cause title + muted body 'Using the built-in engine for this launch.'; overlay notice keeps its title/body"
    - "Each cause has its own warning-coloured icon: clock / wrench / magnifying-glass / eye-slash"
    - "A 2px warning hairline shrinks over 8s; hovering pauses both the bar and the real auto-hide; the overlay bar is frozen (and the countdown not started) until GameLib is visible and focused"
    - "The dismiss button is always visible, round 24px, with hover tint and a visible focus ring; the notice stays role=status, non-modal, no focus trap, no swipe"
    - "meta/__tests__/hardcodedStringGate.test.ts stays green"
  artifacts:
    - path: "src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx"
      provides: "Notice lifecycle (in/leaving/collapsing), pausable auto-hide, region + slot markup"
      contains: "steamEngineLaunchNoticeRegion"
    - path: "src/frontend/components/UI/SteamEngineLaunchNotice/index.scss"
      provides: "Variant A surface, keyframes, slot collapse, progress bar, reduced-motion fallback"
      contains: "prefers-reduced-motion"
    - path: "public/locales/en/gamelib.json"
      provides: "steam.engine.toast.title.{cxExpired,cxBroken,cxMissing} and steam.engine.toast.body"
  key_links:
    - from: "index.tsx toast onAnimationEnd"
      to: "phase transition leaving -> collapsing"
      via: "guard e.target === e.currentTarget && animationName in exit set"
      pattern: "currentTarget"
    - from: "index.tsx notice state (non-null until removal)"
      to: "useSuppressStoreEmbedWhile"
      via: "shown !== null || shownOverlay !== null"
      pattern: "useSuppressStoreEmbedWhile"
---

<objective>
Restyle and re-motion `SteamEngineLaunchNotice` (both the 59-19 engine-fallback notice and the
60-14 overlay-unavailable notice) to sketch 006 variant A, "Refined stripe".

Purpose: this is the todo `.planning/todos/pending/2026-11-04-polish-steam-launch-notice-toast.md`
("make toast sexy", Phase 60 UAT item 16). Its "Design decided (sketch 006)" section and the
locked decisions below are the spec.
Output: the restyled component, its tests extended, and the new i18n keys registered.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-11-04-polish-steam-launch-notice-toast.md
@src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx
@src/frontend/components/UI/SteamEngineLaunchNotice/index.scss
@src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx

Reference implementation: read `.planning/sketches/006-launch-notice-toast/index.html`, lines
83-147 (CSS: `.toast-region`, `.slot`, `.toast`, keyframes, `.bar`, `.v-a .toast`) and lines
254-292 (JS: `makeToast` / `leave`). Port variant A only; ignore `.v-b` and `.v-c`.

Load `Skill("gamelib-conventions")` for the `<verify>` prettier rule, and
`Skill("sketch-findings-gamelib")` §3 for multi-theme survival.

<locked_decisions>
User-approved. Do not revisit.
- L1 Position: bottom-right. A single fixed bottom-right stack region (flex column) wraps both
  notices and replaces the hard-coded `.steamEngineLaunchNotice--overlay` `bottom: calc(... + 4.5rem)`.
  When a notice leaves, its slot collapses (grid-template-rows 1fr→0fr) so the other notice glides.
- L2 Motion: enter is a slide in from the right plus fade, 240ms `cubic-bezier(.2,1.1,.3,1)`. Exit
  is a slide out right plus fade, 180ms `cubic-bezier(.4,0,1,1)`. Under `prefers-reduced-motion:
  reduce` it only fades. A project-wide ban does not exist:
  `src/frontend/screens/Login/__tests__/loginCrossfade.test.ts` counts prefers-reduced-motion in
  Login files only.
- L3 Every exit (auto-hide, dismiss, replacement by a newer notice) goes through a "leaving"
  state before unmount. `useSuppressStoreEmbedWhile(...)` stays true until the exit animation has
  finished. Guard animationend by target and animationName, because child animations bubble.
- L4 Visual (variant A): theme-variable surface `var(--background-darker, var(--body-background))`,
  10px radius, layered shadow `0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.4)`, the 3px
  `--status-warning` inline-start stripe, a bold title line and a muted body line. The dismiss ×
  is always visible: round, 24px, hover background tint, visible focus ring.
- L5 Engine notice: title per cause ("CrossOver trial expired" / "CrossOver isn't working" /
  "CrossOver not found"), body "Using the built-in engine for this launch.". These are new i18n keys.
- L6 Icons (FontAwesome, all in `--status-warning`): faClock (cx-expired), faWrench (cx-broken),
  faMagnifyingGlass (cx-missing), faEyeSlash (overlay). All four exist in the installed
  `@fortawesome/free-solid-svg-icons` (checked).
- L7 A 2px warning progress hairline runs along the bottom and shrinks over AUTO_HIDE_MS (8000).
  Hover pauses it AND the real auto-hide timer, with a single source of truth. The overlay
  countdown does not start until `gameLibInFront()` (G4), and its bar stays visibly frozen until
  then. The engine notice keeps its unconditional countdown.
- L8 Non-modal, role="status", no focus trap, no swipe-to-dismiss. HumbleExpiryToast is OUT of scope.
- L9 Works in all themes. Theme variables only; the shadow rgba is the only hard-coded colour.
</locked_decisions>

<facts_verified_during_planning>
- The hardcoded-string gate is ALREADY GREEN. `npx jest meta/__tests__/hardcodedStringGate.test.ts`
  gives 176/176 passed today. Commit `b83a8c1b2` ("fix(60): exempt overlay step key table from the
  hardcoded-string gate") fixed the todo's "~8 literals" with the declaration-scoped
  `i18n-gate-exempt:` marker (the 34.8-08c mechanism) directly above `OVERLAY_STEP_KEYS`. This task
  must keep the gate green. Leave that marker and the `OVERLAY_STEP_KEYS` declaration exactly as
  they are:
  - Do NOT rename `en` to `defaultText`. The test `step keys and defaults equal the backend
    OVERLAY_STEP_TEXT` asserts `toEqual` against the backend's `{ key, en }` table in
    `src/backend/storeManagers/steam/bridge/overlay/overlayNotice.ts`.
  - Do NOT widen the gate, the allowlist (`meta/i18nGateAllowlist.json`) or the scope.
  - Every new user-facing string goes through `t('gamelib-key', 'English default')`, which the
    gate exempts.
- Do NOT delete the old leaf keys `steam.engine.toast.cxExpired|cxBroken|cxMissing` from
  `gamelib.json`. The backend system notification still uses them
  (`src/backend/storeManagers/steam/games.ts:4507-4516`). New keys sit beside them under
  `steam.engine.toast`: an object `title` with `cxBroken`, `cxExpired`, `cxMissing`, and a leaf
  `body`.
- Only `public/locales/en/` has a `gamelib.json`. `meta/i18nCatalogPresenceBaseline.json` records,
  for each gamelib key, which locales are missing it. When new en keys are added, regenerate it with
  `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`, then confirm that
  `pnpm lint-translations:gamelib` passes. The i18next-parser config has `keepRemoved`, and CI runs
  `pnpm i18n` followed by `pnpm i18n-churn-guard`.
- `public/locales/en/gamelib.json` is prettier-ignored (`--file-info` gives `ignored: true`), so a
  prettier check on it proves nothing and is omitted. Match the file's 4-space indent and
  alphabetical key order by hand. `meta/i18nCatalogPresenceBaseline.json`, the three component
  files and the test file are all prettier-visible.
- The test file has no jsdom. It mocks `react` with a hand-rolled runtime that implements ONLY
  `useState`, `useRef` and `useEffect`, and it calls the component as a plain function and walks
  `props.children`. Consequences:
  - The component may use only those three hooks. `useCallback`, `useMemo` and `useLayoutEffect`
    would resolve to real React and throw outside a render.
  - Do not split the toast into a child function component. The walker never renders children, so
    its text and handlers would disappear from tests. A plain non-hook helper function that
    returns JSX is fine.
  - Animation events are simulated by calling the element's `onAnimationEnd` prop with a fake
    `{ target, currentTarget, animationName }`.
- Theme tokens already used in the repo: `--text-default`, `--text-secondary` (muted),
  `--status-warning`, `--accent` (focus ring, `outline: 2px solid var(--accent)`, 7 uses),
  `--bold` / `--semibold` (font-weight), `--space-*`, `--text-sm`.
- Mount site: `src/frontend/App.tsx` (no change needed).
- Scripts: `pnpm codecheck` (both tsc projects), `npx eslint <paths>` for scoped lint, `pnpm test`
  (jest).
</facts_verified_during_planning>

<interfaces>
Current component contracts that are kept:
- `export default function SteamEngineLaunchNotice()`: no props, mounted once in App.tsx.
- `export const OVERLAY_STEP_KEYS: Record<OverlayStepId, { key: string; en: string }>`: unchanged.
- `AUTO_HIDE_MS = 8000`; `gameLibInFront()`; `isReason`; `isOverlayStep`; the seq-intake effects
  (`lastSeq` / `lastOverlaySeq` refs: a re-fetch with the same seq never re-shows).
- `useSuppressStoreEmbedWhile(active: boolean)` from
  `frontend/components/UI/NavShell/StoreEmbedSuppressionContext`.
- Existing i18n keys: `steam.overlay.toast.title`, `steam.overlay.toast.body` (`{{step}}`),
  `steam.engine.notice.dismiss`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Notice lifecycle, pausable countdown, title/body split, icons and i18n keys (TSX + tests + catalogue)</name>
  <files>src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx, src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx, public/locales/en/gamelib.json, meta/i18nCatalogPresenceBaseline.json</files>
  <behavior>
    - Engine notice per reason: the text contains the title ("CrossOver trial expired" / "CrossOver isn't working" / "CrossOver not found") and the body "Using the built-in engine for this launch.". It renders the FontAwesomeIcon whose `icon` prop is faClock / faWrench / faMagnifyingGlass. The overlay notice renders faEyeSlash. The test imports the icons from `@fortawesome/free-solid-svg-icons` and finds the element by `props.icon`.
    - Unknown reason or step (T-59-72 / T-60-14-01) still renders null. No notice still renders null.
    - Dismiss puts the toast into the leaving phase. It is still rendered with role=status and carries the leaving modifier class, and the last `useSuppressStoreEmbedWhile` mock call is `true`. The toast's `onAnimationEnd` with the exit animation name and target === currentTarget moves to collapsing. The slot's `onAnimationEnd` with the slot-close name and target === currentTarget removes it, render returns null, and the last suppression call is `false`.
    - A bubbled animationend is ignored: target !== currentTarget, or a non-exit name such as the enter or bar keyframes.
    - Fallback: after dismiss, advancing fake timers by the exported fallback constant for each phase (with renders in between) removes the notice even if no animationend arrives.
    - Auto-hide: the 8000ms boundary still holds. At 7999 the notice is in phase `in`; at 8000 it is leaving.
    - Hover pause: show, advance 5000, call `onMouseEnter` and render. The paused modifier class is present. Advancing 10000 does not start leaving. Call `onMouseLeave` and render: at +2999 it is still in, and at +1 it is leaving. This proves the remaining budget is carried over and not reset.
    - Overlay gating: when unfocused, the toast has the waiting modifier class and no timer runs (advance 20000 → still in). After `fire('focus')` and a render, the waiting class is gone and the 8s countdown runs. In the existing test, insert the render that real React would do after the listener's state set.
    - Replacement: engine seq 1 shown, then seq 2 arrives. The seq 1 toast enters leaving, and the old content stays visible while it leaves. After its exit and collapse complete, seq 2 is shown in phase `in` with a fresh 8000ms budget.
    - Stacking: with both shown, there are exactly 2 role=status elements, each with its own dismiss. The overlay toast className contains both `steamEngineLaunchNotice` and `steamEngineLaunchNotice--overlay`. Change the existing exact `toBe` to `toContain` checks.
    - Existing tests that are kept: listener/timer cleanup on unmount (`focusListeners.focus` goes 1 then 0, and `getTimerCount()` goes 1 then 0 for the engine notice), same-seq no re-show after removal, newer seq re-shows, and the `OVERLAY_STEP_KEYS` toEqual `OVERLAY_STEP_TEXT` drift test (untouched). Existing assertions that expected `null` immediately after dismiss or expiry now drive the exit, either by calling the animationend handlers or by advancing the fallback, because L3 mandates the leaving phase. Every other assertion stays as it is.
  </behavior>
  <action>
RED first: extend and adapt the test file per `<behavior>` and run it to confirm the new cases fail.
Then implement in index.tsx:

(a) State per kind (engine, overlay). Extend `Shown` / `ShownOverlay` with
`phase: 'in' | 'leaving' | 'collapsing'`. Add `hovered` state per kind and a `remainingMs` ref per
kind. Add a `pending` ref per kind for a replacement that arrives while the current notice is
leaving. Use ONLY useState / useRef / useEffect (test-harness constraint).

(b) Intake effects (keep the seq logic). If nothing is shown, show the newest with phase `in` and
reset `remainingMs` to AUTO_HIDE_MS. If a notice is shown, put the newest in `pending` and, if the
current phase is `in`, switch it to `leaving` (per L3, replacement goes through exit).

(c) Removal helper (called when the slot-close animation ends or the collapsing fallback fires):
promote `pending` to phase `in` with a fresh budget and hovered false, or set the kind to null.

(d) Pausable auto-hide, which is the single source of truth for L7. One effect per kind, keyed on
seq, phase, hovered and, for the overlay only, waiting. When phase is `in`, not hovered and (overlay
only) not waiting: record the start with `Date.now()` and `setTimeout(beginLeave, remainingMs)`. On
cleanup, clear the timeout and subtract the elapsed time from `remainingMs` (floor 0). The CSS bar is
display-only and is paused by the same `hovered` / `waiting` state through modifier classes, not by
CSS `:hover`, so the timer and the bar cannot disagree. Do not tie dismissal to the bar's
animationend.

(e) Overlay G4 gating. Add a `waiting` state. An effect keyed on the overlay seq sets
`waiting = !gameLibInFront()`. While waiting, it registers `focus` / `visibilitychange` listeners that
set waiting false once `gameLibInFront()` is true. Cleanup removes them. Waiting is a one-way latch
per notice, matching today's behaviour where the countdown keeps running once it starts.

(f) Phase fallbacks. While phase is `leaving` or `collapsing`, an effect sets an exported
`PHASE_FALLBACK_MS` (about 500ms, comfortably above 180ms / 200ms) timeout that advances the phase if
no animationend arrives (for example a hidden window, or a theme that kills animations). Cleanup
clears it.

(g) Markup. Return null when both kinds are null. Otherwise return a
`div.steamEngineLaunchNoticeRegion` containing up to two slots, overlay slot first and engine slot
last, which preserves today's order with overlay above engine. Each slot is
`div.steamEngineLaunchNoticeSlot` (plus `--collapsing` when collapsing), with an `onAnimationEnd`
that acts only when `e.target === e.currentTarget` and `e.animationName === 'steamEngineLaunchNoticeSlotClose'`.
Each slot holds an inner `div` and then the toast: `div.steamEngineLaunchNotice` with `role="status"`
and modifiers `--overlay`, `--leaving`, `--paused` (hovered) and `--waiting`.

The toast has `onMouseEnter` / `onMouseLeave` (set hovered) and an `onAnimationEnd` that acts only
when target === currentTarget and the name is `steamEngineLaunchNoticeOut` or
`steamEngineLaunchNoticeFadeOut`, moving to collapsing. Its children are:
- the icon, `FontAwesomeIcon className="steamEngineLaunchNoticeIcon"` (per L6)
- `span.steamEngineLaunchNoticeText` holding `span.steamEngineLaunchNoticeTitle`, then a `{' '}`
  space for screen-reader concatenation, then `span.steamEngineLaunchNoticeBody`
- the dismiss button (existing aria-label key; onClick begins leaving; ignored unless phase is `in`)
- `span.steamEngineLaunchNoticeBar` with `aria-hidden`, plus
  `style={{ animationDuration: `${AUTO_HIDE_MS}ms` }}` so the 8000ms lives in one constant

If the gate flags that style template, put 8000ms in the SCSS with a comment naming AUTO_HIDE_MS
instead. Keep `role="status"`, no focus trap and no swipe (L8). Remove `faTriangleExclamation`.

(h) Engine strings per L5:
`t('steam.engine.toast.title.cxExpired', 'CrossOver trial expired')`,
`t('steam.engine.toast.title.cxBroken', "CrossOver isn't working")`,
`t('steam.engine.toast.title.cxMissing', 'CrossOver not found')` and
`t('steam.engine.toast.body', 'Using the built-in engine for this launch.')`. The overlay keeps
`steam.overlay.toast.title` and `steam.overlay.toast.body` unchanged. Do not touch the
`i18n-gate-exempt:` marker or `OVERLAY_STEP_KEYS`.

(i) Catalogue. Add the four keys to `public/locales/en/gamelib.json` under `steam.engine.toast`,
alphabetically, as siblings of the existing leaves, which stay because the backend uses them. Use
the file's 4-space indent. Then run `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`
and check that `git diff meta/i18nCatalogPresenceBaseline.json` only ADDS entries for the four new
keys. Run `pnpm i18n` and confirm that `git diff --stat public/locales` touches only
`en/gamelib.json` with exactly the intended additions. If the parser reorders or rewrites anything
else, restore it, and `pnpm i18n-churn-guard` must pass.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/frontend/components/UI/SteamEngineLaunchNotice && npx jest meta/__tests__/hardcodedStringGate.test.ts && pnpm lint-translations:gamelib && pnpm i18n-churn-guard && npx eslint src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx && pnpm codecheck && npx prettier --check src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx meta/i18nCatalogPresenceBaseline.json</automated>
    Note: public/locales/en/gamelib.json is prettier-ignored (`--file-info` reports ignored:true), so a prettier check on it would prove nothing and is deliberately omitted. Hand-match its indent and key order. The gate test takes about 2-3 minutes; run it with a long timeout or in the background.
  </verify>
  <done>All component tests pass, old ones adapted and new ones added. The gate stays green at 176+ passed. lint-translations, churn guard, eslint, codecheck and prettier are all green. The four new en keys are present, and the old backend-used keys are still there.</done>
</task>

<task type="auto">
  <name>Task 2: Port variant A styles, keyframes, slot collapse, progress bar and reduced-motion fallback (SCSS) + graphify update</name>
  <files>src/frontend/components/UI/SteamEngineLaunchNotice/index.scss</files>
  <action>
Rewrite index.scss to the sketch's variant A, translating the sketch's tokens to the app's. Map:
`--color-surface` to `var(--background-darker, var(--body-background))`; `--color-text` to
`--text-default`; `--color-text-muted` to `--text-secondary`; `--color-warning` to `--status-warning`;
`--color-primary` focus ring to `var(--accent)`; `--semibold` to `var(--bold)` for the bold title.
Use only theme variables per L9; the shadow rgba is the one allowed literal colour. Keep the header
comment (D-06 / G6: non-blocking, no backdrop or focus trap).

Region (L1), `.steamEngineLaunchNoticeRegion`:
- `position: fixed`, bottom and right `var(--space-lg)`, `z-index: 20`
- flex column, `align-items: flex-end`
- `width: min(420px, calc(100vw - 2 * var(--space-lg)))`
- `pointer-events: none`

Delete the `.steamEngineLaunchNotice--overlay` bottom-offset rule; the class may stay for tests or
hooks but must carry no positioning.

Slot, `.steamEngineLaunchNoticeSlot`:
- `display: grid`, `grid-template-rows: 1fr`, `width: 100%`
- `margin-top: var(--space-sm)` except `:first-child`
- on mount, animation `steamEngineLaunchNoticeSlotOpen` (0fr / margin-top 0 to 1fr), 200ms
  `cubic-bezier(.4,0,.2,1)`, so a newly added toast does not make its neighbour jump
- `.steamEngineLaunchNoticeSlot--collapsing` runs `steamEngineLaunchNoticeSlotClose` (to
  `grid-template-rows: 0fr; margin-top: 0`), 200ms, `forwards`
- `.steamEngineLaunchNoticeSlot > div { min-height: 0; overflow: visible; }`

Toast (L4), `.steamEngineLaunchNotice`:
- `pointer-events: auto`, `position: relative`, `overflow: hidden`
- flex, `align-items: flex-start`, `gap: var(--space-sm)`
- padding as in the sketch, mapped to `--space-*`
- `font-size: var(--text-sm)`, `color: var(--text-default)`
- the surface above, `border-radius: 10px`, `border-inline-start: 3px solid var(--status-warning)`
- `box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.4)`
- `animation: steamEngineLaunchNoticeIn 240ms cubic-bezier(0.2, 1.1, 0.3, 1) both`
- `--leaving` runs `steamEngineLaunchNoticeOut 180ms cubic-bezier(0.4, 0, 1, 1) both`

Keyframes (L2): translateX(calc(100% + var(--space-lg))) combined with opacity, exactly as the
sketch's toast-in / toast-out. The keyframe names MUST equal the strings the TSX guards on:
`steamEngineLaunchNoticeIn`, `steamEngineLaunchNoticeOut`, `steamEngineLaunchNoticeFadeIn`,
`steamEngineLaunchNoticeFadeOut`, `steamEngineLaunchNoticeSlotOpen`,
`steamEngineLaunchNoticeSlotClose` and `steamEngineLaunchNoticeBar`.

Inner elements:
- Icon: `color: var(--status-warning)`, `flex: none`, sized about 16px, `padding-top: 1px`
- Text: `flex: 1`, `min-width: 0`, `line-height: 1.4`
- Title: `display: block`, `font-weight: var(--bold)`
- Body: `display: block`, `color: var(--text-secondary)`, `margin-top: 2px`
- Dismiss (L4):
  - `flex: none`, 24px square, `border-radius: 50%`, no border, `background: transparent`,
    `color: var(--text-secondary)`, `display: grid`, `place-items: center`, `cursor: pointer`, and
    background/color transitions of about 120ms
  - `:hover` changes `color` to `var(--text-default)` and the background to
    `color-mix(in srgb, var(--text-default) 12%, transparent)`
  - `:focus-visible` uses `outline: 2px solid var(--accent); outline-offset: 1px`
  - the svg is about 12px
- Bar (L7), `.steamEngineLaunchNoticeBar`:
  - absolute, left/right/bottom 0, `height: 2px`, `transform-origin: left`, inline-start-aware
    (use `left` like the sketch)
  - `background: var(--status-warning)`, `opacity: 0.7`
  - `animation: steamEngineLaunchNoticeBar 8000ms linear forwards`, scaleX 1 to 0; the TSX
    inline duration overrides it, and 8000ms here is the fallback
  - `.steamEngineLaunchNotice--paused .steamEngineLaunchNoticeBar` and
    `.steamEngineLaunchNotice--waiting .steamEngineLaunchNoticeBar` set
    `animation-play-state: paused`; `--waiting` also sets `opacity: 0.25`, which is the visibly
    frozen state. Do NOT use `:hover` for the pause. The `--paused` class comes from the same state
    as the JS timer, which keeps a single source of truth.

Reduced motion (L2), `@media (prefers-reduced-motion: reduce)`:
- the toast uses `animation-name: steamEngineLaunchNoticeFadeIn` at 160ms
- `--leaving` uses `steamEngineLaunchNoticeFadeOut`
- slot open and close use `animation-duration: 1ms`, NOT `animation: none`, so that animationend
  still fires and the lifecycle completes without waiting for the fallback
- the bar keeps running, because it is the countdown indicator, not entrance/exit motion

After the SCSS is in, run `graphify update .` (CLAUDE.md).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx prettier --check src/frontend/components/UI/SteamEngineLaunchNotice/index.scss src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx && npx jest src/frontend/components/UI/SteamEngineLaunchNotice && npx jest src/frontend/screens/Login/__tests__/loginCrossfade.test.ts && grep -v '^\s*//' src/frontend/components/UI/SteamEngineLaunchNotice/index.scss | grep -c '4.5rem' | grep -qx 0 && grep -v '^\s*//' src/frontend/components/UI/SteamEngineLaunchNotice/index.scss | grep -Eo '#[0-9a-fA-F]{3,8}\b' | wc -l | grep -qx ' *0' && for n in In Out FadeIn FadeOut SlotOpen SlotClose Bar; do grep -q "@keyframes steamEngineLaunchNotice$n" src/frontend/components/UI/SteamEngineLaunchNotice/index.scss || exit 1; done && npx vite build --logLevel error >/dev/null</automated>
  </verify>
  <done>The SCSS compiles in the vite build, has no 4.5rem offset and no hex colours, and defines all seven keyframes with the names the TSX guards on. Reduced-motion fades only. The login crossfade guard is still green, prettier is clean, and graphify has been updated.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| backend push → renderer | `launchNotice.reason` / `overlayNotice.step` arrive in the steamEngineStateChanged push |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-vvz-01 | Tampering | reason/step → rendered text | mitigate | Keep the closed-set guards `isReason` / `isOverlayStep` (hasOwnProperty, not `in`) and their tests (T-59-72, T-60-14-01). Only catalogue strings render, and nothing is injected as HTML. |
| T-vvz-02 | Denial of Service | leaving phase never completing (animationend lost) | mitigate | `PHASE_FALLBACK_MS` timeout advances leaving/collapsing, so the notice and the store-embed suppression cannot get stuck. A test covers it. |
| T-vvz-03 | Information Disclosure | toast text | accept | It shows only a fixed cause label, with no paths, IDs or user data. |
</threat_model>

<verification>
- All automated verify blocks are green: component tests, the hardcoded-string gate,
  lint-translations, the churn guard, eslint, codecheck, scoped prettier and the vite build.
- MANUAL (non-blocking; record the result in the SUMMARY and do not block the task on it). Start
  `pnpm tauri:dev` (not `tauri:dev:run`). Restart dev first if the sidecar is stale. Trigger an engine
  fallback launch and an overlay-unavailable launch. Then check:
  1. Both toasts slide in from the right with slight overshoot and stack bottom-right.
  2. Dismissing one slides it out right, and the other glides down.
  3. Hovering freezes the hairline and the toast does not auto-hide; leaving resumes it.
  4. The overlay hairline is dim and frozen while the game is in front and starts once GameLib is
     focused.
  5. The native store embed does not snap over a toast mid-exit (test on the Store tab).
  6. With macOS Reduce Motion on, enter and exit only fade.
  7. Repeat in at least midnightMirage (default), dracula and one light theme.
</verification>

<success_criteria>
- Sketch 006 variant A is shipped for both notices: refined stripe surface, per-cause icon, title
  and body, hairline countdown, and slide motion with a reduced-motion fade.
- The exit lifecycle (leaving → collapsing → removed) holds store-embed suppression until removal,
  and a fallback means it can never get stuck.
- Hover pauses the real timer, with one source of truth. Overlay G4 focus gating is kept and is
  visible as a frozen bar.
- The hardcoded-string gate stays green without widening. The old backend-used keys are intact,
  and the new keys are registered in the catalogue and the presence baseline.
</success_criteria>

<output>
Create `.planning/quick/261104-vvz-build-the-toast-from-sketch-006/261104-vvz-SUMMARY.md` when done.
</output>

# Notices and Toasts

Transient, non-blocking notices: the bottom-right toast stack. First built for
`SteamEngineLaunchNotice` (engine-fallback, overlay-unavailable and overlay early-exit notices).
Shipped in quick `261104-vvz`; the overlay exit notice joined the same stack in `261105-ast`.

---

## Design Decisions

### 1. Variant A, "refined stripe", won

A dark surface with a 3px warning stripe on the leading edge, a 10px radius, a two-layer shadow,
a title/body split and a per-cause icon. It stays closest to the shipped notice and reads as
"heads-up", not "error".

Two alternatives were built and rejected:

- **B, icon chip.** A hairline border, a three-layer shadow, a tinted round chip behind the
  icon, and a dismiss button revealed on hover. The hover-only dismiss hides the control from
  keyboard and controller users until focus lands inside.
- **C, tinted glass.** A warning-tinted `backdrop-filter` surface. It is legible over the
  midnightMirage grid but muddy over dracula's lighter surfaces, and `color-mix` on the warning
  token tints the whole surface toward "error".

### 2. Fixed behaviour (settled before the variants)

- **Position:** bottom-right, in one shared stack region for every notice.
- **Motion:** slides in from the right with a slight overshoot and slides out to the right. Under
  `prefers-reduced-motion` it fades only.
- **Stacking:** when a toast leaves, its slot collapses (`grid-template-rows 1fr → 0fr`), so the
  neighbour glides into place instead of jumping.
- **Timing:** a 2px progress hairline counts down the 8s auto-hide and pauses on hover.
- **Overlay notice:** its countdown stays frozen (bar at 0.25 opacity) until GameLib is visible
  and focused.
- **Interaction:** no swipe to dismiss, no backdrop, no focus trap.

## CSS Patterns (as shipped, `SteamEngineLaunchNotice/index.scss`)

```scss
// One fixed bottom-right stack for every notice.
.region {
  position: fixed; bottom: var(--space-lg); right: var(--space-lg); z-index: 20;
  display: flex; flex-direction: column; align-items: flex-end;
  width: min(420px, calc(100vw - 2 * var(--space-lg)));
  pointer-events: none;                       // the toasts re-enable it
}

.toast {
  pointer-events: auto; position: relative; overflow: hidden;
  display: flex; align-items: flex-start; gap: var(--space-sm); padding: var(--space-md);
  background: var(--background-darker, var(--body-background));
  border-radius: 10px;
  border-inline-start: 3px solid var(--status-warning);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.4);
  animation: toastIn 240ms cubic-bezier(0.2, 1.1, 0.3, 1) both;   // slight overshoot
}
.toast--leaving { animation: toastOut 180ms cubic-bezier(0.4, 0, 1, 1) both; }

.bar {                                        // 8s auto-hide hairline
  position: absolute; left: 0; right: 0; bottom: 0; height: 2px;
  transform-origin: left; background: var(--status-warning); opacity: 0.7;
  animation: bar 8000ms linear forwards;      // scaleX(1) → scaleX(0)
}
.toast--paused .bar, .toast--waiting .bar { animation-play-state: paused; }
.toast--waiting .bar { opacity: 0.25; }       // frozen until GameLib is in front

// Slot open/close: 200ms cubic-bezier(0.4, 0, 0.2, 1) on grid-template-rows.
// Reduced motion: fade-only keyframes; slot transitions off.
```

**Token mapping.** The sketch used sketch-theme names. In the app they are:

| Sketch | App |
|---|---|
| `--color-surface` | `--background-darker, var(--body-background)` |
| `--color-warning` | `--status-warning` |
| `--color-text-muted` | `--text-secondary` |
| `--color-text` | `--text-default` |

The shadow `rgba` is the one allowed literal colour. Everything else is a theme variable.

## HTML Structure

```
region (fixed, bottom-right)
 └ slot (collapses on leave)
    └ toast [--leaving | --paused | --waiting | --overlay]
       ├ icon        per-cause glyph, warning colour, 16px
       ├ text
       │  ├ title    bold
       │  └ body     secondary colour
       ├ dismiss     24px round button, always visible, focus-visible outline in --accent
       └ bar         2px hairline
```

## What to Avoid

- **Do not hide the dismiss button behind hover.** Keyboard and controller users cannot find it.
- **Do not tint the whole surface with the warning colour.** It reads as an error.
- **Do not position each notice independently.** Every notice goes in the one region, or toasts
  overlap.
- **Do not let the overlay countdown run while GameLib is in the background.** The user would
  never see the notice.
- **Do not animate slot height with `height`.** Use `grid-template-rows 1fr → 0fr`, which needs no
  measured height.

---

## Origin

Synthesized from sketch: **006**
Source file: `sources/006-launch-notice-toast/index.html`

Interactive: it spawns notices into a live stack and toggles reduced motion, "GameLib in front"
and the theme. Variant A is the winner; B and C are kept for comparison.

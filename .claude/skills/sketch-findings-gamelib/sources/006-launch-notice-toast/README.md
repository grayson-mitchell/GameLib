---
sketch: 006
name: launch-notice-toast
question: "What surface, accent and motion make the bottom-right Steam launch notice feel polished in every theme?"
winner: "A"
tags: [toast, notice, motion, steam, multi-theme]
---

# Sketch 006: Launch Notice Toast

## Design Question
How should `SteamEngineLaunchNotice` (engine-fallback and overlay-unavailable notices) look and
move? Fixed so far: bottom-right; slide in from the right, slide out to the right; shared
stack region so stacked toasts reflow; progress hairline for the 8 s auto-hide that pauses on
hover; overlay countdown gated on GameLib being in front; fade-only under reduced motion; no swipe.

## How to View
open .planning/sketches/006-launch-notice-toast/index.html

## Variants
- **A: Refined stripe** — today's layout with radius, layered shadow, title/body, progress line
- **B: Icon chip** — hairline border, three-layer shadow, tinted cause-icon chip, hover-revealed round dismiss
- **C: Tinted glass** — warning-tinted blurred surface, tinted border, progress along the top

## What to Look For
- Edge legibility on dracula (light navbar) and gruvbox vs midnightMirage
- Whether the warning accent reads as "heads-up" rather than "error"
- Feel of the slide-in overshoot and slide-out speed; reflow when one of two stacked toasts leaves
- Hover pause; "GameLib in front" off keeps the overlay bar frozen

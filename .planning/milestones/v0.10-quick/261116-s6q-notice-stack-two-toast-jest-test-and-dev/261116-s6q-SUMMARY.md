---
quick: 261116-s6q
status: complete
commits: [f4e52c877, 1c0e59909]
---

# Quick 261116-s6q: two-toast notice stack test and dev preview hook

Dev-only `window.__gamelibNotices.{humble,steam,both,clear}` over the real stores (Steam goes through the real validator, small-integer seq), registered under `import.meta.env.DEV` in `src/frontend/index.tsx`; plus a jsdom Jest test of the real `AppNoticeStack` with both toasts, and a "run the live gate fast" note on the pending todo.

## Results
- noticePreview unit test: 7/7. NoticeStackTwoToast: 4/4 (one `.noticeStack`, Steam before Humble, Steam dismissed via real animationend, Humble via fallback timers, store-reset leave; survivor is the same DOM node, never `--leaving`). Pre-existing notice tests still green (56 total).
- codecheck, scoped eslint (index.tsx has only pre-existing warnings), scoped prettier, rendererZodGuard, planning-gates 12/12: green.
- Production `vite build`: zero `__gamelibNotices` matches in build/renderer and build/assets; positive control `noticeStackSlot` found; `git status -- build` empty.

## Deviations
- Rule 1: the module header was written as `//` comments (not JSDoc) so the plan's `import.meta` grep gate, which filters only `//` lines, passes.
- The test wraps AppNoticeStack in the real `StoreEmbedSuppressionProvider` to avoid console warnings. No source components were changed.

## Still open
The visual live gate (non-overlap, glide of the survivor, fade-only under Reduce Motion) was NOT run and remains a human check. The todo stays in `pending/` with `ready: live-gate`.

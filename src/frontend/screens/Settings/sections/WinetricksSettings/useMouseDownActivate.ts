import { useRef } from 'react'
import type { MouseEvent } from 'react'

// MOUSE-CLICK RACE FIX, ported from the Phase 44 `WinetricksBrowse/Row`
// `activate` helper (itself from `WinetricksSearch`, Phase 35 Plan 25, commit
// `366e719bb`, closing REQ-35-16). Root cause: a live-measured trace showed a
// real mouse click's `mousedown` correctly targets a button while the
// surrounding list is still mounted, but a parent-driven remount can remove that
// button from the DOM before `mouseup`/`click` fire, so `click` is never
// synthesised and the action never runs. Keyboard activation (Tab plus
// Enter/Space) dispatches `click` directly against the still-focused element
// with no positional hit-test, so it cannot be raced out.
//
// Fix: capture the action on `mousedown`, before a remount can occur. `onClick`
// is kept so keyboard activation still works, and it is suppressed once via
// `suppressNextClick` so a real click that DOES land does not run the action a
// second time. One shared helper, not a copy per control, because the checkbox,
// Retry and every disclosure header need the identical guard. The row-remount
// mechanism that first motivated this does not exist in the same shape in the
// checkbox model, but the mousedown-to-mouseup target-drift hazard it guards
// against is independent of it (UI-SPEC Interaction Contract 2).
//
// Only the primary button activates: a right or middle click neither runs the
// action nor arms the guard (no `click` follows them, so an armed guard would
// swallow the next real keyboard activation).
export function useMouseDownActivate() {
  const suppressNextClick = useRef(false)

  return function activate(action: () => void) {
    return {
      onMouseDown: (event: MouseEvent) => {
        if (event.button) return
        event.preventDefault()
        suppressNextClick.current = true
        action()
      },
      onClick: () => {
        if (suppressNextClick.current) {
          suppressNextClick.current = false
          return
        }
        action()
      }
    }
  }
}

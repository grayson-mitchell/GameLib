import type { MouseEvent } from 'react'

// RED-phase stub: inert on purpose so the tests fail on their assertions, not
// on a missing module. Replaced by the real implementation in the GREEN commit.
export function useMouseDownActivate() {
  return function activate(_action: () => void) {
    return {
      onMouseDown: (_event: MouseEvent) => undefined,
      onClick: () => undefined
    }
  }
}

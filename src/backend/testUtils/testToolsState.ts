/**
 * A fresh tools state for consumer tests (66.4-14): every call builds its own single-flight slot,
 * caches and winetricks environment, so two tests never share one. The factory is required lazily,
 * as the other test runtimes do (testServices builds this by default for every suite).
 */
import type { ToolsState } from '../tools/toolsState'

export function createTestToolsState(): ToolsState {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createToolsState } =
    require('../tools/toolsState') as typeof import('../tools/toolsState')
  /* eslint-enable @typescript-eslint/no-require-imports */
  return createToolsState()
}

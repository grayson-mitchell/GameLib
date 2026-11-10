/**
 * Side-effect module for node-env component tests: uiState transitively
 * imports frontend/helpers, which attaches window.api at module scope, so a
 * window must exist before it loads. Import this FIRST in the test file.
 */
;(globalThis as unknown as { window: object }).window = {
  __TAURI_INTERNALS__: {
    invoke: () => Promise.resolve(undefined),
    transformCallback: () => 0,
    unregisterCallback: () => undefined,
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { label: 'main' }
    }
  }
}
export {}

/**
 * Static zero-match completeness gate for the `isIntelMac` removal (Phase
 * 34.18 Plan 05, D-10/D-11/D-12/D-14).
 *
 * WHY THIS GATE IS LOAD-BEARING, AND WHY A RUNTIME CHECK WOULD NOT BE:
 * `isIntelMac` is threaded through four layers -- backend constant, two IPC
 * registrations (Electron's `utils/ipc_handler.ts` and the Tauri sidecar's
 * `appShellFlowRegistration.ts`), the shared type in `common/types/ipc.ts`,
 * the preload invoker in `preload/api/misc.ts`, and a frontend mirror in
 * `frontend/state/GlobalState.tsx`. A PARTIAL removal -- say, the backend
 * handler deleted while `GlobalState.tsx:1523`'s
 * `this.setState({ isIntelMac: await window.api.isIntelMac() })` call site
 * survives -- fails SILENTLY, not loudly: that `await` is uncaught, the
 * sidecar's `dispatchInvoke()` resolves an unregistered channel through the
 * `UNPORTED_CHANNEL_MARKER` rejection path, and the frontend's global
 * `unhandledrejection` handler in `bootErrorSurface.ts` downgrades it to a
 * `console.warn`. The app boots looking healthy, with frontend state stuck
 * at its default `false` forever. Absence of a runtime error proves nothing
 * about completeness -- only a static, whole-tree textual sweep can.
 *
 * HEAD BASELINE THIS WAS RED-PROVEN AGAINST (2026-08-27, before any removal):
 * `grep -rn "isIntelMac" src/` returned 61 matching lines across 28 files
 * (36 non-test-file lines, 25 test-file lines). Recorded in the plan 05
 * SUMMARY alongside this file's own RED run.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const SRC_ROOT = join(__dirname, '..', '..', 'src')

describe('D-10: isIntelMac static zero-match completeness gate', () => {
  it('has zero remaining "isIntelMac" matches anywhere under src/', () => {
    const result = spawnSync('grep', ['-rn', 'isIntelMac', SRC_ROOT], {
      encoding: 'utf8'
    })

    // grep's own "no matches found" contract is exit status 1 with empty
    // stdout. Assert BOTH independently: status alone would also be
    // satisfied by grep failing to run at all (e.g. binary not found,
    // status 127 truncated on some shells), and empty stdout alone is
    // satisfied by a mis-typed path that grep silently walks and finds
    // nothing in for the WRONG reason. Only the conjunction proves the
    // intended thing: grep ran, walked the real src/ tree, and found none.
    expect(result.status).toBe(1)
    expect(result.stdout.trim()).toBe('')
  })

  it('vacuity control: "isAppleSiliconMac" (a token that MUST survive) is still found under the same src/ root', () => {
    // Without this control, a broken SRC_ROOT path (typo, wrong join depth,
    // CI working-directory drift) would make grep walk an empty or
    // nonexistent directory and report "no matches" for EVERY token,
    // including isIntelMac -- a permanently green gate that has stopped
    // measuring anything. This proves the grep invocation reaches a
    // populated tree, so the isIntelMac zero-match result above means
    // "absent", not "looked nowhere".
    const result = spawnSync('grep', ['-rn', 'isAppleSiliconMac', SRC_ROOT], {
      encoding: 'utf8'
    })

    expect(result.status).toBe(0)
    expect(result.stdout.trim().length).toBeGreaterThan(0)
  })
})

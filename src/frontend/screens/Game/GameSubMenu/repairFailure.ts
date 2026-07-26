import { TFunction } from 'i18next'

import { DialogModalOptions } from 'frontend/types'

// Not exported: used only within this module (ts-prune / `pnpm find-deadcode`
// flagged the previously-exported form as review finding IN-02 -- there is no
// external consumer, so the export served no purpose).
interface ReportRepairFailureOptions {
  appName: string
  error: unknown
  showDialogModal: (options: DialogModalOptions) => void
  t: TFunction<'gamepage'>
}

/**
 * Gap cycle 2 / CR-01 renderer half (REQ-34.2-12, REQ-34.2-14).
 * Hardened in gap cycle 3 / WR-03 (REQ-34.2-12, REQ-34.2-14).
 *
 * A repair failure must be visible through three independent signals, each
 * with a different failure mode, so a single broken layer (an unhealthy IPC
 * transport, a silent `send` channel under Tauri, etc.) can never reproduce
 * the zero-signal state the verifier found:
 *
 * 1. A console line — transport-independent, always visible in the webview
 *    devtools regardless of any IPC channel's health.
 * 2. The operator log frame — the pre-existing signal, made live on the
 *    sidecar by plan 34.2-16's loggerFlowRegistration.ts.
 * 3. An ERROR dialog — the signal the user actually sees.
 *
 * WR-03 (gap cycle 3): this function used to interpolate the raw `error`
 * binding (typed `unknown`) directly into a template literal, with no
 * try/catch -- the identical defect class
 * plan 34.2-15 removed from processGuards.ts, reintroduced here. For a
 * null-prototype reason, or one whose `toString`/`Symbol.toPrimitive`
 * throws, that interpolation threw `TypeError: Cannot convert object to
 * primitive value` BEFORE reaching the showDialogModal call below -- so the
 * ERROR dialog (signal 3, the one REQ-34.2-12 exists to guarantee) never
 * rendered, and the throw escaped `onRepairYesClick`'s catch into the
 * un-awaited dialog-button handler at `index.tsx:158` as an unhandled
 * renderer rejection. Fixed by computing the log text ONCE, defensively,
 * before any signal fires, mirroring plan 34.2-15's shape verbatim
 * (`src/backend/sidecar/processGuards.ts:61-69`): a hardcoded,
 * non-interpolated fallback literal declared before a `try` that reassigns
 * it via `error instanceof Error ? (error.stack ?? error.message) :
 * String(error)`, with an empty `catch` that keeps the fallback. `error`
 * itself is never interpolated into a template literal anywhere in this
 * function.
 *
 * Signal independence: each of the three calls below is individually
 * wrapped so a failure in one cannot suppress a later one -- this makes the
 * "three independent signals" claim above actually true (it previously was
 * not: all three were bare sequential statements sharing one throw source).
 * The stringification fix above removes the only KNOWN throw source in this
 * function, but `showDialogModal`/`window.api.logError` are caller-supplied
 * and this module cannot prove they never throw, so the guards stay as
 * defence-in-depth rather than being removed as "provably unreachable".
 *
 * T-34.2-52 (information disclosure): the dialog message is a FIXED
 * translated string only. Backend error text routinely carries absolute
 * filesystem paths and occasionally credentials-adjacent detail; that raw
 * text goes to the console and the log (both local, both already carrying
 * that class of data), never into a rendered dialog a user might screenshot
 * or share. Unchanged by the WR-03 hardening -- the precomputed error text
 * is used only for `window.api.logError`, never for the dialog message.
 *
 * T-34.2-53 (denial of service): this function performs three plain,
 * non-async calls with no await and no rethrow -- it runs on an
 * already-failed path. Do not add an await or a rethrow here.
 */
export function reportRepairFailure({
  appName,
  error,
  showDialogModal,
  t
}: ReportRepairFailureOptions): void {
  let errorText = '<unstringifiable error>'
  try {
    errorText = error instanceof Error ? (error.stack ?? error.message) : String(error)
  } catch {
    // keep the fallback errorText
  }

  try {
    // `error` is passed as a second ARGUMENT here, not interpolated -- the
    // console formats it lazily and this preserves the inspectable object
    // in devtools, so it is safe even for a hostile value.
    console.error(`repair failed for ${appName}:`, error)
  } catch {
    // signal 1 must never suppress signals 2/3
  }

  try {
    window.api.logError(`repair failed for ${appName}: ${errorText}`)
  } catch {
    // signal 2 must never suppress signal 3
  }

  showDialogModal({
    showDialog: true,
    type: 'ERROR',
    title: t('box.error.title', 'Error'),
    message: t('box.repair.error', 'Repair failed. See the log for details.')
  })
}

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
 * "three independent signals" claim above actually true. Previously it was
 * only true for signals 1 and 2 (WR-06, gap cycle 4): signal 3's
 * `showDialogModal`/`t` calls were unguarded, so a throwing caller-supplied
 * dependency there still escaped this function into the un-awaited
 * dialog-button handler at `index.tsx:158`. Each of the three signals now
 * catches its own failure and emits a named diagnostic to `console.error`
 * rather than disappearing -- under Tauri the likely cause of signal 2
 * failing is that the preload factory did not attach `window.api.logError`,
 * not that the log write itself failed, and that distinction is itself
 * useful information.
 *
 * Two catches in this function are DELIBERATELY silent, and the claim above
 * is scoped to the three signals precisely so it does not cover them (WR-03,
 * gap cycle 4 -- this docstring previously said "every signal", which read as
 * a claim about every `catch` and was false):
 *
 *   - the stringification guard: its whole output IS the diagnostic. The
 *     hardcoded `'<unstringifiable error>'` fallback flows into signal 2's log
 *     line as `repair failed for X: <unstringifiable error>`, so the failure
 *     is already recorded downstream. A console diagnostic would duplicate it.
 *   - the signal-1 guard: signal 1 IS `console.error`. Reporting a
 *     `console.error` failure by calling `console.error` is self-defeating, so
 *     there is nowhere left to report it. Signals 2 and 3 still fire, which is
 *     the actual mitigation.
 *
 * The `t()` guard was a third silent catch until 2026-08-23 and is NOT in that
 * category -- nothing downstream recorded a broken translation catalogue, so
 * it now emits its own diagnostic.
 *
 * T-34.2-52 (information disclosure): the dialog message is a FIXED
 * translated string only. Backend error text routinely carries absolute
 * filesystem paths and occasionally credentials-adjacent detail; that raw
 * text goes to the console and the log (both local, both already carrying
 * that class of data), never into a rendered dialog a user might screenshot
 * or share. Unchanged by the WR-03 hardening -- the precomputed error text
 * is used only for `window.api.logError`, never for the dialog message. The
 * three guard diagnostics below (log signal, translation signal, dialog
 * signal) extend this guarantee: each goes to `console.error` only, carrying
 * the caller-supplied failure object as a second ARGUMENT rather than
 * interpolating it, and none enters the dialog message. Counted deliberately
 * -- this said "two" until the translation diagnostic was added 2026-08-23.
 *
 * T-34.2-53 (denial of service): this function performs three
 * individually-guarded, non-async calls with no await and no rethrow -- it
 * runs on an already-failed path. Do not add an await or a rethrow here.
 */
export function reportRepairFailure({
  appName,
  error,
  showDialogModal,
  t
}: ReportRepairFailureOptions): void {
  let errorText = '<unstringifiable error>'
  try {
    errorText =
      error instanceof Error ? (error.stack ?? error.message) : String(error)
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
  } catch (logErr) {
    // Never silent: signal 2 failing is itself diagnostic information --
    // under Tauri the likely cause is that the preload factory did not
    // attach `window.api.logError`, not that the log write failed.
    // `logErr` is passed as a second ARGUMENT, never interpolated.
    try {
      console.error('repair-failure log signal unavailable:', logErr)
    } catch {
      // this diagnostic must never itself become a new throw path
    }
  }

  let title = 'Error'
  let message = 'Repair failed. See the log for details.'
  try {
    title = t('box.error.title', title)
    message = t('box.repair.error', message)
  } catch (tErr) {
    // WR-03 (gap cycle 4): never silent. A throwing `t` means the translation
    // catalogue is broken -- the user still gets a rendered dialog thanks to
    // the hardcoded English fallbacks above, but WHY it is untranslated was
    // previously recorded nowhere at all. `tErr` is passed as a second
    // ARGUMENT, never interpolated, so T-34.2-52 holds: this reaches the
    // console only and never the dialog message.
    try {
      console.error('repair-failure translation signal unavailable:', tErr)
    } catch {
      // this diagnostic must never itself become a new throw path
    }
  }

  try {
    showDialogModal({
      showDialog: true,
      type: 'ERROR',
      title,
      message
    })
  } catch (dlgErr) {
    // `dlgErr` is passed as a second ARGUMENT, never interpolated.
    try {
      console.error('repair-failure dialog signal unavailable:', dlgErr)
    } catch {
      // this diagnostic must never itself become a new throw path
    }
  }
}

import { TFunction } from 'i18next'

import { DialogModalOptions } from 'frontend/types'

export interface ReportRepairFailureOptions {
  appName: string
  error: unknown
  showDialogModal: (options: DialogModalOptions) => void
  t: TFunction<'gamepage'>
}

/**
 * Gap cycle 2 / CR-01 renderer half (REQ-34.2-12, REQ-34.2-14).
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
 * T-34.2-52 (information disclosure): the dialog message is a FIXED
 * translated string only. Backend error text routinely carries absolute
 * filesystem paths and occasionally credentials-adjacent detail; that raw
 * text goes to the console and the log (both local, both already carrying
 * that class of data), never into a rendered dialog a user might screenshot
 * or share.
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
  console.error(`repair failed for ${appName}:`, error)

  window.api.logError(`repair failed for ${appName}: ${error}`)

  showDialogModal({
    showDialog: true,
    type: 'ERROR',
    title: t('box.error.title', 'Error'),
    message: t('box.repair.error', 'Repair failed. See the log for details.')
  })
}

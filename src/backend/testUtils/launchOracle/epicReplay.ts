/**
 * Points the backend's shared `axiosClient` at a replayed exchange for the Epic status oracles
 * (88.1-02, D-22, T-88.1-03).
 *
 * `installRecorder` sets the default adapter of bare `axios`, but `backend/utils` built its
 * `axiosClient` at import, so the client still holds the adapter it copied then. This installs the
 * recorder for one case in replay mode (never record: a launch golden must not reach a live host)
 * and puts the recorder's dispatcher on the client itself, for the length of the case.
 *
 * A transport failure is an exchange with `networkError: true`. The shared recorder raises an
 * `AxiosError` with no `request` for it, which `isNetworkLevelFailure` reads as "a config error", not
 * "unreachable". The real http adapter always attaches the request, so `transportFailureCode` turns
 * the recorder's failure into the error the adapter raises: the code, a `request` and no `response`.
 */
import axios, { AxiosError, type AxiosAdapter } from 'axios'
import {
  installRecorder,
  type OracleMode,
  type Recorder
} from 'backend/testUtils/engineWineOracle/recorder'
import { axiosClient } from 'backend/utils'

function withTransportFailures(
  dispatcher: AxiosAdapter,
  code: string | null
): AxiosAdapter {
  return async (config) => {
    try {
      return await dispatcher(config)
    } catch (error) {
      if (code !== null && error instanceof AxiosError && !error.response) {
        throw new AxiosError(`${code} status.epicgames.com`, code, config, {})
      }
      throw error
    }
  }
}

export interface EpicReplay {
  recorder: Recorder
  /** Puts the client's own adapter back. The recorder's `finish()` is the caller's to call. */
  restore: () => void
}

export function replayAxiosClient(options: {
  crate: string
  slice: string
  caseId: string
  /** `write` and `compare` both replay; a `record` mode is refused by the caller. */
  mode: Exclude<OracleMode, 'record'>
  /** The error code of the case's `networkError` exchange, or `null` when it has none. */
  transportFailureCode: string | null
}): EpicReplay {
  const recorder = installRecorder({
    crate: options.crate,
    slice: options.slice,
    caseId: options.caseId,
    mode: options.mode
  })
  const original = axiosClient.defaults.adapter
  axiosClient.defaults.adapter = withTransportFailures(
    axios.defaults.adapter as AxiosAdapter,
    options.transportFailureCode
  )
  return {
    recorder,
    restore: () => {
      axiosClient.defaults.adapter = original
    }
  }
}

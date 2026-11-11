/**
 * A fresh, isolated sign-in probe owner for consumer tests (D-66.3-13). Plain object, no jest APIs.
 * Publishes into `pushed`; the handler registry is a throwaway. Two calls never share state.
 */
import type { SignInProbeOutcomeMap } from 'common/signInState'
import { createSignInEpochs } from '../signInProbe/sessionEpoch'
import { createSignInProbeOutcomes } from '../signInProbe/outcomes'
import type { SignInProbePass } from '../signInProbe/pass'
import { createIpcRegistry, type IpcRegistry } from '../sidecar/ipcRegistry'
import type { SignInProbeServices } from '../services/types'

function loadPass(): typeof import('../signInProbe/pass') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../signInProbe/pass') as typeof import('../signInProbe/pass')
}

export interface TestSignInProbe extends SignInProbeServices {
  /** Every outcome map the owner pushed to the renderer, in order. */
  pushed: SignInProbeOutcomeMap[]
}

export function createTestSignInProbe(
  opts: { ipc?: Pick<IpcRegistry, 'handle'> } = {}
): TestSignInProbe {
  const pushed: SignInProbeOutcomeMap[] = []
  const epochs = createSignInEpochs()
  const outcomes = createSignInProbeOutcomes({
    ipc: opts.ipc ?? createIpcRegistry(),
    push: (_channel, payload) => {
      pushed.push(payload.outcomes)
    },
    epochs
  })
  // The pass pulls every store user module in; build it only when a test reads it, so a suite that
  // mocks one of those modules (or their path constants) is not broken by merely importing this fake.
  let pass: SignInProbePass | undefined
  return {
    epochs,
    outcomes,
    get pass() {
      pass ??= loadPass().createSignInProbePass({ epochs, outcomes })
      return pass
    },
    pushed
  }
}

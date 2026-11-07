import { z } from 'zod'

import { nonEmptyString, optionalArg, type InvokeFns } from './schemaTypes'

const noArgs = z.tuple([])

export const eosOverlayAsyncArgs = {
  getEosOverlayStatus: noArgs,
  getLatestEosOverlayVersion: noArgs,
  updateEosOverlayInfo: noArgs,
  installEosOverlay: noArgs,
  removeEosOverlay: z.tuple([z.boolean()]),
  enableEosOverlay: z.tuple([nonEmptyString()]),
  disableEosOverlay: z.tuple([nonEmptyString()]),
  isEosOverlayEnabled: z.tuple([optionalArg(nonEmptyString())])
}

interface EosOverlayAsyncReturns {
  getEosOverlayStatus: {
    isInstalled: boolean
    version?: string
    install_path?: string
  }
  getLatestEosOverlayVersion: Promise<string>
  updateEosOverlayInfo: Promise<void>
  installEosOverlay: Promise<string | undefined>
  removeEosOverlay: Promise<boolean>
  enableEosOverlay: Promise<{ wasEnabled: boolean; installNow?: boolean }>
  disableEosOverlay: Promise<void>
  isEosOverlayEnabled: Promise<boolean>
}

export type EosOverlayAsync = InvokeFns<
  typeof eosOverlayAsyncArgs,
  EosOverlayAsyncReturns
>

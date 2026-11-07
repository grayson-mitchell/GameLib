import { z } from 'zod'

import type { UserInfo } from '../../types'
import type { UserData } from '../gog'
import type { NileLoginData, NileUserData } from '../nile'

import { nonEmptyString, type InvokeFns, type SendFns } from './schemaTypes'

const noArgs = z.tuple([])

// The OAuth material below is a credential (T-67-30): bounded non-empty strings, and a strict
// envelope so a smuggled extra key is rejected (T-67-32). The ad hoc `typeof` checks in
// runnerAuthFlowRegistration.ts stay as redundancy.
const nileRegisterData = z.strictObject({
  code: nonEmptyString(4096),
  code_verifier: nonEmptyString(4096),
  serial: nonEmptyString(4096),
  client_id: nonEmptyString(4096)
})

export const runnerAuthSyncArgs = {
  logoutGOG: noArgs
}

export const runnerAuthAsyncArgs = {
  getEpicGamesStatus: noArgs,
  getUserInfo: noArgs,
  getAmazonUserInfo: noArgs,
  isLoggedIn: noArgs,
  login: z.tuple([nonEmptyString(4096)]),
  authGOG: z.tuple([nonEmptyString(4096)]),
  authAmazon: z.tuple([nileRegisterData]),
  logoutLegendary: noArgs,
  logoutAmazon: noArgs,
  getAmazonLoginData: noArgs
}

interface RunnerAuthAsyncReturns {
  getEpicGamesStatus: Promise<boolean>
  getUserInfo: Promise<UserInfo | undefined>
  getAmazonUserInfo: Promise<NileUserData | undefined>
  isLoggedIn: boolean
  login: Promise<{
    status: 'done' | 'failed'
    data: UserInfo | undefined
  }>
  authGOG: Promise<{
    status: 'done' | 'error'
    data?: UserData
  }>
  authAmazon: Promise<{
    status: 'done' | 'failed'
    user: NileUserData | undefined
  }>
  logoutLegendary: Promise<void>
  logoutAmazon: Promise<void>
  getAmazonLoginData: Promise<NileLoginData>
}

export type RunnerAuthSync = SendFns<typeof runnerAuthSyncArgs>
export type RunnerAuthAsync = InvokeFns<
  typeof runnerAuthAsyncArgs,
  RunnerAuthAsyncReturns
>

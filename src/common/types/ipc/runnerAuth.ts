import type { UserInfo } from '../../types'
import type { UserData } from '../gog'
import type { NileLoginData, NileRegisterData, NileUserData } from '../nile'

// ts-prune-ignore-next
export interface RunnerAuthSync {
  logoutGOG: () => void
}

// ts-prune-ignore-next
export interface RunnerAuthAsync {
  getEpicGamesStatus: () => Promise<boolean>
  getUserInfo: () => Promise<UserInfo | undefined>
  getAmazonUserInfo: () => Promise<NileUserData | undefined>
  isLoggedIn: () => boolean
  login: (sid: string) => Promise<{
    status: 'done' | 'failed'
    data: UserInfo | undefined
  }>
  authGOG: (code: string) => Promise<{
    status: 'done' | 'error'
    data?: UserData
  }>
  authAmazon: (data: NileRegisterData) => Promise<{
    status: 'done' | 'failed'
    user: NileUserData | undefined
  }>
  logoutLegendary: () => Promise<void>
  logoutAmazon: () => Promise<void>
  getAmazonLoginData: () => Promise<NileLoginData>
}

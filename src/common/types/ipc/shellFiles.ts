import type { DiskSpaceData } from '../../types'

export interface ShellFilesSync {
  openExternalUrl: (url: string) => void
  openFolder: (folder: string) => void
  openSupportPage: () => void
  openWeblate: () => void
  openLoginPage: () => void
  openDiscordLink: () => void
  openKofiPage: () => void
  openGithubSponsorsPage: () => void
  openWinePrefixFAQ: () => void
  openWikiLink: () => void
  openSidInfoPage: () => void
  showConfigFileInFolder: (appName: string) => void
  removeFolder: ([path, folderName]: [string, string]) => void
  clearCache: (showDialog?: boolean, fromVersionChange?: boolean) => void
  clearAchievementCache: (appName: string) => void
  resetHeroic: () => void
  showItemInFolder: (item: string) => void
}

export interface ShellFilesAsync {
  checkDiskSpace: (folder: string) => Promise<DiskSpaceData>
  getShellPath: (path: string) => Promise<string>
  pathExists: (path: string) => Promise<boolean>
}

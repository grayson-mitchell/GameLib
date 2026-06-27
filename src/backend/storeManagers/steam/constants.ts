import { join } from 'path'
import { homedir } from 'os'
import { app } from 'electron'

export const steamSupportPath = join(app.getPath('userData'), 'steam_store')

export const STEAM_INSTALL_PATHS: Record<string, string[]> = {
  linux: ['/usr/bin/steam', join(homedir(), '.steam', 'steam')],
  darwin: ['/Applications/Steam.app'],
  win32: ['C:\\Program Files (x86)\\Steam\\Steam.exe']
}

export const STEAM_DOWNLOAD_URL = 'https://store.steampowered.com/about/'

export const TOKEN_STORE_KEY = 'refreshToken'
export const TOKEN_PREFIX = 'steam:v1:'

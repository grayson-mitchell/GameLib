import { join } from 'path'
import { homedir } from 'os'
import { app } from 'backend/platform'

export const steamSupportPath = join(app.getPath('userData'), 'steam_store')

export const STEAM_INSTALL_PATHS: Record<string, string[]> = {
  linux: ['/usr/bin/steam', join(homedir(), '.steam', 'steam')],
  darwin: ['/Applications/Steam.app'],
  win32: ['C:\\Program Files (x86)\\Steam\\Steam.exe']
}

export const STEAM_DOWNLOAD_URL = 'https://store.steampowered.com/about/'

export const TOKEN_STORE_KEY = 'refreshToken'
export const TOKEN_PREFIX = 'steam:v1:'

// ── Phase 17 (17-02): dedicated Steam CrossOver bottle constants ────────────
// D-01: Steam is NEVER installed into the shared 'GameLib' GOG/Epic bottle —
// it gets its own, distinctly named bottle.
export const DEFAULT_STEAM_BOTTLE_NAME = 'GameLibSteam'

// Reserved synthetic appName for the Pitfall-6 checkWineBeforeLaunch
// interaction (handled in 17-04) — cannot collide with a real numeric Steam
// appId.
export const STEAM_BOTTLE_RESERVED_APPNAME = '__gamelib_steam_bottle__'

// Official Windows Steam installer (HTTPS only — T-17-02).
export const STEAM_SETUP_EXE_URL =
  'https://cdn.cloudflare.steamstatic.com/client/installer/SteamSetup.exe'

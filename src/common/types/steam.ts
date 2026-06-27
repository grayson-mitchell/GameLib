export interface SteamCredentials {
  refreshToken: string // encrypted via safeStorage; decrypted before use
}

export interface SteamUserData {
  username: string // persona name from steam-user after loggedOn
  steamId?: string // SteamID64 — optional, used for display
}

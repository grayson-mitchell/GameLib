import type {
  AppShellSync,
  AppShellAsync,
  AppShellFrontendMessages
} from './appShell'
import type { ClipboardSync, ClipboardAsync } from './clipboard'
import type { DialogAsync } from './dialog'
import type {
  DownloadQueueSync,
  DownloadQueueAsync,
  DownloadQueueFrontendMessages
} from './downloadQueue'
import type { EngineAsync, EngineFrontendMessages } from './engine'
import type { EnrichmentAsync } from './enrichment'
import type { EosOverlayAsync } from './eosOverlay'
import type { GameDetailsSync, GameDetailsAsync } from './gameDetails'
import type { GogFrontendMessages } from './gog'
import type { HumbleSync, HumbleAsync, HumbleFrontendMessages } from './humble'
import type { HumbleLoginSync, HumbleLoginAsync } from './humbleLogin'
import type { InstallAsync } from './install'
import type { LegendaryFrontendMessages } from './legendary'
import type { LoggerSync, LoggerAsync, LoggerFrontendMessages } from './logger'
import type { MainProcessSync, MainProcessAsync } from './mainProcess'
import type { OauthLoginAsync } from './oauthLogin'
import type { RunnerAuthSync, RunnerAuthAsync } from './runnerAuth'
import type { RunnerMiscAsync } from './runnerMisc'
import type { SettingsSync, SettingsAsync } from './settings'
import type { ShellFilesSync, ShellFilesAsync } from './shellFiles'
import type { ShortcutsSync, ShortcutsAsync } from './shortcuts'
import type { SteamAsync, SteamFrontendMessages } from './steam'
import type { SteamAuthSync, SteamAuthAsync } from './steamAuth'
import type { StoreEmbedSync, StoreEmbedAsync } from './storeEmbed'
import type {
  TestStubsSync,
  TestStubsTestSync,
  TestStubsAsync
} from './testStubs'
import type { WindowSync, WindowAsync } from './window'
import type { WineToolsAsync, WineToolsFrontendMessages } from './wineTools'

export type { SteamSyncStatus } from './steam'

export type SyncIPCFunctions = AppShellSync &
  ClipboardSync &
  DownloadQueueSync &
  GameDetailsSync &
  HumbleSync &
  HumbleLoginSync &
  LoggerSync &
  MainProcessSync &
  RunnerAuthSync &
  SettingsSync &
  ShellFilesSync &
  ShortcutsSync &
  SteamAuthSync &
  StoreEmbedSync &
  TestStubsSync &
  WindowSync

export type TestSyncIPCFunctions = TestStubsTestSync

export type AsyncIPCFunctions = AppShellAsync &
  ClipboardAsync &
  DialogAsync &
  DownloadQueueAsync &
  EngineAsync &
  EnrichmentAsync &
  EosOverlayAsync &
  GameDetailsAsync &
  HumbleAsync &
  HumbleLoginAsync &
  InstallAsync &
  LoggerAsync &
  MainProcessAsync &
  OauthLoginAsync &
  RunnerAuthAsync &
  RunnerMiscAsync &
  SettingsAsync &
  ShellFilesAsync &
  ShortcutsAsync &
  SteamAsync &
  SteamAuthAsync &
  StoreEmbedAsync &
  TestStubsAsync &
  WindowAsync &
  WineToolsAsync

export type FrontendMessages = AppShellFrontendMessages &
  DownloadQueueFrontendMessages &
  EngineFrontendMessages &
  GogFrontendMessages &
  HumbleFrontendMessages &
  LegendaryFrontendMessages &
  LoggerFrontendMessages &
  SteamFrontendMessages &
  WineToolsFrontendMessages

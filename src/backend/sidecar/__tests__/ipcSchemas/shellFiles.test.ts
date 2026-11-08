import {
  shellFilesAsyncArgs,
  shellFilesSyncArgs
} from 'common/types/ipc/shellFiles'
import {
  expectFixtureCoverage,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'

const noArgs = { valid: [[]], invalid: [['unexpected']] }

const syncTable: FixtureTable<typeof shellFilesSyncArgs> = {
  openExternalUrl: {
    valid: [
      ['https://www.humblebundle.com/home/keys'],
      ['gamelib://deep-link']
    ],
    invalid: [['not a url'], []]
  },
  openFolder: {
    valid: [['/home/user/Games/Prefix']],
    invalid: [[''], [undefined]]
  },
  openSupportPage: noArgs,
  openWeblate: noArgs,
  openLoginPage: noArgs,
  openDiscordLink: noArgs,
  openKofiPage: noArgs,
  openGithubSponsorsPage: noArgs,
  openWinePrefixFAQ: noArgs,
  openWikiLink: noArgs,
  openSidInfoPage: noArgs,
  showConfigFileInFolder: {
    valid: [['Fortnite']],
    invalid: [[''], [42]]
  },
  clearCache: {
    valid: [[true], [false, true], [], [null, null]],
    invalid: [['yes'], [true, true, true]]
  },
  clearAchievementCache: {
    valid: [['1245620']],
    invalid: [[''], [null]]
  },
  resetHeroic: noArgs,
  showItemInFolder: {
    valid: [['/home/user/.config/wine/proton']],
    invalid: [[''], [{}]]
  }
}

const asyncTable: FixtureTable<typeof shellFilesAsyncArgs> = {
  checkDiskSpace: {
    valid: [['/home/user/Games'], ['C:\\Games']],
    invalid: [[], [123]]
  },
  getShellPath: {
    valid: [['~/Games/save']],
    invalid: [[''], []]
  },
  pathExists: {
    valid: [['/usr/bin/wine'], ['']],
    invalid: [[], [null]]
  }
}

describe('shellFiles IPC schemas', () => {
  it('has a fixture for every sync channel', () => {
    expectFixtureCoverage(shellFilesSyncArgs, syncTable)
  })
  it('has a fixture for every async channel', () => {
    expectFixtureCoverage(shellFilesAsyncArgs, asyncTable)
  })
  runFixtureTable(shellFilesSyncArgs, syncTable)
  runFixtureTable(shellFilesAsyncArgs, asyncTable)
})

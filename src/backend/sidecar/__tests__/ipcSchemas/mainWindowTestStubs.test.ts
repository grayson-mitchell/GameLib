import { defined } from 'backend/testUtils/indexed'
import { channelSchemas } from 'common/types/ipc/channelSchemas'
import {
  mainProcessAsyncArgs,
  mainProcessSyncArgs
} from 'common/types/ipc/mainProcess'
import {
  testStubsAsyncArgs,
  testStubsSyncArgs,
  testStubsTestSyncArgs
} from 'common/types/ipc/testStubs'
import { windowAsyncArgs, windowSyncArgs } from 'common/types/ipc/window'
import {
  expectFixtureCoverage,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'

const noArgs = { valid: [[]], invalid: [['x']] }

const mainSync: FixtureTable<typeof mainProcessSyncArgs> = {
  'set-connectivity-online': noArgs
}
const mainAsync: FixtureTable<typeof mainProcessAsyncArgs> = {
  'get-connectivity-status': noArgs,
  getSignInProbeOutcomes: noArgs
}
const winSync: FixtureTable<typeof windowSyncArgs> = {
  setZoomFactor: {
    valid: [['1.25'], ['1']],
    invalid: [[], [1], ['1'.repeat(33)]]
  },
  minimizeWindow: noArgs,
  maximizeWindow: noArgs,
  unmaximizeWindow: noArgs,
  closeWindow: noArgs,
  setFullscreen: { valid: [[true], [false]], invalid: [[], ['yes']] }
}
const winAsync: FixtureTable<typeof windowAsyncArgs> = {
  isFullscreen: noArgs,
  isFrameless: noArgs,
  isMaximized: noArgs,
  isMinimized: noArgs
}
const stubsSync: FixtureTable<typeof testStubsSyncArgs> = {
  createNewWindow: {
    valid: [['https://www.protondb.com/app/220']],
    invalid: [[], [''], ['not a url'], [1]]
  },
  clearDMFinished: noArgs,
  'connectivity-changed': {
    valid: [['online'], ['offline'], ['check-online']],
    invalid: [[], ['up'], [1]]
  }
}
const stubList = {
  valid: [[[{ commandParts: ['legendary', 'list'], stdout: '[]' }]], [[]]],
  invalid: [[], [[{ stdout: 'x' }]], [[{ commandParts: [1] }]], ['x']]
}
const stubsTest: FixtureTable<typeof testStubsTestSyncArgs> = {
  setLegendaryCommandStub: stubList,
  resetLegendaryCommandStub: noArgs,
  setGogdlCommandStub: stubList,
  resetGogdlCommandStub: noArgs,
  setNileCommandStub: stubList,
  resetNileCommandStub: noArgs
}
const stubsAsync: FixtureTable<typeof testStubsAsyncArgs> = {
  updateAll: noArgs,
  gamepadAction: {
    valid: [[{ action: 'tab' }], [{ action: 'leftClick', metadata: { x: 1 } }]],
    invalid: [[]]
  }
}

describe('mainProcess / window / testStubs schemas', () => {
  expectFixtureCoverage(mainProcessSyncArgs, mainSync)
  expectFixtureCoverage(mainProcessAsyncArgs, mainAsync)
  expectFixtureCoverage(windowSyncArgs, winSync)
  expectFixtureCoverage(windowAsyncArgs, winAsync)
  expectFixtureCoverage(testStubsSyncArgs, stubsSync)
  expectFixtureCoverage(testStubsTestSyncArgs, stubsTest)
  expectFixtureCoverage(testStubsAsyncArgs, stubsAsync)
  runFixtureTable(mainProcessSyncArgs, mainSync)
  runFixtureTable(mainProcessAsyncArgs, mainAsync)
  runFixtureTable(windowSyncArgs, winSync)
  runFixtureTable(windowAsyncArgs, winAsync)
  runFixtureTable(testStubsSyncArgs, stubsSync)
  runFixtureTable(testStubsTestSyncArgs, stubsTest)
  runFixtureTable(testStubsAsyncArgs, stubsAsync)

  it('tags TestSync as testOnly and window / preload-served channels as local', () => {
    for (const k of Object.keys(testStubsTestSyncArgs)) {
      expect(defined(channelSchemas[k], k).testOnly).toBe(true)
    }
    for (const k of [
      ...Object.keys(windowSyncArgs),
      ...Object.keys(windowAsyncArgs),
      'createNewWindow',
      'clearDMFinished',
      'updateAll',
      'gamepadAction'
    ]) {
      expect(defined(channelSchemas[k], k).caller).toBe('local')
    }
    expect(
      defined(channelSchemas['connectivity-changed'], 'connectivity-changed')
        .caller
    ).toBe('renderer')
    expect(
      defined(
        channelSchemas['set-connectivity-online'],
        'set-connectivity-online'
      ).caller
    ).toBe('renderer')
  })
})

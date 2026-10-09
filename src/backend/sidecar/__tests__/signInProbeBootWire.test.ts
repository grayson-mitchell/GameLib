/**
 * Phase 49 Plan 08 (R3, A10): the sign-in probe pass is wired into `init()`
 * AFTER the READY write, and its outcomes pull handler is registered BEFORE it.
 *
 * `init()` calls `registerSignInProbeOutcomesHandler()` (registration only, so
 * the renderer's mount-time pull is answerable before READY) and then, after
 * `output.write(READY_SENTINEL)`, `startSignInProbePass()` (registration only: a
 * connectivity listener and an `unref()`'d immediate). READY therefore never
 * waits on the pass.
 *
 * WHY A DEDICATED FILE, and not an addition to `bootstrap.test.ts` or
 * `bootstrapWirings.test.ts`: both call `init()` early in their own files, so the
 * module-scope `signInProbeInitialized` guard would already be consumed by the
 * time a new describe block appended to either ran. A virgin file gets a virgin
 * module registry and a virgin guard flag for free. This is the reasoning
 * `gogPresenceBootWire.test.ts` records, and this file follows its shape.
 *
 * NO `expect(...).toHaveBeenCalled()` on `runOnceWhenOnline` or
 * `onConnectivityChange` anywhere in this file -- the vacuous shape banned in
 * this file family. Every assertion is on ORDER, an effect only the real
 * `init()` can produce.
 *
 * NO reference to the `'node:os'` specifier. Containment is structural via
 * `src/backend/jest.setupContainment.ts`.
 */

// ── electron / electron-store — route Jest's resolution at the REAL sidecar shims ──────────
jest.mock('backend/store_backend', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── axios — never a real network call (initOnlineMonitor()'s pingSites() runs during init()) ─
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    head: jest.fn(() => Promise.resolve({ status: 200 })),
    get: jest.fn(),
    create: jest.fn(() => ({ get: jest.fn(), head: jest.fn() }))
  }
}))

// ── online_monitor — stubbed so init()'s own listener registration never runs against the
//    mocked emitter shape. Plain functions: `resetMocks: true` would strip a `jest.fn` body.
jest.mock('../../online_monitor', () => ({
  ...jest.requireActual('../../online_monitor'),
  initOnlineMonitor: () => undefined,
  isOnline: () => true,
  runOnceWhenOnline: () => undefined
}))

// ── The two modules under test's collaborators: each records its call order. ──────────────
const mockOrder: string[] = []
const mockFullOrder: string[] = []
jest.mock('../../signInProbe/pass', () => ({
  startSignInProbePass: () => {
    mockOrder.push('start')
    mockFullOrder.push('start')
  }
}))
jest.mock('../../signInProbe/outcomes', () => ({
  ...jest.requireActual('../../signInProbe/outcomes'),
  registerSignInProbeOutcomesHandler: () => {
    mockFullOrder.push('handler')
  }
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { PassThrough } from 'node:stream'
import { READY_SENTINEL } from 'common/types/sidecarTransport'
import { init } from '../bootstrap'

/** An output stream that records the moment the READY sentinel is written. */
function recordingOutput(): PassThrough {
  const output = new PassThrough()
  const write = output.write.bind(output) as (...args: unknown[]) => boolean
  output.write = ((chunk: unknown, ...rest: unknown[]) => {
    if (String(chunk).includes(READY_SENTINEL)) {
      mockOrder.push('ready')
      mockFullOrder.push('ready')
    }
    return write(chunk, ...rest)
  }) as typeof output.write
  return output
}

// The FIRST init() in this virgin module registry is the one that can start the
// pass, so its events are captured once and every case below reads the capture.
let firstInitOrder: string[] = []
let firstInitFullOrder: string[] = []

beforeAll(() => {
  init(new PassThrough(), recordingOutput())
  firstInitOrder = [...mockOrder]
  firstInitFullOrder = [...mockFullOrder]
})

beforeEach(() => {
  mockOrder.length = 0
  mockFullOrder.length = 0
})

describe('Phase 49-08 -- init() starts the sign-in probe pass after READY', () => {
  it('writes READY before the pass starts, and starts it exactly once', () => {
    expect(firstInitOrder).toEqual(['ready', 'start'])
  })

  it('registers the outcomes pull handler before READY', () => {
    expect(firstInitFullOrder).toEqual(['handler', 'ready', 'start'])
  })

  it('a second init() in the same module registry neither registers the handler nor starts the pass again', () => {
    init(new PassThrough(), recordingOutput())

    expect(mockOrder).toEqual(['ready'])
    expect(mockFullOrder).toEqual(['ready'])
  })
})

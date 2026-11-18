/**
 * 80-REVIEW C-WR-08: the consumer side of the steamPollStateEvent wire parity. The crate test
 * `state_event_wire_fixture_matches_every_variant` (gamelib-steampoll tests/contracts.rs)
 * serialises every `StateEvent` variant, with the edge values Rust can really emit, into
 * `tests/fixtures/state-events.json`. Here the zod schema must accept every one of them, and the
 * handler must apply them. An event the schema rejects is re-sent by the shell every 10 s for the
 * rest of the session, so the schema may not be stricter than its producer.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import * as logger from 'backend/logger'
import { createTestManagerDeps } from 'backend/testUtils/testServices'
import type { ManagerDeps } from 'backend/services/types'
import type { SteamGameInfo } from 'common/types/steam'
import {
  sidecarInternalInvokeArgs,
  type SteamPollStateEvent
} from 'common/types/ipc/sidecarInternal'
import {
  registerSteamPollEventFlows,
  type PollAckReply
} from '../steamPollEventRegistration'

const FIXTURE = join(
  __dirname,
  '../../../../src-tauri/crates/gamelib-steampoll/tests/fixtures/state-events.json'
)

function producerEvents(): unknown[] {
  return JSON.parse(readFileSync(FIXTURE, 'utf-8')) as unknown[]
}

// Compile-time exhaustive: adding a kind to the zod union without listing it here fails tsc.
const KINDS: Record<SteamPollStateEvent['kind'], true> = {
  installed: true,
  installIncomplete: true,
  updateDone: true,
  uninstalled: true,
  bridgeUninstalled: true,
  forcedWindowsViaBottleCleared: true,
  macArchVerdict: true,
  adoptionState: true
}

beforeEach(() => {
  for (const fn of ['logWarning', 'logError', 'logInfo', 'logDebug'] as const) {
    jest.spyOn(logger, fn).mockImplementation(() => undefined)
  }
})
afterEach(() => jest.restoreAllMocks())

describe('steamPollStateEvent wire parity with gamelib-steampoll', () => {
  it('the fixture covers every kind the schema knows', () => {
    const kinds = new Set(
      producerEvents().map((e) => (e as { kind: string }).kind)
    )
    expect([...kinds].sort()).toEqual(Object.keys(KINDS).sort())
  })

  it('the schema accepts every event the producer serialises', () => {
    for (const ev of producerEvents()) {
      const parsed = sidecarInternalInvokeArgs.steamPollStateEvent.safeParse([
        ev
      ])
      expect({ ev, success: parsed.success }).toEqual({ ev, success: true })
    }
  })

  it('the handler applies every producer event without a refusal', async () => {
    const deps: ManagerDeps = createTestManagerDeps({
      sendFrontendMessage: (() => undefined) as never
    })
    deps.steamSession.libraryState.library.set('480', {
      app_name: '480',
      runner: 'steam',
      title: 'Spacewar',
      is_installed: false,
      install: {}
    } as SteamGameInfo)
    type Handler = (e: unknown, ...a: unknown[]) => Promise<PollAckReply>
    let handler: Handler | undefined
    registerSteamPollEventFlows({
      ipc: {
        handle: (channel: string, h: Handler) => {
          if (channel === 'steamPollStateEvent') handler = h
        }
      } as never,
      manager: () => deps
    })
    for (const ev of producerEvents()) {
      const reply = await handler!({}, ev)
      expect({ ev, applied: reply.applied }).toEqual({ ev, applied: true })
    }
    // A raw non-numeric or empty SizeOnDisk is stored as 0 bytes, never NaN.
    const size =
      deps.steamSession.libraryState.library.get('480')?.install?.install_size
    expect(String(size)).not.toContain('NaN')
  })
})

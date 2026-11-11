/**
 * Sidecar migration-runner wiring test (todo 2026-08-16, quick task 260822-s8y).
 *
 * `new MigrationSystem(deps).applyMigrations()` had exactly ONE call site in the repo --
 * `main.ts:412`, inside Electron's `app.whenReady()`, which the headless Tauri sidecar never
 * runs. So `LegendaryGlobalConfigFolderMigration` had never executed on the shipping runtime,
 * and any future `Migration` would have shipped as a silent no-op. Same family as the
 * `initOnlineMonitor()` gap that `onlineMonitorWiring.test.ts` covers, and this suite is
 * modelled on that one.
 *
 * These tests drive the REAL migration against a REAL filesystem rather than asserting that a
 * mocked runner was called. A "was `applyMigrations` invoked" assertion would prove the call
 * site exists and say nothing about whether the migration can actually do its work under the
 * sidecar's shimmed `app.getPath` -- which is the half the todo asked to verify.
 *
 * `jest.mock('electron')` / `jest.mock('backend/store_backend')` route Jest's own module resolution at
 * the real `platform/index.ts`/`fileStore.ts` (the same singletons `bootstrap.ts` binds onto)
 * rather than the backend-wide manual mock, so `app.getPath('appData')` resolves through
 * `pathShim.ts` exactly as it does in production. See `skeletonFlows.test.ts`'s header for the
 * full rationale.
 *
 * NO per-suite `jest.mock('os', ...)` here, deliberately, and this is not an oversight:
 * `src/backend/jest.setupContainment.ts` is registered in `jest.config.js`'s `setupFiles` for
 * the whole backend project and already overrides `homedir()` to a disposable per-process root.
 * That module exists precisely because the per-suite kit it replaced "can only ever cover suites
 * someone remembered to add to it". Both paths this suite touches -- the migration's source
 * (`homedir()/.config/legendary`) and its destination (`appFolder/legendaryConfig/legendary`)
 * -- resolve under that root, so no real developer data is read or written.
 *
 * `axios` is mocked: `init()` reaches `initOnlineMonitor()`, whose real `pingSites()` would
 * otherwise make live network calls.
 *
 * ORDER-DEPENDENT BY NATURE. `MigrationSystem` is a singleton over a persisted store, so these tests share real state on
 * purpose. Each test says which prior state it relies on.
 */

// ── electron / electron-store — route Jest's resolution at the REAL sidecar shims ──────────
jest.mock('backend/store_backend', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── axios — never a real network call (see header) ─────────────────────────────────────────
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    head: jest.fn(),
    get: jest.fn(),
    create: jest.fn(() => ({ get: jest.fn(), head: jest.fn() }))
  }
}))

// ── fs/promises — everything real except `cp`, which tests 3/4 need to fail on demand ──────
jest.mock('fs/promises', () => {
  const actual = jest.requireActual('fs/promises')
  return { ...actual, cp: jest.fn() }
})

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { createTestContext } from 'backend/testUtils/testContext'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'graceful-fs'
import { join } from 'node:path'
import { getPath } from '../pathShim'
import { cp } from 'fs/promises'
import { bootFresh } from './helpers/sidecarHarness'
import type MigrationSystem from '../../migration'
import { isLinux } from '../../constants/environment'
import { userHome } from '../../constants/paths'
import { legendaryConfigPath } from '../../storeManagers/legendary/constants'
import { createStoreRegistry } from 'backend/stores/storeRegistry'
import { createMigrationStores } from '../../migration/stores'

const { migrationsStore } = createMigrationStores({
  registry: createStoreRegistry()
})

const actualFsPromises =
  jest.requireActual<typeof import('fs/promises')>('fs/promises')
const mockedCp = cp as jest.Mock

const MIGRATION_ID = 'legendary-move-global-config-folder'
const MARKER_FILE = 'user.json'
const MARKER_CONTENTS = '{"displayName":"migrated"}'

/**
 * The source directory the migration reads. Derived with the SAME expression
 * `migrations/legendary.ts` uses, so this suite keeps working on a Linux runner where the
 * branch differs. That makes the PATH half of these tests tautological by construction -- which
 * is fine, because what they actually assert is that the copy HAPPENS and that a failed copy
 * leaves nothing behind, not that the path expression is correct.
 */
const globalLegendaryConfig = isLinux
  ? join(getPath('appData'), 'legendary')
  : join(userHome, '.config', 'legendary')

const stagingPath = `${legendaryConfigPath}.migrating`

function seedGlobalConfig(): void {
  mkdirSync(globalLegendaryConfig, { recursive: true })
  writeFileSync(join(globalLegendaryConfig, MARKER_FILE), MARKER_CONTENTS)
}

function clearDestination(): void {
  rmSync(legendaryConfigPath, { recursive: true, force: true })
  rmSync(stagingPath, { recursive: true, force: true })
}

/** The migration is floated off `init()`, so poll rather than guessing a flush depth. */
async function waitFor(
  predicate: () => boolean,
  timeoutMs = 5000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return predicate()
}

const migratedMarker = () => join(legendaryConfigPath, MARKER_FILE)

beforeEach(() => {
  // resetMocks: true wipes factory-supplied implementations before EVERY test (the same gotcha
  // dialogStub.test.ts / onlineMonitorWiring.test.ts document), so `cp` must be re-pointed at
  // the real implementation here or it silently resolves `undefined` and copies nothing.
  mockedCp.mockImplementation((...args: unknown[]) =>
    (actualFsPromises.cp as (...a: unknown[]) => Promise<void>)(...args)
  )
})

/**
 * One boot (D-08) into a fresh registry. The fresh registry's `fs/promises` and `axios` mocks are
 * different objects from the top-level ones, and `resetMocks` has wiped their factory
 * implementations, so both are re-armed in `before` ahead of the boot. Returns that registry's
 * `cp` mock and migrations store.
 */
function bootMigrations() {
  let freshCp!: jest.Mock
  bootFresh({
    before: () => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      freshCp = require('fs/promises').cp as jest.Mock
      freshCp.mockImplementation((...args: unknown[]) =>
        (actualFsPromises.cp as (...a: unknown[]) => Promise<void>)(...args)
      )
      require('axios').default.head.mockResolvedValue({ status: 200 })
      /* eslint-enable @typescript-eslint/no-require-imports */
    }
  })
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createMigrationStores } = require('../../migration/stores')
  /* eslint-enable @typescript-eslint/no-require-imports */
  const freshMigrationStores = createMigrationStores({
    registry: createStoreRegistry()
  })
  return {
    freshCp,
    freshStore: freshMigrationStores.migrationsStore as typeof migrationsStore,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    freshSystem: require('../../migration').default as typeof MigrationSystem,
    freshStores: {
      migration: freshMigrationStores
    }
  }
}

describe('sidecar bootstrap runs data migrations (todo 2026-08-16)', () => {
  it('runs the Legendary global-config adoption for real on the sidecar boot path', async () => {
    migrationsStore.set('appliedMigrations', [])
    clearDestination()
    seedGlobalConfig()
    expect(existsSync(migratedMarker())).toBe(false)

    const { freshStore } = bootMigrations()

    // Pre-fix this never became true no matter how long you waited: the boot had no call to
    // `applyMigrations()` at all, so the adoption simply never happened under Tauri.
    expect(await waitFor(() => existsSync(migratedMarker()))).toBe(true)
    expect(
      await waitFor(() =>
        freshStore.get('appliedMigrations', []).includes(MIGRATION_ID)
      )
    ).toBe(true)
  })

  it('one boot runs the migration set exactly once', async () => {
    // A fresh registry boots exactly one migration pass: the single adoption copy happens once.
    migrationsStore.set('appliedMigrations', [])
    clearDestination()
    seedGlobalConfig()

    const { freshCp } = bootMigrations()
    expect(await waitFor(() => existsSync(migratedMarker()))).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(freshCp).toHaveBeenCalledTimes(1)
  })
})

describe('LegendaryGlobalConfigFolderMigration failure-lock (todo 2026-08-16 step 2)', () => {
  // One boot for the pair (D-08): it initialises the logger the migration writes through, and
  // both cases drive that same registry's MigrationSystem directly. Booted with no source
  // seeded, so the boot's own migration pass is a no-op.
  let world!: ReturnType<typeof bootMigrations>
  beforeAll(async () => {
    clearDestination()
    world = bootMigrations()
    await new Promise((resolve) => setTimeout(resolve, 100))
  })

  it('a failed copy leaves NO destination and is NOT recorded as applied', async () => {
    world.freshStore.set('appliedMigrations', [])
    clearDestination()
    seedGlobalConfig()

    // Models a PARTIAL copy, not a copy that never started: the old code's `mkdir` ran BEFORE
    // `cp`, so a failure here left a destination directory on disk. Creating the target before
    // throwing is what makes this test able to see that difference at all.
    world.freshCp.mockImplementation(async (_src: unknown, dest: unknown) => {
      mkdirSync(String(dest), { recursive: true })
      writeFileSync(join(String(dest), 'partial.tmp'), 'half a config')
      throw Object.assign(new Error('simulated copy failure'), {
        code: 'EACCES'
      })
    })

    await new world.freshSystem({
      stores: world.freshStores,
      paths: createTestContext().ctx.paths
    }).applyMigrations()

    // THE REGRESSION. Pre-fix, `legendaryConfigPath` existed after this point, so the next
    // launch's `hasHeroicSpecificConfig` check returned `true` on the first line of `run()` and
    // the migration recorded itself as applied over a half-copied config, forever.
    expect(existsSync(legendaryConfigPath)).toBe(false)
    expect(existsSync(stagingPath)).toBe(false)
    expect(world.freshStore.get('appliedMigrations', [])).not.toContain(
      MIGRATION_ID
    )
  })

  it('and the next attempt therefore succeeds -- the migration is retryable, not locked out', async () => {
    // Depends on the test above: `appliedMigrations` must still be empty and the destination
    // still absent. This is the user-visible half of the fix; the assertions above are the
    // mechanism.
    expect(existsSync(legendaryConfigPath)).toBe(false)
    seedGlobalConfig()
    world.freshCp.mockImplementation((...args: unknown[]) =>
      (actualFsPromises.cp as (...a: unknown[]) => Promise<void>)(...args)
    )

    await new world.freshSystem({
      stores: world.freshStores,
      paths: createTestContext().ctx.paths
    }).applyMigrations()

    expect(existsSync(migratedMarker())).toBe(true)
    // `await` is load-bearing: a bare `expect(promise).resolves.toBe(...)` returns a
    // promise nobody observes, so the assertion can never fail the test.
    await expect(
      actualFsPromises.readFile(migratedMarker(), 'utf-8')
    ).resolves.toBe(MARKER_CONTENTS)
    expect(world.freshStore.get('appliedMigrations', [])).toContain(
      MIGRATION_ID
    )
  })
})

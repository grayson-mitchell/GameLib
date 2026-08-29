/* eslint-disable @typescript-eslint/no-namespace */
import type { PartialDeep } from 'type-fest'
import type {
  BrowserWindowConstructorOptions,
  MenuItemConstructorOptions
} from 'backend/platform'

// FIXME: This file is required because we add functionality to some objects
//        with Jest mocks. Ideally tests using these functions would do
//        their tasks using regular functions defined in the module they're
//        using. Mocks are intended to make existing functionality work inside
//        test, they're not supposed to add new functionality

// Phase 35 plan 16 (Form 3): the two members below used to qualify their type
// references with the enclosing namespace's own name. That qualifier is dropped here
// in favor of the two named imports below: this block still declaration-merges its
// test-only members onto the electron package's own ambient namespace (retained per
// this plan's own constraint -- the `electron` devDependency stays until plan 35-18),
// but the field TYPES themselves now come from `backend/platform`, same as every
// other Form 3 site in this plan -- there is no remaining reason for this file to
// reach into the electron package's declarations for them.
declare global {
  namespace Electron {
    interface BrowserWindow {
      /** NOTE: Test-only property, not present normally */
      options: BrowserWindowConstructorOptions
    }

    namespace BrowserWindow {
      /** NOTE: Test-only function, not present normally */
      function setAllWindows(windows: PartialDeep<BrowserWindow>[]): void
    }

    interface Tray {
      /** NOTE: Test-only function, not present normally */
      menu: MenuItemConstructorOptions[]
    }
  }
}

declare module 'backend/config' {
  namespace GlobalConfig {
    /** NOTE: Test-only function, not present normally */
    const setConfigValue: (key: string, value: unknown) => void
  }
}

export {}

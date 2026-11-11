// @ts-check

import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'
import { importX } from 'eslint-plugin-import-x'
import runnerLiteral from './meta/runnerLiteralSelectors.cjs'

// Shared by the base block and the scoped backend block below. A later
// `no-restricted-imports` block REPLACES earlier options (66.2 probe A3), so the
// backend block spreads this array and restates the electron entry.
const RESTRICTED_PATHS = [
  {
    name: 'electron',
    importNames: ['ipcMain', 'ipcRenderer'],
    message:
      'Use the helper functions declared in [backend|preload]/ipc instead.'
  }
]

const CHILD_PROCESS_MESSAGE =
  'Spawn through the injected ProcessRunner (src/backend/process); only process/runner.ts may import child_process (66 D-13).'
const BUILTIN_BY_NAME_MESSAGE =
  'Loading builtins by name bypasses the child_process ban (66.2 C-05); use a static import.'

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  reactHooks.configs['recommended-latest'],
  prettier,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // React hooks rules
      'react-hooks/rules-of-hooks': 'warn',

      // Honor the leading-underscore convention for intentionally-unused
      // bindings (e.g. positional params required by an interface signature
      // that a given implementation doesn't use). Matches TS noUnusedParameters.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],

      // FIXME: All of these rules should be errors instead
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-for-in-array': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',

      'react/no-unknown-property': [
        'error',
        { ignore: ['partition', 'allowpopups', 'useragent', 'preload'] }
      ],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: false }
      ],
      '@typescript-eslint/unbound-method': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: RESTRICTED_PATHS
        }
      ]
    },

    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname
      }
    },
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/__tests__/**/*.ts', '**/__mocks__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // This block already sanctions `any` in tests above. The five
      // `no-unsafe-*` rules fire precisely on dereferencing/assigning/
      // returning/passing an `any` — so once `any` itself is permitted here,
      // those rules are unactionable warnings against a construct this same
      // policy allows. They remain `warn` in production, where the debt is
      // real.
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'warn'
    }
  },
  {
    // 66 D-13 / 66.2 D-16: only src/backend/process/runner.ts may import
    // child_process. Dynamic forms (require(), import(), computed specifiers)
    // are covered by dependency-cruiser and the AST census in
    // meta/backendDiCeilings.cjs. `globalThis.process.getBuiltinModule` is not
    // matched by no-restricted-properties; the census counts it.
    files: ['src/backend/**/*.ts'],
    ignores: [
      '**/__tests__/**',
      '**/__mocks__/**',
      'src/backend/testUtils/**',
      'src/backend/jest.*',
      'src/backend/process/runner.ts'
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...RESTRICTED_PATHS,
            { name: 'child_process', message: CHILD_PROCESS_MESSAGE },
            { name: 'node:child_process', message: CHILD_PROCESS_MESSAGE },
            // 66.2 WR-01: the npm spawn packages are the same bypass.
            { name: 'execa', message: CHILD_PROCESS_MESSAGE },
            { name: 'cross-spawn', message: CHILD_PROCESS_MESSAGE },
            { name: 'shelljs', message: CHILD_PROCESS_MESSAGE },
            { name: 'node-pty', message: CHILD_PROCESS_MESSAGE },
            {
              name: 'module',
              importNames: ['createRequire'],
              message: BUILTIN_BY_NAME_MESSAGE
            },
            {
              name: 'node:module',
              importNames: ['createRequire'],
              message: BUILTIN_BY_NAME_MESSAGE
            }
          ]
        }
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'getBuiltinModule',
          message: BUILTIN_BY_NAME_MESSAGE
        }
      ]
    }
  },
  {
    // Phase 62 D-13/D-14/D-15: comparing a runner/store value against a store
    // literal is banned in frontend and backend code. The identity/capability
    // home is `src/common/storeCapabilities.ts`. The selector set has one
    // source, meta/runnerLiteralSelectors.cjs.
    files: [
      ...runnerLiteral.SCOPE_FILES.frontend,
      ...runnerLiteral.SCOPE_FILES.backend
    ],
    ignores: [...runnerLiteral.SCOPE_IGNORES],
    rules: {
      'no-restricted-syntax': ['error', ...runnerLiteral.SELECTORS]
    }
  },
  {
    // `.planning/` holds planning artifacts and one-off live-sitting harnesses,
    // not product code. A .ts harness there is outside tsconfig.eslint.json, so
    // the production scope would report it as a parsing ERROR and turn
    // `pnpm lint` (and the pre-push hook) red.
    ignores: [
      'build/',
      '.planning/',
      '.claude/',
      '**/*.js',
      '**/*.cjs',
      '**/*.mjs'
    ]
  }
)

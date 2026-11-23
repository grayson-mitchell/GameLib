# Phase 87 deferred items

Out-of-scope discoveries logged during execution; not fixed by the plan that found them.

## 87-05

- `pnpm find-deadcode` reports `exports | src/backend/testUtils/portSliceGate.ts | manifest` as a new knip finding. The file is untouched by Phase 87; likely left unused by the retirement of the 86 oracle harness. Remove the export or tag it `@public` in a plan that owns `portSliceGate.ts`.

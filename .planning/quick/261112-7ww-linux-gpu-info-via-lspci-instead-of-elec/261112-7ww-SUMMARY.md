---
quick_id: 261112-7ww
status: complete
files_modified:
  - src/backend/utils/systeminfo/gpu/linux.ts
  - src/backend/utils/systeminfo/gpu/index.ts
  - src/backend/utils/systeminfo/__tests__/gpuLinux.test.ts
---

# Quick 261112-7ww: Linux GPU info via lspci

`getGpuInfo_linux` now makes one `lspci -mm -v -n -k` call through the ProbeDeps runner and parses display-class records (0300/0302/0380) with `parseLspciGpus`. The zod/Electron path is gone. Any lspci failure (ENOENT, non-zero exit, timeout) returns `[]` with a warning. `getGpuInfo` is wrapped in try/catch, so `getSystemInfo` can no longer reject on GPU probing.

## Verification
- `npx jest src/backend/utils/systeminfo`: 21 pass, including Deck LCD (1002:163f) and OLED (1002:1435) detection from lspci fixtures.
- `pnpm backend-di-ceilings` passes with no shard edits. `pnpm codecheck` is clean. Prettier is clean on the three files.

## Deviations
- [Rule 3] The first version of linux.ts used module-level constants, which tripped the moduleState ceiling. They were moved inside `parseLspciGpus`.
- The tests use `jest.spyOn(logger, 'logWarning')` rather than `jest.mock`, so the mock ceiling is unchanged. The logger has no writer outside the sidecar.
- Both tasks were committed together as a single commit, because they share a test file.

## Commit
- see `git log` for `fix(quick-261112-7ww)`

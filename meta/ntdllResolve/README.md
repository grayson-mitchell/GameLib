# ntdllResolve: adding an allowlisted CrossOver build

`resolve.py` is a **developer tool**. It is vendored from NotProtonNot/NotProton
(`ntdll-patch/resolve.py`, commit `8db22adb237e6ea640a5af148b69b93709daf50c`, GPL-3.0), x86_64
path only. Nothing in `package.json`, `.github/workflows` or `src/` runs or imports it.

It finds the x86_64 ntdll patch sites **by pattern** (D-08). Runtime never pattern-finds: the
allowlist is explicit (D-09), so an unlisted CrossOver build fails closed.

## Prerequisites

- mingw-w64 for the payload build: `brew install mingw-w64`.
- Python 3 and `capstone`, needed only for this procedure.

## Procedure

1. Create a throwaway venv OUTSIDE the repo: `python3 -m venv <scratch>/np-resolve`.
2. Install the disassembler into it: `<scratch>/np-resolve/bin/pip install capstone==5.0.9`.
3. Run the finder against the clean (unpatched) x86_64 ntdll:
   `<scratch>/np-resolve/bin/python3 -I meta/ntdllResolve/resolve.py <path to clean x86_64-windows/ntdll.dll>`
4. Copy the printed hook RVA, stolen bytes, resume RVA, WM register, load_path slot, cave placement
   and the three export VAs (`LdrGetDllHandle`, `LdrLoadDll`, `NtProtectVirtualMemory`) into two places:
   - a new row in `src/backend/storeManagers/steam/bridge/drm/ntdllPatchTable.ts` (plan 56-06);
   - a new `DETOUR_BUILD_ROWS` entry in `meta/buildDrmNativeParts.ts`.
5. Rebuild the payload, pin its sha256 in both places, and record the patched ntdll sha produced by
   the 56-06 applier.

## Existing row: CrossOver 26.3.0.39832

Verified against NotProton revision `8db22adb237e6ea640a5af148b69b93709daf50c`.

| Field                  | Value                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| clean ntdll sha256     | `6dff64c00793ce92124f1316985c63783f539f26b392975c70f57637458d2387` |
| hook RVA / resume RVA  | `0x44972` / `0x4497b`                                              |
| stolen bytes           | `4883bc24f000000000`                                               |
| WM register            | `r14`                                                              |
| load_path slot         | `[rsp+0xd0]`                                                       |
| cave                   | RVA `0xae000`, size `0x1000`                                       |
| LdrGetDllHandle        | `0x170014bc0`                                                      |
| LdrLoadDll             | `0x170015680`                                                      |
| NtProtectVirtualMemory | `0x17000f380`                                                      |
| payload sha256         | `e35b834408599c45f30b23a6d2bf38acfa5c3df4d15206617c471e23a4a01bfb` |

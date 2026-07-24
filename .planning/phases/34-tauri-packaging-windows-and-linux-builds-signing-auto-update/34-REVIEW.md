---
phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
reviewed: 2026-07-24T20:15:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - .github/workflows/release-tauri.yml
  - meta/__tests__/buildSidecarSea.test.ts
  - meta/buildSidecarSea.ts
  - meta/sidecarSeaFsShim.ts
  - patches/lzma.patch
  - patches/steam-user.patch
  - src-tauri/Cargo.toml
  - src-tauri/binaries/.gitignore
  - src-tauri/capabilities/default.json
  - src-tauri/icons/icon.ico
  - src-tauri/src/main.rs
  - src-tauri/tauri.conf.json
  - src/backend/__tests__/cargoFeatures.test.ts
  - src/backend/__tests__/releaseWorkflow.test.ts
  - src/backend/__tests__/tauriConf.test.ts
  - src/backend/__tests__/tauriShellSource.test.ts
findings:
  critical: 3
  warning: 10
  info: 3
  total: 16
status: issues_found
---

# Phase 34: Code Review Report (re-review after gap closure 34-08..34-11)

**Reviewed:** 2026-07-24
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

**Gap-fix verdict (the five findings this cycle was supposed to close):**

| Prior finding | Verdict | Notes |
|---|---|---|
| CR-01 (host-vs-target sidecar triple) | **Closed, correctly** | `resolveTriple()`/`triplePlatform()`/`expectedMachoArch()` make the output triple, postject's `--macho-segment-name`, and the `lipo -archs` gate all target-driven; `obtainCrossNodeBinary()` genuinely downloads + SHA-256-verifies the nodejs.org binary rather than relabeling `process.execPath`; the workflow wires `GAMELIB_SIDECAR_TARGET_TRIPLE` per matrix leg. Regression tests are real, not vacuous. |
| CR-02 (missing Windows `.ico`) | **Closed, correctly** | `src-tauri/icons/icon.ico` is a genuine 6-image MS icon resource (verified: `MS Windows icon resource - 6 icons`, magic `00 00 01 00`), wired into `bundle.icon`, asserted both on-disk and by magic bytes. |
| WR-01 (release-reachable `node` spawn) | **Closed, correctly** | `use_dev_sidecar()` reduces to `cfg!(debug_assertions)`; `GAMELIB_SIDECAR_ENTRY` survives only as a dev-path entry redirect. |
| WR-02 (`cert.pfx` left on disk) | **Closed, correctly** | `try/finally` + `Remove-Item -Force`; the inaccurate "ONLY in-memory" claim was corrected rather than papered over. |
| WR-03 (orphan sidecar on exit) | **Closed, but incomplete** | `RunEvent::Exit` -> `shutdown_child()` covers window-close/Cmd+Q. It does **not** cover the `app_relaunch` path (WR-01 below), and it is an unconditional `kill()` with no graceful shutdown (WR-02 below). |

**New/previously-missed defects.** Three BLOCKERs remain. None is a regression from the gap
cycle — all are pre-existing and all sit squarely on the code path the deferred 34-07 live gate
would have exercised first. Because the tag-push pipeline has *never* been run, none was caught
empirically:

1. **The release workflow never builds the renderer.** `frontendDist: "../build"` +
   `beforeBuildCommand: ""` + no `electron-vite build` step anywhere in `release-tauri.yml`
   means every Tauri bundle produced by CI either fails to bundle or ships with no web assets.
2. **The `windows-latest` leg cannot build the SEA sidecar** — `buildSidecarSea.ts` spawns
   `node_modules/.bin/esbuild` and `node_modules/.bin/postject` as bare extensionless paths,
   which do not execute via `spawn()` on Windows.
3. **Auto-update can never resolve its feed** — every release is created `prerelease: true`
   while the endpoint is `/releases/latest/download/latest.json`, which by GitHub's documented
   semantics never resolves to a prerelease.

Ten warnings follow, concentrated in three clusters: exit/lifecycle correctness in the Rust
shell, tests that assert weaker things than their prose claims, and renderer-facing capability
grants with zero callers.

**Previously-accepted deferred debt (NOT re-raised as findings):** prior-review WR-04
(`security.csp: null` + `withGlobalTauri` + broad `opener:default`) and IN-01
(`sidecarSeaFsShim.ts`'s loose `system.pem` match) are recorded as tracked debt in
`deferred-items.md` per user decision GAP-D-01. They are unchanged and remain open; see the
"Deferred debt" section at the end.

## Critical Issues

### CR-01: `release-tauri.yml` never builds the renderer — every CI bundle ships without web assets

**File:** `.github/workflows/release-tauri.yml:61-158` (entire `steps:` list)
**Also:** `src-tauri/tauri.conf.json:7-8` (`frontendDist: "../build"`, `beforeBuildCommand: ""`)

**Issue:** Tauri resolves the app's web assets from `frontendDist: "../build"`, i.e.
`build/index.html` and `build/assets/*`. Those files are produced *only* by
`electron-vite build` (see `electron.vite.config.ts` — `renderer.build.outDir: 'build'`,
`input: index.html`). The release workflow's complete step list is:

```
checkout -> apt deps -> ./.github/actions/install-deps -> rust toolchain -> rust-cache
-> pnpm build:sidecar-sea -> signing-warn steps -> cert import -> build_args -> tauri-action
```

None of those build the renderer:
- `./.github/actions/install-deps` runs only `pnpm install` + `pnpm download-helper-binaries`
  (verified in `.github/actions/install-deps/action.yml`).
- `pnpm build:sidecar-sea` = `pnpm build:sidecar && esbuild … meta/buildSidecarSea.ts | node`,
  which emits `build/main/sidecar.js` and `src-tauri/binaries/…` only.
- `beforeBuildCommand` is the empty string, so the Tauri CLI runs nothing pre-bundle.
- `tauri-apps/tauri-action` does not build frontends; that is precisely what
  `beforeBuildCommand` exists for. There is not even a `build` script in `package.json` for it
  to fall back to.

Result on a real tag push: `build/` exists (created by `build:sidecar`) but contains no
`index.html`, so `tauri build` either aborts with "Unable to find your web assets" or produces
installers whose webview loads nothing. All four matrix legs are affected. Compare the Electron
pipeline, which is correct: `draft-release-mac.yml` runs `pnpm release:mac`
= `pnpm build-steam-bridge && electron-vite build && electron-builder …`.

Two further omissions in the same family, both silent:
- `pnpm build-steam-bridge` is never run, so the Phase 24 macOS Steam bridge helper
  (`build/bin/…`) is absent from macOS Tauri bundles.
- The `gh release download crossover-index` step that seeds `public/crossover-index.json.gz`
  (present in `draft-release-mac.yml`) is absent, so Tauri builds ship without the bundled
  CrossOver index snapshot.

**Fix:** Add explicit renderer/asset build steps before `tauri-action` (preferred over
`beforeBuildCommand`, since it keeps the `tauri dev` flow unchanged and makes failures
attributable to their own step):

```yaml
      - name: Build steam bridge shims (macOS only)
        if: startsWith(matrix.platform, 'macos')
        run: pnpm build-steam-bridge

      - name: Build renderer (electron-vite) — produces build/index.html for frontendDist
        run: pnpm exec electron-vite build
```

Then add a `releaseWorkflow.test.ts` assertion so this cannot regress:

```ts
test('builds the renderer before invoking tauri-action (frontendDist ../build must exist)', () => {
  const source = loadReleaseWorkflow()
  expect(source).toMatch(/electron-vite build[\s\S]*?tauri-apps\/tauri-action/)
})
```

---

### CR-02: The `windows-latest` leg cannot run the SEA sidecar build — `.bin` shims are not executable via `spawn()` on Windows

**File:** `meta/buildSidecarSea.ts:124-125` (`POSTJECT_BIN`, `ESBUILD_BIN`), used at `:371` and `:561`

**Issue:**

```ts
const POSTJECT_BIN = join('node_modules', '.bin', 'postject')
const ESBUILD_BIN = join('node_modules', '.bin', 'esbuild')
…
const result = await spawnArgv(ESBUILD_BIN, [ … ])                 // :371
const inject  = await spawnArgv(POSTJECT_BIN, postjectArgv.args)   // :561
```

`spawnArgv()` calls `child_process.spawn(command, args, { stdio: … })` with **no `shell: true`**
(correct per T-24-06). On Windows, pnpm materialises `node_modules/.bin/postject` as three files:
`postject` (a POSIX shell shim, not executable by `CreateProcess`), `postject.CMD`, and
`postject.ps1`. `spawn()` with an explicit extensionless relative path performs no PATHEXT
resolution, so the Windows leg fails inside `bundleForSea()` with `ENOENT`/`EACCES` before it
ever reaches postject — `pnpm build:sidecar-sea` fails, the step fails, and the
`windows-latest` job dies before `tauri-action` runs. The `sidecar_triple:
'x86_64-pc-windows-msvc'` matrix wiring added by 34-11 is therefore unreachable in practice.
Nothing catches this: `buildSidecarSea.test.ts` only exercises the pure argv builders, and the
pipeline has never been run (34-07 deferred).

**Fix:** Resolve the real executables rather than the shim. The cleanest T-24-06-preserving form
is argv-form, shell-free, and platform-neutral:

```ts
const ESBUILD_BIN = require.resolve('esbuild/bin/esbuild')   // run via process.execPath
const POSTJECT_BIN = require.resolve('postject/dist/cli.js')
…
await spawnArgv(process.execPath, [ESBUILD_BIN, ...esbuildArgs])
await spawnArgv(process.execPath, [POSTJECT_BIN, ...postjectArgv.args])
```

(The minimal alternative is `const BIN_EXT = process.platform === 'win32' ? '.CMD' : ''`, but a
`.CMD` still needs a shell on some Node versions, which reintroduces the T-24-06 hazard.) Add a
unit test asserting the resolved binary path is Windows-executable when
`process.platform === 'win32'`.

---

### CR-03: The updater feed can never resolve — `/releases/latest/download/` is incompatible with `prerelease: true`

**File:** `src-tauri/tauri.conf.json:42-44` (`plugins.updater.endpoints`)
**Also:** `.github/workflows/release-tauri.yml:156-157` (`releaseDraft: true`, `prerelease: true`)

**Issue:** The workflow unconditionally creates every release as a **draft + prerelease**:

```yaml
          releaseDraft: true
          prerelease: true
```

while the updater feed is hardcoded to:

```json
"endpoints": [
  "https://github.com/grayson-mitchell/GameLib/releases/latest/download/latest.json"
]
```

GitHub's `/releases/latest` (and the `/releases/latest/download/<asset>` redirect) is documented
to resolve to "the most recent **non-prerelease, non-draft** release". `latest.json` is uploaded
as an asset of a release that is, by design and by a test-guarded invariant
(`releaseWorkflow.test.ts:73-83`), always a prerelease. So the endpoint 404s forever — before
publish (draft) *and* after publish (still flagged prerelease unless a human manually unchecks
it, which is not part of the documented D-09 publish procedure). REQ-34-09's wording ("invisible
to the updater until manual publish") assumes visibility *returns* after publish; it does not.

Net effect: the entire minisign / `createUpdaterArtifacts` / pubkey apparatus is inert, and
`tauriConf.test.ts:79-85` asserts the endpoint is "correct" (it only checks the URL contains
`grayson-mitchell/GameLib`), giving false confidence.

**Fix:** Pick one and make it explicit:

- **Option A (keep prereleases):** point the feed at a stable, non-`latest` asset location the
  publish step updates, e.g. a fixed tag:
  ```json
  "endpoints": ["https://github.com/grayson-mitchell/GameLib/releases/download/updater/latest.json"]
  ```
  and have the publish procedure re-upload `latest.json` to the `updater` release.
- **Option B (keep the URL):** drop `prerelease: true` for releases intended to be
  update-visible, keeping `releaseDraft: true` as the human-review gate (a draft is already
  invisible; the prerelease flag is what breaks `latest`).

Either way, add the missing cross-file test:

```ts
test('the updater endpoint form is compatible with the workflow release flags', () => {
  const endpoint = ((loadTauriConf().plugins as any).updater.endpoints as string[])[0]
  const workflow = readFileSync(RELEASE_WORKFLOW_PATH, 'utf-8')
  if (endpoint.includes('/releases/latest/download/')) {
    expect(workflow).not.toContain('prerelease: true')
  }
})
```

## Warnings

### WR-01: `app_relaunch` bypasses `RunEvent::Exit`, so the WR-03 sidecar-cleanup fix does not cover restart

**File:** `src-tauri/src/main.rs:511-513` (`"app_relaunch"` arm), `:883-889` (exit handler)

**Issue:** `AppHandle::restart()` is `-> !`: it runs `cleanup_before_exit()` and then
execs/exits the process directly, without returning control to the event loop. The
user-supplied `run(|app_handle, event| …)` callback's `RunEvent::Exit` arm is driven only by the
event loop, so `shutdown_child()` is not guaranteed to run on the relaunch path. The result is
the exact failure mode WR-03 was filed against — an orphaned sidecar holding an authenticated
Steam session and open sockets — now *duplicated* against the fresh sidecar the relaunched shell
spawns. The `shutdown_child()` doc comment (`:133-135`) even names `app_relaunch` as a covered
path; it is not.

**Fix:** Kill the child explicitly before restarting:

```rust
"app_relaunch" => {
    if let Some(state) = app.try_state::<Arc<SidecarState>>() {
        state.shutdown_child();
    }
    app.restart();
}
```

`shutdown_child()` is already safe to call twice (kill errors on an exited child are logged and
swallowed), so a later `RunEvent::Exit` double-call is harmless.

### WR-02: `shutdown_child()` SIGKILLs the sidecar with no graceful-shutdown attempt

**File:** `src-tauri/src/main.rs:141-157`

**Issue:** `child.kill()` is `SIGKILL` on Unix and `TerminateProcess` on Windows — unmaskable and
immediate. The sidecar owns `electron-store` writes (Steam library/token stores) and in-flight
depot installs. A quit issued mid-write can truncate a store JSON file, and a quit mid-install
leaves `.acf`/partial-chunk state with no chance to run the existing cancel/cleanup paths — the
same data-integrity class as the historical "startup-resume crash on stale StateFlags" issue.
There is also no bound on `child.wait()`, so a child that somehow survives the kill hangs app
exit on the main thread.

**Fix:** Try a cooperative shutdown first, then escalate:

```rust
// best-effort graceful stop: send a shutdown frame (or close stdin for EOF), then wait briefly
let _ = self.write_raw(&serde_json::json!({ "kind": "shutdown" }));
let deadline = Instant::now() + Duration::from_secs(3);
while Instant::now() < deadline {
    if matches!(child.try_wait(), Ok(Some(_))) { return }
    thread::sleep(Duration::from_millis(100));
}
let _ = child.kill();
let _ = child.wait();
```

### WR-03: Windows signing override emits an empty `certificateThumbprint`, hard-failing CI in a half-configured state

**File:** `.github/workflows/release-tauri.yml:140-149`

**Issue:** The gate is `[ -n "$WINDOWS_CERTIFICATE" ]` only — `WINDOWS_CERT_THUMBPRINT` is never
checked:

```bash
CONFIG_OVERRIDE=$(printf -- '--config {"bundle":{"windows":{"certificateThumbprint":"%s",…}}}' "$WINDOWS_CERT_THUMBPRINT")
```

If a maintainer enrols `WINDOWS_CERTIFICATE`/`WINDOWS_CERTIFICATE_PASSWORD` but forgets the
thumbprint secret (an easy three-secret mistake), the override renders
`"certificateThumbprint":""`, tauri invokes signtool with an empty thumbprint, and the Windows
leg fails hard — directly violating the file's own stated invariant "CI must never fail on
missing certs" (`:14-18`).

Secondary: `echo "args=…" >> "$GITHUB_OUTPUT"` writes a secret-derived value with no delimiter
escaping. A thumbprint secret containing a newline would allow arbitrary step outputs to be
injected; GitHub's own guidance is a random heredoc delimiter for any non-literal output value.

**Fix:**

```bash
if [ "${{ matrix.platform }}" = "windows-latest" ] && [ -n "$WINDOWS_CERTIFICATE" ] && [ -n "$WINDOWS_CERT_THUMBPRINT" ]; then
  …
elif [ "${{ matrix.platform }}" = "windows-latest" ] && [ -n "$WINDOWS_CERTIFICATE" ]; then
  echo "::warning::WINDOWS_CERTIFICATE set but WINDOWS_CERT_THUMBPRINT missing; shipping unsigned"
  echo "args=${{ matrix.args }}" >> "$GITHUB_OUTPUT"
fi
```
and emit via a heredoc delimiter (`{ echo "args<<$DELIM"; echo "$VALUE"; echo "$DELIM"; }`).

### WR-04: `tauriShellSource.test.ts`'s comment-stripping self-test is vacuous

**File:** `src/backend/__tests__/tauriShellSource.test.ts:48-54`

**Issue:** The suite's whole premise (`:30-38`) is that `loadMainRsCode()` must strip comments so
the "does NOT contain X" assertions cannot pass on prose alone, and the self-test is supposed to
prove the stripping works:

```ts
expect(loadMainRsCode()).not.toContain('Kept alive so the child is not reaped')
```

That exact phrase was **deleted from `main.rs` by the very commit under review** (the `_child`
field doc comment was rewritten — see `main.rs:120-125`). The string now appears nowhere in the
file, so the self-test passes identically whether `loadMainRsCode()` strips comments, returns the
raw file, or returns the empty string. The stated anti-vacuous guarantee is unverified, and every
downstream `not.toContain` assertion inherits that unverified premise.

**Fix:** Self-test against a phrase that is *currently* comment-only in `main.rs`, with a
positive control:

```ts
test('a comment-only phrase from main.rs IS present raw but absent after stripping', () => {
  const raw = readFileSync(MAIN_RS_PATH, 'utf-8')
  const phrase = 'held alive so it is not reaped early' // lives only in a doc comment
  expect(raw).toContain(phrase)                    // positive control: really in the file
  expect(loadMainRsCode()).not.toContain(phrase)   // and stripping really removed it
})
```

### WR-05: `releaseWorkflow.test.ts`'s "no cache step" assertion gives false assurance

**File:** `src/backend/__tests__/releaseWorkflow.test.ts:160-164`

**Issue:**

```ts
test('has no upload-artifact or cache step that could exfiltrate the workspace (and its cert.pfx)', () => {
  expect(source).not.toContain('actions/upload-artifact')
  expect(source).not.toContain('actions/cache')
})
```

The workflow *does* contain caching — `swatinem/rust-cache@v2` (`:77-79`), which wraps
`actions/cache` internally, plus `actions/setup-node` with `cache: 'pnpm'` inside the composite
`install-deps` action. The literal-substring test sees neither. It is scoped harmlessly today
(rust-cache is limited to `./src-tauri -> target`; `cert.pfx` lives at the workspace root), but
the test asserts a property it does not verify — worse than no test, since adding a
workspace-wide cache later would leave it green.

**Fix:** Assert the real property (allowlist + scope) rather than a substring:

```ts
const ALLOWED_CACHE_ACTIONS = ['swatinem/rust-cache']
test('any cache/artifact step is on the allowlist and scoped away from the workspace root', () => {
  const uses = [...source.matchAll(/uses:\s*([^\s]+)/g)].map((m) => m[1])
  const caching = uses.filter((u) => /cache|upload-artifact/i.test(u))
  expect(caching.every((u) => ALLOWED_CACHE_ACTIONS.some((a) => u.startsWith(a)))).toBe(true)
})
```

### WR-06: `updater:default` and `shell:allow-execute` are granted to the webview with zero renderer callers

**File:** `src-tauri/capabilities/default.json:6-15`

**Issue:** A repo-wide search of `src/` finds no import of `@tauri-apps/plugin-updater` or
`@tauri-apps/plugin-shell` anywhere (the only hits are the assertion strings inside
`cargoFeatures.test.ts`). Both grants are therefore dead:

- `updater:default` exposes `plugin:updater|check` / `|download_and_install` to renderer JS that
  never calls them. It also means the phase's headline auto-update feature has **no caller at
  all** — nothing in Rust or JS ever triggers an update check, so even with CR-03 fixed the app
  would not self-update.
- `shell:allow-execute` (scoped to `{name: 'binaries/gamelib-sidecar', sidecar: true}`) is
  unnecessary by the file's own reasoning: `spawn_sidecar_packaged()` calls
  `app.shell().sidecar(...)` from **Rust**, and the comment correctly states "Rust plugin API
  calls bypass capabilities". What the grant actually buys is the ability for renderer JS
  (reachable via `withGlobalTauri: true`) to spawn *additional* sidecar processes — each a full
  backend that opens its own Steam session and writes the same `electron-store` files
  concurrently.

**Fix:** Remove `shell:allow-execute` from `capabilities/default.json` entirely (verify the
packaged sidecar still spawns — it will; the Rust path is unaffected), and either wire a real
update check (`check()` on startup behind a setting) or drop `updater:default` until a caller
exists. Add a capability-shape test asserting no plugin permission is granted without a
corresponding renderer import.

### WR-07: Node base-binary integrity check is same-origin and unsigned, but is documented as the T-34-15 supply-chain mitigation

**File:** `meta/buildSidecarSea.ts:441-482`

**Issue:** `obtainCrossNodeBinary()` downloads `node-<ver>-<dist>.tar.gz` and verifies it against
`SHASUMS256.txt` fetched from **the same host over the same channel**, and every failure message
is tagged `T-34-15`. A same-origin, unsigned checksum defends against truncated/corrupt transfers
only; an attacker able to serve a malicious tarball from `nodejs.org` (or terminate TLS in front
of the runner) serves a matching `SHASUMS256.txt` in the same breath. Node publishes
`SHASUMS256.txt.sig`, signed by the release keys, precisely for this; it is not checked. The
resulting binary is what every macOS x64 user's sidecar is built from, so the claimed mitigation
does materially less than the comments assert.

**Fix:** Verify `SHASUMS256.txt.sig` against a pinned release key, or (simpler and equally
strong) pin the expected SHA-256 per supported triple as a committed constant so the trust anchor
is the reviewed source tree rather than the download origin:

```ts
const NODE_DIST_SHA256: Record<string, string> = {
  'node-v22.11.0-darwin-x64.tar.gz': '<hash committed after manual verification>'
}
```
…and downgrade the `T-34-15` labelling in the comments to what the current check actually proves.

### WR-08: Stale comment in `buildSidecarSea.ts` contradicts the code it documents

**File:** `meta/buildSidecarSea.ts:113-115`

**Issue:**

```ts
// electron/electron-store stay external: the sidecar's Electron-guarded
// code paths never reach them at runtime outside an Electron host, and
// neither package is present for a SEA-packaged Tauri build to resolve.
```

This is the pre-fix design and is now false in two ways, both contradicted by the file's own
header (fix 2, `:37-48`) and by `bundleForSea()` (`:366-391`): the SEA bundle omits
`--packages=external` entirely (everything is inlined, including `electron-store`), and
`electron` is *aliased* to `electronStub.ts`, not left external. A maintainer reading only this
comment would reasonably re-add `--packages=external` and reintroduce the
`ERR_UNKNOWN_BUILTIN_MODULE` startup crash the header documents at length.

**Fix:** Replace the block with the actual invariant — "nothing is external; `electron` is
statically aliased to `electronStub.ts`; re-adding `--packages=external` here will crash the SEA
sidecar at startup (see fix 1 in the header)."

### WR-09: No concurrency control for four matrix legs plus two co-triggering Electron release workflows

**File:** `.github/workflows/release-tauri.yml:5-12` (the co-run claim), `:27-47` (matrix), `:151-158`

**Issue:** The header asserts as fact that this workflow and `draft-release-{mac,linux}.yml`
"publish to the SAME GitHub Release". Nothing enforces that. GitHub permits multiple *draft*
releases sharing one tag name, and there is no `concurrency:` group, no dedicated
create-the-release job, and four matrix legs (`fail-fast: false`) each invoking `tauri-action`
with the same `tagName`. Two independent create-release paths (tauri-action and
electron-builder's `-p always`) racing on the same tag can produce duplicate drafts with assets
split across them — which would also split `latest.json` from the installers it describes. This
is exactly the class of failure the deferred 34-07 live gate exists to catch, and the comment
currently reads as verified fact rather than an untested assumption.

**Fix:** Add a `concurrency` group and a single release-creating job the matrix depends on:

```yaml
concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false
```
plus a `create-release` job emitting `release_id`, consumed by the matrix via
`releaseId: ${{ needs.create-release.outputs.release_id }}`. Soften the header comment to state
the co-run behaviour is an untested assumption pending the 34-07 gate.

### WR-10: Tests assert argv/URL shapes the production build never executes

**File:** `meta/buildSidecarSea.ts:155-171` + `:561`; `:314-335` + `:426-432`
**Also:** `meta/__tests__/buildSidecarSea.test.ts:68-72`, `:157-161`

**Issue:** Two exported helpers are partly decorative:

1. `buildPostjectArgv()` returns `{ command: 'postject', args }`, and the test asserts
   `darwinArgv.command).toBe('postject')` — but `injectBlob()` ignores `.command` and spawns
   `POSTJECT_BIN` (`node_modules/.bin/postject`). The tested command string is never the one
   executed, which is how CR-02 above went unnoticed.
2. `nodeDistUrls()` has a fully-implemented Windows branch (`.zip` archive, `node.exe` inner
   path) with a dedicated test, but `obtainCrossNodeBinary()` rejects every `win32` triple at
   `:426-432` before ever calling it — and extraction is hardcoded to `tar -xzf`, which cannot
   read a `.zip`. `nodeDistName()`'s `aarch64-unknown-linux-gnu` mapping is likewise mapped and
   tested but unreachable (no matrix leg).

**Fix:** Have `injectBlob()` consume `buildPostjectArgv().command` (with the resolution fix from
CR-02 applied *inside* the builder, so the tested value *is* the executed value), and either
delete the Windows branch of `nodeDistUrls()` or implement zip extraction so the branch is real.
Tests asserting unreachable behaviour should be deleted alongside it.

## Info

### IN-01: No timeouts on `fetch()` or `spawnArgv()` in the SEA build script

**File:** `meta/buildSidecarSea.ts:195-212`, `:442`, `:454`

**Issue:** Neither `fetch()` call nor any `spawnArgv()` invocation carries a timeout or
`AbortSignal`. A stalled nodejs.org connection or a wedged `tar`/`postject` hangs the CI step
until the job-level timeout, producing a very long billed run with no diagnostic.

**Fix:** `fetch(url, { signal: AbortSignal.timeout(60_000) })`, plus a `setTimeout` +
`child.kill()` guard inside `spawnArgv`.

### IN-02: `hostTriple()` silently mislabels arm64 Windows and arm64 Linux hosts

**File:** `meta/buildSidecarSea.ts:215-225`

**Issue:** `process.platform === 'win32'` returns `x86_64-pc-windows-msvc` and the fallthrough
returns `x86_64-unknown-linux-gnu` regardless of `process.arch`. On an arm64 Windows or arm64
Linux dev machine, `triple === hostTriple()` is true, so `copyNodeBinary()` copies the arm64
`process.execPath` and labels it x86_64 — the exact relabeling GAP-D-02 rejected, and outside the
darwin-only `lipo` gate's reach.

**Fix:** Branch on `process.arch` for all three platforms, or `throw` for unsupported
host arch/platform combinations rather than guessing.

### IN-03: Two small comment/message inaccuracies left by the gap fixes

**File:** `src-tauri/src/main.rs:876`; `src/backend/__tests__/tauriShellSource.test.ts:44`

**Issue:** (a) `.expect("error while running the GameLib Tauri shell")` now attaches to
`.build()`, not `.run()`, so a *construction* failure reports a *running* error. (b) the
comment-stripper's `line.replace(/\/\/.*$/, '')` also truncates any Rust string literal
containing `//` (e.g. a future `"steam://…"` or `"https://…"` literal in code), silently
weakening whichever assertion depends on that line.

**Fix:** (a) `.expect("failed to build the GameLib Tauri shell")`. (b) Note the limitation in the
helper's doc comment, or skip the trailing-comment strip on lines containing a quote character.

---

## Deferred debt (recorded, not re-raised)

Per user decision GAP-D-01 the following remain open and accepted in `deferred-items.md`. Both
were re-confirmed present during this review and are deliberately **not** counted in the findings
above:

- **WR-04 (prior review):** `src-tauri/tauri.conf.json:21-23` `security.csp: null` +
  `app.withGlobalTauri: true` + `opener:default` in `capabilities/default.json`. Note that WR-06
  above compounds it: `withGlobalTauri` is what makes the dead `shell:allow-execute` /
  `updater:default` grants renderer-reachable in the first place.
- **IN-01 (prior review):** `meta/sidecarSeaFsShim.ts:46-48` loose `system.pem` suffix match.

Also unchanged and out of scope: 34-07's live `v*` tag-push gate is deferred by user decision,
which is why CR-01/CR-02/CR-03 above are still latent rather than observed failures.

---

_Reviewed: 2026-07-24T20:15:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---
created: 2026-09-23T00:00:00.000Z
title: "`isWritable_windows` matches ACLs by individual username, so it returns FALSE for every path outside the user's own profile — hiding disk space and showing a false 'not writable' warning on all Windows installs"
area: filesystem
severity: major
platform: windows
ready: code
found_by: "Live Phase 38 sitting on the operator's Windows 11 machine, 2026-09-23, scoring 38-S08's free-space line"
files:
  - src/backend/utils/filesystem/windows.ts:63-92
  - src/backend/sidecar/shellFilesFlowRegistration.ts:316-338
  - src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx:493-501
  - src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx:695-726
---

# `isWritable_windows` is true only inside the user's own profile

`isWritable_windows` runs `Get-Acl <path>).Access`, then:

```js
const userName = userInfo().username
const userAccess = parsedAccess.find((entry) =>
  entry.IdentityReference.endsWith(userName)
)
if (!userAccess) return false
```

It looks for an ACE naming the **individual user**. Windows grants write access through **GROUPS**
(`BUILTIN\Users`, `NT AUTHORITY\Authenticated Users`), and only the user's own profile tree
normally carries an explicit per-user ACE. So this returns `false` for nearly every path outside
`C:\Users\<name>`.

## Measured on the operator's Windows 11 machine, 2026-09-23

Reproduced by running the SAME `Get-Acl` the code runs and applying the same `endsWith(userName)`
predicate (username `grays`):

| Path | ACL identities | Predicate |
| ---- | -------------- | --------- |
| `C:\Users\grays` | includes an explicit per-user ACE | **MATCH -> true** |
| `C:\Users\grays\Projects\GameLib` | includes an explicit per-user ACE | **MATCH -> true** |
| `C:\Program Files (x86)\Steam` | `SYSTEM`, `BUILTIN\Users`, `TrustedInstaller`, `BUILTIN\Administrators`, `CREATOR OWNER`, app packages | **no match -> FALSE** |
| `D:\SteamLibrary` | `BUILTIN\Administrators`, `SYSTEM`, `NT AUTHORITY\Authenticated Users`, `BUILTIN\Users` | **no match -> FALSE** |
| `D:\` | same group-only shape | **no match -> FALSE** |

`D:\SteamLibrary` is plainly writable in practice — Steam installs games into it. The predicate is
simply asking the wrong question.

**Why it was never noticed:** the only paths it gets right are inside the user profile, which is
where GameLib's DEFAULT install path lives. Steam libraries never are.

## Blast radius — two user-visible symptoms, both on ALL Windows installs

`isWritable` has exactly one consumer, `checkDiskSpace`
(`shellFilesFlowRegistration.ts:326`), which returns it as `validPath`. Both dialogs read it:

1. **Steam install-options dialog** — the free-space line renders only when
   `gating.freeSpaceLine && diskSpace && diskSpace.validPath && diskSpace.validFlatpakPath`
   (`SteamDialog/index.tsx:493-497`). `validPath` false means the line NEVER renders on Windows
   for a Steam library. **This is the direct cause of `38-S08`'s row-4 FAIL** — the gating verdict
   itself is correct (`steamSectionGating.ts:284`, `freeSpaceLine = libraryDropdown`), so the
   matrix is fine and only the render condition fails.
2. **The generic install dialog (Epic / GOG / Amazon)** — `DownloadDialog/index.tsx:718-724`
   renders `!validPath` as a literal warning: **"Warning: path might not be writable."** Every
   Windows user installing to any path outside their profile sees a permanent, false warning, and
   loses the "Space Available / After Install" readout at `:695-716`.

Symptom 2 was NOT observed live in this sitting — it is read from source and should be confirmed
on the next Windows run. Symptom 1 WAS observed.

**Not a blocker, which is why it has survived:** install is not gated on `validPath` (the enable
condition at `DownloadDialog/index.tsx:593` reads `validFlatpakPath`, not `validPath`). It
degrades information and cries wolf; it does not stop anyone installing.

## Fix direction — not prescriptive

The predicate should answer "can this process write here", which an ACL identity-string match
cannot do: it would have to resolve the user's full group membership, including nested groups, and
weigh deny ACEs. A direct probe — attempt a write and catch the failure, or an `access(W_OK)`-style
check — answers the real question without reimplementing Windows authorization in JavaScript.

Before changing it, check what `isWritable_unix` does so the two platforms do not end up answering
different questions, and note that `genericSpawnWrapper('powershell', ...)` per disk-space probe
is itself a cost this rewrite could remove.

## Watch out

`AccessControlEntry.array().parse(JSON.parse(stdout))` is wrapped in a `try { } catch { return
false }` (`windows.ts:75-80`). **A single-entry ACL makes `ConvertTo-Json` emit an OBJECT, not an
array**, so the array parse throws and the function returns `false` for a second, independent
reason. Any rewrite should not simply patch the identity match and leave this shape in place.

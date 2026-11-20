# 260901-i8i BASELINE — installed app BEFORE the x64/darwin removal

Taken: 2026-09-01 13:22:31
Method: apparent bytes (stat -f %z summed), NOT du. Compare OLD SHIPPED vs NEW SHIPPED only.

```
app ctime : 2026-09-01 11:22:24  (creation)
app mtime : 2026-09-01 11:22:24
app apparent bytes TOTAL : 336375854

x64/darwin     files=4     symlinks=0    bytes=46423272
x64/win32      files=2     symlinks=0    bytes=211452
arm64/darwin   files=279   symlinks=12   bytes=100707073
arm64/win32    ABSENT
x64/linux      ABSENT
arm64/linux    ABSENT

-- dangling symlinks under arm64/darwin --
DANGLING_COUNT=0
```

## Confirmations against the task brief

All four brief numbers reproduce exactly on the installed artifact:

| claim | brief | measured | |
|---|---|---|---|
| `x64/darwin` | 4 files / 46,423,272 B | 4 files / 46,423,272 B | ✅ |
| `arm64/darwin` | 279 files / 12 links / 100,707,073 B | identical | ✅ |
| `DANGLING_COUNT` | 0 | 0 | ✅ |
| installed `.app` | 336,375,854 B | 336,375,854 B | ✅ |

## A finding the brief did NOT contain

**The shipped macOS bundle carries only THREE bin trees, and `x64/win32` is tiny.**

```
x64/darwin    4 files    46,423,272 B   <- to be removed
arm64/darwin  279 files 100,707,073 B   <- keep (e7o's symlink fix)
x64/win32     2 files       211,452 B   <- KEEP: 34.18 D-07 non-goal #1
arm64/win32, x64/linux, arm64/linux     ABSENT
```

The todo's line-60 figures (`x64/win32 52M`, `arm64/win32 38M`) describe the
**pre-8rm** bundle when `frontendDist` embedded everything. They are NOT the
current shipped state and must not be used as this task's baseline — using them
would reproduce exactly the bad-subtraction error that has already produced
three retracted rationales on this todo.

**`x64/win32` shipping only 2 files / 211,452 B makes criterion 2 cheap to
prove positively**, and makes it a sharp over-reach detector: if a sweep
wrongly keys on `x64` rather than `x64/darwin`, this tree vanishes and the
count goes 2 -> 0. Worth asserting the exact byte count, not just presence.

## Prediction to check after the build

`336,375,854 - 46,423,272 = 289,952,582 B` expected for the new `.app`.

This subtraction is OLD SHIPPED minus the REMOVED SHIPPED SUBTREE — both terms
measured on the same artifact above, which is the legitimate pair. Any shortfall
must first be re-checked as an arithmetic/pairing error before any mechanism is
invented to explain it.

**Superseded 2026-09-01 by quick-260901-kl2: 277 files / 12 symlinks / 97,884,865 B after
`steam_api.pdb` + `steam_api_shim.lib` (2,822,208 B) stopped shipping. The figure above
remains the correct record for its own date.**

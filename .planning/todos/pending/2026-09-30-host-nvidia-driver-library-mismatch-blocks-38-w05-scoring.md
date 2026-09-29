---
created: 2026-09-30
title: 'The host NVIDIA kernel module (580.159.03) and userspace library (580.173.02) mismatch aborts every WebKitGTK launch with EGL_NOT_INITIALIZED, so 38-W05 cannot be scored until it is fixed'
area: release
severity: medium
platform: linux
ready: human
source: quick-260930-9l9
files:
  - .planning/quick/260930-9l9-re-run-38-w05-smoke-launch-against-the-n/evidence/
  - .planning/spikes/029-linux-embed-allocation-reliability/README.md
  - .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md
---

## What was observed

Sitting 11 of Phase 38 (quick 260930-9l9) launched the ubuntu-22.04-built AppImage (sha256
d7648c37e7721bcb10fc56018b41e531b8cb6a649856d8daeffb24eddcf35943) directly under a fake HOME with no
workaround. A window titled GameLib appeared at 270 ms and the shell died with SIGABRT 364 ms after
spawn. The scored stderr, in full:

    Gtk-Message: 07:18:00.312: Failed to load module "canberra-gtk-module"
    Gtk-Message: 07:18:00.313: Failed to load module "canberra-gtk-module"
    Could not create GBM EGL display: EGL_NOT_INITIALIZED. Aborting...

At launch `nvidia-smi` printed `Failed to initialize NVML: Driver/library version mismatch`; the kernel
module is 580.159.03 (`/proc/driver/nvidia/version`), the userspace `libnvidia-glcore` is 580.173.02,
kernel 7.0.11-76070011-generic, booted 2026-09-29 21:55:41. The pre-registered rule (mismatch present
AND EGL/GBM signature in the scored streams) scored the sitting CONFOUNDED and `38-W05` stays open.

With `WEBKIT_DISABLE_DMABUF_RENDERER=1` (diagnostic arm, `SCORED=no`, NOT a discharge) the same
artifact launched in 277 ms, kept 11 of 11 samples alive and visible, kept its bundled sidecar alive
at s=10 and t=30, and showed an interactive Library screen. stderr there still carried
`libEGL warning: egl: failed to create dri2 screen`, so the GPU stack stays broken.

## What is not known

Whether the artifact launches WITHOUT a workaround on a healthy GPU stack; only a re-run after the
mismatch is fixed can say. Sitting 9's `tauri dev` build ran on the same boot without an abort, so a
dev build and the packaged AppImage may differ in how they reach EGL; that was not investigated here.

## Action for the operator

Fix the kernel-module/userspace mismatch (make the running kernel's module match the installed
userspace driver, for example by rebooting after the module builds for kernel 7.0.11, or by aligning
the package versions), confirm `nvidia-smi` runs, then re-run `38-W05`. The same mismatch blocks
`.planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md`
(spike 029 addendum), which is blocked on the same state.

## Evidence

`.planning/quick/260930-9l9-re-run-38-w05-smoke-launch-against-the-n/evidence/` (`smoke-run.txt`,
`smoke-run-diag.txt`, `verdict.txt`, `session.txt`, `baseline.env`).

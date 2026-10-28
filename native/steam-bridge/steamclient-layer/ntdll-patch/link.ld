/*
 * Origin: NotProtonNot/NotProton, commit 8db22adb237e6ea640a5af148b69b93709daf50c, path ntdll-patch/link.ld
 * Licence: GPL-3.0 (see COPYING beside this file). Upstream carries no per-file copyright line;
 * the NotProton project states GPLV3 in its NOTICE file.
 * Ported by GameLib per Phase 56 D-03: x86_64 only, logic unchanged from upstream.
 * The payload is position-dependent per CrossOver build. meta/buildDrmNativeParts.ts supplies the
 * addresses via --defsym (CAVE_VA, BM_RESUME, LDR_GETDLLHANDLE, LDR_LOADDLL, NT_PROTECT) and the
 * -D macros (WM_REG, SCRATCH_REG, LOAD_PATH_SLOT, STOLEN_BYTES).
 */
/* x86_64 ntdll.dll cave layout, link time only */
SECTIONS {
  . = CAVE_VA;
  .cave CAVE_VA : {
    shim.o(.text)
    *(.text .text.*)
    . = ALIGN(16);
    *(.rdata .rdata.* .rodata .rodata.*)
  }
  /DISCARD/ : { *(.pdata) *(.xdata) *(.bss) *(.data) *(.comment) *(.note.*) }
}

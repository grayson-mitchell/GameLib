// Origin: NotProtonNot/NotProton, commit 8db22adb237e6ea640a5af148b69b93709daf50c, path ntdll-patch/shim.S
// Licence: GPL-3.0 (see COPYING beside this file). Upstream carries no per-file copyright line;
// the NotProton project states GPLV3 in its NOTICE file.
// Ported by GameLib per Phase 56 D-03: x86_64 only, logic unchanged from upstream.
// The payload is position-dependent per CrossOver build. meta/buildDrmNativeParts.ts supplies the
// addresses via --defsym (CAVE_VA, BM_RESUME, LDR_GETDLLHANDLE, LDR_LOADDLL, NT_PROTECT) and the
// -D macros (WM_REG, SCRATCH_REG, LOAD_PATH_SLOT, STOLEN_BYTES).
// Entry shim (GAS/AT&T) for the build_module steamclient64 trampoline detour.


    .intel_syntax noprefix
    .text
    .globl shim_entry3

shim_entry3:
    push    SCRATCH_REG
    mov     SCRATCH_REG, [rsp + (LOAD_PATH_SLOT + 8)]    
    push    rax
    push    rcx
    push    rdx
    push    rsi
    push    rdi
    push    r8
    push    r9
    push    r10
    push    r11
    // align stack to 16 and reserve shadow + ctx table 
    mov     r10, rsp                // remember unaligned rsp 
    and     rsp, -16
    sub     rsp, 0x60
    mov     [rsp+0x58], r10         // save pre-align rsp for exact restore 
    // ctx table at [rsp+0x38..0x4f]: {get_dll_handle, load_dll, protect} 
    lea     rax, [rip + LDR_GETDLLHANDLE]
    mov     [rsp+0x38], rax
    lea     rax, [rip + LDR_LOADDLL]
    mov     [rsp+0x40], rax
    lea     rax, [rip + NT_PROTECT]
    mov     [rsp+0x48], rax
    // detour_build_module(ctx, wm, load_path) 
    lea     rcx, [rsp+0x38]         // &ctx 
    mov     rdx, WM_REG             // wm 
    mov     r8, SCRATCH_REG         // load_path 
    call    detour_build_module
    mov     rsp, [rsp+0x58]         // restore pre-align rsp 
    pop     r11
    pop     r10
    pop     r9
    pop     r8
    pop     rdi
    pop     rsi
    pop     rdx
    pop     rcx
    pop     rax
    pop     SCRATCH_REG
    .byte   STOLEN_BYTES
    jmp     BM_RESUME

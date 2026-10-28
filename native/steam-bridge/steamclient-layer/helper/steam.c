/*
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * GameLib game-process helper (steam.exe) for DRM mode.
 *
 * Origin: a C port of the game-process half of NotProtonNot/NotProton steam-shim/steam.cpp
 * (commit 8db22adb237e6ea640a5af148b69b93709daf50c), itself a port of Proton 9.0 steam_helper.
 * Licence: BSD-3-Clause, see LICENSE beside this file. Original notice:
 *   Copyright (c) 2015, 2019, 2020, 2021, 2022 Valve Corporation. All rights reserved.
 *
 * Built with `zig cc -target x86_64-windows-gnu` by meta/buildDrmNativeParts.ts. It needs no
 * Steamworks headers and no Wine tree: pure Win32, linked against kernel32, user32 and advapi32.
 *
 * The file name MUST stay steam.exe: lsteamclient takes its trace role from the basename of
 * GetModuleFileNameW(NULL). This helper writes no trace lines of its own.
 *
 * Deliberately omitted (Phase 56 D-07, D-21): every write to the local-machine registry hive
 * (spike 036: it diverts the stub into steam.exe -applaunch), the DRM responder thread, any
 * start-ACK handling, VR, anti-cheat bridges, and forwarding of relaunch requests to a Steam
 * client. The helper stays the game's parent until the game exits.
 */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <string.h>
#include <wchar.h>

typedef LONG (NTAPI *nt_set_information_process_t)(HANDLE, ULONG, PVOID, ULONG);
typedef void (CDECL *init_registry_t)(void);

static void fail(const char *msg, int code)
{
    fprintf(stderr, "gamelib-steam-helper: %s\n", msg);
    fflush(stderr);
    ExitProcess((UINT)code);
}

/* Skip the first (quoted or bare) token of the raw command line; return the rest verbatim. */
static const WCHAR *skip_first_token(const WCHAR *p)
{
    if (*p == L'"')
    {
        p++;
        while (*p && *p != L'"') p++;
        if (*p == L'"') p++;
    }
    else
    {
        while (*p && *p != L' ' && *p != L'\t') p++;
    }
    while (*p == L' ' || *p == L'\t') p++;
    return p;
}

static int starts_with_nocase(const WCHAR *s, const WCHAR *prefix)
{
    size_t n = wcslen(prefix);
    return _wcsnicmp(s, prefix, n) == 0;
}

static void set_sz(HKEY root, const WCHAR *subkey, const WCHAR *name, const WCHAR *value)
{
    HKEY key;
    if (RegCreateKeyExW(root, subkey, 0, NULL, 0, KEY_SET_VALUE, NULL, &key, NULL) != ERROR_SUCCESS)
        return;
    RegSetValueExW(key, name, 0, REG_SZ, (const BYTE *)value, (DWORD)((wcslen(value) + 1) * sizeof(WCHAR)));
    RegCloseKey(key);
}

static void set_dword(HKEY root, const WCHAR *subkey, const WCHAR *name, DWORD value)
{
    HKEY key;
    if (RegCreateKeyExW(root, subkey, 0, NULL, 0, KEY_SET_VALUE, NULL, &key, NULL) != ERROR_SUCCESS)
        return;
    RegSetValueExW(key, name, 0, REG_DWORD, (const BYTE *)&value, sizeof(value));
    RegCloseKey(key);
}

static void write_registry(const WCHAR *steam_dir, const WCHAR *client64, const WCHAR *client32, const WCHAR *exe)
{
    static const WCHAR steam_key[] = L"Software\\Valve\\Steam";
    static const WCHAR active_key[] = L"Software\\Valve\\Steam\\ActiveProcess";

    set_dword(HKEY_CURRENT_USER, active_key, L"pid", GetCurrentProcessId());
    set_sz(HKEY_CURRENT_USER, active_key, L"SteamClientDll64", client64);
    set_sz(HKEY_CURRENT_USER, active_key, L"SteamClientDll", client32);
    set_sz(HKEY_CURRENT_USER, active_key, L"Universe", L"Public");
    set_sz(HKEY_CURRENT_USER, active_key, L"SteamPath", steam_dir);
    set_sz(HKEY_CURRENT_USER, steam_key, L"SteamPath", steam_dir);
    set_sz(HKEY_CURRENT_USER, steam_key, L"SteamExe", exe);
}

static DWORD WINAPI create_steam_window(void *arg)
{
    static WNDCLASSEXW wndclass = { sizeof(WNDCLASSEXW) };
    static const WCHAR class_name[] = L"vguiPopupWindow";
    MSG msg;
    (void)arg;

    wndclass.lpfnWndProc = DefWindowProcW;
    wndclass.lpszClassName = class_name;
    RegisterClassExW(&wndclass);
    /* No WS_VISIBLE: the window only has to exist. */
    CreateWindowW(class_name, L"Steam", WS_POPUP, 40, 40, 400, 300, NULL, NULL, NULL, NULL);

    while (GetMessageW(&msg, NULL, 0, 0))
    {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
    return 0;
}

int main(void)
{
    WCHAR game_id[16];
    WCHAR exe_path[MAX_PATH + 1];
    WCHAR steam_dir[MAX_PATH + 1];
    WCHAR client64[MAX_PATH + 32];
    WCHAR client32[MAX_PATH + 32];
    const WCHAR *rest;
    WCHAR *cmdline, *slash;
    DWORD n, i, rc = 0;
    HANDLE ev_lock, ev_ipc;
    HMODULE lsteam, ntdll;
    init_registry_t init_registry;
    nt_set_information_process_t set_info;
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;

    rest = skip_first_token(GetCommandLineW());
    if (!*rest)
        fail("no game command", 2);
    if (starts_with_nocase(rest, L"-applaunch") || starts_with_nocase(rest, L"steam://"))
        fail("refusing steam relaunch request", 3);

    n = GetEnvironmentVariableW(L"SteamGameId", game_id, 16);
    if (n == 0 || n > 10)
        fail("SteamGameId missing or invalid", 2);
    for (i = 0; i < n; i++)
        if (game_id[i] < L'0' || game_id[i] > L'9')
            fail("SteamGameId missing or invalid", 2);

    n = GetModuleFileNameW(NULL, exe_path, MAX_PATH);
    if (n == 0 || n >= MAX_PATH)
        fail("cannot determine helper path", 2);
    wcscpy(steam_dir, exe_path);
    slash = wcsrchr(steam_dir, L'\\');
    if (!slash)
        fail("cannot determine steam directory", 2);
    slash[1] = 0; /* keep the trailing backslash */
    if (wcslen(steam_dir) + 20 > MAX_PATH)
        fail("steam directory path too long", 2);
    swprintf(client64, MAX_PATH + 32, L"%lssteamclient64.dll", steam_dir);
    swprintf(client32, MAX_PATH + 32, L"%lssteamclient.dll", steam_dir);

    ev_lock = CreateEventW(NULL, FALSE, FALSE, L"Steam3Master_SharedMemLock");
    ev_ipc = CreateEventW(NULL, FALSE, FALSE, L"Global\\Valve_SteamIPC_Class");
    (void)ev_lock;
    (void)ev_ipc; /* handles stay open for the helper's lifetime */

    CreateThread(NULL, 0, create_steam_window, NULL, 0, NULL);

    write_registry(steam_dir, client64, client32, exe_path);

    lsteam = LoadLibraryW(L"lsteamclient");
    init_registry = lsteam ? (init_registry_t)GetProcAddress(lsteam, "steamclient_init_registry") : NULL;
    if (init_registry)
        init_registry();
    else
        fprintf(stderr, "gamelib-steam-helper: steamclient_init_registry unavailable\n");

    cmdline = _wcsdup(rest);
    if (!cmdline)
        fail("out of memory", 4);
    memset(&si, 0, sizeof(si));
    si.cb = sizeof(si);
    memset(&pi, 0, sizeof(pi));
    /* NULL environment: GAMELIB_DRM_TRACE_FILE, SteamGameId and SteamAppId are inherited. */
    if (!CreateProcessW(NULL, cmdline, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi))
    {
        char buf[64];
        snprintf(buf, sizeof(buf), "CreateProcess failed %lu", GetLastError());
        fail(buf, 4);
    }
    CloseHandle(pi.hThread);

    ntdll = GetModuleHandleW(L"ntdll.dll");
    set_info = ntdll ? (nt_set_information_process_t)GetProcAddress(ntdll, "NtSetInformationProcess") : NULL;
    if (set_info)
    {
        HANDLE wait_handle = pi.hProcess;
        /* ProcessWineMakeProcessSystem; failure is ignored so the binary also loads off Wine. */
        set_info(GetCurrentProcess(), 1000, &wait_handle, sizeof(wait_handle));
    }

    FreeConsole();
    WaitForSingleObject(pi.hProcess, INFINITE);
    GetExitCodeProcess(pi.hProcess, &rc);
    CloseHandle(pi.hProcess);
    return (int)rc;
}

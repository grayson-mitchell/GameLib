#
# COMMITTED EXCERPT -- regenerate, never hand-edit.
#
# Source: ~/Library/Application Support/GameLib/tools/winetricks
# Winetricks version: 20260125-next
# sha256: f35c29737ca08a583569e6a3752d52fbe23333c5acfad5f16c4177d25eaf3f4b
# Extracted: 2026-10-10
#
# This excerpt contains, verbatim from the pinned script:
#   1. Every `w_metadata` block (header line through its final continuation
#      line), for all 567 verbs, EXCEPT localized `title_<lang>=` continuation
#      lines (dropped -- no field this phase reads consumes them).
#   2. The complete `load_<name>()` function bodies, verbatim, for the 11
#      verbs this plan's tests exercise directly: foobar2000, utorrent,
#      3dmark03, 3dmark06, stalker_pripyat_bench, unigine_heaven,
#      gdiplus_winxp, protectionid, fontxplorer, ubisoftconnect, d3dx9.
#
# Generated with (run against the pinned script, from the GameLib repo root):
#   awk -f extract.awk "$HOME/Library/Application Support/GameLib/tools/winetricks" > winetricks-20260125-next.metadata.sh
# where extract.awk is:
#   BEGIN { in_block=0; in_func=0 }
#   in_block {
#       if ($0 ~ /^[ \t]+title_[A-Za-z0-9]+=/) {
#           if ($0 !~ /\\$/) { in_block=0 }
#           next
#       }
#       print
#       if ($0 !~ /\\$/) { in_block=0 }
#       next
#   }
#   in_func {
#       print
#       if ($0 == "}") { in_func=0 }
#       next
#   }
#   /^w_metadata[ \t]+/ {
#       in_block=1
#       print
#       if ($0 !~ /\\$/) { in_block=0 }
#       next
#   }
#   /^load_(foobar2000|utorrent|3dmark03|3dmark06|stalker_pripyat_bench|unigine_heaven|gdiplus_winxp|protectionid|fontxplorer|ubisoftconnect|d3dx9)\(\)[ \t]*$/ {
#       in_func=1
#       print
#       next
#   }
#
# Licence: winetricks itself is distributed under the GNU Lesser General
# Public License, version 2.1 or (at your option) any later version
# (LGPL-2.1+) -- see the pinned script's own header, lines 81-95, for the
# full notice. This excerpt is reproduced here under the same terms, solely
# as a committed, reproducible test fixture.
#
w_metadata amstream dlls \
    title="MS amstream.dll" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/amstream.dll"
w_metadata art2kmin dlls \
    title="MS Access 2000 runtime" \
    publisher="Microsoft" \
    year="2000" \
    media="download" \
    file1="art2kmin.exe" \
    installed_file1="${W_COMMONFILES_X86_WIN}/Microsoft Shared/MSDesigners98/MDT2DBNS.DLL"
w_metadata art2k7min dlls \
    title="MS Access 2007 runtime" \
    publisher="Microsoft" \
    year="2007" \
    media="download" \
    file1="AccessRuntime.exe" \
    installed_file1="${W_COMMONFILES_X86_WIN}/Microsoft Shared/OFFICE12/ACEES.DLL"
w_metadata atmlib dlls \
    title="Adobe Type Manager" \
    publisher="Adobe" \
    year="2009" \
    media="download" \
    file1="../win2ksp4/W2KSP4_EN.EXE" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/atmlib.dll"
w_metadata avifil32 dlls \
    title="MS avifil32" \
    publisher="Microsoft" \
    year="2009" \
    media="download" \
    file1="windowsserver2003.windowsxp-kb971557-x64-enu_32943d879a20893dace5191677c4e499aaef0ef8.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/avifil32.dll"
w_metadata cabinet dlls \
    title="Microsoft cabinet.dll" \
    publisher="Microsoft" \
    year="2002" \
    media="download" \
    file1="MDAC_TYP.EXE" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/cabinet.dll"
w_metadata cmd dlls \
    title="MS cmd.exe" \
    publisher="Microsoft" \
    year="2004" \
    media="download" \
    file1="Q811493_W2K_SP4_X86_EN.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/cmd.exe"
w_metadata cnc_ddraw dlls \
    title="Reimplentation of ddraw for CnC games" \
    homepage="https://github.com/FunkyFr3sh/cnc-ddraw" \
    publisher="CnCNet" \
    year="2021" \
    media="download" \
    file1="cnc-ddraw-v7.0.0.0.zip" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/Shaders/readme.txt"
w_metadata comctl32 dlls \
    title="MS common controls 5.80" \
    publisher="Microsoft" \
    year="2001" \
    media="download" \
    file1="CC32inst.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/comctl32.dll"
w_metadata comctl32ocx dlls \
    title="MS comctl32.ocx and mscomctl.ocx, comctl32 wrappers for VB6" \
    publisher="Microsoft" \
    year="2012" \
    media="download" \
    file1="../vb6sp6/VB60SP6-KB2708437-x86-ENU.msi" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/mscomctl.ocx"
w_metadata comdlg32ocx dlls \
    title="Common Dialog ActiveX Control for VB6" \
    publisher="Microsoft" \
    year="2012" \
    media="download" \
    file1="../vb6sp6/VB60SP6-KB2708437-x86-ENU.msi" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/comdlg32.ocx"
w_metadata crypt32 dlls \
    title="MS crypt32" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../win7sp1/windows6.1-KB976932-X64.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/crypt32.dll"
w_metadata crypt32_winxp dlls \
    title="MS crypt32" \
    publisher="Microsoft" \
    year="2004" \
    media="download" \
    file1="../winxpsp3/WindowsXP-KB936929-SP3-x86-ENU.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/crypt32.dll"
w_metadata binkw32 dlls \
    title="RAD Game Tools binkw32.dll" \
    publisher="RAD Game Tools, Inc." \
    year="2000" \
    media="download" \
    file1="__32-binkw32.dll3.0.0.0.zip" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/binkw32.dll"
w_metadata d2gl dlls \
    title="Diablo 2 LoD Glide to OpenGL Wrapper" \
    publisher="Bayaraa" \
    year="2023" \
    media="download" \
    file1="D2GL.v1.3.3.zip" \
    installed_file1="${W_PROGRAMS_X86_WIN}/Diablo II/glide3x.dll" \
    homepage="https://github.com/bayaraa/d2gl"
w_metadata d3dcompiler_42 dlls \
    title="MS d3dcompiler_42.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dcompiler_42.dll"
w_metadata d3dcompiler_43 dlls \
    title="MS d3dcompiler_43.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dcompiler_43.dll"
w_metadata d3dcompiler_46 dlls \
    title="MS d3dcompiler_46.dll" \
    publisher="Microsoft" \
    year="2012" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dcompiler_46.dll"
w_metadata d3dcompiler_47 dlls \
    title="MS d3dcompiler_47.dll" \
    publisher="Microsoft" \
    year="2013" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dcompiler_47.dll"
w_metadata d3drm dlls \
    title="MS d3drm.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3drm.dll"
w_metadata d3dx9 dlls \
    title="MS d3dx9_??.dll from DirectX 9 redistributable" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx9_43.dll"
load_d3dx9()
{
    helper_directx_Jun2010

    # Kinder, less invasive directx - only extract and override d3dx9_??.dll
    w_try_cabextract -d "${W_TMP}" -L -F '*d3dx9*x86*' "${W_CACHE}"/directx9/${DIRECTX_NAME}

    for x in "${W_TMP}"/*.cab; do
        w_try_cabextract -d "${W_SYSTEM32_DLLS}" -L -F 'd3dx9*.dll' "${x}"
    done

    if test "${W_ARCH}" = "win64"; then
        w_try_cabextract -d "${W_TMP}" -L -F '*d3dx9*x64*' "${W_CACHE}"/directx9/${DIRECTX_NAME}

        for x in "${W_TMP}"/*x64.cab; do
            w_try_cabextract -d "${W_SYSTEM64_DLLS}" -L -F 'd3dx9*.dll' "${x}"
        done
    fi

    # For now, not needed, but when Wine starts preferring our builtin dll over native it will be.
    w_override_dlls native d3dx9_24 d3dx9_25 d3dx9_26 d3dx9_27 d3dx9_28 d3dx9_29 d3dx9_30
    w_override_dlls native d3dx9_31 d3dx9_32 d3dx9_33 d3dx9_34 d3dx9_35 d3dx9_36 d3dx9_37
    w_override_dlls native d3dx9_38 d3dx9_39 d3dx9_40 d3dx9_41 d3dx9_42 d3dx9_43
}
w_metadata d3dx9_24 dlls \
    title="MS d3dx9_24.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx9_24.dll"
w_metadata d3dx9_25 dlls \
    title="MS d3dx9_25.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx9_25.dll"
w_metadata d3dx9_26 dlls \
    title="MS d3dx9_26.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx9_26.dll"
w_metadata d3dx9_27 dlls \
    title="MS d3dx9_27.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx9_27.dll"
w_metadata d3dx9_28 dlls \
    title="MS d3dx9_28.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx9_28.dll"
w_metadata d3dx9_29 dlls \
    title="MS d3dx9_29.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx9_29.dll"
w_metadata d3dx9_30 dlls \
    title="MS d3dx9_30.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx9_30.dll"
w_metadata d3dx9_31 dlls \
    title="MS d3dx9_31.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx9_31.dll"
w_metadata d3dx9_32 dlls \
    title="MS d3dx9_32.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx9_32.dll"
w_metadata d3dx9_33 dlls \
    title="MS d3dx9_33.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx9_33.dll"
w_metadata d3dx9_34 dlls \
    title="MS d3dx9_34.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx9_34.dll"
w_metadata d3dx9_35 dlls \
    title="MS d3dx9_35.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx9_35.dll"
w_metadata d3dx9_36 dlls \
    title="MS d3dx9_36.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx9_36.dll"
w_metadata d3dx9_37 dlls \
    title="MS d3dx9_37.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx9_37.dll"
w_metadata d3dx9_38 dlls \
    title="MS d3dx9_38.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx9_38.dll"
w_metadata d3dx9_39 dlls \
    title="MS d3dx9_39.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx9_39.dll"
w_metadata d3dx9_40 dlls \
    title="MS d3dx9_40.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx9_40.dll"
w_metadata d3dx9_41 dlls \
    title="MS d3dx9_41.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx9_41.dll"
w_metadata d3dx9_42 dlls \
    title="MS d3dx9_42.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx9_42.dll"
w_metadata d3dx9_43 dlls \
    title="MS d3dx9_43.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx9_43.dll"
w_metadata d3dx11_42 dlls \
    title="MS d3dx11_42.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx11_42.dll"
w_metadata d3dx11_43 dlls \
    title="MS d3dx11_43.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx11_43.dll"
w_metadata d3dx10 dlls \
    title="MS d3dx10_??.dll from DirectX user redistributable" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx10_33.dll"
w_metadata d3dx10_43 dlls \
    title="MS d3dx10_43.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dx10_43.dll"
w_metadata d3dxof dlls \
    title="MS d3dxof.dll from DirectX user redistributable" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3dxof.dll"
w_metadata dbghelp dlls \
    title="MS dbghelp" \
    publisher="Microsoft" \
    year="2008" \
    media="download" \
    file1="../winxpsp3/WindowsXP-KB936929-SP3-x86-ENU.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dbghelp.dll"
w_metadata devenum dlls \
    title="MS devenum.dll from DirectX user redistributable" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    conflicts="quartz" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/devenum.dll"
w_metadata dinput dlls \
    title="MS dinput.dll; breaks mouse, use only on Rayman 2 etc." \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    conflicts="dinputto8" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dinput.dll"
w_metadata dinput8 dlls \
    title="MS DirectInput 8 from DirectX user redistributable" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dinput8.dll"
w_metadata dinputto8 dlls \
    title="A dll module that is designed to improve compatibility in games using DirectInput 1-7 by converting all API calls to their equivalent DirectInput 8 (1.0.92.0)" \
    homepage="https://github.com/elishacloud/dinputto8" \
    publisher="Elisha Riedlinger" \
    year="2018" \
    media="download" \
    conflicts="dinput" \
    file1="dinput.dll" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dinput.dll"
w_metadata directmusic dlls \
    title="MS DirectMusic from DirectX user redistributable" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dmusic.dll"
w_metadata directshow dlls \
    title="DirectShow runtime DLLs (amstream, qasf, qcap, qdvd, qedit, quartz)" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe"
w_metadata directplay dlls \
    title="MS DirectPlay from DirectX user redistributable" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dplayx.dll"
w_metadata directx9 dlls \
    title="MS DirectX 9 (Deprecated, no-op)" \
    publisher="Microsoft" \
    year="2010" \
    media="download"
w_metadata dpvoice dlls \
    title="Microsoft dpvoice dpvvox dpvacm Audio dlls" \
    publisher="Microsoft" \
    year="2002" \
    media="download" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dpvoice.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/dpvvox.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/dpvacm.dll"
w_metadata dsdmo dlls \
    title="MS dsdmo.dll" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dsdmo.dll"
w_metadata dbgview apps \
    title="Debug monitor" \
    publisher="Mark Russinovich" \
    year="2019" \
    media="download" \

w_metadata depends apps \
    title="Dependency Walker" \
    publisher="Steve P. Miller" \
    year="2006" \
    media="download" \

w_metadata dxsdk_aug2006 apps \
    title="MS DirectX SDK, August 2006 (developers only)" \
    publisher="Microsoft" \
    year="2006" \
    media="download" \
    file1="dxsdk_aug2006.exe" \
    installed_file1="${W_PROGRAMS_X86_WIN}/Microsoft DirectX SDK (August 2006)/Lib/x86/d3d10.lib"
w_metadata dxsdk_jun2010 apps \
    title="MS DirectX SDK, June 2010 (developers only)" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="DXSDK_Jun10.exe" \
    installed_file1="${W_PROGRAMS_X86_WIN}/Microsoft DirectX SDK (June 2010)/Lib/x86/d3d11.lib"
w_metadata dxtrans dlls \
    title="MS dxtrans.dll" \
    publisher="Microsoft" \
    year="2002" \
    media="download" \
    file1="../winxpsp3/WindowsXP-KB936929-SP3-x86-ENU.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dxtrans.dll" \

w_metadata dxvk1000 dlls \
    title="Vulkan-based D3D10/D3D11 implementation for Linux / Wine (1.0)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.0.tar.gz" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1001 dlls \
    title="Vulkan-based D3D10/D3D11 implementation for Linux / Wine (1.0.1)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.0.1.tar.gz" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1002 dlls \
    title="Vulkan-based D3D10/D3D11 implementation for Linux / Wine (1.0.2)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.0.2.tar.gz" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1003 dlls \
    title="Vulkan-based D3D10/D3D11 implementation for Linux / Wine (1.0.3)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.0.3.tar.gz" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1011 dlls \
    title="Vulkan-based D3D10/D3D11 implementation for Linux / Wine (1.1.1)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.1.1.tar.gz" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1020 dlls \
    title="Vulkan-based D3D10/D3D11 implementation for Linux / Wine (1.2)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.2.tar.gz" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1021 dlls \
    title="Vulkan-based D3D10/D3D11 implementation for Linux / Wine (1.2.1)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.2.1.tar.gz" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1022 dlls \
    title="Vulkan-based D3D10/D3D11 implementation for Linux / Wine (1.2.2)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.2.2.tar.gz" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1023 dlls \
    title="Vulkan-based D3D10/D3D11 implementation for Linux / Wine (1.2.3)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.2.3.tar.gz" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1030 dlls \
    title="Vulkan-based D3D10/D3D11 implementation for Linux / Wine (1.3)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.3.tar.gz" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1031 dlls \
    title="Vulkan-based D3D10/D3D11 implementation for Linux / Wine (1.3.1)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.3.1.tar.gz" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1032 dlls \
    title="Vulkan-based D3D10/D3D11 implementation for Linux / Wine (1.3.2)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.3.2.tar.gz" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1033 dlls \
    title="Vulkan-based D3D10/D3D11 implementation for Linux / Wine (1.3.3)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.3.3.tar.gz" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1034 dlls \
    title="Vulkan-based D3D10/D3D11 implementation for Linux / Wine (1.3.4)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.3.4.tar.gz" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1040 dlls \
    title="Vulkan-based D3D10/D3D11 implementation for Linux / Wine (1.4)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.4.tar.gz" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1041 dlls \
    title="Vulkan-based D3D10/D3D11 implementation for Linux / Wine (1.4.1)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.4.1.tar.gz" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1042 dlls \
    title="Vulkan-based D3D10/D3D11 implementation for Linux / Wine (1.4.2)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.4.2.tar.gz" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1043 dlls \
    title="Vulkan-based D3D10/D3D11 implementation for Linux / Wine (1.4.3)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.4.3.tar.gz" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1044 dlls \
    title="Vulkan-based D3D10/D3D11 implementation for Linux / Wine (1.4.4)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.4.4.tar.gz" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1045 dlls \
    title="Vulkan-based D3D10/D3D11 implementation for Linux / Wine (1.4.5)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.4.5.tar.gz" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1046 dlls \
    title="Vulkan-based D3D10/D3D11 implementation for Linux / Wine (1.4.6)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.4.6.tar.gz" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1050 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (1.5)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.5.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file6="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1051 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (1.5.1)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.5.1.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file6="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1052 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (1.5.2)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.5.2.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file6="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1053 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (1.5.3)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.5.3.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file6="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1054 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (1.5.4)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.5.4.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file6="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1055 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (1.5.5)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.5.5.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file6="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1060 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (1.6)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.6.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file6="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1061 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (1.6.1)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.6.1.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file6="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1070 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (1.7)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.7.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file6="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1071 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (1.7.1)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.7.1.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file6="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1072 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (1.7.2)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.7.2.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file6="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1073 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (1.7.3)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.7.3.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file6="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1080 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (1.8)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.8.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file6="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1081 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (1.8.1)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.8.1.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file6="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1090 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (1.9)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.9.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file6="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1091 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (1.9.1)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.9.1.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file6="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1092 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (1.9.2)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.9.2.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file6="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1093 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (1.9.3)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.9.3.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file6="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1094 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (1.9.4)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.9.4.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file6="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1100 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (1.10)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.10.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file6="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1101 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (1.10.1)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.10.1.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file6="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1102 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (1.10.2)" \
    publisher="Philip Rebohle" \
    year="2017" \
    media="download" \
    file1="dxvk-1.10.2.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file6="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk1103 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (1.10.3)" \
    publisher="Philip Rebohle" \
    year="2022" \
    media="download" \
    file1="dxvk-1.10.3.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file6="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk2000 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (2.0)" \
    publisher="Philip Rebohle" \
    year="2022" \
    media="download" \
    file1="dxvk-2.0.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk2010 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (2.1)" \
    publisher="Philip Rebohle" \
    year="2023" \
    media="download" \
    file1="dxvk-2.1.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk2020 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (2.2)" \
    publisher="Philip Rebohle" \
    year="2023" \
    media="download" \
    file1="dxvk-2.2.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk2030 dlls \
    title="Vulkan-based D3D9/D3D10/D3D11 implementation for Linux / Wine (2.3)" \
    publisher="Philip Rebohle" \
    year="2023" \
    media="download" \
    file1="dxvk-2.3.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk2040 dlls \
    title="Vulkan-based D3D8/D3D9/D3D10/D3D11 implementation for Linux / Wine (2.4)" \
    publisher="Philip Rebohle" \
    year="2024" \
    media="download" \
    file1="dxvk-2.4.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d8.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk2041 dlls \
    title="Vulkan-based D3D8/D3D9/D3D10/D3D11 implementation for Linux / Wine (2.4.1)" \
    publisher="Philip Rebohle" \
    year="2024" \
    media="download" \
    file1="dxvk-2.4.1.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d8.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk2050 dlls \
    title="Vulkan-based D3D8/D3D9/D3D10/D3D11 implementation for Linux / Wine (2.5)" \
    publisher="Philip Rebohle" \
    year="2024" \
    media="download" \
    file1="dxvk-2.5.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d8.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk2051 dlls \
    title="Vulkan-based D3D8/D3D9/D3D10/D3D11 implementation for Linux / Wine (2.5.1)" \
    publisher="Philip Rebohle" \
    year="2024" \
    media="download" \
    file1="dxvk-2.5.1.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d8.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk2052 dlls \
    title="Vulkan-based D3D8/D3D9/D3D10/D3D11 implementation for Linux / Wine (2.5.2)" \
    publisher="Philip Rebohle" \
    year="2024" \
    media="download" \
    file1="dxvk-2.5.2.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d8.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk2053 dlls \
    title="Vulkan-based D3D8/D3D9/D3D10/D3D11 implementation for Linux / Wine (2.5.3)" \
    publisher="Philip Rebohle" \
    year="2025" \
    media="download" \
    file1="dxvk-2.5.3.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d8.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk2060 dlls \
    title="Vulkan-based D3D8/D3D9/D3D10/D3D11 implementation for Linux / Wine (2.6)" \
    publisher="Philip Rebohle" \
    year="2025" \
    media="download" \
    file1="dxvk-2.6.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d8.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk2061 dlls \
    title="Vulkan-based D3D8/D3D9/D3D10/D3D11 implementation for Linux / Wine (2.6.1)" \
    publisher="Philip Rebohle" \
    year="2025" \
    media="download" \
    file1="dxvk-2.6.1.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d8.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk2062 dlls \
    title="Vulkan-based D3D8/D3D9/D3D10/D3D11 implementation for Linux / Wine (2.6.2)" \
    publisher="Philip Rebohle" \
    year="2025" \
    media="download" \
    file1="dxvk-2.6.2.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d8.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk2070 dlls \
    title="Vulkan-based D3D8/D3D9/D3D10/D3D11 implementation for Linux / Wine (2.7)" \
    publisher="Philip Rebohle" \
    year="2025" \
    media="download" \
    file1="dxvk-2.7.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d8.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk2071 dlls \
    title="Vulkan-based D3D8/D3D9/D3D10/D3D11 implementation for Linux / Wine (2.7.1)" \
    publisher="Philip Rebohle" \
    year="2025" \
    media="download" \
    file1="dxvk-2.7.1.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d8.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk dlls \
    title="Vulkan-based D3D8/D3D9/D3D10/D3D11 implementation for Linux / Wine (latest)" \
    publisher="Philip Rebohle" \
    year="2024" \
    media="download" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d8.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk_async dlls \
    title="DXVK with Async and GPL patches [USE AT OWN RISK IN GAMES WITH ANTICHEAT] (latest)" \
    publisher="Ph42oN" \
    year="2025" \
    media="download" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d8.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/d3d9.dll" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/d3d10core.dll" \
    installed_file4="${W_SYSTEM32_DLLS_WIN}/d3d11.dll" \
    installed_file5="${W_SYSTEM32_DLLS_WIN}/dxgi.dll"
w_metadata dxvk_nvapi0061 dlls \
    title="Alternative NVAPI Vulkan implementation on top of DXVK for Linux / Wine (0.6.1)" \
    publisher="Jens Peters" \
    year="2023" \
    media="download" \
    file1="dxvk-nvapi-v0.6.1.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/nvapi.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/nvapi64.dll"
w_metadata dxvk_nvapi009 dlls \
    title="Alternative NVAPI Vulkan implementation on top of DXVK for Linux / Wine (0.9.0)" \
    publisher="Jens Peters" \
    year="2025" \
    media="download" \
    file1="dxvk-nvapi-v0.9.0.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/nvapi.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/nvapi64.dll"
w_metadata dxvk_nvapi dlls \
    title="Alternative NVAPI Vulkan implementation on top of DXVK for Linux / Wine (latest)" \
    publisher="Jens Peters" \
    year="2025" \
    media="download" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/nvapi.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/nvapi64.dll"
w_metadata vkd3d dlls \
    title="Vulkan-based D3D12 implementation for Linux / Wine (latest)" \
    publisher="Hans-Kristian Arntzen " \
    year="2020" \
    media="download" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d12.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/d3d12core.dll"
w_metadata dmusic32 dlls \
    title="MS dmusic32.dll from DirectX user redistributable" \
    publisher="Microsoft" \
    year="2006" \
    media="download" \
    file1="../directx9/directx_apr2006_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dmusic32.dll"
w_metadata dmband dlls \
    title="MS dmband.dll from DirectX user redistributable" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dmband.dll"
w_metadata dmcompos dlls \
    title="MS dmcompos.dll from DirectX user redistributable" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dmcompos.dll"
w_metadata dmime dlls \
    title="MS dmime.dll from DirectX user redistributable" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dmime.dll"
w_metadata dmloader dlls \
    title="MS dmloader.dll from DirectX user redistributable" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dmloader.dll"
w_metadata dmscript dlls \
    title="MS dmscript.dll from DirectX user redistributable" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dmscript.dll"
w_metadata dmstyle dlls \
    title="MS dmstyle.dll from DirectX user redistributable" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dmstyle.dll"
w_metadata dmsynth dlls \
    title="MS dmsynth.dll from DirectX user redistributable" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dmsynth.dll"
w_metadata dmusic dlls \
    title="MS dmusic.dll from DirectX user redistributable" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dmusic.dll"
w_metadata dswave dlls \
    title="MS dswave.dll from DirectX user redistributable" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dswave.dll"
w_metadata dotnet11 dlls \
    title="MS .NET 1.1" \
    publisher="Microsoft" \
    year="2003" \
    media="download" \
    conflicts="dotnet20sdk" \
    file1="dotnetfx.exe" \
    installed_file1="${W_WINDIR_WIN}/Microsoft.NET/Framework/v1.1.4322/ndpsetup.ico"
w_metadata dotnet11sp1 dlls \
    title="MS .NET 1.1 SP1" \
    publisher="Microsoft" \
    year="2004" \
    media="download" \
    file1="NDP1.1sp1-KB867460-X86.exe" \
    installed_file1="${W_WINDIR_WIN}/Microsoft.NET/Framework/v1.1.4322/CONFIG/web_hightrust.config.default"
w_metadata dotnet20 dlls \
    title="MS .NET 2.0" \
    publisher="Microsoft" \
    year="2006" \
    media="download" \
    conflicts="dotnet20sp1 dotnet20sp2 dotnet30sp1 dotnet35" \
    file1="dotnetfx.exe" \
    installed_file1="${W_WINDIR_WIN}/Microsoft.NET/Framework/v2.0.50727/MSBuild.exe"
w_metadata dotnet20sdk apps \
    title="MS .NET 2.0 SDK" \
    publisher="Microsoft" \
    year="2006" \
    media="download" \
    conflicts="dotnet11 dotnet20sp1 dotnet20sp2 dotnet30 dotnet40" \
    file1="setup.exe" \
    installed_file1="${W_PROGRAMS_X86_WIN}/Microsoft.NET/SDK/v2.0/Bin/cordbg.exe"
w_metadata dotnet20sp1 dlls \
    title="MS .NET 2.0 SP1" \
    publisher="Microsoft" \
    year="2008" \
    media="download" \
    conflicts="dotnet20sp2" \
    file1="NetFx20SP1_x86.exe" \
    installed_file1="${W_WINDIR_WIN}/dotnet20sp1.installed.workaround"
w_metadata dotnet20sp2 dlls \
    title="MS .NET 2.0 SP2" \
    publisher="Microsoft" \
    year="2009" \
    media="download" \
    conflicts="dotnet11" \
    file1="NetFx20SP2_x86.exe" \
    installed_file1="${W_WINDIR_WIN}/winsxs/manifests/x86_Microsoft.VC80.CRT_1fc8b3b9a1e18e3b_8.0.50727.3053_x-ww_b80fa8ca.cat"
w_metadata dotnet30 dlls \
    title="MS .NET 3.0" \
    publisher="Microsoft" \
    year="2006" \
    media="download" \
    conflicts="dotnet11 dotnet30sp1 dotnet35 dotnet35sp1" \
    file1="dotnetfx3.exe" \
    installed_file1="${W_WINDIR_WIN}/Microsoft.NET/Framework/v3.0/Microsoft .NET Framework 3.0/logo.bmp"
w_metadata dotnet30sp1 dlls \
    title="MS .NET 3.0 SP1" \
    publisher="Microsoft" \
    year="2007" \
    media="download" \
    conflicts="dotnet11 dotnet20sdk" \
    file1="NetFx30SP1_x86.exe" \
    installed_file1="${W_WINDIR_WIN}/dotnet30sp1.installed.workaround"
w_metadata dotnet35 dlls \
    title="MS .NET 3.5" \
    publisher="Microsoft" \
    year="2007" \
    media="download" \
    conflicts="dotnet11 dotnet20sdk dotnet20sp2 dotnet30" \
    file1="dotnetfx35.exe" \
    installed_file1="${W_WINDIR_WIN}/Microsoft.NET/Framework/v3.5/MSBuild.exe"
w_metadata dotnet35sp1 dlls \
    title="MS .NET 3.5 SP1" \
    publisher="Microsoft" \
    year="2008" \
    media="download" \
    conflicts="dotnet11 dotnet20sp1" \
    file1="dotnetfx35.exe" \
    installed_file1="${W_WINDIR_WIN}/Microsoft.NET/Framework/v3.5/msbuild.exe.config"
w_metadata dotnet40 dlls \
    title="MS .NET 4.0" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    conflicts="dotnet20sdk" \
    file1="dotNetFx40_Full_x86_x64.exe" \
    installed_file1="${W_WINDIR_WIN}/Microsoft.NET/Framework/v4.0.30319/ngen.exe"
w_metadata dotnet40_kb2468871 dlls \
    title="MS .NET 4.0 KB2468871" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    conflicts="dotnet20sdk" \
    file1="NDP40-KB2468871-v2-x86.exe"
w_metadata dotnet45 dlls \
    title="MS .NET 4.5" \
    publisher="Microsoft" \
    year="2012" \
    media="download" \
    conflicts="dotnet20sdk" \
    file1="dotnetfx45_full_x86_x64.exe" \
    installed_file1="${W_WINDIR_WIN}/Microsoft.NET/Framework/v4.0.30319/Microsoft.Windows.ApplicationServer.Applications.45.man"
w_metadata dotnet452 dlls \
    title="MS .NET 4.5.2" \
    publisher="Microsoft" \
    year="2012" \
    media="download" \
    conflicts="dotnet20sdk dotnet46 dotnet462" \
    file1="NDP452-KB2901907-x86-x64-AllOS-ENU.exe" \
    installed_file1="${W_WINDIR_WIN}/Microsoft.NET/Framework/v4.0.30319/Microsoft.Windows.ApplicationServer.Applications.45.man"
w_metadata dotnet46 dlls \
    title="MS .NET 4.6" \
    publisher="Microsoft" \
    year="2015" \
    media="download" \
    file1="NDP46-KB3045557-x86-x64-AllOS-ENU.exe" \
    conflicts="dotnet20sdk" \
    installed_file1="${W_WINDIR_WIN}/Migration/WTR/netfx45_upgradecleanup.inf"
w_metadata dotnet461 dlls \
    title="MS .NET 4.6.1" \
    publisher="Microsoft" \
    year="2015" \
    media="download" \
    file1="NDP461-KB3102436-x86-x64-AllOS-ENU.exe" \
    conflicts="dotnet20sdk" \
    installed_file1="${W_WINDIR_WIN}/dotnet461.installed.workaround"
w_metadata dotnet462 dlls \
    title="MS .NET 4.6.2" \
    publisher="Microsoft" \
    year="2016" \
    media="download" \
    conflicts="dotnet20sdk" \
    installed_file1="${W_WINDIR_WIN}/dotnet462.installed.workaround"
w_metadata dotnet471 dlls \
    title="MS .NET 4.7.1" \
    publisher="Microsoft" \
    year="2017" \
    media="download" \
    file1="NDP471-KB4033342-x86-x64-AllOS-ENU.exe" \
    conflicts="dotnet20sdk dotnet30sp1" \
    installed_file1="${W_WINDIR_WIN}/dotnet471.installed.workaround"
w_metadata dotnet472 dlls \
    title="MS .NET 4.7.2" \
    publisher="Microsoft" \
    year="2018" \
    media="download" \
    conflicts="dotnet20sdk" \
    installed_file1="${W_WINDIR_WIN}/dotnet472.installed.workaround"
w_metadata dotnet48 dlls \
    title="MS .NET 4.8" \
    publisher="Microsoft" \
    year="2019" \
    media="download" \
    file1="ndp48-x86-x64-allos-enu.exe" \
    conflicts="dotnet20sdk" \
    installed_file1="${W_WINDIR_WIN}/dotnet48.installed.workaround"
w_metadata dotnetcore2 dlls \
    title="MS .NET Core Runtime 2.1 LTS" \
    publisher="Microsoft" \
    year="2020" \
    media="download" \
    file1="dotnet-runtime-2.1.17-win-x86.exe" \
    installed_file1="${W_PROGRAMS_WIN}/dotnet/dotnet.exe"
w_metadata dotnetcore3 dlls \
    title="MS .NET Core Runtime 3.1 LTS" \
    publisher="Microsoft" \
    year="2020" \
    media="download" \
    file1="dotnet-runtime-3.1.10-win-x86.exe" \
    installed_file1="${W_PROGRAMS_WIN}/dotnet/dotnet.exe"
w_metadata dotnetcoredesktop3 dlls \
    title="MS .NET Core Desktop Runtime 3.1 LTS" \
    publisher="Microsoft" \
    year="2020" \
    media="download" \
    file1="windowsdesktop-runtime-3.1.10-win-x86.exe" \
    installed_file1="${W_PROGRAMS_WIN}/dotnet/dotnet.exe"
w_metadata dotnet6 dlls \
    title="MS .NET Runtime 6.0 LTS" \
    publisher="Microsoft" \
    year="2023" \
    media="download" \
    file1="dotnet-runtime-6.0.36-win-x86.exe" \
    installed_file1="${W_PROGRAMS_WIN}/dotnet/dotnet.exe"
w_metadata dotnetdesktop6 dlls \
    title="MS .NET Desktop Runtime 6.0 LTS" \
    publisher="Microsoft" \
    year="2023" \
    media="download" \
    file1="windowsdesktop-runtime-6.0.36-win-x86.exe" \
    installed_file1="${W_PROGRAMS_WIN}/dotnet/dotnet.exe"
w_metadata dotnet7 dlls \
    title="MS .NET Runtime 7.0 LTS" \
    publisher="Microsoft" \
    year="2023" \
    media="download" \
    file1="dotnet-runtime-7.0.20-win-x86.exe" \
    installed_file1="${W_PROGRAMS_WIN}/dotnet/dotnet.exe"
w_metadata dotnetdesktop7 dlls \
    title="MS .NET Desktop Runtime 7.0 LTS" \
    publisher="Microsoft" \
    year="2023" \
    media="download" \
    file1="windowsdesktop-runtime-7.0.20-win-x86.exe" \
    installed_file1="${W_PROGRAMS_WIN}/dotnet/dotnet.exe"
w_metadata dotnet8 dlls \
    title="MS .NET Runtime 8.0 LTS" \
    publisher="Microsoft" \
    year="2024" \
    media="download" \
    file1="dotnet-runtime-8.0.12-win-x86.exe" \
    installed_file1="${W_PROGRAMS_WIN}/dotnet/dotnet.exe"
w_metadata dotnetdesktop8 dlls \
    title="MS .NET Desktop Runtime 8.0 LTS" \
    publisher="Microsoft" \
    year="2024" \
    media="download" \
    file1="windowsdesktop-runtime-8.0.12-win-x86.exe" \
    installed_file1="${W_PROGRAMS_WIN}/dotnet/dotnet.exe"
w_metadata dotnet9 dlls \
    title="MS .NET Runtime 9.0 LTS" \
    publisher="Microsoft" \
    year="2026" \
    media="download" \
    file1="dotnet-runtime-9.0.14-win-x86.exe" \
    installed_file1="${W_PROGRAMS_WIN}/dotnet/dotnet.exe"
w_metadata dotnetdesktop9 dlls \
    title="MS .NET Desktop Runtime 9.0 LTS" \
    publisher="Microsoft" \
    year="2024" \
    media="download" \
    file1="windowsdesktop-runtime-9.0.7-win-x86.exe" \
    installed_file1="${W_PROGRAMS_WIN}/dotnet/dotnet.exe"
w_metadata dotnet10 dlls \
    title="MS .NET Runtime 10.0 LTS" \
    publisher="Microsoft" \
    year="2025" \
    media="download" \
    file1="dotnet-runtime-10.0.0-win-x86.exe" \
    installed_file1="${W_PROGRAMS_WIN}/dotnet/dotnet.exe"
w_metadata dotnetdesktop10 dlls \
    title="MS .NET Desktop Runtime 10.0 LTS" \
    publisher="Microsoft" \
    year="2025" \
    media="download" \
    file1="windowsdesktop-runtime-10.0.0-win-x86.exe" \
    installed_file1="${W_PROGRAMS_WIN}/dotnet/dotnet.exe"
w_metadata dotnet_verifier dlls \
    title="MS .NET Verifier" \
    publisher="Microsoft" \
    year="2016" \
    media="download" \
    file1="netfx_setupverifier_new.zip" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/netfx_setupverifier.exe"
w_metadata dx8vb dlls \
    title="MS dx8vb.dll from DirectX 8.1 runtime" \
    publisher="Microsoft" \
    year="2001" \
    media="download" \
    file1="DX81NTger.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dx8vb.dll"
w_metadata dxdiagn dlls \
    title="DirectX Diagnostic Library" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    conflicts="dxdiagn_feb2010" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dxdiagn.dll"
w_metadata dxdiagn_feb2010 dlls \
    title="DirectX Diagnostic Library (February 2010)" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    conflicts="dxdiagn" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dxdiagn.dll"
w_metadata dsoal dlls \
    title="A DirectSound DLL replacer that enables surround sound, HRTF, and EAX support via OpenAL Soft" \
    homepage="https://github.com/kcat/dsoal" \
    publisher="kcat" \
    year="2019" \
    media="download" \
    conflicts="dsound" \
    file1="DSOAL.7z" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dsoal-aldrv.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/dsound.dll"
w_metadata dsound dlls \
    title="MS DirectSound from DirectX user redistributable" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    conflicts="dsoal" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dsound.dll"
w_metadata esent dlls \
    title="MS Extensible Storage Engine" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/esent.dll"
w_metadata faudio1901 dlls \
    title="FAudio (xaudio reimplementation, with xna support) builds for win32 (19.01)" \
    publisher="Kron4ek" \
    year="2019" \
    media="download" \
    file1="faudio-19.01.tar.xz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/FAudio.dll"
w_metadata faudio1902 dlls \
    title="FAudio (xaudio reimplementation, with xna support) builds for win32 (19.02)" \
    publisher="Kron4ek" \
    year="2019" \
    media="download" \
    file1="faudio-19.02.tar.xz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/FAudio.dll"
w_metadata faudio1903 dlls \
    title="FAudio (xaudio reimplementation, with xna support) builds for win32 (19.03)" \
    publisher="Kron4ek" \
    year="2019" \
    media="download" \
    file1="faudio-19.03.tar.xz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/FAudio.dll"
w_metadata faudio1904 dlls \
    title="FAudio (xaudio reimplementation, with xna support) builds for win32 (19.04)" \
    publisher="Kron4ek" \
    year="2019" \
    media="download" \
    file1="faudio-19.04.tar.xz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/FAudio.dll"
w_metadata faudio1905 dlls \
    title="FAudio (xaudio reimplementation, with xna support) builds for win32 (19.05)" \
    publisher="Kron4ek" \
    year="2019" \
    media="download" \
    file1="faudio-19.05.tar.xz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/FAudio.dll"
w_metadata faudio1906 dlls \
    title="FAudio (xaudio reimplementation, with xna support) builds for win32 (19.06)" \
    publisher="Kron4ek" \
    year="2019" \
    media="download" \
    file1="faudio-19.06.tar.xz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/FAudio.dll"
w_metadata faudio190607 dlls \
    title="FAudio (xaudio reimplementation, with xna support) builds for win32 (19.06.07)" \
    publisher="Kron4ek" \
    year="2019" \
    media="download" \
    file1="faudio-19.06.07.tar.xz" \
    installed_file1="${W_SYSTEM64_DLLS_WIN64}/FAudio.dll"
w_metadata faudio dlls \
    title="FAudio (xaudio reimplementation, with xna support) builds for win32 (20.07)" \
    publisher="Kron4ek" \
    year="2019" \
    media="download" \
    installed_file1="${W_SYSTEM64_DLLS_WIN64}/FAudio.dll"
w_metadata filever dlls \
    title="Microsoft's filever, for dumping file version info" \
    publisher="Microsoft" \
    year="20??" \
    media="download" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/filever.exe"
w_metadata galliumnine02 dlls \
    title="Gallium Nine Standalone (v0.2)" \
    publisher="Gallium Nine Team" \
    year="2019" \
    media="download" \
    file1="gallium-nine-standalone-v0.2.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9-nine.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/ninewinecfg.exe" \
    homepage="https://github.com/iXit/wine-nine-standalone"
w_metadata galliumnine03 dlls \
    title="Gallium Nine Standalone (v0.3)" \
    publisher="Gallium Nine Team" \
    year="2019" \
    media="download" \
    file1="gallium-nine-standalone-v0.3.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9-nine.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/ninewinecfg.exe" \
    homepage="https://github.com/iXit/wine-nine-standalone"
w_metadata galliumnine04 dlls \
    title="Gallium Nine Standalone (v0.4)" \
    publisher="Gallium Nine Team" \
    year="2019" \
    media="download" \
    file1="gallium-nine-standalone-v0.4.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9-nine.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/ninewinecfg.exe" \
    homepage="https://github.com/iXit/wine-nine-standalone"
w_metadata galliumnine05 dlls \
    title="Gallium Nine Standalone (v0.5)" \
    publisher="Gallium Nine Team" \
    year="2019" \
    media="download" \
    file1="gallium-nine-standalone-v0.5.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9-nine.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/ninewinecfg.exe" \
    homepage="https://github.com/iXit/wine-nine-standalone"
w_metadata galliumnine06 dlls \
    title="Gallium Nine Standalone (v0.6)" \
    publisher="Gallium Nine Team" \
    year="2020" \
    media="download" \
    file1="gallium-nine-standalone-v0.6.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9-nine.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/ninewinecfg.exe" \
    homepage="https://github.com/iXit/wine-nine-standalone"
w_metadata galliumnine07 dlls \
    title="Gallium Nine Standalone (v0.7)" \
    publisher="Gallium Nine Team" \
    year="2020" \
    media="download" \
    file1="gallium-nine-standalone-v0.7.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9-nine.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/ninewinecfg.exe" \
    homepage="https://github.com/iXit/wine-nine-standalone"
w_metadata galliumnine08 dlls \
    title="Gallium Nine Standalone (v0.8)" \
    publisher="Gallium Nine Team" \
    year="2021" \
    media="download" \
    file1="gallium-nine-standalone-v0.8.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9-nine.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/ninewinecfg.exe" \
    homepage="https://github.com/iXit/wine-nine-standalone"
w_metadata galliumnine09 dlls \
    title="Gallium Nine Standalone (v0.9)" \
    publisher="Gallium Nine Team" \
    year="2023" \
    media="download" \
    file1="gallium-nine-standalone-v0.9.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9-nine.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/ninewinecfg.exe" \
    homepage="https://github.com/iXit/wine-nine-standalone"
w_metadata galliumnine010 dlls \
    title="Gallium Nine Standalone (v0.10)" \
    publisher="Gallium Nine Team" \
    year="2024" \
    media="download" \
    file1="gallium-nine-standalone-v0.10.tar.gz" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9-nine.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/ninewinecfg.exe" \
    homepage="https://github.com/iXit/wine-nine-standalone"
w_metadata galliumnine dlls \
    title="Gallium Nine Standalone (latest)" \
    publisher="Gallium Nine Team" \
    year="2024" \
    media="download" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/d3d9-nine.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/ninewinecfg.exe" \
    homepage="https://github.com/iXit/wine-nine-standalone"
w_metadata gdiplus dlls \
    title="MS GDI+" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/gdiplus.dll"
w_metadata gdiplus_winxp dlls \
    title="MS GDI+" \
    publisher="Microsoft" \
    year="2009" \
    media="manual_download" \
    file1="WindowsXP-KB975337-x86-ENU.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/gdiplus.dll"
load_gdiplus_winxp()
{
    # https://www.microsoft.com/en-us/download/details.aspx?id=5339
    w_download https://web.archive.org/web/20140615000000/http://download.microsoft.com/download/a/b/c/abc45517-97a0-4cee-a362-1957be2f24e1/WindowsXP-KB975337-x86-ENU.exe 699e76e9f100db3d50da8762c484a369df4698d4b84f7821d4df0e37ce68bcbe
    w_try_cd "${W_CACHE}/${W_PACKAGE}"
    w_try "${WINE}" "${W_CACHE}/${W_PACKAGE}/${file1}" /x:. /q
    w_try_cp_dll "${W_CACHE}/${W_PACKAGE}/asms/10/msft/windows/gdiplus/gdiplus.dll" "${W_SYSTEM32_DLLS}/gdiplus.dll"

    # For some reason, native, builtin isn't good enough...?
    w_override_dlls native gdiplus
}
w_metadata glidewrapper dlls \
    title="GlideWrapper" \
    publisher="Rolf Neuberger" \
    year="2005" \
    media="download" \
    file1="GlideWrapper084c.exe" \
    installed_file1="${W_WINDIR_WIN}/glide3x.dll"
w_metadata gfw dlls \
    title="MS Games For Windows Live (xlive.dll)" \
    publisher="Microsoft" \
    year="2008" \
    media="download" \
    file1="gfwlivesetupmin.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/xlive.dll"
w_metadata glut dlls \
    title="The glut utility library for OpenGL" \
    publisher="Mark J. Kilgard" \
    year="2001" \
    media="download" \
    file1="glut-3.7.6-bin.zip" \
    installed_file1="c:/glut-3.7.6-bin/glut32.lib"
w_metadata gmdls dlls \
    title="General MIDI DLS Collection" \
    publisher="Microsoft / Roland" \
    year="1999" \
    media="download" \
    file1="../directx9/directx_apr2006_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/drivers/gm.dls"
w_metadata allcodecs dlls \
    title="All codecs (dirac, ffdshow, icodecs, cinepak, l3codecx, xvid) except wmp" \
    publisher="various" \
    year="1995-2009" \
    media="download"
w_metadata dirac dlls \
    title="The Dirac directshow filter v1.0.2" \
    publisher="Dirac" \
    year="2009" \
    media="download" \
    file1="DiracDirectShowFilter-1.0.2.exe" \
    installed_file1="${W_PROGRAMS_X86_WIN}/Dirac/DiracDecoder.dll"
w_metadata ffdshow dlls \
    title="ffdshow video codecs" \
    publisher="doom9 folks" \
    year="2010" \
    media="download" \
    file1="ffdshow_beta7_rev3154_20091209.exe" \
    installed_file1="${W_PROGRAMS_X86_WIN}/ffdshow/ff_liba52.dll" \
    homepage="https://ffdshow-tryout.sourceforge.io/"
w_metadata hid dlls \
    title="MS hid" \
    publisher="Microsoft" \
    year="2003" \
    media="download" \
    file1="../win2ksp4/W2KSP4_EN.EXE" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/hid.dll"
w_metadata icodecs dlls \
    title="Indeo codecs" \
    publisher="Intel" \
    year="1998" \
    media="download" \
    file1="codinstl.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/ir50_32.dll"
w_metadata iertutil dlls \
    title="MS Runtime Utility" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/iertutil.dll"
w_metadata itircl dlls \
    title="MS itircl.dll" \
    publisher="Microsoft" \
    year="1999" \
    media="download" \
    file1="../hhw/htmlhelp.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/itircl.dll"
w_metadata itss dlls \
    title="MS itss.dll" \
    publisher="Microsoft" \
    year="1999" \
    media="download" \
    file1="../hhw/htmlhelp.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/itss.dll"
w_metadata cinepak dlls \
    title="Cinepak Codec" \
    publisher="Radius" \
    year="1995" \
    media="download" \
    file1="cvid32.zip" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/iccvid.dll" \
    homepage="http://www.probo.com/cinepak.php"
w_metadata jet40 dlls \
    title="MS Jet 4.0 Service Pack 8" \
    publisher="Microsoft" \
    year="2003" \
    media="download" \
    file1="jet40sp8_9xnt.exe" \
    installed_file1="${W_COMMONFILES_WIN}/Microsoft Shared/dao/dao360.dll"
w_metadata ie8_kb2936068 dlls \
    title="Cumulative Security Update for Internet Explorer 8" \
    publisher="Microsoft" \
    year="2014" \
    media="download" \
    file1="IE8-WindowsXP-KB2936068-x86-ENU.exe" \
    installed_file1="${W_WINDIR_WIN}/KB2936068-IE8.log"
w_metadata ie8_tls12 dlls \
    title="TLS 1.1 and 1.2 for Internet Explorer 8" \
    publisher="Microsoft" \
    year="2017" \
    media="download" \
    file1="windowsxp-kb4019276-x86-embedded-enu_3822fc1692076429a7dc051b00213d5e1240ce3d.exe" \
    file2="ie8-windowsxp-kb4230450-x86-embedded-enu_d8b388624d07b6804485d347be4f74a985d50be7.exe" \
    installed_file1="c:/windows/KB4230450-IE8.log"
w_metadata l3codecx dlls \
    title="MPEG Layer-3 Audio Codec for Microsoft DirectShow" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/l3codecx.ax"
w_metadata lavfilters dlls \
    title="LAV Filters" \
    publisher="Hendrik Leppkes" \
    year="2019" \
    media="download" \
    conflicts="lavfilters702" \
    file1="LAVFilters-0.74.1-Installer.exe" \
    installed_file1="${W_PROGRAMS_X86_WIN}/LAV Filters/x86/avfilter-lav-7.dll" \
    homepage="https://github.com/Nevcairiel/LAVFilters"
w_metadata lavfilters702 dlls \
    title="LAV Filters 0.70.2" \
    publisher="Hendrik Leppkes" \
    year="2017" \
    media="download" \
    conflicts="lavfilters" \
    file1="LAVFilters-0.70.2-Installer.exe" \
    installed_file1="${W_PROGRAMS_X86_WIN}/LAV Filters/x86/avfilter-lav-6.dll" \
    homepage="https://github.com/Nevcairiel/LAVFilters"
w_metadata mdac27 dlls \
    title="Microsoft Data Access Components 2.7 sp1" \
    publisher="Microsoft" \
    year="2006" \
    media="download" \
    file1="MDAC_TYP.EXE" \
    installed_file1="${W_COMMONFILES_X86_WIN}/System/ADO/msado26.tlb"
w_metadata mdac28 dlls \
    title="Microsoft Data Access Components 2.8 sp1" \
    publisher="Microsoft" \
    year="2005" \
    media="download" \
    file1="MDAC_TYP.EXE" \
    installed_file1="${W_COMMONFILES_X86_WIN}/System/ADO/msado27.tlb"
w_metadata mdx dlls \
    title="Managed DirectX" \
    publisher="Microsoft" \
    year="2006" \
    media="download" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="C:/windows/assembly/GAC/microsoft.directx/1.0.2902.0__31bf3856ad364e35/microsoft.directx.dll"
w_metadata mf dlls \
    title="MS Media Foundation" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/mf.dll"
w_metadata mfc40 dlls \
    title="MS mfc40 (Microsoft Foundation Classes from win7sp1)" \
    publisher="Microsoft" \
    year="1999" \
    media="download" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/mfc40.dll"
w_metadata mfc70 dlls \
    title="Visual Studio (.NET) 2002 mfc70 library" \
    publisher="Microsoft" \
    year="2006" \
    media="download" \
    file1="VS7.0sp1-KB924642-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/mfc70.dll"
w_metadata msaa dlls \
    title="MS Active Accessibility (oleacc.dll, oleaccrc.dll, msaatext.dll)" \
    publisher="Microsoft" \
    year="2003" \
    media="download" \
    file1="MSAA20_RDK.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/oleacc.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/oleaccrc.dll" \
    installed_file3="${W_SYSTEM32_DLLS_WIN}/msaatext.dll"
w_metadata msacm32 dlls \
    title="MS ACM32" \
    publisher="Microsoft" \
    year="2003" \
    media="download" \
    file1="../winxpsp3/WindowsXP-KB936929-SP3-x86-ENU.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/msacm32.dll"
w_metadata msasn1 dlls \
    title="MS ASN1" \
    publisher="Microsoft" \
    year="2003" \
    media="download" \
    file1="../win2ksp4/W2KSP4_EN.EXE" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/msasn1.dll"
w_metadata msctf dlls \
    title="MS Text Service Module" \
    publisher="Microsoft" \
    year="2003" \
    media="download" \
    file1="../winxpsp3/WindowsXP-KB936929-SP3-x86-ENU.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/msctf.dll"
w_metadata msdelta dlls \
    title="MSDelta differential compression library" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/msdelta.dll"
w_metadata msdxmocx dlls \
    title="MS Windows Media Player 2 ActiveX control for VB6" \
    publisher="Microsoft" \
    year="1999" \
    media="download" \
    file1="mpfull.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/msdxm.ocx"
w_metadata msflxgrd dlls \
    title="MS FlexGrid Control (msflxgrd.ocx)" \
    publisher="Microsoft" \
    year="2012" \
    media="download" \
    file1="../vb6sp6/VB60SP6-KB2708437-x86-ENU.msi" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/msflxgrd.ocx"
w_metadata mshflxgd dlls \
    title="MS Hierarchical FlexGrid Control (mshflxgd.ocx)" \
    publisher="Microsoft" \
    year="2012" \
    media="download" \
    file1="../vb6sp6/VB60SP6-KB2708437-x86-ENU.msi" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/mshflxgd.ocx"
w_metadata mspatcha dlls \
    title="MS mspatcha" \
    publisher="Microsoft" \
    year="2004" \
    media="download" \
    file1="../win2ksp4/W2KSP4_EN.EXE" \
    installed_exe1="${W_SYSTEM32_DLLS_WIN}/mspatcha.dll"
w_metadata msscript dlls \
    title="MS Windows Script Control" \
    publisher="Microsoft" \
    year="2004" \
    media="download" \
    file1="../winxpsp3/WindowsXP-KB936929-SP3-x86-ENU.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/msscript.ocx"
w_metadata msls31 dlls \
    title="MS Line Services" \
    publisher="Microsoft" \
    year="2001" \
    media="download" \
    file1="IE8-WindowsServer2003-x64-ENU.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/msls31.dll" \
    installed_file2="${W_SYSTEM64_DLLS_WIN64}/msls31.dll"
w_metadata msls31_nt4 dlls \
    title="MS Line Services (32-bit only)" \
    publisher="Microsoft" \
    year="2001" \
    media="download" \
    file1="InstMsiW.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/msls31.dll"
w_metadata msmask dlls \
    title="MS Masked Edit Control" \
    publisher="Microsoft" \
    year="2009" \
    media="download" \
    file1="../vb6sp6/VB60SP6-KB2708437-x86-ENU.msi" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/msmask32.ocx"
w_metadata msftedit dlls \
    title="Microsoft RichEdit Control" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/msftedit.dll"
w_metadata msvcrt40 dlls \
    title="MS Visual C++ Runtime Library Version 4.0" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../winxpsp3/WindowsXP-KB936929-SP3-x86-ENU.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/msvcrt40.dll"
w_metadata msxml3 dlls \
    title="MS XML Core Services 3.0" \
    publisher="Microsoft" \
    year="2005" \
    media="download" \
    file1="msxml3.msi" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/msxml3.dll"
w_metadata msxml4 dlls \
    title="MS XML Core Services 4.0" \
    publisher="Microsoft" \
    year="2009" \
    media="download" \
    file1="msxml.msi" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/msxml4.dll"
w_metadata msxml6 dlls \
    title="MS XML Core Services 6.0 sp2" \
    publisher="Microsoft" \
    year="2014" \
    media="download" \
    file1="msxml6-KB2957482-enu-amd64.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/msxml6.dll"
w_metadata nuget dlls \
    title="NuGet Package manager" \
    publisher="Outercurve Foundation" \
    year="2013" \
    media="download" \
    file1="nuget.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/nuget.exe" \
    homepage="https://nuget.org"
w_metadata ogg dlls \
    title="OpenCodecs 0.85: FLAC, Speex, Theora, Vorbis, WebM" \
    publisher="Xiph.Org Foundation" \
    year="2011" \
    media="download" \
    file1="opencodecs_0.85.17777.exe" \
    installed_file1="${W_PROGRAMS_X86_WIN}/Xiph.Org/Open Codecs/AxPlayer.dll" \
    homepage="https://xiph.org/dshow"
w_metadata ole32 dlls \
    title="MS ole32 Module (ole32.dll)" \
    publisher="Microsoft" \
    year="2015" \
    media="download" \
    file1="windowsserver2003-kb3072633-x64-enu_e3bee4ea9cab584b77067f26e4aeed5428436327.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/ole32.dll"
w_metadata oleaut32 dlls \
    title="MS oleaut32.dll" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/oleaut32.dll"
w_metadata openal dlls \
    title="OpenAL Runtime" \
    publisher="Creative" \
    year="2023" \
    media="download" \
    file1="oalinst.zip" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/OpenAL32.dll"
w_metadata otvdm090 dlls \
    title="Otvdm - A modified version of winevdm as Win16 emulator" \
    publisher="otya128" \
    year="2024" \
    media="download" \
    file1="otvdm-v0.9.0.zip"
w_metadata otvdm dlls \
    title="Otvdm - A modified version of winevdm as Win16 emulator" \
    publisher="otya128" \
    year="2024" \
    media="download"
w_metadata pdh dlls \
    title="MS pdh.dll (Performance Data Helper)" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    conflicts="pdh_nt4" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/pdh.dll"
w_metadata pdh_nt4 dlls \
    title="MS pdh.dll (Performance Data Helper); WinNT 4.0 Version" \
    publisher="Microsoft" \
    year="1997" \
    media="download" \
    conflicts="pdh" \
    file1="nt4pdhdll.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/pdh.dll"
w_metadata peverify dlls \
    title="MS peverify (from .NET 2.0 SDK)" \
    publisher="Microsoft" \
    year="2006" \
    media="download" \
    file1="../dotnet20sdk/setup.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/peverify.exe"
w_metadata physx dlls \
    title="PhysX" \
    publisher="Nvidia" \
    year="2024" \
    media="download" \
    file1="PhysX_9.23.1019_SystemSoftware.exe" \

w_metadata pngfilt dlls \
    title="pngfilt.dll (from winxp)" \
    publisher="Microsoft" \
    year="2004" \
    media="download" \
    file1="../winxpsp3/WindowsXP-KB936929-SP3-x86-ENU.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/pngfilt.dll"
w_metadata powershell_core dlls \
    title="PowerShell Core" \
    publisher="Microsoft" \
    year="2024" \
    media="download" \
    file1="PowerShell-7.4.11-win-x86.msi" \
    file2="PowerShell-7.4.11-win-x64.msi"
w_metadata powershell dlls \
    title="PowerShell Wrapper For Wine" \
    publisher="ProjectSynchro" \
    year="2024" \
    media="download" \
    file1="powershell32.exe" \
    file2="powershell64.exe" \
    file3="profile.ps1"
w_metadata prntvpt dlls \
    title="prntvpt.dll" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/prntvpt.dll"
w_metadata python26 dlls \
    title="Python interpreter 2.6.2" \
    publisher="Python Software Foundaton" \
    year="2009" \
    media="download" \
    file1="python-2.6.2.msi" \
    installed_exe1="c:/Python26/python.exe"
w_metadata python27 dlls \
    title="Python interpreter 2.7.16" \
    publisher="Python Software Foundaton" \
    year="2019" \
    media="download" \
    file1="python-2.7.16.msi" \
    installed_exe1="c:/Python27/python.exe"
w_metadata qasf dlls \
    title="qasf.dll" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/qasf.dll"
w_metadata qcap dlls \
    title="qcap.dll" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/qcap.dll"
w_metadata qdvd dlls \
    title="qdvd.dll" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/qdvd.dll"
w_metadata qedit dlls \
    title="qedit.dll" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/qedit.dll"
w_metadata quartz dlls \
    title="quartz.dll" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    conflicts="devenum quartz_feb2010" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/quartz.dll"
w_metadata quartz_feb2010 dlls \
    title="quartz.dll (February 2010)" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    conflicts="quartz" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/quartz.dll"
w_metadata quicktime72 dlls \
    title="Apple QuickTime 7.2" \
    publisher="Apple" \
    year="2010" \
    media="download" \
    file1="QuickTimeInstaller.exe" \
    installed_file1="${W_WINDIR_WIN}/Installer/{95A890AA-B3B1-44B6-9C18-A8F7AB3EE7FC}/QTPlayer.ico"
w_metadata quicktime76 dlls \
    title="Apple QuickTime 7.6" \
    publisher="Apple" \
    year="2010" \
    media="download" \
    file1="QuickTimeInstaller.exe" \
    installed_file1="${W_WINDIR_WIN}/Installer/{57752979-A1C9-4C02-856B-FBB27AC4E02C}/QTPlayer.ico"
w_metadata riched20 dlls \
    title="MS RichEdit Control 2.0 (riched20.dll)" \
    publisher="Microsoft" \
    year="2004" \
    media="download" \
    file1="../win2ksp4/W2KSP4_EN.EXE" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/riched20.dll"
w_metadata riched30 dlls \
    title="MS RichEdit Control 3.0 (riched20.dll, msls31.dll)" \
    publisher="Microsoft" \
    year="2001" \
    media="download" \
    file1="InstMsiA.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/riched20.dll" \
    installed_file2="${W_SYSTEM32_DLLS_WIN}/msls31.dll"
w_metadata richtx32 dlls \
    title="MS Rich TextBox Control 6.0" \
    publisher="Microsoft" \
    year="2012" \
    media="download" \
    file1="../vb6sp6/VB60SP6-KB2708437-x86-ENU.msi" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/richtx32.ocx"
w_metadata sapi dlls \
    title="MS Speech API" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    conflicts="speechsdk" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/sapi.dll"
w_metadata sdl dlls \
    title="Simple DirectMedia Layer" \
    publisher="Sam Lantinga" \
    year="2012" \
    media="download" \
    file1="SDL-1.2.15-win32.zip" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/SDL.dll"
w_metadata secur32 dlls \
    title="MS Security Support Provider Interface" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/secur32.dll"
w_metadata setupapi dlls \
    title="MS Setup API" \
    publisher="Microsoft" \
    year="2004" \
    media="download" \
    file1="../winxpsp3/WindowsXP-KB936929-SP3-x86-ENU.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/setupapi.dll"
w_metadata shockwave dlls \
    title="Shockwave" \
    publisher="Adobe" \
    year="2018" \
    media="download" \
    file1="sw_lic_full_installer.msi" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/Adobe/Shockwave 12/shockwave_Projector_Loader.dcr"
w_metadata speechsdk dlls \
    title="MS Speech SDK 5.1" \
    publisher="Microsoft" \
    year="2009" \
    media="download" \
    conflicts="sapi" \
    file1="SpeechSDK51.exe" \
    installed_file1="${W_PROGRAMS_X86_WIN}/Microsoft Speech SDK 5.1/Bin/SAPI51SampleApp.exe"
w_metadata tabctl32 dlls \
    title="Microsoft Tabbed Dialog Control 6.0 (tabctl32.ocx)" \
    publisher="Microsoft" \
    year="2012" \
    media="download" \
    file1="../vb6sp6/VB60SP6-KB2708437-x86-ENU.msi" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/tabctl32.ocx"
w_metadata uiribbon dlls \
    title="Windows UIRibbon" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/uiribbon.dll|${W_SYSTEM32_DLLS_WIN}/uiribbonres.dll"
w_metadata updspapi dlls \
    title="Windows Update Service API" \
    publisher="Microsoft" \
    year="2004" \
    media="download" \
    file1="../winxpsp3/WindowsXP-KB936929-SP3-x86-ENU.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/updspapi.dll"
w_metadata urlmon dlls \
    title="MS urlmon" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/urlmon.dll"
w_metadata usp10 dlls \
    title="Uniscribe" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/usp10.dll"
w_metadata vb2run dlls \
    title="MS Visual Basic 2 runtime" \
    publisher="Microsoft" \
    year="1993" \
    media="download" \
    file1="VBRUN200.EXE" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/VBRUN200.DLL"
w_metadata vb3run dlls \
    title="MS Visual Basic 3 runtime" \
    publisher="Microsoft" \
    year="1998" \
    media="download" \
    file1="vb3run.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/Vbrun300.dll"
w_metadata vb4run dlls \
    title="MS Visual Basic 4 runtime" \
    publisher="Microsoft" \
    year="1998" \
    media="download" \
    file1="vb4run.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/Vb40032.dll"
w_metadata vb5run dlls \
    title="MS Visual Basic 5 runtime" \
    publisher="Microsoft" \
    year="2001" \
    media="download" \
    file1="msvbvm50.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/msvbvm50.dll"
w_metadata vb6run dlls \
    title="MS Visual Basic 6 runtime" \
    publisher="Microsoft" \
    year="2008" \
    media="download" \
    file1="../winxpsp3/WindowsXP-KB936929-SP3-x86-ENU.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/msvbvm60.dll"
w_metadata vcrun6 dlls \
    title="Visual C++ 6 SP4 libraries (mfc42, msvcp60, msvcirt)" \
    publisher="Microsoft" \
    year="2000" \
    media="download" \
    file1="VC6RedistSetup_deu.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/mfc42.dll"
w_metadata mfc42 dlls \
    title="Visual C++ 6 SP4 mfc42 library; part of vcrun6" \
    publisher="Microsoft" \
    year="2000" \
    media="download" \
    file1="../vcrun6/VC6RedistSetup_deu.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/mfc42u.dll"
w_metadata msvcirt dlls \
    title="Visual C++ 6 SP4 msvcirt library; part of vcrun6" \
    publisher="Microsoft" \
    year="2000" \
    media="download" \
    file1="../vcrun6/VC6RedistSetup_deu.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/msvcirt.dll"
w_metadata vcrun6sp6 dlls \
    title="Visual C++ 6 SP6 libraries (with fixes in ATL and MFC)" \
    publisher="Microsoft" \
    year="2004" \
    media="download" \
    file1="VS6SP6.EXE" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/mfc42.dll"
w_metadata vcrun2003 dlls \
    title="Visual C++ 2003 libraries (mfc71,msvcp71,msvcr71)" \
    publisher="Microsoft" \
    year="2003" \
    media="download" \
    file1="BZEditW32_1.6.5.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/msvcp71.dll"
w_metadata mfc71 dlls \
    title="Visual C++ 2003 mfc71 library; part of vcrun2003" \
    publisher="Microsoft" \
    year="2003" \
    media="download" \
    file1="BZEditW32_1.6.5.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/mfc71.dll"
w_metadata vcrun2005 dlls \
    title="Visual C++ 2005 libraries (mfc80,msvcp80,msvcr80)" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="vcredist_x86.EXE" \
    installed_file1="${W_WINDIR_WIN}/winsxs/x86_Microsoft.VC80.MFC_1fc8b3b9a1e18e3b_8.0.50727.6195_x-ww_150c9e8b/mfc80.dll|${W_WINDIR_WIN}/winsxs/x86_microsoft.vc80.mfc_1fc8b3b9a1e18e3b_8.0.50727.6195_none_deadbeef/mfc80.dll"
w_metadata mfc80 dlls \
    title="Visual C++ 2005 mfc80 library; part of vcrun2005" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../vcrun2005/vcredist_x86.EXE" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/mfc80.dll"
w_metadata vcrun2008 dlls \
    title="Visual C++ 2008 libraries (mfc90,msvcp90,msvcr90)" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="vcredist_x86.exe" \
    installed_file1="${W_PROGRAMS_X86_WIN}/Common Files/Microsoft Shared/VC/msdia90.dll"
w_metadata mfc90 dlls \
    title="Visual C++ 2008 mfc90 library; part of vcrun2008" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../vcrun2008/vcredist_x86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/mfc90.dll"
w_metadata vcrun2010 dlls \
    title="Visual C++ 2010 libraries (mfc100,msvcp100,msvcr100)" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="vcredist_x86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/mfc100.dll"
w_metadata mfc100 dlls \
    title="Visual C++ 2010 mfc100 library; part of vcrun2010" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../vcrun2010/vcredist_x86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/mfc100u.dll"
w_metadata vcrun2012 dlls \
    title="Visual C++ 2012 libraries (atl110,mfc110,mfc110u,msvcp110,msvcr110,vcomp110)" \
    publisher="Microsoft" \
    year="2012" \
    media="download" \
    file1="vcredist_x86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/mfc110.dll"
w_metadata mfc110 dlls \
    title="Visual C++ 2012 mfc110 library; part of vcrun2012" \
    publisher="Microsoft" \
    year="2012" \
    media="download" \
    file1="../vcrun2012/vcredist_x86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/mfc110u.dll"
w_metadata vcrun2013 dlls \
    title="Visual C++ 2013 libraries (mfc120,mfc120u,msvcp120,msvcr120,vcomp120)" \
    publisher="Microsoft" \
    year="2013" \
    media="download" \
    file1="vcredist_x86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/mfc120.dll"
w_metadata mfc120 dlls \
    title="Visual C++ 2013 mfc120 library; part of vcrun2013" \
    publisher="Microsoft" \
    year="2013" \
    media="download" \
    file1="../vcrun2013/vcredist_x86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/mfc120u.dll"
w_metadata vcrun2015 dlls \
    title="Visual C++ 2015 libraries (concrt140.dll,mfc140.dll,mfc140u.dll,mfcm140.dll,mfcm140u.dll,msvcp140.dll,msvcp140_1.dll,msvcp140_atomic_wait.dll,vcamp140.dll,vccorlib140.dll,vcomp140.dll,vcruntime140.dll,vcruntime140_1.dll)" \
    publisher="Microsoft" \
    year="2015" \
    media="download" \
    conflicts="vcrun2017 vcrun2019 ucrtbase2019 vcrun2022 vcrun2026" \
    file1="vc_redist.x86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/mfc140.dll"
w_metadata mfc140 dlls \
    title="Visual C++ 2015 mfc140 library; part of vcrun2015" \
    publisher="Microsoft" \
    year="2015" \
    media="download" \
    file1="../vcrun2015/vc_redist.x86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/mfc140u.dll"
w_metadata vcrun2017 dlls \
    title="Visual C++ 2017 libraries (concrt140.dll,mfc140.dll,mfc140u.dll,mfcm140.dll,mfcm140u.dll,msvcp140.dll,msvcp140_1.dll,msvcp140_2.dll,msvcp140_atomic_wait.dll,vcamp140.dll,vccorlib140.dll,vcomp140.dll,vcruntime140.dll,vcruntime140_1.dll)" \
    publisher="Microsoft" \
    year="2017" \
    media="download" \
    conflicts="vcrun2015 vcrun2019 ucrtbase2019 vcrun2022 vcrun2026" \
    file1="vc_redist.x86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/mfc140.dll"
w_metadata vcrun2019 dlls \
    title="Visual C++ 2015-2019 libraries (concrt140.dll,mfc140.dll,mfc140u.dll,mfcm140.dll,mfcm140u.dll,msvcp140.dll,msvcp140_1.dll,msvcp140_2.dll,msvcp140_atomic_wait.dll,msvcp140_codecvt_ids.dll,vcamp140.dll,vccorlib140.dll,vcomp140.dll,vcruntime140.dll,vcruntime140_1.dll" \
    publisher="Microsoft" \
    year="2019" \
    media="download" \
    conflicts="vcrun2015 vcrun2017 vcrun2022 vcrun2026" \
    file1="vc_redist.x86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/mfc140.dll"
w_metadata ucrtbase2019 dlls \
    title="Visual C++ 2019 library (ucrtbase.dll)" \
    publisher="Microsoft" \
    year="2019" \
    media="download" \
    conflicts="vcrun2015 vcrun2017" \
    file1="vc_redist.x86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/ucrtbase.dll"
w_metadata vcrun2022 dlls \
    title="Visual C++ 2015-2022 libraries (concrt140.dll,mfc140.dll,mfc140chs.dll,mfc140cht.dll,mfc140deu.dll,mfc140enu.dll,mfc140esn.dll,mfc140fra.dll,mfc140ita.dll,mfc140jpn.dll,mfc140kor.dll,mfc140rus.dll,mfc140u.dll,mfcm140.dll,mfcm140u.dll,msvcp140.dll,msvcp140_1.dll,msvcp140_2.dll,msvcp140_atomic_wait.dll,msvcp140_codecvt_ids.dll,vcamp140.dll,vccorlib140.dll,vcomp140.dll,vcruntime140.dll,vcruntime140_1.dll)" \
    publisher="Microsoft" \
    year="2022" \
    media="download" \
    conflicts="vcrun2015 vcrun2017 vcrun2019 vcrun2026" \
    file1="vc_redist.x86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/vcruntime140.dll"
w_metadata vcrun2026 dlls \
    title="Visual C++ 2017-2026 libraries (concrt140.dll,mfc140.dll,mfc140chs.dll,mfc140cht.dll,mfc140deu.dll,mfc140enu.dll,mfc140esn.dll,mfc140fra.dll,mfc140ita.dll,mfc140jpn.dll,mfc140kor.dll,mfc140rus.dll,mfc140u.dll,mfcm140.dll,mfcm140u.dll,msvcp140.dll,msvcp140_1.dll,msvcp140_2.dll,msvcp140_atomic_wait.dll,msvcp140_codecvt_ids.dll,vcamp140.dll,vccorlib140.dll,vcomp140.dll,vcruntime140.dll,vcruntime140_1.dll)" \
    publisher="Microsoft" \
    year="2026" \
    media="download" \
    conflicts="vcrun2015 vcrun2017 vcrun2019 vcrun2022" \
    file1="vc_redist.x86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/vcruntime140.dll"
w_metadata vjrun20 dlls \
    title="MS Visual J# 2.0 SE libraries (requires dotnet20)" \
    publisher="Microsoft" \
    year="2007" \
    media="download" \
    file1="vjredist.exe" \
    installed_file1="${W_WINDIR_WIN}/Microsoft.NET/Framework/VJSharp/VJSharpSxS10.dll"
w_metadata vstools2019 apps \
    title="MS Visual Studio Build Tools 2019" \
    publisher="Microsoft" \
    year="2019" \
    media="download"
w_metadata webio dlls \
    title="MS Windows Web I/O" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/webio.dll"
w_metadata webview2 dlls \
    title="Microsoft Edge WebView2 Evergreen Runtime" \
    publisher="Microsoft" \
    year="2020" \
    media="download" \
    file1="MicrosoftEdgeWebview2Setup.exe" \
    installed_file1="${W_PROGRAMS_X86_WIN}/Microsoft/EdgeUpdate/MicrosoftEdgeUpdate.exe"
w_metadata windowscodecs dlls \
    title="MS Windows Imaging Component" \
    publisher="Microsoft" \
    year="2006" \
    media="download" \
    file1="wic_x86_enu.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/WindowsCodecs.dll"
w_metadata winhttp dlls \
    title="MS Windows HTTP Services" \
    publisher="Microsoft" \
    year="2005" \
    media="download" \
    file1="../win2ksp4/W2KSP4_EN.EXE" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/winhttp.dll"
w_metadata wininet dlls \
    title="MS Windows Internet API" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/wininet.dll"
w_metadata wininet_win2k dlls \
    title="MS Windows Internet API" \
    publisher="Microsoft" \
    year="2008" \
    media="download" \
    file1="../win2ksp4/W2KSP4_EN.EXE" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/wininet.dll"
w_metadata wmi dlls \
    title="Windows Management Instrumentation (aka WBEM) Core 1.5" \
    publisher="Microsoft" \
    year="2000" \
    media="download" \
    file1="wmi9x.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/wbem/wbemcore.dll"
w_metadata wmv9vcm dlls \
    title="MS Windows Media Video 9 Video Compression Manager" \
    publisher="Microsoft" \
    year="2013" \
    media="download" \
    file1="WindowsServer2003-WindowsMedia-KB2845142-x86-ENU.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/wmv9vcm.dll"
w_metadata wsh57 dlls \
    title="MS Windows Script Host 5.7" \
    publisher="Microsoft" \
    year="2007" \
    media="download" \
    file1="scripten.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/scrrun.dll"
w_metadata xact dlls \
    title="MS XACT Engine (32-bit only)" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/xactengine2_0.dll"
w_metadata xact_x64 dlls \
    title="MS XACT Engine (64-bit only)" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_Jun2010_redist.exe" \
    installed_file1="${W_SYSTEM64_DLLS_WIN64:-does_not_exist}/xactengine2_0.dll"
w_metadata xaudio29 dlls \
    title="MS XAudio Redistributable 2.9" \
    publisher="Microsoft" \
    year="2023" \
    media="download" \
    file1="microsoft.xaudio2.redist.1.2.11.nupkg" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/xaudio2_9.dll"
w_metadata xinput dlls \
    title="Microsoft XInput (Xbox controller support)" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/xinput1_1.dll"
w_metadata xmllite dlls \
    title="MS xmllite dll" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="../win7sp1/windows6.1-KB976932-X86.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/xmllite.dll"
w_metadata xna31 dlls \
    title="MS XNA Framework Redistributable 3.1" \
    publisher="Microsoft" \
    year="2009" \
    media="download" \
    file1="xnafx31_redist.msi" \
    installed_file1="C:/windows/assembly/GAC_32/Microsoft.Xna.Framework.Game/3.1.0.0__6d5c3888ef60e27d/Microsoft.Xna.Framework.Game.dll"
w_metadata xna40 dlls \
    title="MS XNA Framework Redistributable 4.0" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="xnafx40_redist.msi" \
    installed_file1="${W_PROGRAMS_X86_WIN}/Common Files/Microsoft Shared/XNA/Framework/v4.0/XnaNative.dll"
w_metadata xvid dlls \
    title="Xvid Video Codec" \
    publisher="xvid.org" \
    year="2019" \
    media="download" \
    file1="Xvid-1.3.7-20191228.exe" \
    installed_file1="${W_PROGRAMS_X86_WIN}/Xvid/xvid.ico"
w_metadata baekmuk fonts \
    title="Baekmuk Korean fonts" \
    publisher="Wooderart Inc. / kldp.net" \
    year="1999" \
    media="download" \
    file1="fonts-baekmuk_2.2.orig.tar.gz" \
    installed_file1="${W_FONTSDIR_WIN}/batang.ttf"
w_metadata cjkfonts fonts \
    title="All Chinese, Japanese, Korean fonts and aliases" \
    publisher="Various" \
    date="1999-2019" \
    media="download"
w_metadata calibri fonts \
    title="MS Calibri font" \
    publisher="Microsoft" \
    year="2007" \
    media="download" \
    file1="PowerPointViewer.exe" \
    installed_file1="${W_FONTSDIR_WIN}/calibri.ttf"
w_metadata cambria fonts \
    title="MS Cambria font" \
    publisher="Microsoft" \
    year="2009" \
    media="download" \
    file1="PowerPointViewer.exe" \
    installed_file1="${W_FONTSDIR_WIN}/cambria.ttc"
w_metadata candara fonts \
    title="MS Candara font" \
    publisher="Microsoft" \
    year="2009" \
    media="download" \
    file1="PowerPointViewer.exe" \
    installed_file1="${W_FONTSDIR_WIN}/candara.ttf"
w_metadata consolas fonts \
    title="MS Consolas console font" \
    publisher="Microsoft" \
    year="2011" \
    media="download" \
    file1="PowerPointViewer.exe" \
    installed_file1="${W_FONTSDIR_WIN}/consola.ttf"
w_metadata constantia fonts \
    title="MS Constantia font" \
    publisher="Microsoft" \
    year="2009" \
    media="download" \
    file1="PowerPointViewer.exe" \
    installed_file1="${W_FONTSDIR_WIN}/constan.ttf"
w_metadata corbel fonts \
    title="MS Corbel font" \
    publisher="Microsoft" \
    year="2009" \
    media="download" \
    file1="PowerPointViewer.exe" \
    installed_file1="${W_FONTSDIR_WIN}/corbel.ttf"
w_metadata meiryo fonts \
    title="MS Meiryo font" \
    publisher="Microsoft" \
    year="2009" \
    media="download" \
    conflicts="fakejapanese_vlgothic" \
    file1="PowerPointViewer.exe" \
    installed_file1="${W_FONTSDIR_WIN}/meiryo.ttc"
w_metadata pptfonts fonts \
    title="All MS PowerPoint Viewer fonts" \
    publisher="various" \
    date="2007-2009" \
    media="download"
w_metadata andale fonts \
    title="MS Andale Mono font" \
    publisher="Microsoft" \
    year="2008" \
    media="download" \
    file1="andale32.exe" \
    installed_file1="${W_FONTSDIR_WIN}/andalemo.ttf"
w_metadata arial fonts \
    title="MS Arial / Arial Black fonts" \
    publisher="Microsoft" \
    year="2008" \
    media="download" \
    file1="arial32.exe" \
    installed_file1="${W_FONTSDIR_WIN}/arial.ttf"
w_metadata comicsans fonts \
    title="MS Comic Sans fonts" \
    publisher="Microsoft" \
    year="2008" \
    media="download" \
    file1="comic32.exe" \
    installed_file1="${W_FONTSDIR_WIN}/comic.ttf"
w_metadata courier fonts \
    title="MS Courier fonts" \
    publisher="Microsoft" \
    year="2008" \
    media="download" \
    file1="courie32.exe" \
    installed_file1="${W_FONTSDIR_WIN}/cour.ttf"
w_metadata georgia fonts \
    title="MS Georgia fonts" \
    publisher="Microsoft" \
    year="2008" \
    media="download" \
    file1="georgi32.exe" \
    installed_file1="${W_FONTSDIR_WIN}/georgia.ttf"
w_metadata impact fonts \
    title="MS Impact fonts" \
    publisher="Microsoft" \
    year="2008" \
    media="download" \
    file1="impact32.exe" \
    installed_file1="${W_FONTSDIR_WIN}/impact.ttf"
w_metadata times fonts \
    title="MS Times fonts" \
    publisher="Microsoft" \
    year="2008" \
    media="download" \
    file1="times32.exe" \
    installed_file1="${W_FONTSDIR_WIN}/times.ttf"
w_metadata trebuchet fonts \
    title="MS Trebuchet fonts" \
    publisher="Microsoft" \
    year="2008" \
    media="download" \
    file1="trebuchet32.exe" \
    installed_file1="${W_FONTSDIR_WIN}/trebuc.ttf"
w_metadata verdana fonts \
    title="MS Verdana fonts" \
    publisher="Microsoft" \
    year="2008" \
    media="download" \
    file1="verdan32.exe" \
    installed_file1="${W_FONTSDIR_WIN}/verdana.ttf"
w_metadata webdings fonts \
    title="MS Webdings fonts" \
    publisher="Microsoft" \
    year="2008" \
    media="download" \
    file1="webdin32.exe" \
    installed_file1="${W_FONTSDIR_WIN}/webdings.ttf"
w_metadata corefonts fonts \
    title="MS Arial, Courier, Times fonts" \
    publisher="Microsoft" \
    year="2008" \
    media="download" \
    file1="arial32.exe" \
    installed_file1="${W_FONTSDIR_WIN}/corefonts.installed"
w_metadata droid fonts \
    title="Droid fonts" \
    publisher="Ascender Corporation" \
    year="2009" \
    media="download" \
    file1="DroidSans-Bold.ttf" \
    installed_file1="${W_FONTSDIR_WIN}/droidsans-bold.ttf"
w_metadata eufonts fonts \
    title="Updated fonts for Romanian and Bulgarian" \
    publisher="Microsoft" \
    year="2008" \
    media="download" \
    file1="EUupdate.EXE" \
    installed_file1="${W_FONTSDIR_WIN}/trebucbd.ttf"
w_metadata fakechinese fonts \
    title="Creates aliases for Chinese fonts using Source Han Sans fonts" \
    publisher="Adobe" \
    year="2019"
w_metadata fakejapanese fonts \
    title="Creates aliases for Japanese fonts using Source Han Sans fonts" \
    publisher="Adobe" \
    year="2019"
w_metadata fakejapanese_ipamona fonts \
    title="Creates aliases for Japanese fonts using IPAMona fonts" \
    publisher="Jun Kobayashi" \
    year="2008"
w_metadata fakejapanese_vlgothic fonts \
    title="Creates aliases for Japanese Meiryo fonts using VLGothic fonts" \
    publisher="Project Vine / Daisuke Suzuki" \
    conflicts="meiryo" \
    year="2014"
w_metadata fakekorean fonts \
    title="Creates aliases for Korean fonts using Source Han Sans fonts" \
    publisher="Adobe" \
    year="2019"
w_metadata ipamona fonts \
    title="IPAMona Japanese fonts" \
    publisher="Jun Kobayashi" \
    year="2008" \
    media="download" \
    file1="opfc-ModuleHP-1.1.1_withIPAMonaFonts-1.0.8.tar.gz" \
    installed_file1="${W_FONTSDIR_WIN}/ipag-mona.ttf" \
    homepage="http://www.geocities.jp/ipa_mona/"
w_metadata liberation fonts \
    title="Red Hat Liberation fonts (Mono, Sans, SansNarrow, Serif)" \
    publisher="Red Hat" \
    year="2021" \
    media="download" \
    file1="liberation-fonts-ttf-2.1.5.tar.gz" \
    installed_file1="${W_FONTSDIR_WIN}/liberationmono-bolditalic.ttf"
w_metadata lucida fonts \
    title="MS Lucida Console font" \
    publisher="Microsoft" \
    year="1998" \
    media="download" \
    file1="eurofixi.exe" \
    installed_file1="${W_FONTSDIR_WIN}/lucon.ttf"
w_metadata micross fonts \
    title="MS Sans Serif font" \
    publisher="Microsoft" \
    year="2004" \
    media="download" \
    file1="../winxpsp3/WindowsXP-KB936929-SP3-x86-ENU.exe" \
    installed_file1="${W_FONTSDIR_WIN}/micross.ttf"
w_metadata opensymbol fonts \
    title="OpenSymbol fonts (replacement for Wingdings)" \
    publisher="libreoffice.org" \
    year="2022" \
    media="download" \
    file1="opens___.ttf" \
    installed_file1="${W_FONTSDIR_WIN}/opens___.ttf"
w_metadata sourcehansans fonts \
    title="Source Han Sans fonts" \
    publisher="Adobe" \
    year="2021" \
    media="download" \
    file1="SourceHanSans.ttc.zip" \
    installed_file1="${W_FONTSDIR_WIN}/sourcehansans.ttc"
w_metadata tahoma fonts \
    title="MS Tahoma font (not part of corefonts)" \
    publisher="Microsoft" \
    year="1999" \
    media="download" \
    file1="IELPKTH.CAB" \
    installed_file1="${W_FONTSDIR_WIN}/tahoma.ttf"
w_metadata takao fonts \
    title="Takao Japanese fonts" \
    publisher="Jun Kobayashi" \
    year="2010" \
    media="download" \
    file1="takao-fonts-ttf-003.02.01.zip" \
    installed_file1="${W_FONTSDIR_WIN}/takaogothic.ttf"
w_metadata uff fonts \
    title="Ubuntu Font Family" \
    publisher="Ubuntu" \
    year="2010" \
    media="download" \
    file1="ubuntu-font-family-0.83.zip" \
    installed_file1="${W_FONTSDIR_WIN}/ubuntu-r.ttf" \
    homepage="https://launchpad.net/ubuntu-font-family"
w_metadata vlgothic fonts \
    title="VLGothic Japanese fonts" \
    publisher="Project Vine / Daisuke Suzuki" \
    year="2014" \
    media="download" \
    file1="VLGothic-20141206.tar.xz" \
    installed_file1="${W_FONTSDIR_WIN}/vl-gothic-regular.ttf" \
    homepage="https://ja.osdn.net/projects/vlgothic"
w_metadata wenquanyi fonts \
    title="WenQuanYi CJK font" \
    publisher="wenq.org" \
    year="2009" \
    media="download" \
    file1="wqy-microhei-0.2.0-beta.tar.gz" \
    installed_file1="${W_FONTSDIR_WIN}/wqy-microhei.ttc"
w_metadata wenquanyizenhei fonts \
    title="WenQuanYi ZenHei font" \
    publisher="wenq.org" \
    year="2009" \
    media="download" \
    file1="wqy-zenhei-0.8.38-1.tar.gz" \
    installed_file1="${W_FONTSDIR_WIN}/wqy-zenhei.ttc"
w_metadata unifont fonts \
    title="Unifont alternative to Arial Unicode MS" \
    publisher="Roman Czyborra / GNU" \
    year="2021" \
    media="download" \
    file1="unifont-13.0.06.ttf" \
    installed_file1="${W_FONTSDIR_WIN}/unifont.ttf"
w_metadata allfonts fonts \
    title="All fonts" \
    publisher="various" \
    year="1998-2010" \
    media="download"
w_metadata 3m_library apps \
    title="3M Cloud Library" \
    publisher="3M Company" \
    year="2015" \
    media="download" \
    file1="cloudLibrary-2.1.1702011951-Setup.exe" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/cloudLibrary/cloudLibrary.exe" \
    homepage="https://www.yourcloudlibrary.com/"
w_metadata 7zip apps \
    title="7-Zip 24.09" \
    publisher="Igor Pavlov" \
    year="2024" \
    media="download" \
    file1="7z2409.exe" \
    installed_exe1="${W_PROGRAMS_WIN}/7-Zip/7zFM.exe"
w_metadata adobe_diged apps \
    title="Adobe Digital Editions 1.7" \
    publisher="Adobe" \
    year="2011" \
    media="download" \
    file1="setup.exe" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/Adobe/Adobe Digital Editions/digitaleditions.exe" \
    homepage="https://www.adobe.com/solutions/ebook/digital-editions.html"
w_metadata adobe_diged4 apps \
    title="Adobe Digital Editions 4.5" \
    publisher="Adobe" \
    year="2015" \
    media="download" \
    file1="ADE_4.5_Installer.exe" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/Adobe/Adobe Digital Editions 4.5/DigitalEditions.exe" \
    homepage="https://www.adobe.com/solutions/ebook/digital-editions.html"
w_metadata autohotkey apps \
    title="AutoHotKey" \
    publisher="autohotkey.org" \
    year="2010" \
    media="download" \
    file1="AutoHotkey_1.1.36.01_setup.exe" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/AutoHotkey/AutoHotkey.exe"
w_metadata busybox apps \
    title="BusyBox FRP-5579-g5749feb35" \
    publisher="Ron Yorston / Busybox authors" \
    year="2025" \
    media="download" \
    file1="busybox-w32-FRP-5579-g5749feb35.exe" \
    installed_exe1="${W_SYSTEM32_DLLS_WIN}/busybox.exe"
w_metadata cmake apps \
    title="CMake 2.8" \
    publisher="Kitware" \
    year="2013" \
    media="download" \
    file1="cmake-2.8.11.2-win32-x86.exe" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/CMake 2.8/bin/cmake-gui.exe"
w_metadata colorprofile apps \
    title="Standard RGB color profile" \
    publisher="Microsoft" \
    year="2005" \
    media="download" \
    file1="ColorProfile.exe" \
    installed_exe1="${W_WINDIR_WIN}/system32/spool/drivers/color/sRGB Color Space Profile.icm"
w_metadata controlpad apps \
    title="MS ActiveX Control Pad" \
    publisher="Microsoft" \
    year="1997" \
    media="download" \
    file1="setuppad.exe" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/ActiveX Control Pad/PED.EXE"
w_metadata controlspy apps \
    title="Control Spy 6 " \
    publisher="Microsoft" \
    year="2005" \
    media="download" \
    file1="ControlSpyV6.exe" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/Microsoft/ControlSpy/ControlSpyV6.exe"
w_metadata dxdiag dlls \
    title="DirectX Diagnostic Tool" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="../directx9/directx_feb2010_redist.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/dxdiag.exe"
w_metadata dxwnd apps \
    title="Window hooker to run fullscreen programs in window and much more..." \
    publisher="ghotik" \
    year="2011" \
    media="download" \
    file1="v2_05_88_build.rar" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/dxwnd/dxwnd.exe" \
    homepage="https://dxwnd.sourceforge.io"
w_metadata emu8086 apps \
    title="emu8086" \
    publisher="emu8086.com" \
    year="2015" \
    media="download" \
    file1="emu8086v408r11.zip" \
    installed_exe1="c:/emu8086/emu8086.exe"
w_metadata firefox apps \
    title="Firefox 51.0" \
    publisher="Mozilla" \
    year="2017" \
    media="download" \
    file1="FirefoxSetup51.0.exe" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/Mozilla Firefox/firefox.exe"
w_metadata fontxplorer apps \
    title="Font Xplorer 1.2.2" \
    publisher="Moon Software" \
    year="2001" \
    media="download" \
    file1="Font_Xplorer_122_Free.exe" \
    installed_file1="${W_PROGRAMS_X86_WIN}/Font Xplorer/FXplorer.exe" \
    homepage="http://www.moonsoftware.com/fxplorer.asp"
load_fontxplorer()
{
    # 2011/05/15: http://www.moonsoftware.com/files/legacy/Font_Xplorer_122_Free.exe e3a53841c133e2ecfeb75c7ea277e23011317bb031f8caf423b7e9b7f92d85e0
    # 2019/06/14: http://www.moonsoftware.com/files/legacy/Font_Xplorer_122_Free.exe is dead
    w_download https://web.archive.org/web/20190217101943/http://www.moonsoftware.com/files/legacy/Font_Xplorer_122_Free.exe e3a53841c133e2ecfeb75c7ea277e23011317bb031f8caf423b7e9b7f92d85e0
    w_try_cd "${W_CACHE}/fontxplorer"
    w_try "${WINE}" Font_Xplorer_122_Free.exe ${W_OPT_UNATTENDED:+/S}
    w_killall "explorer.exe"
}
w_metadata foobar2000 apps \
    title="foobar2000 v1.4" \
    publisher="Peter Pawlowski" \
    year="2018" \
    media="manual_download" \
    file1="foobar2000_v1.4.exe" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/foobar2000/foobar2000.exe"
load_foobar2000()
{
    # 2016/12/21: 1.3.14 - 72d024d258c2f3b6cea62dc47fb613848202e7f33f2331f6b2e0a8e61daffcb6
    # 2018/07/25: 1.4    - 7c048faecfec79f9ec2b332b2c68b25e0d0219b47a7c679fe56f2ec05686a96a

    w_download_manual https://www.foobar2000.org/download foobar2000_v1.4.exe 7c048faecfec79f9ec2b332b2c68b25e0d0219b47a7c679fe56f2ec05686a96a
    w_try_cd "${W_CACHE}/${W_PACKAGE}"
    w_try "${WINE}" "${file1}" ${W_OPT_UNATTENDED:+/S}
}
w_metadata hhw apps \
    title="HTML Help Workshop" \
    publisher="Microsoft" \
    year="2000" \
    media="download" \
    file1="htmlhelp.exe" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/HTML Help Workshop/hhw.exe"
w_metadata iceweasel apps \
    title="GNU Icecat 31.7.0" \
    publisher="GNU Foundation" \
    year="2015" \
    media="download" \
    file1="icecat-31.7.0.en-US.win32.zip" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/icecat/icecat.exe"
w_metadata ie6 dlls \
    title="Internet Explorer 6" \
    publisher="Microsoft" \
    year="2002" \
    media="download" \
    conflicts="ie7 ie8" \
    file1="ie60.exe" \
    installed_file1="c:/Program Files/Internet Explorer/iedetect.dll"
w_metadata ie7 dlls \
    title="Internet Explorer 7" \
    publisher="Microsoft" \
    year="2008" \
    media="download" \
    conflicts="ie6 ie8" \
    file1="IE7-WindowsXP-x86-enu.exe" \
    installed_file1="${W_WINDIR_WIN}/ie7.log"
w_metadata ie8 dlls \
    title="Internet Explorer 8" \
    publisher="Microsoft" \
    year="2009" \
    media="download" \
    conflicts="ie6 ie7" \
    file1="IE8-WindowsXP-x86-ENU.exe" \
    installed_file1="${W_WINDIR_WIN}/ie8_main.log"
w_metadata kindle apps \
    title="Amazon Kindle" \
    publisher="Amazon" \
    year="2017" \
    media="download" \
    file1="KindleForPC-installer-1.16.44025.exe" \
    installed_exe1="${W_PROGRAMS_WIN}/Amazon/Kindle/Kindle.exe" \
    homepage="https://www.amazon.com/kindle-dbs/fd/kcp"
w_metadata kobo apps \
    title="Kobo e-book reader" \
    publisher="Kobo" \
    year="2011" \
    media="download" \
    file1="KoboSetup.exe" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/Kobo/Kobo.exe" \
    homepage="http://www.borders.com/online/store/MediaView_ereaderapps"
w_metadata mingw apps \
    title="Minimalist GNU for Windows, including GCC for Windows" \
    publisher="GNU" \
    year="2013" \
    media="download" \
    file1="mingw-get-setup.exe" \
    installed_exe1="c:/MinGW/bin/gcc.exe" \
    homepage="http://mingw.org/wiki/Getting_Started"
w_metadata mozillabuild apps \
    title="Mozilla build environment" \
    publisher="Mozilla Foundation" \
    year="2015" \
    media="download" \
    file1="MozillaBuildSetup-2.0.0.exe" \
    installed_file1="c:/mozilla-build/moztools/bin/nsinstall.exe" \
    homepage="https://wiki.mozilla.org/MozillaBuild"
w_metadata mpc apps \
    title="Media Player Classic - Home Cinema" \
    publisher="doom9 folks" \
    year="2014" \
    media="download" \
    file1="MPC-HC.1.7.5.x86.exe" \
    installed_file1="${W_PROGRAMS_X86_WIN}/MPC-HC/mpc-hc.exe" \
    homepage="https://mpc-hc.sourceforge.io/"
w_metadata mspaint apps \
    title="MS Paint" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="windowsxp-kb978706-x86-enu_f4e076b3867c2f08b6d258316aa0e11d6822b8d7.exe" \
    installed_file1="${W_WINDIR_WIN}/mspaint.exe"
w_metadata mt4 apps \
    title="Meta Trader 4" \
    year="2005" \
    media="download" \
    file1="mt4setup.exe"
w_metadata njcwp_trial apps \
    title="NJStar Chinese Word Processor trial" \
    publisher="NJStar" \
    year="2015" \
    media="download" \
    file1="njcwp610sw15918.exe" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/NJStar Chinese WP6/NJStar.exe" \
    homepage="https://www.njstar.com/cms/njstar-chinese-word-processor"
w_metadata njjwp_trial apps \
    title="NJStar Japanese Word Processor trial" \
    publisher="NJStar" \
    year="2009" \
    media="download" \
    file1="njjwp610sw15918.exe" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/NJStar Japanese WP6/NJStarJ.exe" \
    homepage="https://www.njstar.com/cms/njstar-japanese-word-processor"
w_metadata nook apps \
    title="Nook for PC (e-book reader)" \
    publisher="Barnes & Noble" \
    year="2011" \
    media="download" \
    file1="bndr2_setup_latest.exe" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/Barnes & Noble/BNDesktopReader/BNDReader.exe" \
    homepage="https://www.barnesandnoble.com/h/nook/apps"
w_metadata npp apps \
    title="Notepad++" \
    publisher="Don Ho" \
    year="2026" \
    media="download" \
    file1="npp.8.9.1.Installer.x64.exe" \
    installed_exe1="${W_PROGRAMS_WIN}/Notepad++/notepad++.exe"
w_metadata ollydbg110 apps \
    title="OllyDbg" \
    publisher="ollydbg.de" \
    year="2004" \
    media="download" \
    file1="odbg110.zip" \
    installed_file1="c:/ollydbg110/OLLYDBG.EXE" \
    homepage="http://ollydbg.de"
w_metadata ollydbg200 apps \
    title="OllyDbg" \
    publisher="ollydbg.de" \
    year="2010" \
    media="download" \
    file1="odbg200.zip" \
    installed_file1="c:/ollydbg200/ollydbg.exe" \
    homepage="http://ollydbg.de"
w_metadata ollydbg201 apps \
    title="OllyDbg" \
    publisher="ollydbg.de" \
    year="2013" \
    media="download" \
    file1="odbg201.zip" \
    installed_file1="c:/ollydbg201/ollydbg.exe" \
    homepage="http://ollydbg.de"
w_metadata openwatcom apps \
    title="Open Watcom C/C++ compiler (can compile win16 code!)" \
    publisher="Watcom" \
    year="2010" \
    media="download" \
    file1="open-watcom-c-win32-1.9.exe" \
    installed_file1="c:/WATCOM/owsetenv.bat" \
    homepage="http://www.openwatcom.org"
w_metadata procexp apps \
    title="Process Explorer" \
    publisher="Steve P. Miller" \
    year="2006" \
    media="download" \

w_metadata protectionid apps \
    title="Protection ID" \
    publisher="CDKiLLER & TippeX" \
    year="2016" \
    media="manual_download" \
    file1="ProtectionId.685.December.2016.rar" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/protection_id.exe"
load_protectionid()
{
    w_download "https://web.archive.org/web/20181209123344/https://pid.wiretarget.com/?f=ProtectionId.685.December.2016.rar" 27a84d740c9fb96cc866438a2b5cd4afc350affc8b7a0122c28c651af3559aea ProtectionId.685.December.2016.rar
    w_try_cd "${W_SYSTEM32_DLLS}"
    w_try_unrar "${W_CACHE}/${W_PACKAGE}/${file1}"

    # ProtectionId.685.December.2016 has a different executable name than usual, this may need to be disabled on next update:
    w_try mv Protection_ID.eXe protection_id_.exe
    w_try mv protection_id_.exe protection_id.exe
}
w_metadata psdk2003 apps \
    title="MS Platform SDK 2003" \
    publisher="Microsoft" \
    year="2003" \
    media="download" \
    file1="5.2.3790.1830.15.PlatformSDK_Svr2003SP1_rtm.img" \
    installed_file1="${W_PROGRAMS_X86_WIN}/Microsoft Platform SDK/SetEnv.Cmd"
w_metadata psdkwin71 apps \
    title="MS Windows 7.1 SDK" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="winsdk_web.exe" \
    installed_exe1="C:/Program Files/Microsoft SDKs/Windows/v7.1/Bin/SetEnv.Cmd"
w_metadata safari apps \
    title="Safari" \
    publisher="Apple" \
    year="2010" \
    media="download" \
    file1="SafariSetup.exe" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/Safari/Safari.exe"
w_metadata sketchup apps \
    title="SketchUp 8" \
    publisher="Google" \
    year="2012" \
    media="download" \
    file1="GoogleSketchUpWEN.exe" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/Google/Google SketchUp 8/SketchUp.exe"
w_metadata steam apps \
    title="Steam" \
    publisher="Valve" \
    year="2010" \
    media="download" \
    file1="SteamSetup.exe" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/Steam/Steam.exe"
w_metadata ubisoftconnect apps \
    title="Ubisoft Connect" \
    publisher="Ubisoft" \
    year="2020" \
    media="download" \
    file1="UbisoftConnectInstaller.exe" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/Ubisoft/Ubisoft Game Launcher/UbisoftConnect.exe"
load_ubisoftconnect()
{
    # Changes too frequently, don't check anymore
    w_download https://ubistatic3-a.akamaihd.net/orbit/launcher_installer/UbisoftConnectInstaller.exe
    w_try_cd "${W_CACHE}/${W_PACKAGE}"

    # NSIS installer
    w_try "${WINE}" UbisoftConnectInstaller.exe ${W_OPT_UNATTENDED:+ /S}
}
w_metadata utorrent apps \
    title="µTorrent 2.2.1" \
    publisher="BitTorrent" \
    year="2011" \
    media="manual_download" \
    file1="utorrent_2.2.1.exe" \
    installed_exe1="${W_WINDIR_WIN}/utorrent.exe"
load_utorrent()
{
    # BitTorrent client supported on Windows, OS X, Linux through Wine
    # 2012/03/07: sha256sum ec2c086ff784b06e4ff05243164ddb768b81ee32096afed6d5e574ff350b619e
    w_download_manual "https://www.oldapps.com/utorrent.php?old_utorrent=38" utorrent_2.2.1.exe ec2c086ff784b06e4ff05243164ddb768b81ee32096afed6d5e574ff350b619e

    w_try cp -f "${W_CACHE}/utorrent/${file1}" "${W_WINDIR_UNIX}"/utorrent.exe
}
w_metadata utorrent3 apps \
    title="µTorrent 3.4" \
    publisher="BitTorrent" \
    year="2011" \
    media="download" \
    file1="uTorrent.exe" \
    installed_exe1="c:/users/${LOGNAME}/Application Data/uTorrent/uTorrent.exe"
w_metadata vc2005express apps \
    title="MS Visual C++ 2005 Express" \
    publisher="Microsoft" \
    year="2005" \
    media="download" \
    file1="VC.iso" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/Microsoft Visual Studio 8/Common7/IDE/VCExpress.exe"
w_metadata vc2005expresssp1 apps \
    title="MS Visual C++ 2005 Express SP1" \
    publisher="Microsoft" \
    year="2007" \
    media="download" \
    file1="VS80sp1-KB926748-X86-INTL.exe"
w_metadata vc2005trial apps \
    title="MS Visual C++ 2005 Trial" \
    publisher="Microsoft" \
    year="2005" \
    media="download" \
    file1="En_vs_2005_vsts_180_Trial.img" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/Microsoft Visual Studio 8/Common7/IDE/devenv.exe"
w_metadata vc2008express apps \
    title="MS Visual C++ 2008 Express" \
    publisher="Microsoft" \
    year="2008" \
    media="download" \
    file1="VS2008ExpressENUX1397868.iso" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/Microsoft Visual Studio 9.0/Common7/IDE/VCExpress.exe"
w_metadata vc2010express apps \
    title="MS Visual C++ 2010 Express" \
    publisher="Microsoft" \
    year="2010" \
    media="download" \
    file1="VS2010Express1.iso" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/Microsoft Visual Studio 10.0/Common7/IDE/VCExpress.exe"
w_metadata vlc apps \
    title="VLC media player 3.0.23" \
    publisher="VideoLAN" \
    year="2026" \
    media="download" \
    file1="vlc-3.0.23-win64.exe" \
    installed_file1="${W_PROGRAMS_WIN}/VideoLAN/VLC/vlc.exe" \
    homepage="https://www.videolan.org/vlc/"
w_metadata winamp apps \
    title="Winamp" \
    publisher="Radionomy (AOL (Nullsoft))" \
    year="2013" \
    media="download" \
    file1="winamp5666_full_all_redux.exe" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/Winamp/winamp.exe" \
    homepage="https://www.winamp.com/"
w_metadata winrar apps \
    title="WinRAR 6.11" \
    publisher="RARLAB" \
    year="1993" \
    media="download" \
    file1="winrar-x32-611.exe" \
    installed_exe1="${W_PROGRAMS_WIN}/WinRAR/WinRAR.exe"
w_metadata wme9 apps \
    title="MS Windows Media Encoder 9 (broken in Wine)" \
    publisher="Microsoft" \
    year="2002" \
    media="download" \
    file1="WMEncoder.exe" \
    installed_file1="${W_PROGRAMS_X86_WIN}/Windows Media Components/Encoder/wmenc.exe"
w_metadata wmp9 dlls \
    title="Windows Media Player 9" \
    publisher="Microsoft" \
    year="2003" \
    media="download" \
    file1="MPSetup.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}"/l3codeca.acm
w_metadata wmp10 dlls \
    title="Windows Media Player 10" \
    publisher="Microsoft" \
    year="2006" \
    media="download" \
    file1="MP10Setup.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/l3codecp.acm"
w_metadata wmp11 dlls \
    title="Windows Media Player 11" \
    publisher="Microsoft" \
    year="2007" \
    media="download" \
    file1="wmp11-windowsxp-x86-enu.exe" \
    installed_file1="${W_PROGRAMS_X86_WIN}/Windows Media Player/wmplayer.exe"
w_metadata 3dmark2000 benchmarks \
    title="3DMark2000" \
    publisher="MadOnion.com" \
    year="2000" \
    media="download" \
    file1="3dmark2000_v11_100308.exe" \
    installed_file1="${W_PROGRAMS_X86_WIN}/MadOnion.com/3DMark2000/3DMark2000.exe"
w_metadata 3dmark2001 benchmarks \
    title="3DMark2001" \
    publisher="MadOnion.com" \
    year="2001" \
    media="download" \
    file1="3dmark2001se_330_100308.exe" \
    installed_file1="${W_PROGRAMS_X86_WIN}/MadOnion.com/3DMark2001 SE/3DMark2001SE.exe"
w_metadata 3dmark03 benchmarks \
    title="3D Mark 03" \
    publisher="Futuremark" \
    year="2003" \
    media="manual_download" \
    file1="3DMark03_v360_1901.exe" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/Futuremark/3DMark03/3DMark03.exe"
load_3dmark03()
{
    # https://www.futuremark.com/benchmarks/3dmark03/download/
    if ! test -f "${W_CACHE}/${W_PACKAGE}/3DMark03_v360_1901.exe"; then
        w_download_manual https://www.futuremark.com/download/3dmark03/ 3DMark03_v360_1901.exe 86d7f73747944c553e47e6ab5a74138e8bbca07fab8216ae70a61ac7f9a1c468
    fi

    w_try_cd "${W_CACHE}/${W_PACKAGE}"
    w_warn "Don't use mouse while this installer is running.  Sorry..."
    # This old installer doesn't seem to be scriptable the usual way, so spray and pray.
    w_ahk_do "
        SetTitleMatchMode, 2
        run 3DMark03_v360_1901.exe
        WinWait 3DMark03 - InstallShield Wizard, Welcome
        if ( w_opt_unattended > 0 ) {
            WinActivate
            Send {Enter}
            Sleep 2000
            WinWait 3DMark03 - InstallShield Wizard, License
            WinActivate
            ; Accept license
            Send a
            Send {Enter}
            Sleep 2000
            ; Choose Destination
            Send {Enter}
            Sleep 2000
            ; Begin install
            Send {Enter}
            ; Wait for install to finish
            WinWait 3DMark03, Registration
            ; Purchase later
            Send {Tab}
            Send {Tab}
            Send {Enter}
        }
        WinWait, 3DMark03 - InstallShield Wizard, Complete
        if ( w_opt_unattended > 0 ) {
            ; Uncheck readme
            Send {Space}
            Send {Tab}
            Send {Tab}
            Send {Enter}
        }
        WinWaitClose, 3DMark03 - InstallShield Wizard, Complete
    "
}
w_metadata 3dmark05 benchmarks \
    title="3D Mark 05" \
    publisher="Futuremark" \
    year="2005" \
    media="download" \
    file1="3dmark05_v130_1901.exe" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/Futuremark/3DMark05/3DMark05.exe"
w_metadata 3dmark06 benchmarks \
    title="3D Mark 06" \
    publisher="Futuremark" \
    year="2006" \
    media="manual_download" \
    file1="3DMark06_v121_installer.exe" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/Futuremark/3DMark06/3DMark06.exe"
load_3dmark06()
{
    w_download_manual https://www.futuremark.com/support/downloads 3DMark06_v121_installer.exe 362ebafd2b9c89a59a233e4328596438b74a32827feb65fe2837154c60a37da3

    w_try_cd "${W_CACHE}/${W_PACKAGE}"
    w_ahk_do "
        run ${file1}
        WinWait ahk_class #32770, Welcome
        if ( w_opt_unattended > 0 ) {
            Send {Enter}
            WinWait, ahk_class #32770, License
            ControlClick Button1 ; Accept
            ControlClick Button4 ; Next
            WinWait, ahk_class #32770, Destination
            ControlClick Button1 ; Next
            WinWait, ahk_class #32770, Install
            ControlClick Button1 ; Install
            WinWait ahk_class OpenAL Installer
            ControlClick Button2 ; OK
            WinWait ahk_class #32770
            ControlClick Button1 ; OK
        }
        WinWait, ahk_class #32770, Complete
        if ( w_opt_unattended > 0 ) {
            ControlClick Button1 ; Uncheck view readme
            ControlClick Button3 ; Finish
        }
        WinWaitClose, ahk_class #32770, Complete
    "

    if w_workaround_wine_bug 24417 "Installing shader compiler..."; then
        # "Demo" button doesn't work without this.  d3dcompiler_43 related.
        w_call d3dx9_28
        w_call d3dx9_36
    fi

    if w_workaround_wine_bug 22392; then
        w_warn "You must run the app with the -nosysteminfo option to avoid a crash on startup"
    fi
}
w_metadata stalker_pripyat_bench benchmarks \
    title="S.T.A.L.K.E.R.: Call of Pripyat benchmark" \
    publisher="GSC Game World" \
    year="2009" \
    media="manual_download" \
    file1="stkcop-bench-setup.exe" \
    installed_exe1="${W_PROGRAMS_X86_WIN}/Call Of Pripyat Benchmark/Benchmark.exe"
load_stalker_pripyat_bench()
{
    # Much faster
    w_download_manual http://www.bigdownload.com/games/stalker-call-of-pripyat/pc/stalker-call-of-pripyat-benchmark stkcop-bench-setup.exe 8c810fba1bbb9c58fc01f4f602479886680c9f4b491dd0afe935e27083f54845
    #w_download https://files.gsc-game.com/st/bench/stkcop-bench-setup.exe 8c810fba1bbb9c58fc01f4f602479886680c9f4b491dd0afe935e27083f54845

    w_try_cd "${W_CACHE}/${W_PACKAGE}"

    # FIXME: a bit fragile, if you're browsing the web while installing, it sometimes gets stuck.
    w_ahk_do "
        SetTitleMatchMode, 2
        run ${file1}
        WinWait,Setup - Call Of Pripyat Benchmark
        if ( w_opt_unattended > 0 ) {
            sleep 1000
            ControlClick TNewButton1 ; Next
            WinWait,Setup - Call Of Pripyat Benchmark,License
            sleep 1000
            ControlClick TNewRadioButton1 ; accept
            sleep 1000
            ControlClick TNewButton2 ; Next
            WinWait,Setup - Call Of Pripyat Benchmark,Destination
            sleep 1000
            ControlClick TNewButton3 ; Next
            WinWait,Setup - Call Of Pripyat Benchmark,shortcuts
            sleep 1000
            ControlClick TNewButton4 ; Next
            WinWait,Setup - Call Of Pripyat Benchmark,performed
            sleep 1000
            ControlClick TNewButton4 ; Next
            WinWait,Setup - Call Of Pripyat Benchmark,ready
            sleep 1000
            ControlClick, TNewButton4 ; Next  (nah, who reads doc?)
        }
        WinWait,Setup - Call Of Pripyat Benchmark,finished
        if ( w_opt_unattended > 0 ) {
            sleep 1000
            Send {Space}  ; uncheck launch
            sleep 1000
            ControlClick TNewButton4 ; Finish
        }
        WinWaitClose,Setup - Call Of Pripyat Benchmark,finished
    "

    if w_workaround_wine_bug 24868; then
        w_call d3dx9_31
        w_call d3dx9_42
    fi
}
w_metadata unigine_heaven benchmarks \
    title="Unigen Heaven 2.1 Benchmark" \
    publisher="Unigen" \
    year="2010" \
    media="manual_download" \
    file1="Unigine_Heaven-2.1.msi"
load_unigine_heaven()
{
    w_download_manual "https://www.fileplanet.com/212489/210000/fileinfo/Unigine-'Heaven'-Benchmark-2.1-%28Windows%29" 47113b285253a1ebce04527a31d734c0dfce5724e8d2643c6c1b822a940e7073

    w_try_cd "${W_CACHE}/${W_PACKAGE}"
    w_ahk_do "
        SetWinDelay 1000
        SetTitleMatchMode, 2
        run msiexec /i ${file1}
        if ( w_opt_unattended > 0 ) {
            WinWait ahk_class MsiDialogCloseClass
            Send {Enter}
            WinWait ahk_class MsiDialogCloseClass, License
            ControlClick Button1 ; Accept
            ControlClick Button3 ; Accept
            WinWait ahk_class MsiDialogCloseClass, Choose
            ControlClick Button1 ; Typical
            WinWait ahk_class MsiDialogCloseClass, Ready
            ControlClick Button2 ; Install
            ; FIXME: on systems with OpenAL already (Win7?), the next four lines
            ; are not needed.  We should somehow wait for either OpenAL window
            ; *or* Completed window.
            WinWait ahk_class OpenAL Installer
            ControlClick Button2 ; OK
            WinWait ahk_class #32770
            ControlClick Button1 ; OK
        }
        WinWait ahk_class MsiDialogCloseClass, Completed
        if ( w_opt_unattended > 0 ) {
            ControlClick Button1 ; Finish
            Send {Enter}
        }
        winwaitclose
    "
}
w_metadata wglgears benchmarks \
    title="wglgears" \
    publisher="Clinton L. Jeffery" \
    year="2005" \
    media="download" \
    file1="wglgears.exe" \
    installed_exe1="${W_SYSTEM32_DLLS_WIN}/wglgears.exe"
w_metadata graphics=wayland settings \
    title_zh_CN="将图形驱动设置为 Wayland" \
    title_zh_TW="將圖形驅動設為 Wayland" \
    title="Set graphics driver to Wayland"
w_metadata graphics=x11 settings \
    title_zh_CN="将图形驱动设置为 X11" \
    title_zh_TW="將圖形驅動設為 X11" \
    title="Set graphics driver to X11"
w_metadata graphics=mac settings \
    title_zh_CN="将图形驱动设置为 Quartz（针对 macOS）" \
    title_zh_TW="將圖形驅動設為 Quartz（適用於 macOS）" \
    title="Set graphics driver to Quartz (for macOS)"
w_metadata graphics=default settings \
    title_zh_CN="将图形驱动恢复默认设置" \
    title_zh_TW="將圖形驅動還原為預設值" \
    title="Set graphics driver to default"
w_metadata mwo=force settings \
    title="Set DirectInput MouseWarpOverride to force (needed by some games)"
w_metadata mwo=enabled settings \
    title="Set DirectInput MouseWarpOverride to enabled (default)"
w_metadata mwo=disable settings \
    title="Set DirectInput MouseWarpOverride to disable"
w_metadata fontfix settings \
    title="Check for broken fonts"
w_metadata fontsmooth=disable settings \
    title="Disable font smoothing"
w_metadata fontsmooth=bgr settings \
    title="Enable subpixel font smoothing for BGR LCDs"
w_metadata fontsmooth=rgb settings \
    title="Enable subpixel font smoothing for RGB LCDs"
w_metadata fontsmooth=gray settings \
    title="Enable subpixel font smoothing"
w_metadata mackeyremap=both settings \
    title="Enable mapping opt->alt and cmd->ctrl keys for the Mac native driver"
w_metadata mackeyremap=left settings \
    title="Enable mapping of left opt->alt and cmd->ctrl keys for the Mac native driver"
w_metadata mackeyremap=none settings \
    title="Do not remap keys for the Mac native driver (default)"
w_metadata grabfullscreen=y settings \
    title="Force cursor clipping for full-screen windows (needed by some games)"
w_metadata grabfullscreen=n settings \
    title="Disable cursor clipping for full-screen windows (default)"
w_metadata windowmanagerdecorated=y settings \
    title="Allow the window manager to decorate windows (default)"
w_metadata windowmanagerdecorated=n settings \
    title="Prevent the window manager from decorating windows"
w_metadata useegl=y settings \
    title="Enable EGL (default)"
w_metadata useegl=n settings \
    title="Disable EGL, use GLX instead"
w_metadata usetakefocus=y settings \
    title="Enable UseTakeFocus"
w_metadata usetakefocus=n settings \
    title="Disable UseTakeFocus (default)"
w_metadata windowmanagermanaged=y settings \
    title="Allow the window manager to control windows (default)"
w_metadata windowmanagermanaged=n settings \
    title="Prevent the window manager from controlling windows"
w_metadata vd=off settings \
    title="Disable virtual desktop"
w_metadata vd=640x480 settings \
    title="Enable virtual desktop, set size to 640x480"
w_metadata vd=800x600 settings \
    title="Enable virtual desktop, set size to 800x600"
w_metadata vd=1024x768 settings \
    title="Enable virtual desktop, set size to 1024x768"
w_metadata vd=1280x1024 settings \
    title="Enable virtual desktop, set size to 1280x1024"
w_metadata vd=1440x900 settings \
    title="Enable virtual desktop, set size to 1440x900"
w_metadata dpi=96 settings \
    title="Set screen DPI to 96"
w_metadata dpi=120 settings \
    title="Set screen DPI to 120"
w_metadata dpi=144 settings \
    title="Set screen DPI to 144"
w_metadata dpi=168 settings \
    title="Set screen DPI to 168"
w_metadata dpi=192 settings \
    title="Set screen DPI to 192"
w_metadata dpi=216 settings \
    title="Set screen DPI to 216"
w_metadata dpi=240 settings \
    title="Set screen DPI to 240"
w_metadata dpi=288 settings \
    title="Set screen DPI to 288"
w_metadata dpi=336 settings \
    title="Set screen DPI to 336"
w_metadata dpi=384 settings \
    title="Set screen DPI to 384"
w_metadata dpi=432 settings \
    title="Set screen DPI to 432"
w_metadata dpi=480 settings \
    title="Set screen DPI to 480"
w_metadata mimeassoc=on settings \
    title="Enable exporting MIME-type file associations to the native desktop (default)"
w_metadata mimeassoc=off settings \
    title="Disable exporting MIME-type file associations to the native desktop"
w_metadata cfc=enabled settings \
    title="Enable CheckFloatConstants"
w_metadata cfc=disabled settings \
    title="Disable CheckFloatConstants (default)"
w_metadata csmt=force settings \
    title="Enable and force serialisation of OpenGL or Vulkan commands between multiple command streams in the same application"
w_metadata csmt=on settings \
    title="Enable Command Stream Multithreading (default)"
w_metadata csmt=off settings \
    title="Disable Command Stream Multithreading"
w_metadata gsm=0 settings \
    title="Set MaxShaderModelGS to 0"
w_metadata gsm=1 settings \
    title="Set MaxShaderModelGS to 1"
w_metadata gsm=2 settings \
    title="Set MaxShaderModelGS to 2"
w_metadata gsm=3 settings \
    title="Set MaxShaderModelGS to 3"
w_metadata npm=repack settings \
    title="Set NonPower2Mode to repack"
w_metadata orm=fbo settings \
    title="Set OffscreenRenderingMode=fbo (default)"
w_metadata orm=backbuffer settings \
    title="Set OffscreenRenderingMode=backbuffer"
w_metadata psm=0 settings \
    title="Set MaxShaderModelPS to 0"
w_metadata psm=1 settings \
    title="Set MaxShaderModelPS to 1"
w_metadata psm=2 settings \
    title="Set MaxShaderModelPS to 2"
w_metadata psm=3 settings \
    title="Set MaxShaderModelPS to 3"
w_metadata shader_backend=glsl settings \
    title="Set shader_backend to glsl"
w_metadata shader_backend=arb settings \
    title="Set shader_backend to arb"
w_metadata shader_backend=none settings \
    title="Set shader_backend to none"
w_metadata ssm=disabled settings \
    title="Disable Struct Shader Math (default)"
w_metadata ssm=enabled settings \
    title="Enable Struct Shader Math"
w_metadata renderer=gdi settings \
    title="Set renderer to gdi"
w_metadata renderer=gl settings \
    title="Set renderer to gl"
w_metadata renderer=no3d settings \
    title="Set renderer to no3d"
w_metadata renderer=vulkan settings \
    title="Set renderer to vulkan"
w_metadata rtlm=auto settings \
    title="Set RenderTargetLockMode to auto (default)"
w_metadata rtlm=disabled settings \
    title="Set RenderTargetLockMode to disabled"
w_metadata rtlm=readdraw settings \
    title="Set RenderTargetLockMode to readdraw"
w_metadata rtlm=readtex settings \
    title="Set RenderTargetLockMode to readtex"
w_metadata rtlm=texdraw settings \
    title="Set RenderTargetLockMode to texdraw"
w_metadata rtlm=textex settings \
    title="Set RenderTargetLockMode to textex"
w_metadata set_mididevice settings \
    title="Set MIDImap device to the value specified in the MIDI_DEVICE environment variable"
w_metadata videomemorysize=default settings \
    title="Let Wine detect amount of video card memory"
w_metadata videomemorysize=512 settings \
    title="Tell Wine your video card has 512MB RAM"
w_metadata videomemorysize=1024 settings \
    title="Tell Wine your video card has 1024MB RAM"
w_metadata videomemorysize=2048 settings \
    title="Tell Wine your video card has 2048MB RAM"
w_metadata vsm=0 settings \
    title="Set MaxShaderModelVS to 0"
w_metadata vsm=1 settings \
    title="Set MaxShaderModelVS to 1"
w_metadata vsm=2 settings \
    title="Set MaxShaderModelVS to 2"
w_metadata vsm=3 settings \
    title="Set MaxShaderModelVS to 3"
w_metadata autostart_winedbg=enabled settings \
    title="Automatically launch winedbg when an unhandled exception occurs (default)"
w_metadata autostart_winedbg=disabled settings \
    title="Prevent winedbg from launching when an unhandled exception occurs"
w_metadata heapcheck settings \
    title="Enable heap checking with GlobalFlag"
w_metadata nocrashdialog settings \
    title="Disable crash dialog"
w_metadata set_userpath settings \
    title="set user PATH variable in wine prefix specified by native and/or wine paths in WINEPATH environment variable with ';' as path separator"
w_metadata alldlls=default settings \
    title="Remove all DLL overrides"
w_metadata alldlls=builtin settings \
    title="Override most common DLLs to builtin"
w_metadata bad settings \
    title="Fake verb that always returns false"
w_metadata forcemono settings \
    title="Force using Mono instead of .NET (for debugging)"
w_metadata good settings \
    title="Fake verb that always returns true"
w_metadata hidewineexports=enable settings \
    title="Enable hiding Wine exports from applications (wine-staging)"
w_metadata hidewineexports=disable settings \
    title="Disable hiding Wine exports from applications (wine-staging)"
w_metadata hosts settings \
    title="Add empty C:\\windows\\system32\\drivers\\etc\\{hosts,services} files"
w_metadata isolate_home settings \
    title="Remove wineprefix links to \$HOME"
w_metadata native_mdac settings \
    title="Override odbc32, odbccp32 and oledb32"
w_metadata native_oleaut32 settings \
    title="Override oleaut32"
w_metadata remove_mono settings \
    title="Remove builtin wine-mono"
w_metadata sandbox settings \
    title="Sandbox the wineprefix - remove links to \$HOME"
w_metadata showdotfiles=y settings \
    title="Show dotfiles/folders (.foo) in Windows programs"
w_metadata showdotfiles=n settings \
    title="Hide dotfiles/folders (.foo) in Windows programs (default)"
w_metadata sound=alsa settings \
    title="Set sound driver to ALSA"
w_metadata sound=coreaudio settings \
    title="Set sound driver to Mac CoreAudio"
w_metadata sound=disabled settings \
    title="Set sound driver to disabled"
w_metadata sound=oss settings \
    title="Set sound driver to OSS"
w_metadata sound=pulse settings \
    title="Set sound driver to PulseAudio"
w_metadata theme=dark settings \
    title="Use dark theme for the WINEPREFIX"
w_metadata theme=light settings \
    title="Use default Wine theme (light) for the WINEPREFIX"
w_metadata nt351 settings \
    title="Set Windows version to Windows NT 3.51"
w_metadata nt40 settings \
    title="Set Windows version to Windows NT 4.0"
w_metadata vista settings \
    title="Set Windows version to Windows Vista"
w_metadata win20 settings \
    title="Set Windows version to Windows 2.0"
w_metadata win2k settings \
    title="Set Windows version to Windows 2000"
w_metadata win2k3 settings \
    title="Set Windows version to Windows 2003"
w_metadata win2k8 settings \
    title="Set Windows version to Windows 2008"
w_metadata win2k8r2 settings \
    title="Set Windows version to Windows 2008 R2"
w_metadata win30 settings \
    title="Set Windows version to Windows 3.0"
w_metadata win31 settings \
    title="Set Windows version to Windows 3.1"
w_metadata win7 settings \
    title="Set Windows version to Windows 7"
w_metadata win8 settings \
    title="Set Windows version to Windows 8"
w_metadata win81 settings \
    title="Set Windows version to Windows 8.1"
w_metadata win10 settings \
    title="Set Windows version to Windows 10"
w_metadata win11 settings \
    title="Set Windows version to Windows 11"
w_metadata win95 settings \
    title="Set Windows version to Windows 95"
w_metadata win98 settings \
    title="Set Windows version to Windows 98"
w_metadata winme settings \
    title="Set Windows version to Windows ME"
w_metadata winver= settings \
    title="Set Windows version to default (win7)"
w_metadata winxp settings \
    title="Set Windows version to Windows XP"

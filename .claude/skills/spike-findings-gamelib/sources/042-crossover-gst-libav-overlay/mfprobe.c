// Spike 042 MF probe: open a media file the way XNA/MonoGame's Video does
// (SourceResolver.CreateObjectFromURL), then decode one sample per stream
// through a source reader. Prints one KEY=VALUE line per step and exits
// non-zero on the first failure.
//
// Build: zig cc -municode -target x86_64-windows-gnu mfprobe.c -o mfprobe64.exe -lmfplat -lmf -lmfreadwrite -lmfuuid -lole32
//        zig cc -municode -target x86-windows-gnu    mfprobe.c -o mfprobe32.exe -lmfplat -lmf -lmfreadwrite -lmfuuid -lole32
#define COBJMACROS
#include <windows.h>
#include <mfapi.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <mferror.h>
#include <stdio.h>

static void guid_str(const GUID *g, char *out) {
  sprintf(out, "%08lx-%04x-%04x", (unsigned long)g->Data1, g->Data2, g->Data3);
}

int wmain(int argc, wchar_t **argv) {
  if (argc < 2) { printf("usage: mfprobe <path>\n"); return 2; }
  // MonoGame passes the plain Windows path, not a file:// URL.
  const wchar_t *url = argv[1];
  printf("url=%ls\n", url);

  HRESULT hr = CoInitializeEx(NULL, COINIT_MULTITHREADED);
  hr = MFStartup(MF_VERSION, MFSTARTUP_FULL);
  printf("MFStartup=0x%08lx\n", (unsigned long)hr);
  if (FAILED(hr)) return 1;

  IMFSourceResolver *res = NULL;
  hr = MFCreateSourceResolver(&res);
  printf("MFCreateSourceResolver=0x%08lx\n", (unsigned long)hr);
  if (FAILED(hr)) return 1;

  MF_OBJECT_TYPE type = MF_OBJECT_INVALID;
  IUnknown *obj = NULL;
  hr = IMFSourceResolver_CreateObjectFromURL(res, url, MF_RESOLUTION_MEDIASOURCE, NULL, &type, &obj);
  printf("CreateObjectFromURL=0x%08lx type=%d\n", (unsigned long)hr, (int)type);
  if (FAILED(hr)) return 1;

  IMFMediaSource *src = NULL;
  IUnknown_QueryInterface(obj, &IID_IMFMediaSource, (void **)&src);
  // Let the reader insert a colour converter, as MonoGame's media session topology does.
  IMFAttributes *ra = NULL;
  MFCreateAttributes(&ra, 1);
  IMFAttributes_SetUINT32(ra, &MF_SOURCE_READER_ENABLE_VIDEO_PROCESSING, TRUE);
  IMFSourceReader *rd = NULL;
  hr = MFCreateSourceReaderFromMediaSource(src, ra, &rd);
  printf("CreateSourceReader=0x%08lx\n", (unsigned long)hr);
  if (FAILED(hr)) return 1;

  int failed = 0;
  for (DWORD i = 0;; i++) {
    IMFMediaType *nt = NULL;
    hr = IMFSourceReader_GetNativeMediaType(rd, i, 0, &nt);
    if (hr == MF_E_INVALIDSTREAMNUMBER) break;
    if (FAILED(hr)) { printf("stream%lu GetNativeMediaType=0x%08lx\n", i, (unsigned long)hr); failed = 1; break; }
    GUID major, sub; char ms[40], ss[40];
    IMFMediaType_GetGUID(nt, &MF_MT_MAJOR_TYPE, &major);
    IMFMediaType_GetGUID(nt, &MF_MT_SUBTYPE, &sub);
    guid_str(&major, ms); guid_str(&sub, ss);
    // Ask for an uncompressed output so the reader must find a decoder.
    IMFMediaType *want = NULL;
    MFCreateMediaType(&want);
    IMFMediaType_SetGUID(want, &MF_MT_MAJOR_TYPE, &major);
    IMFMediaType_SetGUID(want, &MF_MT_SUBTYPE,
                         IsEqualGUID(&major, &MFMediaType_Video) ? &MFVideoFormat_RGB32 : &MFAudioFormat_PCM);
    HRESULT hs = IMFSourceReader_SetCurrentMediaType(rd, i, NULL, want);
    IMFSourceReader_SetStreamSelection(rd, i, TRUE);
    DWORD idx, flags; LONGLONG ts; IMFSample *s = NULL;
    HRESULT hrd = SUCCEEDED(hs) ? IMFSourceReader_ReadSample(rd, i, 0, &idx, &flags, &ts, &s) : hs;
    DWORD len = 0;
    if (s) { IMFSample_GetTotalLength(s, &len); IMFSample_Release(s); }
    printf("stream%lu major=%s native_sub=%s SetCurrentMediaType=0x%08lx ReadSample=0x%08lx flags=0x%lx bytes=%lu\n",
           i, ms, ss, (unsigned long)hs, (unsigned long)hrd, flags, len);
    if (FAILED(hrd) || !len) failed = 1;
  }
  printf("VERDICT=%s\n", failed ? "DECODE_FAILED" : "DECODE_OK");
  return failed;
}

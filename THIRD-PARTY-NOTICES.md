# Third-party notices

## On-demand overlay: `gst-libav-1.24.13` (macOS, x86_64)

GameLib does not bundle this component. It is downloaded only when a game's
known-fix profile names it (today: Unclaimed World, Steam 284100), only on macOS
with a CrossOver Wine build, and is installed under GameLib's app-data
`overlays/` directory, never in a game folder or a bottle. GameLib distributes
it from its own release page and verifies it against sha256 sums pinned in the
application before use.

Release page (archive, licence texts and corresponding source):
https://github.com/grayson-mitchell/GameLib/releases/tag/overlay-gst-libav-1.24.13-x86_64

The libraries are unmodified. The x86_64 slice was extracted with `lipo -thin`
from the official, unsigned GStreamer 1.24.13 universal macOS package
(package sha256 begins `a18458c7`, ends `537839`). They are loaded at run time
by CrossOver's GStreamer; they are not linked into GameLib. To use a different
build, put your own on `GST_PLUGIN_PATH` in the game's environment settings.

### gst-libav 1.24.13 - LGPL-2.1-or-later

`libgstlibav.dylib`. The GStreamer libav plugin. Source:
https://gstreamer.freedesktop.org/src/gst-libav/gst-libav-1.24.13.tar.xz

### FFmpeg libraries - LGPL-2.1-or-later

`libavcodec`, `libavformat`, `libavutil`, `libavfilter`, `libswresample`,
`libswscale` and `libpostproc`. These are built from GStreamer's meson port of
FFmpeg 6.0 (build id `6b6d772`), configured with nonfree, version3 and GPL
parts disabled. Corresponding source is on the release page above.

### zlib 1.2.12 - zlib licence

`libz.1.dylib`. Copyright (C) 1995-2022 Jean-loup Gailly and Mark Adler.

This software is provided 'as-is', without any express or implied warranty. In
no event will the authors be held liable for any damages arising from the use
of this software.

Permission is granted to anyone to use this software for any purpose, including
commercial applications, and to alter it and redistribute it freely, subject to
the following restrictions:

1. The origin of this software must not be misrepresented; you must not claim
   that you wrote the original software. If you use this software in a product,
   an acknowledgment in the product documentation would be appreciated but is
   not required.
2. Altered source versions must be plainly marked as such, and must not be
   misrepresented as being the original software.
3. This notice may not be removed or altered from any source distribution.

### bzip2 1.0.8 - bzip2 licence

`libbz2.1.dylib`. Copyright (C) 1996-2019 Julian Seward <jseward@acm.org>.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. The origin of this software must not be misrepresented; you must not claim
   that you wrote the original software. If you use this software in a product,
   an acknowledgment in the product documentation would be appreciated but is
   not required.
3. Altered source versions must be plainly marked as such, and must not be
   misrepresented as being the original software.
4. The name of the author may not be used to endorse or promote products
   derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE AUTHOR "AS IS" AND ANY EXPRESS OR IMPLIED
WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO
EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT
OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING
IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY
OF SUCH DAMAGE.

### Licence texts

The full LGPL-2.1 text (`COPYING.LGPL`) and the zlib and bzip2 licence files
are uploaded beside the archive on the release page. The short zlib and bzip2
permission texts are reproduced above.

### Pinned per-file sha256 sums

| path                                | sha256                                                           | size     |
| ----------------------------------- | ---------------------------------------------------------------- | -------- |
| lib/gstreamer-1.0/libgstlibav.dylib | cd114a81e5b9f0813d745b289e7e341157df3bdedea6af338c1b977b39edc31b | 282624   |
| lib/libavcodec.60.dylib             | 536ef5a82799a2a75a5e2d4f671db4041c0535b5c8d790613f79b3b92a697209 | 14918328 |
| lib/libavfilter.9.dylib             | 62f7e9438018da59fdb398784f12b4f494313adddfdfa1bb43d5efb115e0dbe4 | 183824   |
| lib/libavformat.60.dylib            | 81f7a146399996b31a32e2cbabe96253dd094ec4cc342dbb0f46bb8615a2d43d | 2296304  |
| lib/libavutil.58.dylib              | c5c4a15989f7fe23cca36e04ce567ff2a3664d1da967de5573b6008d434b4db4 | 861792   |
| lib/libbz2.1.dylib                  | 3b31bb556b30ba793e14d78c5653adf48adbc4db1372af00acc6dcde498128a6 | 85992    |
| lib/libpostproc.57.dylib            | bc6d727d27caedf1de1c12f943c6aaf2a8175fcfe355fa5505631a0cc85f5068 | 70256    |
| lib/libswresample.4.dylib           | a85f79423da1fafc749414b9de9a9234825e2827ecfaf5bbecacfe1670f229d1 | 225704   |
| lib/libswscale.7.dylib              | 8e8b54f2d38a18f76ce079e140b60730a9cc274621e921f3a98a40ee18422fc8 | 1151888  |
| lib/libz.1.dylib                    | 5d5ff2be35d261fb91b951d8c341574381c8d28fcf4f8f8b68b8dccdf3fc8a3e | 114040   |

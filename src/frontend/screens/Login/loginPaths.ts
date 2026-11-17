// Login route constants live here, with no imports, so light consumers
// (HumbleExpiryToast) need not load the whole Login screen, which imports a
// .png that jest cannot parse. screens/Login/index.tsx re-exports them.
export const epicLoginPath = '/loginweb/legendary'
export const gogLoginPath = '/loginweb/gog'
export const amazonLoginPath = '/loginweb/nile'
export const steamLoginPath = '/loginweb/steam'
// D-05: Humble now logs in through the embedded Stores WebView, matching the
// other runners above, instead of the retired popup BrowserWindow. This is
// the single source of truth for the Humble login route — the D-09 reconnect
// toast (HumbleExpiryToast) imports it from here too.
export const humbleLoginPath = '/loginweb/humble'

//! D-13: RunningAppID is a native registry read; 0 on missing and on error.

use gamelib_steamfiles::readers::{
    read_windows_running_app_id, running_app_id_from, RegistryDword,
};

struct Fake(Result<Option<u32>, ()>);

impl RegistryDword for Fake {
    fn hkcu_dword(&self, subkey: &str, value: &str) -> Result<Option<u32>, ()> {
        assert_eq!(subkey, "Software\\Valve\\Steam");
        assert_eq!(value, "RunningAppID");
        self.0
    }
}

#[test]
fn a_present_value_is_returned() {
    assert_eq!(running_app_id_from(&Fake(Ok(Some(7000)))), 7000);
}

#[test]
fn a_missing_value_is_zero() {
    assert_eq!(running_app_id_from(&Fake(Ok(None))), 0);
}

#[test]
fn an_error_is_zero() {
    assert_eq!(running_app_id_from(&Fake(Err(()))), 0);
}

#[cfg(not(windows))]
#[test]
fn off_windows_the_real_reader_is_zero() {
    assert_eq!(read_windows_running_app_id(), 0);
}

#[cfg(windows)]
mod windows_registry {
    use super::*;
    use gamelib_steamfiles::readers::real_hkcu_dword;
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyW, RegDeleteTreeW, RegSetValueExW, HKEY, HKEY_CURRENT_USER,
        REG_DWORD,
    };

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    #[test]
    fn a_value_missing_under_the_steam_key_reads_zero_through_the_real_api() {
        // The Steam key may or may not exist on the CI host; either way no such value exists
        // under a name no Steam writes, and the real RunningAppID mapping stays total.
        assert_eq!(
            real_hkcu_dword("Software\\Valve\\Steam", "GameLibNoSuchValue"),
            Ok(None)
        );
        let _ = read_windows_running_app_id();
    }

    #[test]
    fn a_dword_written_to_a_test_subkey_reads_back() {
        let sub = "Software\\GameLibTest\\RunningAppId";
        let (wsub, wval) = (wide(sub), wide("RunningAppID"));
        let mut key: HKEY = std::ptr::null_mut();
        // SAFETY: all strings are NUL-terminated and outlive the calls; `key` is a valid
        // out-pointer, closed below; the data pointer is a live u32 of the stated 4 bytes.
        unsafe {
            let st = RegCreateKeyW(HKEY_CURRENT_USER, wsub.as_ptr(), &mut key);
            assert_eq!(st, ERROR_SUCCESS);
            let v: u32 = 4242;
            let st = RegSetValueExW(
                key,
                wval.as_ptr(),
                0,
                REG_DWORD,
                (&v as *const u32).cast(),
                4,
            );
            assert_eq!(st, ERROR_SUCCESS);
            RegCloseKey(key);
        }
        let got = real_hkcu_dword(sub, "RunningAppID");
        // SAFETY: NUL-terminated key name; deletes only the test subtree.
        unsafe {
            RegDeleteTreeW(HKEY_CURRENT_USER, wide("Software\\GameLibTest").as_ptr());
        }
        assert_eq!(got, Ok(Some(4242)));
    }
}

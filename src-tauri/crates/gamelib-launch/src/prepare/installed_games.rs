//! The `installed_games` file of a wine prefix or CrossOver bottle (`prepareWineLaunch`, `launcher.ts`): a JSON
//! array of the app names that have run in the folder, written as `JSON.stringify` writes it (no spaces, no
//! trailing newline) so the TypeScript and this crate read each other's file.
//!
//! The folder is the settings' prefix, or the bottle folder the CrossOver probe named, exactly as the TS used it;
//! the file name is fixed and the content is a serialised array, never an interpolated string (T-88.1-28).

use std::io;
use std::path::Path;

use serde_json::Value;

/// The file's name inside the folder.
pub const FILE_NAME: &str = "installed_games";

/// Makes sure `app_name` is listed in `<folder>/installed_games`. `Ok(true)` when the file was created or the
/// game was added (the TS `hasUpdated`), `Ok(false)` when the game was already listed and the file is left
/// untouched.
///
/// - No file: the folder is created (with its parents) and the file written as `["<app>"]`.
/// - A file holding an array that has no entry equal to `app_name`: the name is appended and the whole array
///   written back; the other entries are written as read.
/// - A file that is not valid JSON, or holds JSON that is not an array (the TS threw from `JSON.parse` or
///   `.includes`): an `InvalidData` error, and the file is not touched.
pub fn update(folder: &Path, app_name: &str) -> io::Result<bool> {
    let path = folder.join(FILE_NAME);
    if !path.exists() {
        std::fs::create_dir_all(folder)?;
        std::fs::write(&path, serialise(&[Value::String(app_name.to_string())]))?;
        return Ok(true);
    }
    let text = std::fs::read_to_string(&path)?;
    let invalid = |_| io::Error::new(io::ErrorKind::InvalidData, "installed_games is not JSON");
    let Value::Array(mut installed) = serde_json::from_str::<Value>(&text).map_err(invalid)? else {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "installed_games is not an array",
        ));
    };
    if installed
        .iter()
        .any(|entry| entry.as_str() == Some(app_name))
    {
        return Ok(false);
    }
    installed.push(Value::String(app_name.to_string()));
    std::fs::write(&path, serialise(&installed))?;
    Ok(true)
}

/// `JSON.stringify(array)`: compact, no trailing newline.
fn serialise(entries: &[Value]) -> String {
    Value::Array(entries.to_vec()).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read(folder: &Path) -> Vec<u8> {
        std::fs::read(folder.join(FILE_NAME)).unwrap()
    }

    #[test]
    fn the_file_is_created_with_its_folder_then_appended_with_no_spaces_and_no_trailing_newline() {
        let root = tempfile::tempdir().unwrap();
        let folder = root.path().join("a").join("prefix");

        assert!(update(&folder, "a").unwrap());
        assert_eq!(read(&folder), b"[\"a\"]");

        assert!(update(&folder, "b").unwrap());
        assert_eq!(read(&folder), b"[\"a\",\"b\"]");
    }

    #[test]
    fn a_game_that_is_listed_leaves_the_file_untouched() {
        let root = tempfile::tempdir().unwrap();
        // Spaces and a newline the TS would have kept: nothing is rewritten when nothing is added.
        let original = b"[ \"a\", \"b\" ]\n";
        std::fs::write(root.path().join(FILE_NAME), original).unwrap();

        assert!(!update(root.path(), "b").unwrap());
        assert_eq!(read(root.path()), original);
    }

    #[test]
    fn other_entries_are_written_back_as_read() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join(FILE_NAME), "[\"x\",1,null]").unwrap();

        assert!(update(root.path(), "y").unwrap());
        assert_eq!(read(root.path()), b"[\"x\",1,null,\"y\"]");
    }

    #[test]
    fn a_name_is_serialised_not_interpolated() {
        let root = tempfile::tempdir().unwrap();
        assert!(update(root.path(), "a\"b\\c").unwrap());
        assert_eq!(read(root.path()), b"[\"a\\\"b\\\\c\"]");
    }

    #[test]
    fn a_file_that_is_not_an_array_is_an_error_and_is_not_touched() {
        let root = tempfile::tempdir().unwrap();
        for original in ["", "not json", "{\"a\":1}", "\"a\"", "null"] {
            std::fs::write(root.path().join(FILE_NAME), original).unwrap();
            let error = update(root.path(), "a").unwrap_err();
            assert_eq!(error.kind(), io::ErrorKind::InvalidData, "{original:?}");
            assert_eq!(read(root.path()), original.as_bytes());
        }
    }
}

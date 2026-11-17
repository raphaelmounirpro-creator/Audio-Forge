//! Moves a file to the Windows Recycle Bin, so the user can restore it.
use crate::error::{AppError, Result};
use std::path::Path;

/// Plain drive path accepted by the shell: no `\\?\` prefix, wildcard or
/// path longer than MAX_PATH, which SHFileOperationW cannot handle safely.
pub fn shell_path(path: &Path) -> Result<String> {
    let text = path.to_str().ok_or_else(refused)?;
    let plain = text.strip_prefix(r"\\?\").unwrap_or(text);
    let bytes = plain.as_bytes();
    let drive = bytes.len() > 3 && bytes[0].is_ascii_alphabetic() && &bytes[1..3] == b":\\";
    if !drive || plain.contains(['*', '?', '/']) || plain.encode_utf16().count() >= 260 {
        return Err(refused());
    }
    Ok(plain.to_owned())
}
fn refused() -> AppError {
    AppError::new(
        "RECYCLE_FAILED",
        "Ce fichier n'a pas pu être placé dans la corbeille. Il est conservé avec son entrée.",
    )
}

#[cfg(windows)]
pub fn recycle(path: &Path) -> Result<()> {
    use windows_sys::Win32::UI::Shell::{
        SHFileOperationW, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT,
        FOF_WANTNUKEWARNING, FO_DELETE, SHFILEOPSTRUCTW,
    };
    // A single file in a double NUL-terminated list.
    let from: Vec<u16> = shell_path(path)?.encode_utf16().chain([0, 0]).collect();
    let mut operation = SHFILEOPSTRUCTW {
        hwnd: std::ptr::null_mut(),
        wFunc: FO_DELETE,
        pFrom: from.as_ptr(),
        pTo: std::ptr::null(),
        // ALLOWUNDO keeps the file restorable. WANTNUKEWARNING makes Windows
        // ask before any permanent deletion on a drive without Recycle Bin.
        fFlags: (FOF_ALLOWUNDO
            | FOF_NOCONFIRMATION
            | FOF_WANTNUKEWARNING
            | FOF_NOERRORUI
            | FOF_SILENT) as u16,
        fAnyOperationsAborted: 0,
        hNameMappings: std::ptr::null_mut(),
        lpszProgressTitle: std::ptr::null(),
    };
    // SAFETY: `from` is a valid double NUL-terminated UTF-16 buffer that
    // outlives the call; the other pointers are null as the API allows.
    let code = unsafe { SHFileOperationW(&mut operation) };
    if code != 0 || operation.fAnyOperationsAborted != 0 || path.exists() {
        return Err(refused());
    }
    Ok(())
}
#[cfg(not(windows))]
pub fn recycle(_: &Path) -> Result<()> {
    Err(refused())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shell_paths_are_plain_drive_paths() {
        assert_eq!(
            shell_path(Path::new(r"\\?\C:\Musique\Titre [abc].mp3")).unwrap(),
            r"C:\Musique\Titre [abc].mp3"
        );
        for path in [
            r"\\?\UNC\serveur\partage\a.mp3",
            r"\\serveur\partage\a.mp3",
            r"C:\Musique\*.mp3",
            r"C:\Musique\a?.mp3",
            "relatif.mp3",
        ] {
            assert!(shell_path(Path::new(path)).is_err(), "{path}");
        }
        let long = format!(r"C:\{}.mp3", "a".repeat(260));
        assert!(shell_path(Path::new(&long)).is_err());
    }
}

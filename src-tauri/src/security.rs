use crate::error::{AppError, Result};
use std::{
    net::IpAddr,
    path::{Component, Path, PathBuf},
};
use url::Url;

pub fn validate_url(input: &str) -> Result<Url> {
    if input.len() > 4096 {
        return Err(invalid_url());
    }
    let url = Url::parse(input).map_err(|_| invalid_url())?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some_and(|p| p != 443)
        || url.fragment().is_some()
    {
        return Err(invalid_url());
    }
    let host = url.host_str().ok_or_else(invalid_url)?;
    // Initial release deliberately supports a narrow set of public sources.
    if ![
        "youtube.com",
        "youtu.be",
        "vimeo.com",
        "wikimedia.org",
        "archive.org",
    ]
    .iter()
    .any(|base| domain_matches(host, base))
    {
        return Err(AppError::new("UNSUPPORTED_URL", "Source non prise en charge. Utilisez un lien public YouTube, Vimeo, Wikimedia ou Archive.org autorisé."));
    }
    Ok(url)
}
fn invalid_url() -> AppError {
    AppError::new(
        "INVALID_URL",
        "Collez un lien HTTPS public, sans identifiants ni port personnalisé.",
    )
}
pub fn domain_matches(host: &str, base: &str) -> bool {
    host == base || host.strip_suffix(base).is_some_and(|p| p.ends_with('.'))
}
pub fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            let [a, b, c, _] = v.octets();
            !(v.is_private()
                || v.is_loopback()
                || v.is_link_local()
                || v.is_multicast()
                || v.is_broadcast()
                || v.is_documentation()
                || a == 0
                || a >= 240
                || (a == 100 && (64..=127).contains(&b))
                || (a == 192 && b == 0 && c == 0)
                || (a == 192 && b == 0 && c == 2)
                || (a == 198 && (b == 18 || b == 19))
                || (a == 192 && b == 88 && c == 99))
        }
        IpAddr::V6(v) => {
            // Restrict to global unicast; excludes IPv4 mappings, ULA, multicast and transition ranges.
            let s = v.segments();
            (s[0] & 0xe000) == 0x2000
                && s[0] != 0x2002
                && !(s[0] == 0x2001 && (s[1] <= 0x01ff || s[1] == 0x0db8))
        }
    }
}
pub fn sanitize_name(input: &str) -> String {
    let value: String = input
        .chars()
        .filter(|c| !c.is_control())
        .map(|c| if "<>:\"/\\|?*".contains(c) { '_' } else { c })
        .take(100)
        .collect();
    let trimmed = value.trim().trim_end_matches(['.', ' ']);
    let stem = trimmed.split('.').next().unwrap_or("").to_ascii_uppercase();
    if trimmed.is_empty()
        || [
            "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
            "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
        ]
        .contains(&stem.as_str())
    {
        format!("media_{}", trimmed)
    } else {
        trimmed.to_owned()
    }
}
pub fn destination(input: &str) -> Result<PathBuf> {
    let path = Path::new(input);
    if !path.is_absolute()
        || path.components().any(|c| c == Component::ParentDir)
        || input.starts_with("//")
        || input.contains('\0')
    {
        return Err(AppError::new(
            "INVALID_PATH",
            "Choisissez un dossier local existant avec un chemin absolu.",
        ));
    }
    #[cfg(windows)]
    {
        use std::path::Prefix;
        if !matches!(path.components().next(), Some(Component::Prefix(p)) if matches!(p.kind(), Prefix::Disk(_) | Prefix::VerbatimDisk(_)))
        {
            return Err(AppError::new(
                "INVALID_PATH",
                "Choisissez un dossier sur un disque local, sans chemin réseau ou périphérique.",
            ));
        }
    }
    // Refuse reparse points throughout the requested path on Windows.
    for ancestor in path.ancestors() {
        if ancestor.as_os_str().is_empty() {
            continue;
        }
        let m = std::fs::symlink_metadata(ancestor)?;
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if m.file_attributes() & 0x400 != 0 {
                return Err(AppError::new(
                    "INVALID_PATH",
                    "Les dossiers redirigés ou liens symboliques ne sont pas acceptés.",
                ));
            }
        }
        if m.file_type().is_symlink() {
            return Err(AppError::new(
                "INVALID_PATH",
                "Les liens symboliques ne sont pas acceptés.",
            ));
        }
    }
    let canonical = std::fs::canonicalize(path)?;
    if !canonical.is_dir() {
        return Err(AppError::new(
            "INVALID_PATH",
            "La destination doit être un dossier.",
        ));
    }
    Ok(canonical)
}
pub fn safe_child(root: &Path, path: &Path) -> Result<PathBuf> {
    let canonical = std::fs::canonicalize(path)?;
    if !canonical.starts_with(root) || canonical == root {
        return Err(AppError::new(
            "INVALID_PATH",
            "Le fichier sort du dossier autorisé.",
        ));
    }
    Ok(canonical)
}

pub const MEDIA_EXTENSIONS: &[&str] = &[
    "mp4", "m4a", "mov", "mkv", "webm", "mka", "mp3", "wav", "flac", "opus", "ogg", "aac",
];

pub fn local_file(path: &Path, extensions: &[&str]) -> Result<PathBuf> {
    let invalid = || {
        AppError::new(
            "INVALID_PATH",
            "Choisissez un fichier local accessible dans un format pris en charge.",
        )
    };
    let parent = path.parent().and_then(Path::to_str).ok_or_else(invalid)?;
    let root = destination(parent).map_err(|_| invalid())?;
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(invalid)?;
    if name.contains(':') || name.chars().any(char::is_control) {
        return Err(invalid());
    }
    let path = root.join(name);
    let metadata = std::fs::symlink_metadata(&path).map_err(|_| invalid())?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err(invalid());
        }
    }
    if !metadata.is_file()
        || !path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| extensions.contains(&value.to_ascii_lowercase().as_str()))
    {
        return Err(invalid());
    }
    let verified = safe_child(&root, &path).map_err(|_| invalid())?;
    if verified.parent() != Some(root.as_path()) {
        return Err(invalid());
    }
    Ok(verified)
}

pub fn read_link_list(path: &Path) -> Result<String> {
    use std::io::Read;
    const MAX_SIZE: u64 = 128 * 1024;
    let path = local_file(path, &["txt"])?;
    let mut bytes = Vec::new();
    std::fs::File::open(path)?
        .take(MAX_SIZE + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_SIZE {
        return Err(AppError::new(
            "INVALID_SETTINGS",
            "La liste TXT dépasse 128 Kio.",
        ));
    }
    let text = String::from_utf8(bytes)
        .ok()
        .filter(|text| !text.contains('\0'))
        .ok_or_else(|| {
            AppError::new(
                "INVALID_SETTINGS",
                "Enregistrez la liste TXT au format UTF-8.",
            )
        })?;
    Ok(text.trim_start_matches('\u{feff}').to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn import_accepts_utf8_bom_and_refuses_oversize_and_binary() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("liens.txt");
        std::fs::write(&path, "\u{feff}https://vimeo.com/1\r\n").unwrap();
        assert_eq!(read_link_list(&path).unwrap(), "https://vimeo.com/1\r\n");
        std::fs::write(&path, vec![b'x'; 128 * 1024 + 1]).unwrap();
        assert_eq!(read_link_list(&path).unwrap_err().code, "INVALID_SETTINGS");
        std::fs::write(&path, [0xff, 0]).unwrap();
        assert_eq!(read_link_list(&path).unwrap_err().code, "INVALID_SETTINGS");
    }
    #[test]
    fn urls_reject_injection_and_private_hosts() {
        for u in [
            "file:///C:/secret",
            "https://127.0.0.1",
            "https://youtube.com.evil.test/watch",
            "https://user:pass@youtube.com/watch",
            "https://youtube.com:444/",
            "--exec=calc",
            "https://localhost",
            "https://[::1]",
        ] {
            assert!(validate_url(u).is_err(), "{u}");
        }
        assert!(validate_url("https://www.youtube.com/watch?v=abc").is_ok());
    }
    #[test]
    fn ip_ranges_are_filtered() {
        for ip in [
            "127.0.0.1",
            "10.1.2.3",
            "169.254.169.254",
            "100.64.0.1",
            "198.18.0.1",
            "192.0.0.9",
            "::1",
            "::ffff:127.0.0.1",
            "2001:db8::1",
            "2002::1",
        ] {
            assert!(!public_ip(ip.parse().unwrap()), "{ip}");
        }
        assert!(public_ip("8.8.8.8".parse().unwrap()));
    }
    #[test]
    fn windows_names_are_safe() {
        assert_eq!(sanitize_name("CON.txt"), "media_CON.txt");
        assert_eq!(sanitize_name("été:/titre?. "), "été__titre_");
        assert!(!sanitize_name("../a").contains('/'));
    }
    #[test]
    fn path_must_stay_inside() {
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        let outside = b.path().join("outside");
        std::fs::write(&outside, "test").unwrap();
        assert!(safe_child(a.path(), &outside).is_err());
        assert!(destination("../relative").is_err());
    }
}

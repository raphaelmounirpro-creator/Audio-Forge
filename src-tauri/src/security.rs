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

#[cfg(test)]
mod tests {
    use super::*;
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

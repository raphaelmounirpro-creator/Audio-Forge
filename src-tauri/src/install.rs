//! Download of the third-party components, on explicit request only.
//!
//! The installer contains none of them: sources, sizes and digests are
//! compiled into the program. Only the Microsoft-signed `curl.exe` and
//! `tar.exe` of Windows are executed, with separate arguments and no shell.
//! Nothing is installed unless the archive and every extracted file match
//! their pinned SHA-256.
use crate::{
    error::{AppError, Result},
    process,
    tools::{sha256_file, Tools, NAMES},
};
use serde::{Deserialize, Serialize};
use std::{
    future::Future,
    path::{Path, PathBuf},
    time::Duration,
};
use tokio::sync::watch;

const SOURCES: &str = include_str!("../binaries/sources.lock.json");
const MAX_ARCHIVE: u64 = 512 * 1024 * 1024;
const STAGING_PREFIX: &str = ".staging-";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub repository: String,
    pub version: String,
    pub url: String,
    pub sha256: String,
    pub size: u64,
    pub license: String,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub repository: String,
    /// "download", "verify", "extract" or "ready".
    pub stage: &'static str,
    pub received: u64,
    pub total: u64,
}
impl Progress {
    fn new(source: &Source, stage: &'static str, received: u64) -> Self {
        Self {
            repository: source.repository.clone(),
            stage,
            received,
            total: source.size,
        }
    }
}

pub fn sources() -> Vec<Source> {
    serde_json::from_str(SOURCES).expect("sources.lock.json intégré valide")
}

/// Installs every component that is missing or altered; verified ones are kept.
pub async fn install<F, Fut>(
    tools: &Tools,
    sources: &[Source],
    cancel: &mut watch::Receiver<bool>,
    fetch: F,
    mut progress: impl FnMut(Progress) + Send,
) -> Result<()>
where
    F: Fn(Source, PathBuf, watch::Receiver<bool>) -> Fut + Sync,
    Fut: Future<Output = Result<()>> + Send,
{
    for source in sources {
        validate(source)?;
    }
    let root = tools.root().to_owned();
    std::fs::create_dir_all(&root)?;
    remove_stale_staging(&root);
    for source in sources {
        let (check, wanted) = (tools.clone(), source.clone());
        if blocking(move || Ok(ready(&check, &wanted))).await? {
            progress(Progress::new(source, "ready", source.size));
            continue;
        }
        let staging = root.join(format!("{STAGING_PREFIX}{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&staging)?;
        let result = install_one(tools, source, &staging, cancel, &fetch, &mut progress).await;
        let _ = std::fs::remove_dir_all(&staging);
        result?;
    }
    Ok(())
}

async fn install_one<F, Fut>(
    tools: &Tools,
    source: &Source,
    staging: &Path,
    cancel: &mut watch::Receiver<bool>,
    fetch: &F,
    progress: &mut (impl FnMut(Progress) + Send),
) -> Result<()>
where
    F: Fn(Source, PathBuf, watch::Receiver<bool>) -> Fut + Sync,
    Fut: Future<Output = Result<()>> + Send,
{
    let archive = staging.join("archive");
    progress(Progress::new(source, "download", 0));
    {
        let download = fetch(source.clone(), archive.clone(), cancel.clone());
        tokio::pin!(download);
        let mut ticker = tokio::time::interval(Duration::from_millis(400));
        loop {
            tokio::select! {
                result = &mut download => { result?; break; }
                _ = ticker.tick() => {
                    let received = std::fs::metadata(&archive).map(|m| m.len()).unwrap_or(0);
                    progress(Progress::new(source, "download", received.min(source.size)));
                }
            }
        }
    }
    progress(Progress::new(source, "verify", source.size));
    let path = archive.clone();
    if blocking(move || sha256_file(&path)).await? != source.sha256 {
        return Err(invalid_download(&format!(
            "L'archive de {} ne correspond pas à l'empreinte attendue. Réessayez plus tard.",
            source.repository
        )));
    }
    progress(Progress::new(source, "extract", source.size));
    let staged: Vec<(String, PathBuf)> = if is_zip(&source.url) {
        let tar = system_tool("tar.exe")?;
        let listing = run_tool(
            &tar,
            vec!["-tf".into(), archive.display().to_string()],
            staging,
            cancel,
            Duration::from_secs(120),
        )
        .await?;
        let members = select_members(&listing, &source.files)?;
        let out = staging.join("files");
        std::fs::create_dir(&out)?;
        let mut args = vec![
            "-xf".to_string(),
            archive.display().to_string(),
            "-C".into(),
            out.display().to_string(),
        ];
        args.extend(members.iter().cloned());
        run_tool(&tar, args, staging, cancel, Duration::from_secs(600)).await?;
        source
            .files
            .iter()
            .zip(&members)
            .map(|(file, member)| (file.clone(), out.join(member)))
            .collect()
    } else {
        // A single executable published as is.
        vec![(source.files[0].clone(), archive)]
    };
    for (file, path) in &staged {
        let expected = tools
            .record(tool_name(file)?)
            .ok_or_else(invalid_source)?
            .sha256
            .clone();
        let path = path.clone();
        if blocking(move || sha256_file(&path)).await? != expected {
            return Err(invalid_download(&format!(
                "{file} ne correspond pas à l'empreinte attendue."
            )));
        }
    }
    for (file, path) in staged {
        rename_with_retry(&path, &tools.root().join(&file)).await?;
    }
    progress(Progress::new(source, "ready", source.size));
    Ok(())
}

/// Production download: system curl.exe, HTTPS only, exact size limit.
pub async fn curl_fetch(
    source: Source,
    target: PathBuf,
    mut cancel: watch::Receiver<bool>,
) -> Result<()> {
    let args = vec![
        "--disable".into(), // must stay first: ignore any curl configuration file
        "--fail".into(),
        "--location".into(),
        "--silent".into(),
        "--show-error".into(),
        "--proto".into(),
        "=https".into(),
        "--proto-redir".into(),
        "=https".into(),
        "--max-redirs".into(),
        "5".into(),
        "--connect-timeout".into(),
        "30".into(),
        "--max-filesize".into(),
        source.size.to_string(),
        "--output".into(),
        target.display().to_string(),
        source.url.clone(),
    ];
    let cwd = target
        .parent()
        .map(Path::to_owned)
        .ok_or_else(invalid_source)?;
    process::run(
        &system_tool("curl.exe")?,
        &args,
        Some(&cwd),
        &mut cancel,
        Duration::from_secs(30 * 60),
        |_| {},
    )
    .await
    .map(|_| ())
    .map_err(|e| {
        tool_error(
            e,
            &format!(
                "Le téléchargement de {} a échoué. Vérifiez la connexion puis réessayez.",
                source.repository
            ),
        )
    })
}

/// Exactly one safe member per expected file, matched on its file name.
pub fn select_members(listing: &str, files: &[String]) -> Result<Vec<String>> {
    files
        .iter()
        .map(|file| {
            let matches: Vec<&str> = listing
                .lines()
                .filter(|member| member.rsplit('/').next() == Some(file.as_str()))
                .collect();
            match matches.as_slice() {
                [member] if safe_member(member) => Ok(member.to_string()),
                _ => Err(invalid_download(&format!(
                    "{file} est introuvable ou ambigu dans l'archive."
                ))),
            }
        })
        .collect()
}

fn safe_member(member: &str) -> bool {
    member.split('/').all(|part| {
        !part.is_empty()
            && part != "."
            && part != ".."
            && !part.starts_with('-')
            && part
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "._ +-".contains(c))
    })
}

fn validate(source: &Source) -> Result<()> {
    let url = url::Url::parse(&source.url).map_err(|_| invalid_source())?;
    let lowercase_hex = |value: &str| {
        value.len() == 64
            && value
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    };
    let single_file = !is_zip(&source.url);
    let valid = url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && lowercase_hex(source.sha256.as_str())
        && source.size > 0
        && source.size <= MAX_ARCHIVE
        && !source.files.is_empty()
        && source.files.iter().all(|file| tool_name(file).is_ok())
        && (!single_file
            || (source.files.len() == 1 && url.path().ends_with(&format!("/{}", source.files[0]))));
    if valid {
        Ok(())
    } else {
        Err(invalid_source())
    }
}

fn ready(tools: &Tools, source: &Source) -> bool {
    source.files.iter().all(|file| {
        tool_name(file)
            .map(|name| tools.verified(name).is_ok())
            .unwrap_or(false)
    })
}

fn tool_name(file: &str) -> Result<&str> {
    file.strip_suffix(".exe")
        .filter(|name| NAMES.contains(name))
        .ok_or_else(invalid_source)
}

fn is_zip(url: &str) -> bool {
    url.to_ascii_lowercase().ends_with(".zip")
}

fn system_tool(name: &str) -> Result<PathBuf> {
    let path = std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .ok_or_else(|| AppError::internal("SystemRoot"))?
        .join("System32")
        .join(name);
    if path.is_file() {
        Ok(path)
    } else {
        Err(AppError::new(
            "SYSTEM_TOOL_MISSING",
            format!(
                "{name} est introuvable. Windows 10 version 1803 ou ultérieure est nécessaire."
            ),
        ))
    }
}

async fn run_tool(
    executable: &Path,
    args: Vec<String>,
    cwd: &Path,
    cancel: &mut watch::Receiver<bool>,
    timeout: Duration,
) -> Result<String> {
    process::run(executable, &args, Some(cwd), cancel, timeout, |_| {})
        .await
        .map_err(|e| tool_error(e, "L'extraction de l'archive a échoué."))
}

/// Keep cancellation, timeout and launch errors; replace the media wording.
fn tool_error(error: AppError, message: &str) -> AppError {
    if error.code == "ENGINE_ERROR" {
        AppError::new("TOOL_DOWNLOAD_FAILED", message)
    } else {
        error
    }
}

async fn rename_with_retry(from: &Path, to: &Path) -> Result<()> {
    // An antivirus scan can briefly lock a freshly written executable.
    for attempt in 0..5 {
        match std::fs::rename(from, to) {
            Ok(()) => return Ok(()),
            Err(_) if attempt < 4 => tokio::time::sleep(Duration::from_millis(300)).await,
            Err(_) => break,
        }
    }
    Err(AppError::new(
        "TOOL_INSTALL_FAILED",
        "Impossible d'enregistrer un composant. Fermez les téléchargements en cours puis réessayez.",
    ))
}

fn remove_stale_staging(root: &Path) {
    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            if entry
                .file_name()
                .to_string_lossy()
                .starts_with(STAGING_PREFIX)
            {
                let _ = std::fs::remove_dir_all(entry.path());
            }
        }
    }
}

async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T> + Send + 'static,
) -> Result<T> {
    tokio::task::spawn_blocking(work)
        .await
        .map_err(AppError::internal)?
}

fn invalid_source() -> AppError {
    AppError::new(
        "TOOL_SOURCE_INVALID",
        "La liste des composants intégrée au programme est invalide.",
    )
}

fn invalid_download(message: &str) -> AppError {
    AppError::new("TOOL_DOWNLOAD_INVALID", message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tools::ToolRecord;
    use sha2::{Digest, Sha256};
    use std::collections::HashMap;

    fn digest(bytes: &[u8]) -> String {
        format!("{:x}", Sha256::digest(bytes))
    }
    fn tools_for(root: &Path, name: &str, content: &[u8]) -> Tools {
        let records = HashMap::from([(
            name.to_string(),
            ToolRecord {
                version: "1".into(),
                sha256: digest(content),
            },
        )]);
        Tools::with_records(root.to_owned(), records)
    }
    fn source(url: &str, archive: &[u8], files: &[&str]) -> Source {
        Source {
            repository: "test/outil".into(),
            version: "1".into(),
            url: url.into(),
            sha256: digest(archive),
            size: archive.len() as u64,
            license: "MIT".into(),
            files: files.iter().map(|f| f.to_string()).collect(),
        }
    }
    async fn copy_from(from: PathBuf, target: PathBuf) -> Result<()> {
        std::fs::copy(from, target)?;
        Ok(())
    }
    fn no_staging_left(root: &Path) -> bool {
        std::fs::read_dir(root).unwrap().all(|e| {
            !e.unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with(STAGING_PREFIX)
        })
    }

    #[test]
    fn embedded_sources_cover_every_locked_component() {
        let tools = Tools::load(PathBuf::from("absent"));
        let mut covered = Vec::new();
        for source in sources() {
            validate(&source).unwrap();
            for file in &source.files {
                let name = tool_name(file).unwrap();
                assert!(tools.record(name).is_some());
                covered.push(name.to_string());
            }
        }
        covered.sort();
        let mut expected: Vec<String> = NAMES.iter().map(|n| n.to_string()).collect();
        expected.sort();
        assert_eq!(covered, expected);
    }

    #[test]
    fn archive_members_are_selected_strictly() {
        let listing =
            "pkg/\npkg/bin/\npkg/bin/ffmpeg.exe\npkg/bin/ffprobe.exe\npkg/doc/ffmpeg.exe.html";
        assert_eq!(
            select_members(listing, &["ffmpeg.exe".into(), "ffprobe.exe".into()]).unwrap(),
            vec!["pkg/bin/ffmpeg.exe", "pkg/bin/ffprobe.exe"]
        );
        for bad in [
            "a/ffmpeg.exe\nb/ffmpeg.exe",
            "../ffmpeg.exe",
            "--use-compress-program=x/ffmpeg.exe",
            "",
        ] {
            assert!(
                select_members(bad, &["ffmpeg.exe".into()]).is_err(),
                "{bad}"
            );
        }
    }

    #[test]
    fn rejects_unsafe_sources() {
        let ok = source("https://example.invalid/yt-dlp.exe", b"x", &["yt-dlp.exe"]);
        validate(&ok).unwrap();
        for bad in [
            Source {
                url: "http://example.invalid/yt-dlp.exe".into(),
                ..ok.clone()
            },
            Source {
                url: "https://u:p@example.invalid/yt-dlp.exe".into(),
                ..ok.clone()
            },
            Source {
                url: "https://example.invalid/other.exe".into(),
                ..ok.clone()
            },
            Source {
                files: vec!["calc.exe".into()],
                ..ok.clone()
            },
            Source {
                sha256: "ABC".into(),
                ..ok.clone()
            },
            Source {
                size: MAX_ARCHIVE + 1,
                ..ok.clone()
            },
        ] {
            assert_eq!(validate(&bad).unwrap_err().code, "TOOL_SOURCE_INVALID");
        }
    }

    #[tokio::test]
    async fn installs_a_verified_executable_once_and_refuses_an_altered_one() {
        let work = tempfile::tempdir().unwrap();
        let root = work.path().join("tools");
        let exe = work.path().join("published.exe");
        std::fs::write(&exe, b"fake yt-dlp").unwrap();
        let tools = tools_for(&root, "yt-dlp", b"fake yt-dlp");
        let wanted = source(
            "https://example.invalid/yt-dlp.exe",
            b"fake yt-dlp",
            &["yt-dlp.exe"],
        );
        let (_tx, mut cancel) = watch::channel(false);
        let mut stages = Vec::new();
        install(
            &tools,
            &[wanted.clone()],
            &mut cancel,
            |_, target, _| copy_from(exe.clone(), target),
            |p| stages.push(p.stage),
        )
        .await
        .unwrap();
        assert!(tools.verified("yt-dlp").is_ok());
        assert_eq!(stages.first(), Some(&"download"));
        assert_eq!(stages.last(), Some(&"ready"));
        // Already verified: nothing is downloaded again.
        install(
            &tools,
            &[wanted.clone()],
            &mut cancel,
            |_, _, _| async { Err::<(), _>(AppError::internal("inattendu")) },
            |_| {},
        )
        .await
        .unwrap();

        std::fs::remove_file(root.join("yt-dlp.exe")).unwrap();
        std::fs::write(&exe, b"altered").unwrap();
        let error = install(
            &tools,
            &[wanted],
            &mut cancel,
            |_, target, _| copy_from(exe.clone(), target),
            |_| {},
        )
        .await
        .unwrap_err();
        assert_eq!(error.code, "TOOL_DOWNLOAD_INVALID");
        assert!(tools.verified("yt-dlp").is_err());
        assert!(no_staging_left(&root));
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn extracts_only_the_expected_member_of_a_verified_zip() {
        let work = tempfile::tempdir().unwrap();
        let content = work.path().join("pkg").join("bin");
        std::fs::create_dir_all(&content).unwrap();
        std::fs::write(content.join("ffmpeg.exe"), b"fake ffmpeg").unwrap();
        std::fs::write(content.join("ffplay.exe"), b"not requested").unwrap();
        let zip = work.path().join("pkg.zip");
        let status = std::process::Command::new(system_tool("tar.exe").unwrap())
            .arg("-a")
            .arg("-cf")
            .arg(&zip)
            .arg("-C")
            .arg(work.path())
            .arg("pkg")
            .status()
            .unwrap();
        assert!(status.success());
        let bytes = std::fs::read(&zip).unwrap();
        let root = work.path().join("tools");
        let tools = tools_for(&root, "ffmpeg", b"fake ffmpeg");
        let wanted = source("https://example.invalid/pkg.zip", &bytes, &["ffmpeg.exe"]);
        let (_tx, mut cancel) = watch::channel(false);
        install(
            &tools,
            &[wanted],
            &mut cancel,
            |_, target, _| copy_from(zip.clone(), target),
            |_| {},
        )
        .await
        .unwrap();
        assert!(tools.verified("ffmpeg").is_ok());
        assert!(!root.join("ffplay.exe").exists());
        assert!(no_staging_left(&root));
    }

    #[tokio::test]
    async fn cancellation_reaches_a_running_download_and_installs_nothing() {
        let work = tempfile::tempdir().unwrap();
        let root = work.path().join("tools");
        let tools = tools_for(&root, "yt-dlp", b"fake yt-dlp");
        let wanted = source(
            "https://example.invalid/yt-dlp.exe",
            b"fake yt-dlp",
            &["yt-dlp.exe"],
        );
        let (tx, mut cancel) = watch::channel(false);
        let stop = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(50)).await;
            tx.send(true).unwrap();
            tx
        });
        let error = install(
            &tools,
            &[wanted],
            &mut cancel,
            |_, target, mut running: watch::Receiver<bool>| async move {
                std::fs::write(target, b"partial")?;
                let _ = running.changed().await;
                Err::<(), _>(process::cancelled())
            },
            |_| {},
        )
        .await
        .unwrap_err();
        let _tx = stop.await.unwrap();
        assert_eq!(error.code, "DOWNLOAD_CANCELLED");
        assert!(tools.verified("yt-dlp").is_err());
        assert!(no_staging_left(&root));
    }
}

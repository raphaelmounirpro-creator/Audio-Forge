use crate::error::{AppError, Result};
use std::{path::Path, process::Stdio, time::Duration};
use tokio::{
    io::{AsyncBufRead, AsyncBufReadExt, BufReader},
    process::Command,
    sync::watch,
};

// No shell, no user-supplied executable, no inherited yt-dlp configuration.
pub async fn run(
    executable: &Path,
    args: &[String],
    cwd: Option<&Path>,
    cancel: &mut watch::Receiver<bool>,
    timeout: Duration,
    mut on_line: impl FnMut(&str) + Send,
) -> Result<String> {
    if *cancel.borrow() {
        return Err(cancelled());
    }
    let mut command = Command::new(executable);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    if let Some(path) = cwd {
        command.current_dir(path);
    }
    // Do not inherit proxies/config affecting route selection.
    for key in [
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "NO_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
        "no_proxy",
    ] {
        command.env_remove(key);
    }
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    let mut child = command.spawn().map_err(|_| {
        AppError::new(
            "PROCESS_ERROR",
            "Impossible de lancer le moteur multimédia.",
        )
    })?;
    let mut stdout = BufReader::new(
        child
            .stdout
            .take()
            .ok_or_else(|| AppError::internal("stdout"))?,
    );
    let mut stderr = BufReader::new(
        child
            .stderr
            .take()
            .ok_or_else(|| AppError::internal("stderr"))?,
    );
    let deadline = tokio::time::sleep(timeout);
    tokio::pin!(deadline);
    let mut output = String::new();
    let mut stdout_pending = Vec::new();
    let mut stderr_pending = Vec::new();
    let mut out_done = false;
    let mut err_done = false;
    let mut diagnosis = None;
    let result: Result<()> = async {
        while !out_done || !err_done {
            tokio::select! {
                biased;
                _ = cancel.changed() => { return Err(cancelled()); },
                _ = &mut deadline => { return Err(AppError::new("PROCESS_TIMEOUT", "Le moteur a dépassé le temps autorisé. Réessayez.")); },
                line = bounded_line(&mut stdout, &mut stdout_pending, 24 * 1024 * 1024), if !out_done => {
                    match line? {
                        Some(line) => {
                            if output.len() + line.len() > 24 * 1024 * 1024 { return Err(AppError::new("OUTPUT_LIMIT", "Réponse du moteur trop volumineuse. Réduisez le nombre d'éléments.")); }
                            on_line(&line); output.push_str(&line); output.push('\n');
                        }, None => out_done = true,
                    }
                },
                line = bounded_line(&mut stderr, &mut stderr_pending, 65536), if !err_done => {
                    if let Some(line) = line? {
                        diagnosis = classify_error(&line).or(diagnosis);
                    } else {
                        err_done = true;
                    }
                }
            }
        }
        tokio::select! {
            _ = cancel.changed() => Err(cancelled()),
            _ = &mut deadline => Err(AppError::new("PROCESS_TIMEOUT", "Le moteur n'a pas terminé à temps.")),
            status = child.wait() => {
                if status?.success() { Ok(()) } else { Err(diagnosis.unwrap_or_else(|| AppError::new("ENGINE_ERROR", "Le moteur n'a pas pu traiter ce média. Il peut être indisponible, restreint ou incompatible avec le format choisi."))) }
            }
        }
    }.await;
    if result.is_err() {
        #[cfg(windows)]
        if let Some(pid) = child.id() {
            let system = std::env::var_os("SystemRoot")
                .map(std::path::PathBuf::from)
                .unwrap_or_else(|| "C:\\Windows".into());
            let _ = Command::new(system.join("System32/taskkill.exe"))
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .creation_flags(0x08000000)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .await;
        }
        let _ = child.kill().await;
        let _ = child.wait().await;
    }
    result?;
    Ok(output)
}
pub fn cancelled() -> AppError {
    AppError::new("DOWNLOAD_CANCELLED", "Téléchargement annulé.")
}

fn classify_error(line: &str) -> Option<AppError> {
    let line = line.to_ascii_lowercase();
    if line.contains("requested format is not available")
        || line.contains("does not contain any stream")
        || line.contains("matches no streams")
    {
        Some(AppError::new(
            "FORMAT_UNAVAILABLE",
            "Aucune piste ne correspond au format choisi. Sélectionnez un autre format.",
        ))
    } else if line.contains("no space left on device") || line.contains("not enough space") {
        Some(AppError::new(
            "DISK_FULL",
            "Le disque manque d’espace. Libérez de la place ou changez de destination.",
        ))
    } else if line.contains("timed out") || line.contains("timeout") {
        Some(AppError::new(
            "PROCESS_TIMEOUT",
            "La connexion a expiré. Vérifiez le réseau puis réessayez.",
        ))
    } else if line.contains("video unavailable") || line.contains("unsupported url") {
        Some(AppError::new(
            "MEDIA_UNAVAILABLE",
            "Le moteur ne trouve pas ce média. Vérifiez que le lien est public et accessible.",
        ))
    } else {
        None
    }
}

async fn bounded_line(
    reader: &mut (impl AsyncBufRead + Unpin),
    bytes: &mut Vec<u8>,
    limit: usize,
) -> Result<Option<String>> {
    loop {
        let chunk = reader.fill_buf().await?;
        if chunk.is_empty() {
            return if bytes.is_empty() {
                Ok(None)
            } else {
                Ok(Some(
                    String::from_utf8_lossy(&std::mem::take(bytes)).into_owned(),
                ))
            };
        }
        let count = chunk
            .iter()
            .position(|b| *b == b'\n')
            .map(|i| i + 1)
            .unwrap_or(chunk.len());
        if bytes.len() + count > limit {
            return Err(AppError::new(
                "OUTPUT_LIMIT",
                "Réponse du moteur trop volumineuse.",
            ));
        }
        bytes.extend_from_slice(&chunk[..count]);
        let complete = chunk[count - 1] == b'\n';
        reader.consume(count);
        if complete {
            return Ok(Some(
                String::from_utf8_lossy(&std::mem::take(bytes))
                    .trim_end_matches(['\r', '\n'])
                    .to_owned(),
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn output_limit_applies_before_allocating_whole_line() {
        let mut input = BufReader::new(&b"123456789\n"[..]);
        assert_eq!(
            bounded_line(&mut input, &mut Vec::new(), 4)
                .await
                .unwrap_err()
                .code,
            "OUTPUT_LIMIT"
        );
    }
    #[tokio::test]
    async fn handles_final_line_without_newline() {
        let mut input = BufReader::new(&b"a\r\nb"[..]);
        let mut pending = Vec::new();
        assert_eq!(
            bounded_line(&mut input, &mut pending, 10).await.unwrap(),
            Some("a".into())
        );
        assert_eq!(
            bounded_line(&mut input, &mut pending, 10).await.unwrap(),
            Some("b".into())
        );
        assert_eq!(
            bounded_line(&mut input, &mut pending, 10).await.unwrap(),
            None
        );
    }
    #[tokio::test]
    async fn partial_line_survives_select_cancellation() {
        use tokio::io::AsyncWriteExt;
        let (reader, mut writer) = tokio::io::duplex(32);
        writer.write_all(b"12").await.unwrap();
        let mut reader = BufReader::new(reader);
        let mut pending = Vec::new();
        assert!(tokio::time::timeout(
            Duration::from_millis(5),
            bounded_line(&mut reader, &mut pending, 10)
        )
        .await
        .is_err());
        writer.write_all(b"34\n").await.unwrap();
        assert_eq!(
            bounded_line(&mut reader, &mut pending, 10).await.unwrap(),
            Some("1234".into())
        );
    }
}

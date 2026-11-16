use crate::{
    domain::{DownloadRequest, Media, MediaFormat, PlaylistEntry},
    error::{AppError, Result},
    process,
    proxy::NetworkBroker,
    security,
    tools::Tools,
};
use serde_json::Value;
use std::{
    path::{Path, PathBuf},
    time::Duration,
};
use tokio::sync::watch;

fn base_args(proxy: &str, tools: &Tools) -> Result<Vec<String>> {
    Ok(vec![
        "--ignore-config",
        "--no-plugin-dirs",
        "--no-cache-dir",
        "--no-remote-components",
        "--no-js-runtimes",
        "--js-runtimes",
        &format!("deno:{}", tools.verified("deno")?.display()),
        "--proxy",
        proxy,
        "--socket-timeout",
        "20",
        "--retries",
        "2",
        "--fragment-retries",
        "2",
        "--no-check-formats",
        "--no-warnings",
        "--ffmpeg-location",
        &tools
            .verified("ffmpeg")?
            .parent()
            .ok_or_else(|| AppError::internal("ffmpeg parent"))?
            .display()
            .to_string(),
    ]
    .into_iter()
    .map(String::from)
    .collect())
}
pub async fn analyze(
    tools: &Tools,
    url: &str,
    cancel: &mut watch::Receiver<bool>,
) -> Result<Media> {
    security::validate_url(url)?;
    let broker = NetworkBroker::start().await?;
    let mut args = base_args(&broker.address, tools)?;
    args.extend(
        [
            "--dump-single-json",
            "--flat-playlist",
            "--playlist-end",
            "200",
            "--skip-download",
            "--",
            url,
        ]
        .into_iter()
        .map(String::from),
    );
    let output = process::run(
        &tools.verified("yt-dlp")?,
        &args,
        None,
        cancel,
        Duration::from_secs(120),
        |_| {},
    )
    .await?;
    parse_media(&output, url)
}
pub fn parse_media(output: &str, source: &str) -> Result<Media> {
    let data: Value = serde_json::from_str(output)?;
    let is_playlist = data["entries"].is_array();
    let formats = data["formats"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|f| {
                    let protocol = f["protocol"].as_str().unwrap_or("");
                    if !["https", "http", "m3u8_native", "http_dash_segments"].contains(&protocol) {
                        return None;
                    }
                    Some(MediaFormat {
                        id: f["format_id"].as_str()?.into(),
                        ext: f["ext"].as_str().unwrap_or("").into(),
                        height: f["height"].as_u64().map(|v| v as u32),
                        audio: f["acodec"].as_str().is_some_and(|v| v != "none"),
                        video: f["vcodec"].as_str().is_some_and(|v| v != "none"),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let entries = data["entries"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|e| {
                    let url = e["webpage_url"].as_str().or(e["url"].as_str())?;
                    if security::validate_url(url).is_err() {
                        return None;
                    }
                    Some(PlaylistEntry {
                        id: e["id"].as_str()?.into(),
                        url: url.into(),
                        title: e["title"].as_str().unwrap_or("Média sans titre").into(),
                        duration: e["duration"].as_f64(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(Media {
        id: data["id"].as_str().unwrap_or(source).into(),
        url: source.into(),
        title: data["title"].as_str().unwrap_or("Média sans titre").into(),
        creator: data["uploader"].as_str().map(String::from),
        duration: data["duration"].as_f64(),
        formats,
        entries,
        is_playlist,
    })
}
pub fn download_args(request: &DownloadRequest, proxy: &str, tools: &Tools) -> Result<Vec<String>> {
    request.validate()?;
    security::validate_url(&request.url)?;
    let mut args = base_args(proxy, tools)?;
    let selector = if request.kind == "audio" {
        "bestaudio/best".into()
    } else if request.quality == 0 {
        "bestvideo+bestaudio/best".into()
    } else {
        format!(
            "bestvideo[height<={}]+bestaudio/best[height<={}]",
            request.quality, request.quality
        )
    };
    args.extend(
        [
            "--no-playlist",
            "--newline",
            "--progress",
            "--progress-template",
            "download:AF_PROGRESS:%(progress)j",
            "--print",
            "after_move:AF_FILE:%(filepath)j",
            "--no-overwrites",
            "--restrict-filenames",
            "--hls-prefer-native",
            "--max-filesize",
            "20G",
            "--output",
            "source.%(ext)s",
            "--format",
            &selector,
        ]
        .into_iter()
        .map(String::from),
    );
    if request.kind == "video" {
        args.extend([
            "--merge-output-format".into(),
            if request.format == "original" {
                "mkv".into()
            } else {
                request.format.clone()
            },
        ]);
    }
    args.push("--".into());
    args.push(request.url.clone());
    Ok(args)
}
pub async fn download(
    tools: &Tools,
    request: &DownloadRequest,
    work: &Path,
    cancel: &mut watch::Receiver<bool>,
    progress: impl FnMut(&str) + Send,
) -> Result<PathBuf> {
    let broker = NetworkBroker::start().await?;
    let args = download_args(request, &broker.address, tools)?;
    let output = process::run(
        &tools.verified("yt-dlp")?,
        &args,
        Some(work),
        cancel,
        Duration::from_secs(3600),
        progress,
    )
    .await?;
    let path = output
        .lines()
        .rev()
        .find_map(|line| {
            line.strip_prefix("AF_FILE:")
                .and_then(|s| serde_json::from_str::<String>(s).ok())
        })
        .ok_or_else(|| AppError::new("ENGINE_ERROR", "Aucun fichier final n'a été produit."))?;
    let path = PathBuf::from(path);
    let path = if path.is_absolute() {
        path
    } else {
        work.join(path)
    };
    security::safe_child(&std::fs::canonicalize(work)?, &path)
}
pub async fn convert(
    tools: &Tools,
    input: &Path,
    request: &DownloadRequest,
    work: &Path,
    cancel: &mut watch::Receiver<bool>,
) -> Result<PathBuf> {
    if request.format == "original" {
        return Ok(input.to_owned());
    }
    let ext = &request.format;
    let output = work.join(format!("converted.{ext}"));
    if output.exists() {
        return Err(AppError::new(
            "FILE_EXISTS",
            "Le fichier de conversion existe déjà. Il ne sera pas écrasé.",
        ));
    }
    let mut args = vec![
        "-nostdin".into(),
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-n".into(),
        "-protocol_whitelist".into(),
        "file,pipe".into(),
        "-i".into(),
        input.display().to_string(),
    ];
    if request.kind == "audio" {
        args.extend(["-vn".into(), "-map".into(), "0:a:0".into()]);
        match ext.as_str() {
            "mp3" => args.extend([
                "-c:a".into(),
                "libmp3lame".into(),
                "-b:a".into(),
                format!("{}k", request.bitrate),
            ]),
            "m4a" => args.extend(["-c:a".into(), "aac".into(), "-b:a".into(), "192k".into()]),
            "opus" => args.extend([
                "-c:a".into(),
                "libopus".into(),
                "-b:a".into(),
                "160k".into(),
            ]),
            "flac" => args.extend(["-c:a".into(), "flac".into()]),
            "wav" => args.extend(["-c:a".into(), "pcm_s16le".into()]),
            _ => {
                return Err(AppError::new(
                    "FORMAT_UNAVAILABLE",
                    "Format audio indisponible.",
                ))
            }
        }
    } else {
        args.extend(["-map".into(), "0".into(), "-c".into(), "copy".into()]);
    }
    if request.metadata {
        args.extend([
            "-metadata".into(),
            format!("title={}", request.title.replace(['\r', '\n'], " ")),
        ]);
    }
    args.push(output.display().to_string());
    process::run(
        &tools.verified("ffmpeg")?,
        &args,
        Some(work),
        cancel,
        Duration::from_secs(3600),
        |_| {},
    )
    .await?;
    if !std::fs::metadata(&output).is_ok_and(|m| m.is_file() && m.len() > 0) {
        return Err(AppError::new(
            "FFMPEG_ERROR",
            "La conversion n'a produit aucun fichier valide.",
        ));
    }
    Ok(output)
}
pub async fn probe(tools: &Tools, path: &Path, cancel: &mut watch::Receiver<bool>) -> Result<()> {
    let args = [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-show_entries",
        "format=duration,size",
        "-show_entries",
        "stream=codec_type",
        "-of",
        "json",
        "-i",
        &path.display().to_string(),
    ]
    .map(String::from);
    let output = process::run(
        &tools.verified("ffprobe")?,
        &args,
        None,
        cancel,
        Duration::from_secs(30),
        |_| {},
    )
    .await?;
    let json: Value = serde_json::from_str(&output)?;
    if !json["streams"].as_array().is_some_and(|s| !s.is_empty()) {
        return Err(AppError::new(
            "INVALID_MEDIA",
            "Le fichier produit ne contient aucune piste multimédia.",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn playlist_skips_unavailable_and_unsafe_items() {
        let media = parse_media(r#"{"id":"list","title":"Liste","entries":[null,{"id":"a","title":"Titre","url":"https://vimeo.com/123"},{"id":"b","url":"file:///secret"}]}"#, "https://vimeo.com/showcase/1").unwrap();
        assert!(media.is_playlist);
        assert_eq!(media.entries.len(), 1);
    }
    #[test]
    fn formats_exclude_unsupported_protocols() {
        let media = parse_media(r#"{"id":"a","formats":[{"format_id":"1","protocol":"https","ext":"m4a","acodec":"aac","vcodec":"none"},{"format_id":"2","protocol":"rtmp"}]}"#, "https://vimeo.com/1").unwrap();
        assert_eq!(media.formats.len(), 1);
        assert!(media.formats[0].audio);
    }
}

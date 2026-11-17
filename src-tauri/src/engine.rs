use crate::{
    domain::{DownloadRequest, Media, MediaDetails, MediaFormat, PlaylistEntry},
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

const PLAYLIST_PAGE_SIZE: u32 = 200;
pub const PLAYLIST_MAX_START: u32 = 9801;
const LOCAL_DEMUXERS: &str = "mov,matroska,webm,mp3,wav,flac,ogg,aac";

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
    start: u32,
    cancel: &mut watch::Receiver<bool>,
) -> Result<Media> {
    security::validate_url(url)?;
    if !(1..=PLAYLIST_MAX_START).contains(&start) || (start - 1) % PLAYLIST_PAGE_SIZE != 0 {
        return Err(AppError::new(
            "INVALID_SETTINGS",
            "Cette page de playlist est indisponible.",
        ));
    }
    let broker = NetworkBroker::start().await?;
    let mut args = base_args(&broker.address, tools)?;
    args.extend(
        [
            "--dump-single-json",
            "--flat-playlist",
            "--playlist-items",
            &format!("{start}:{}", start + PLAYLIST_PAGE_SIZE),
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
    parse_media_page(&output, url, start)
}
pub fn parse_media(output: &str, source: &str) -> Result<Media> {
    parse_media_page(output, source, 1)
}

fn media_key(data: &Value) -> Option<String> {
    let extractor = ["ie_key", "extractor_key", "extractor"]
        .iter()
        .find_map(|key| data[key].as_str())?;
    let id = data["id"].as_str()?;
    if extractor.eq_ignore_ascii_case("generic")
        || extractor.is_empty()
        || extractor.len() > 100
        || id.is_empty()
        || id.len() > 500
        || extractor.contains(':')
        || id.chars().any(char::is_control)
    {
        return None;
    }
    Some(format!("{}:{id}", extractor.to_ascii_lowercase()))
}

fn parse_media_page(output: &str, source: &str, start: u32) -> Result<Media> {
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
    let raw_entries = data["entries"].as_array();
    let next_start = (raw_entries.is_some_and(|a| a.len() > PLAYLIST_PAGE_SIZE as usize)
        && start < PLAYLIST_MAX_START)
        .then_some(start + PLAYLIST_PAGE_SIZE);
    let entries = raw_entries
        .map(|a| {
            a.iter()
                .take(PLAYLIST_PAGE_SIZE as usize)
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
                        creator: creator(e),
                        media_key: media_key(e),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(Media {
        id: data["id"].as_str().unwrap_or(source).into(),
        url: source.into(),
        title: data["title"].as_str().unwrap_or("Média sans titre").into(),
        creator: creator(&data),
        duration: data["duration"].as_f64(),
        formats,
        entries,
        is_playlist,
        media_key: if is_playlist { None } else { media_key(&data) },
        next_start,
    })
}

fn creator(data: &Value) -> Option<String> {
    ["uploader", "channel", "creator"]
        .iter()
        .find_map(|key| data[key].as_str().filter(|value| !value.trim().is_empty()))
        .map(str::to_owned)
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
            if ["original", "mp4"].contains(&request.format.as_str()) {
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
    convert_file(tools, input, request, work, cancel, false).await
}

pub async fn convert_local(
    tools: &Tools,
    input: &Path,
    request: &DownloadRequest,
    work: &Path,
    cancel: &mut watch::Receiver<bool>,
) -> Result<PathBuf> {
    convert_file(tools, input, request, work, cancel, true).await
}

async fn convert_file(
    tools: &Tools,
    input: &Path,
    request: &DownloadRequest,
    work: &Path,
    cancel: &mut watch::Receiver<bool>,
    local: bool,
) -> Result<PathBuf> {
    if request.kind == "video" && request.format == "original" {
        return Ok(input.to_owned());
    }
    let streams = if request.format == "original" || request.format == "mp4" {
        inspect(tools, input, cancel, local).await?.0
    } else {
        Vec::new()
    };
    let ext = if request.format == "original" {
        if streams.iter().all(|s| s["codec_type"] == "audio") {
            return Ok(input.to_owned());
        }
        "mka"
    } else {
        request.format.as_str()
    };
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
    ];
    if local {
        args.extend(["-format_whitelist".into(), LOCAL_DEMUXERS.into()]);
    }
    args.extend(["-i".into(), input.display().to_string()]);
    if request.kind == "audio" {
        args.extend(["-vn".into(), "-map".into(), "0:a:0".into()]);
        match ext {
            "mka" => args.extend(["-c:a".into(), "copy".into()]),
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
    } else if ext == "mp4" {
        let video = streams.iter().find(|stream| {
            stream["codec_type"] == "video" && stream["disposition"]["attached_pic"] != 1
        });
        let audio = streams
            .iter()
            .find(|stream| stream["codec_type"] == "audio");
        let video = video.ok_or_else(|| {
            AppError::new("INVALID_MEDIA", "Le média ne contient aucune piste vidéo.")
        })?;
        let scale = local
            && request.quality > 0
            && video["height"]
                .as_u64()
                .is_some_and(|height| height > u64::from(request.quality));
        let copy_video = !scale && video["codec_name"] == "h264" && video["pix_fmt"] == "yuv420p";
        args.extend([
            "-map".into(),
            format!("0:{}", video["index"]),
            "-c:v".into(),
            if copy_video { "copy" } else { "libx264" }.into(),
        ]);
        if !copy_video {
            args.extend([
                "-vf".into(),
                if scale {
                    format!("scale=-2:{},setsar=1", request.quality)
                } else {
                    "pad=ceil(iw/2)*2:ceil(ih/2)*2".into()
                },
                "-pix_fmt".into(),
                "yuv420p".into(),
            ]);
        }
        if let Some(audio) = audio {
            args.extend([
                "-map".into(),
                format!("0:{}", audio["index"]),
                "-c:a".into(),
                if audio["codec_name"] == "aac" && audio["profile"] == "LC" {
                    "copy"
                } else {
                    "aac"
                }
                .into(),
            ]);
        }
        args.extend(["-movflags".into(), "+faststart".into()]);
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
    inspect(tools, path, cancel, false).await.map(|_| ())
}

pub async fn validate_output(
    tools: &Tools,
    path: &Path,
    request: &DownloadRequest,
    cancel: &mut watch::Receiver<bool>,
) -> Result<MediaDetails> {
    let (streams, details) = inspect(tools, path, cancel, false).await?;
    let audio = streams.iter().filter(|s| s["codec_type"] == "audio");
    let video = streams
        .iter()
        .filter(|s| s["codec_type"] == "video" && s["disposition"]["attached_pic"] != 1);
    let valid = if request.kind == "audio" {
        audio.count() > 0 && video.count() == 0
    } else if request.format == "mp4" {
        video.count() == 1
            && streams
                .iter()
                .filter(|s| s["codec_type"] == "video")
                .all(|s| s["codec_name"] == "h264" && s["pix_fmt"] == "yuv420p")
            && audio.clone().count() <= 1
            && audio
                .into_iter()
                .all(|s| s["codec_name"] == "aac" && s["profile"] == "LC")
    } else {
        video.count() > 0
    };
    if !valid {
        return Err(AppError::new(
            "INVALID_MEDIA",
            "Les pistes du fichier ne correspondent pas au format demandé.",
        ));
    }
    Ok(details)
}

async fn inspect(
    tools: &Tools,
    path: &Path,
    cancel: &mut watch::Receiver<bool>,
    local: bool,
) -> Result<(Vec<Value>, MediaDetails)> {
    let mut args = [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-show_entries",
        "stream=index,codec_type,codec_name,profile,pix_fmt,height:stream_disposition=attached_pic:format=duration:format_tags=artist,ARTIST,author,AUTHOR",
        "-of",
        "json",
    ]
    .map(String::from).to_vec();
    if local {
        args.extend(["-format_whitelist".into(), LOCAL_DEMUXERS.into()]);
    }
    args.extend(["-i".into(), path.display().to_string()]);
    let output = process::run(
        &tools.verified("ffprobe")?,
        &args,
        None,
        cancel,
        Duration::from_secs(30),
        |_| {},
    )
    .await?;
    let mut json: Value = serde_json::from_str(&output)?;
    let format = &json["format"];
    let duration = format["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .filter(|n| n.is_finite() && *n >= 0.0);
    let creator = ["artist", "ARTIST", "author", "AUTHOR"]
        .iter()
        .find_map(|key| format["tags"][key].as_str())
        .map(|text| text.chars().take(500).collect());
    match json["streams"].take() {
        Value::Array(streams) if !streams.is_empty() => Ok((
            streams,
            MediaDetails {
                duration,
                creator,
                playlist: None,
            },
        )),
        _ => Err(AppError::new(
            "INVALID_MEDIA",
            "Le fichier produit ne contient aucune piste multimédia.",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn playlist_counts_raw_positions_for_pagination() {
        let mut entries = vec![Value::Null; 200];
        entries[1] = serde_json::json!({"id":"example", "ie_key":"Youtube", "url":"https://youtu.be/ExampleId01"});
        entries.push(serde_json::json!({"id":"next", "ie_key":"Youtube", "url":"https://youtu.be/ExampleId02"}));
        let page = parse_media_page(
            &serde_json::json!({"entries": entries}).to_string(),
            "https://www.youtube.com/playlist?list=example",
            201,
        )
        .unwrap();
        assert_eq!(page.next_start, Some(401));
        assert_eq!(page.entries.len(), 1);
        assert_eq!(
            page.entries[0].media_key.as_deref(),
            Some("youtube:example")
        );
    }
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

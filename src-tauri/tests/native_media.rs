#![cfg(feature = "native-media-tests")]
use audioforge_lib::{domain::DownloadRequest, engine, process, tools::Tools};
use std::{path::PathBuf, time::Duration};

#[tokio::test]
async fn native_service_converts_and_validates_all_audio_formats() {
    let tools = Tools::load(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries"));
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("source.wav");
    let (_tx, mut cancel) = tokio::sync::watch::channel(false);
    let args = [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-n",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=0.5",
        "-c:a",
        "pcm_s16le",
        &source.display().to_string(),
    ]
    .map(String::from);
    process::run(
        &tools.verified("ffmpeg").unwrap(),
        &args,
        None,
        &mut cancel,
        Duration::from_secs(20),
        |_| {},
    )
    .await
    .unwrap();
    for format in ["mp3", "m4a", "opus", "flac", "wav"] {
        let work = root.path().join(format);
        std::fs::create_dir(&work).unwrap();
        let request = DownloadRequest {
            url: "https://vimeo.com/1".into(),
            title: "Essai local é".into(),
            kind: "audio".into(),
            format: format.into(),
            quality: 0,
            bitrate: 192,
            destination: root.path().display().to_string(),
            metadata: true,
        };
        let path = engine::convert(&tools, &source, &request, &work, &mut cancel)
            .await
            .unwrap();
        assert!(std::fs::metadata(&path).unwrap().len() > 0);
        engine::probe(&tools, &path, &mut cancel).await.unwrap();
        let before = std::fs::read(&path).unwrap();
        let duplicate = engine::convert(&tools, &source, &request, &work, &mut cancel)
            .await
            .unwrap_err();
        assert_eq!(duplicate.code, "FILE_EXISTS");
        assert_eq!(std::fs::read(&path).unwrap(), before);
    }
}

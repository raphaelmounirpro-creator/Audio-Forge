#![cfg(feature = "native-media-tests")]
use audioforge_lib::{domain::DownloadRequest, engine, process, tools::Tools};
use std::{path::PathBuf, time::Duration};

#[tokio::test]
#[ignore = "télécharge un média public CC0 depuis Wikimedia Commons"]
async fn network_wikimedia_download_reaches_persistent_history() {
    use audioforge_lib::{
        domain::{Settings, Status},
        queue::Queue,
        storage::Storage,
    };

    // CC0, Ryan Junell et Creative Commons, URL stable du fichier original.
    let url = "https://upload.wikimedia.org/wikipedia/commons/3/38/CC_BY-SA_video_bumper.webm";
    let tools = Tools::load(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries"));
    let root = tempfile::tempdir().unwrap();
    let database = root.path().join("audioforge.sqlite");
    let destination = root.path().display().to_string();
    let (_tx, mut cancel) = tokio::sync::watch::channel(false);
    let media = engine::analyze(&tools, url, 1, &mut cancel).await.unwrap();
    assert!(!media.is_playlist);
    let queue = Queue::new(
        Storage::open(&database).unwrap(),
        tools.clone(),
        Settings {
            destination: destination.clone(),
            audio_format: "mp3".into(),
            video_format: "mp4".into(),
            mp3_bitrate: 192,
            concurrency: 1,
            metadata: true,
        },
        |_| {},
    )
    .unwrap();
    queue.remember_analysis(&media).unwrap();
    let request = DownloadRequest {
        url: url.into(),
        title: media.title,
        kind: "audio".into(),
        format: "original".into(),
        quality: 0,
        bitrate: 192,
        destination,
        metadata: true,
    };
    let task_id = queue.enqueue(request.clone(), false).unwrap().id;
    queue.start();
    let task = tokio::time::timeout(Duration::from_secs(90), async {
        loop {
            let task = queue.tasks().unwrap().remove(0);
            if task.status.terminal() {
                break task;
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
    })
    .await
    .expect("temps maximal du téléchargement dépassé");
    assert_eq!(task.status, Status::Completed, "{:?}", task.error);
    let path = queue.path(&task_id).unwrap();
    engine::validate_output(&tools, &path, &request, &mut cancel)
        .await
        .unwrap();
    let reopened = Storage::open(&database).unwrap().tasks().unwrap().remove(0);
    assert_eq!(reopened.id, task_id);
    assert_eq!(reopened.status, Status::Completed);
    assert_eq!(reopened.path, task.path);
}

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

#[tokio::test]
async fn native_service_extracts_original_audio_and_produces_compatible_mp4() {
    let tools = Tools::load(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries"));
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("combined.mkv");
    let (_tx, mut cancel) = tokio::sync::watch::channel(false);
    let args = [
        "-nostdin",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=size=32x32:duration=0.5",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=0.5",
        "-c:v",
        "mpeg4",
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
    let mut request = DownloadRequest {
        url: "https://vimeo.com/1".into(),
        title: "Essai de pistes".into(),
        kind: "audio".into(),
        format: "original".into(),
        quality: 0,
        bitrate: 192,
        destination: root.path().display().to_string(),
        metadata: false,
    };
    assert!(
        engine::validate_output(&tools, &source, &request, &mut cancel)
            .await
            .is_err()
    );
    let audio = engine::convert(&tools, &source, &request, root.path(), &mut cancel)
        .await
        .unwrap();
    assert_eq!(audio.extension().unwrap(), "mka");
    engine::validate_output(&tools, &audio, &request, &mut cancel)
        .await
        .unwrap();
    request.kind = "video".into();
    request.format = "mp4".into();
    assert!(
        engine::validate_output(&tools, &source, &request, &mut cancel)
            .await
            .is_err()
    );
    let video = engine::convert(&tools, &source, &request, root.path(), &mut cancel)
        .await
        .unwrap();
    assert_eq!(video.extension().unwrap(), "mp4");
    engine::validate_output(&tools, &video, &request, &mut cancel)
        .await
        .unwrap();

    use audioforge_lib::{
        domain::{OutputOptions, Settings, Status},
        queue::Queue,
        storage::Storage,
    };
    let database = root.path().join("local.sqlite");
    let queue = Queue::new(
        Storage::open(&database).unwrap(),
        tools,
        Settings {
            destination: request.destination.clone(),
            audio_format: "mp3".into(),
            video_format: "mp4".into(),
            mp3_bitrate: 192,
            concurrency: 1,
            metadata: true,
        },
        |_| {},
    )
    .unwrap();
    let original_size = std::fs::metadata(&video).unwrap().len();
    let queued = queue
        .enqueue_local(
            OutputOptions {
                kind: "audio".into(),
                format: "mp3".into(),
                quality: 0,
                bitrate: 192,
                destination: request.destination,
                metadata: true,
            },
            &video,
        )
        .unwrap();
    queue.start();
    let finished = tokio::time::timeout(Duration::from_secs(60), async {
        loop {
            let task = queue.tasks().unwrap().remove(0);
            if task.status.terminal() {
                break task;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(finished.status, Status::Completed, "{:?}", finished.error);
    assert!(finished.details.duration.is_some());
    assert!(queue.file_sizes(&[queued.id]).unwrap()[&finished.id].unwrap() > 0);
    assert_eq!(std::fs::metadata(&video).unwrap().len(), original_size);
    assert_eq!(
        Storage::open(&database).unwrap().tasks().unwrap()[0].status,
        Status::Completed
    );
}

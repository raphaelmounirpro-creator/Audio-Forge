pub mod domain;
pub mod engine;
pub mod error;
pub mod process;
pub mod proxy;
pub mod queue;
pub mod security;
pub mod storage;
pub mod tools;

#[cfg(feature = "desktop")]
mod desktop {
    use crate::{
        domain::*,
        error::{AppError, Result},
        queue::Queue,
        storage::Storage,
        tools::Tools,
    };
    use std::sync::Arc;
    use tauri::{Emitter, Manager, State};
    type AppQueue = Arc<Queue>;

    #[tauri::command]
    fn get_tasks(queue: State<'_, AppQueue>) -> Result<Vec<Task>> {
        queue.tasks()
    }
    #[tauri::command]
    fn get_settings(queue: State<'_, AppQueue>) -> Result<Settings> {
        queue.settings()
    }
    #[tauri::command]
    fn save_settings(queue: State<'_, AppQueue>, settings: Settings) -> Result<()> {
        queue.save_settings(settings)
    }
    #[tauri::command]
    async fn get_tools(queue: State<'_, AppQueue>) -> Result<Vec<ToolInfo>> {
        let tools = queue.tools.clone();
        tauri::async_runtime::spawn_blocking(move || tools.status())
            .await
            .map_err(AppError::internal)
    }
    #[tauri::command]
    async fn analyze_media(queue: State<'_, AppQueue>, url: String) -> Result<Media> {
        let (_tx, mut cancel) = tokio::sync::watch::channel(false);
        crate::engine::analyze(&queue.tools, &url, &mut cancel).await
    }
    #[tauri::command]
    fn enqueue_download(queue: State<'_, AppQueue>, request: DownloadRequest) -> Result<Task> {
        queue.enqueue(request)
    }
    #[tauri::command]
    fn cancel_download(queue: State<'_, AppQueue>, id: String) -> Result<()> {
        queue.cancel(&id)
    }
    #[tauri::command]
    fn retry_download(queue: State<'_, AppQueue>, id: String) -> Result<()> {
        queue.retry(&id)
    }
    #[tauri::command]
    fn remove_download(queue: State<'_, AppQueue>, id: String) -> Result<()> {
        queue.remove(&id)
    }
    #[tauri::command]
    fn open_download(queue: State<'_, AppQueue>, id: String, folder: bool) -> Result<()> {
        let path = queue.path(&id)?;
        let system = std::env::var_os("SystemRoot")
            .map(std::path::PathBuf::from)
            .ok_or_else(|| AppError::internal("SystemRoot"))?;
        let target = if folder {
            path.parent()
                .ok_or_else(|| AppError::internal("parent"))?
                .to_owned()
        } else {
            path
        };
        std::process::Command::new(system.join("explorer.exe"))
            .arg(target)
            .spawn()?;
        Ok(())
    }
    pub fn run() {
        tauri::Builder::default()
            .plugin(tauri_plugin_dialog::init())
            .setup(|app| {
                let data = app.path().app_local_data_dir()?;
                std::fs::create_dir_all(&data)?;
                let destination = app.path().download_dir().unwrap_or(data.clone());
                let resources = if cfg!(debug_assertions) {
                    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries")
                } else {
                    app.path().resource_dir()?.join("binaries")
                };
                let storage = Storage::open(&data.join("audioforge.sqlite"))?;
                let handle = app.handle().clone();
                let queue = Queue::new(
                    storage,
                    Tools::load(resources),
                    Settings {
                        destination: destination.display().to_string(),
                        audio_format: "mp3".into(),
                        video_format: "mp4".into(),
                        mp3_bitrate: 192,
                        concurrency: 2,
                        metadata: true,
                    },
                    move |task| {
                        let _ = handle.emit("task-updated", task);
                    },
                )?;
                let runtime_handle = tauri::async_runtime::handle();
                let _runtime = runtime_handle.inner().enter();
                queue.start();
                app.manage(queue);
                Ok(())
            })
            .invoke_handler(tauri::generate_handler![
                get_tasks,
                get_settings,
                save_settings,
                get_tools,
                analyze_media,
                enqueue_download,
                cancel_download,
                retry_download,
                remove_download,
                open_download
            ])
            .run(tauri::generate_context!())
            .expect("Impossible de démarrer AudioForge");
    }
}
#[cfg(feature = "desktop")]
pub use desktop::run;

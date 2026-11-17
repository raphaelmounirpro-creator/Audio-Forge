pub mod domain;
pub mod engine;
pub mod error;
pub mod install;
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
    use std::sync::{Arc, Mutex};
    use tauri::{Emitter, Manager, State};
    use tokio::sync::watch;
    type AppQueue = Arc<Queue>;

    /// At most one component installation; its sender allows cancellation.
    #[derive(Default)]
    struct Installer(Mutex<Option<watch::Sender<bool>>>);
    struct InstallGuard<'a>(&'a Installer);
    impl Drop for InstallGuard<'_> {
        fn drop(&mut self) {
            if let Ok(mut slot) = self.0 .0.lock() {
                *slot = None;
            }
        }
    }

    #[tauri::command]
    fn get_tool_sources() -> Vec<crate::install::Source> {
        crate::install::sources()
    }
    #[tauri::command]
    async fn install_tools(
        app: tauri::AppHandle,
        queue: State<'_, AppQueue>,
        installer: State<'_, Installer>,
    ) -> Result<Vec<ToolInfo>> {
        let mut cancel = {
            let mut slot = installer.0.lock().map_err(AppError::internal)?;
            if slot.is_some() {
                return Err(AppError::new(
                    "INSTALL_RUNNING",
                    "Le téléchargement des composants est déjà en cours.",
                ));
            }
            let (sender, receiver) = watch::channel(false);
            *slot = Some(sender);
            receiver
        };
        let _guard = InstallGuard(installer.inner());
        crate::install::install(
            &queue.tools,
            &crate::install::sources(),
            &mut cancel,
            crate::install::curl_fetch,
            |progress| {
                let _ = app.emit("tools-progress", progress);
            },
        )
        .await?;
        let tools = queue.tools.clone();
        tauri::async_runtime::spawn_blocking(move || tools.status())
            .await
            .map_err(AppError::internal)
    }
    #[tauri::command]
    fn cancel_tools_install(installer: State<'_, Installer>) -> Result<()> {
        if let Some(sender) = installer.0.lock().map_err(AppError::internal)?.as_ref() {
            let _ = sender.send(true);
        }
        Ok(())
    }

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
                // Third-party components are downloaded on request into the
                // user profile, never shipped in the installer.
                let components = data.join("tools");
                let storage = Storage::open(&data.join("audioforge.sqlite"))?;
                let handle = app.handle().clone();
                let queue = Queue::new(
                    storage,
                    Tools::load(components),
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
                app.manage(Installer::default());
                Ok(())
            })
            .invoke_handler(tauri::generate_handler![
                get_tasks,
                get_settings,
                save_settings,
                get_tools,
                get_tool_sources,
                install_tools,
                cancel_tools_install,
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

pub mod domain;
pub mod engine;
pub mod error;
pub mod install;
pub mod process;
pub mod proxy;
pub mod queue;
pub mod recycle;
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
    use tauri_plugin_dialog::DialogExt;
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
    async fn analyze_media(
        queue: State<'_, AppQueue>,
        url: String,
        start: Option<u32>,
    ) -> Result<Media> {
        let (_tx, mut cancel) = tokio::sync::watch::channel(false);
        let media =
            crate::engine::analyze(&queue.tools, &url, start.unwrap_or(1), &mut cancel).await?;
        queue.remember_analysis(&media)?;
        Ok(media)
    }
    #[tauri::command]
    fn enqueue_download(
        queue: State<'_, AppQueue>,
        request: DownloadRequest,
        allow_existing: bool,
        details: Option<MediaDetails>,
    ) -> Result<Task> {
        queue.enqueue_media(request, allow_existing, details.unwrap_or_default())
    }
    #[tauri::command]
    fn get_profiles(queue: State<'_, AppQueue>) -> Result<Vec<Profile>> {
        queue.profiles()
    }
    #[tauri::command]
    fn save_profile(queue: State<'_, AppQueue>, profile: Profile) -> Result<Vec<Profile>> {
        queue.save_profile(profile)
    }
    #[tauri::command]
    fn remove_profile(queue: State<'_, AppQueue>, name: String) -> Result<Vec<Profile>> {
        queue.remove_profile(&name)
    }
    #[tauri::command]
    async fn choose_local_media(
        app: tauri::AppHandle,
        queue: State<'_, AppQueue>,
        output: OutputOptions,
    ) -> Result<Option<Task>> {
        let queue = queue.inner().clone();
        tauri::async_runtime::spawn_blocking(move || {
            let selection = app
                .dialog()
                .file()
                .set_title("Choisir un fichier multimédia")
                .add_filter("Fichiers multimédias", crate::security::MEDIA_EXTENSIONS)
                .blocking_pick_file();
            selection
                .map(|path| {
                    let path = path.into_path().map_err(AppError::internal)?;
                    queue.enqueue_local(output, &path)
                })
                .transpose()
        })
        .await
        .map_err(AppError::internal)?
    }
    #[tauri::command]
    async fn import_link_list(app: tauri::AppHandle) -> Result<Option<String>> {
        tauri::async_runtime::spawn_blocking(move || {
            let selection = app
                .dialog()
                .file()
                .set_title("Importer une liste de liens")
                .add_filter("Liste de liens TXT", &["txt"])
                .blocking_pick_file();
            selection
                .map(|path| {
                    let path = path.into_path().map_err(AppError::internal)?;
                    crate::security::read_link_list(&path)
                })
                .transpose()
        })
        .await
        .map_err(AppError::internal)?
    }
    #[tauri::command]
    async fn get_file_sizes(
        queue: State<'_, AppQueue>,
        ids: Vec<String>,
    ) -> Result<std::collections::HashMap<String, Option<u64>>> {
        let queue = queue.inner().clone();
        tauri::async_runtime::spawn_blocking(move || queue.file_sizes(&ids))
            .await
            .map_err(AppError::internal)?
    }
    #[tauri::command]
    async fn find_existing(
        queue: State<'_, AppQueue>,
        urls: Vec<String>,
    ) -> Result<Vec<ExistingFile>> {
        let queue = queue.inner().clone();
        tauri::async_runtime::spawn_blocking(move || queue.existing(&urls))
            .await
            .map_err(AppError::internal)?
    }
    #[tauri::command]
    async fn find_duplicates(queue: State<'_, AppQueue>) -> Result<Vec<String>> {
        let queue = queue.inner().clone();
        tauri::async_runtime::spawn_blocking(move || queue.duplicates())
            .await
            .map_err(AppError::internal)?
    }
    #[tauri::command]
    async fn remove_duplicates(queue: State<'_, AppQueue>, delete_files: bool) -> Result<Cleanup> {
        let queue = queue.inner().clone();
        // Blocking: Windows may ask before a permanent deletion.
        tauri::async_runtime::spawn_blocking(move || {
            queue.remove_duplicates(delete_files, crate::recycle::recycle)
        })
        .await
        .map_err(AppError::internal)?
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
    fn retry_failed_downloads(queue: State<'_, AppQueue>, ids: Vec<String>) -> Result<RetryReport> {
        queue.retry_failed(&ids)
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
                #[cfg(windows)]
                {
                    use std::os::windows::fs::OpenOptionsExt;
                    let lock = std::fs::OpenOptions::new()
                        .write(true)
                        .create(true)
                        .truncate(false)
                        .share_mode(0)
                        .open(data.join("instance.lock"))?;
                    app.manage(lock);
                }
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
                get_profiles,
                save_profile,
                remove_profile,
                choose_local_media,
                import_link_list,
                get_file_sizes,
                find_existing,
                find_duplicates,
                remove_duplicates,
                cancel_download,
                retry_download,
                retry_failed_downloads,
                remove_download,
                open_download
            ])
            .run(tauri::generate_context!())
            .expect("Impossible de démarrer AudioForge");
    }
}
#[cfg(feature = "desktop")]
pub use desktop::run;

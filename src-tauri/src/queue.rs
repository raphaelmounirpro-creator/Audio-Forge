use crate::{
    domain::{now, DownloadRequest, Settings, Status, Task},
    engine,
    error::{AppError, Result},
    process::cancelled,
    security,
    storage::Storage,
    tools::Tools,
};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tokio::sync::{watch, Notify};

pub struct Queue {
    storage: Storage,
    tasks: Mutex<Vec<Task>>,
    active: Mutex<HashMap<String, watch::Sender<bool>>>,
    settings: Mutex<Settings>,
    pub tools: Tools,
    notify: Notify,
    emit: Box<dyn Fn(&Task) + Send + Sync>,
}
impl Queue {
    pub fn new(
        storage: Storage,
        tools: Tools,
        default: Settings,
        emit: impl Fn(&Task) + Send + Sync + 'static,
    ) -> Result<Arc<Self>> {
        let tasks = storage.tasks()?;
        let settings = storage.settings(default)?;
        settings.validate()?;
        Ok(Arc::new(Self {
            storage,
            tasks: Mutex::new(tasks),
            active: Mutex::new(HashMap::new()),
            settings: Mutex::new(settings),
            tools,
            notify: Notify::new(),
            emit: Box::new(emit),
        }))
    }
    pub fn tasks(&self) -> Result<Vec<Task>> {
        Ok(self.tasks.lock().map_err(AppError::internal)?.clone())
    }
    pub fn settings(&self) -> Result<Settings> {
        Ok(self.settings.lock().map_err(AppError::internal)?.clone())
    }
    pub fn save_settings(&self, settings: Settings) -> Result<()> {
        settings.validate()?;
        security::destination(&settings.destination)?;
        self.storage.save_settings(&settings)?;
        *self.settings.lock().map_err(AppError::internal)? = settings;
        self.notify.notify_one();
        Ok(())
    }
    pub fn enqueue(&self, mut request: DownloadRequest) -> Result<Task> {
        request.validate()?;
        request.url = security::validate_url(&request.url)?.to_string();
        let dest = security::destination(&request.destination)?;
        request.destination = dest.display().to_string();
        if request.title.chars().count() > 1000 {
            return Err(AppError::new("INVALID_SETTINGS", "Le titre est trop long."));
        }
        let mut tasks = self.tasks.lock().map_err(AppError::internal)?;
        if tasks.iter().any(|t| {
            t.request.url == request.url
                && t.request.kind == request.kind
                && t.request.format == request.format
                && t.request.quality == request.quality
                && t.request.bitrate == request.bitrate
                && t.request.destination == request.destination
                && !matches!(
                    t.status,
                    Status::Cancelled | Status::Failed | Status::Interrupted
                )
        }) {
            return Err(AppError::new(
                "DUPLICATE",
                "Ce média est déjà dans la file ou l'historique avec ces réglages.",
            ));
        }
        if tasks.iter().filter(|t| !t.status.terminal()).count() >= 500 {
            return Err(AppError::new(
                "QUEUE_FULL",
                "La file contient déjà 500 tâches. Attendez avant d'en ajouter.",
            ));
        }
        let task = Task {
            id: uuid::Uuid::new_v4().to_string(),
            request,
            status: Status::Queued,
            progress: 0.0,
            speed: None,
            eta: None,
            path: None,
            error: None,
            created_at: now(),
        };
        self.storage.save_task(&task)?;
        tasks.push(task.clone());
        (self.emit)(&task);
        self.notify.notify_one();
        Ok(task)
    }
    pub fn cancel(&self, id: &str) -> Result<()> {
        let mut tasks = self.tasks.lock().map_err(AppError::internal)?;
        let task = tasks.iter_mut().find(|t| t.id == id).ok_or_else(missing)?;
        if task.status == Status::Queued {
            let mut next = task.clone();
            next.status = Status::Cancelled;
            self.storage.save_task(&next)?;
            *task = next;
            (self.emit)(task);
        } else if !task.status.terminal() {
            if let Some(tx) = self.active.lock().map_err(AppError::internal)?.get(id) {
                let _ = tx.send(true);
            }
        }
        Ok(())
    }
    pub fn retry(&self, id: &str) -> Result<()> {
        let mut tasks = self.tasks.lock().map_err(AppError::internal)?;
        let task = tasks.iter_mut().find(|t| t.id == id).ok_or_else(missing)?;
        if !task.status.can_transition(Status::Queued) {
            return Err(AppError::new(
                "INVALID_STATE",
                "Cette tâche ne peut pas être relancée.",
            ));
        }
        let mut next = task.clone();
        next.status = Status::Queued;
        next.progress = 0.0;
        next.error = None;
        self.storage.save_task(&next)?;
        *task = next;
        (self.emit)(task);
        self.notify.notify_one();
        Ok(())
    }
    pub fn remove(&self, id: &str) -> Result<()> {
        let mut tasks = self.tasks.lock().map_err(AppError::internal)?;
        let index = tasks.iter().position(|t| t.id == id).ok_or_else(missing)?;
        if !tasks[index].status.terminal() {
            return Err(AppError::new(
                "INVALID_STATE",
                "Annulez la tâche avant de la retirer.",
            ));
        }
        self.storage.remove(id)?;
        tasks.remove(index);
        Ok(())
    }
    pub fn path(&self, id: &str) -> Result<PathBuf> {
        let tasks = self.tasks.lock().map_err(AppError::internal)?;
        let task = tasks.iter().find(|t| t.id == id).ok_or_else(missing)?;
        let path = Path::new(task.path.as_deref().ok_or_else(missing)?);
        let root = security::destination(&task.request.destination)?;
        security::safe_child(&root, path)
    }
    fn update(&self, id: &str, change: impl FnOnce(&mut Task)) -> Result<()> {
        let mut tasks = self.tasks.lock().map_err(AppError::internal)?;
        let task = tasks.iter_mut().find(|t| t.id == id).ok_or_else(missing)?;
        let mut next = task.clone();
        change(&mut next);
        if next.status != task.status && !task.status.can_transition(next.status) {
            return Err(AppError::new(
                "INVALID_STATE",
                "Transition de tâche invalide.",
            ));
        }
        self.storage.save_task(&next)?;
        *task = next;
        (self.emit)(task);
        Ok(())
    }
    pub fn start(self: &Arc<Self>) {
        let queue = self.clone();
        tokio::spawn(async move {
            loop {
                let notified = queue.notify.notified();
                // Consistent lock order: tasks, then active. Never hold either across await.
                let selected = (|| -> Result<Option<(Task, watch::Receiver<bool>)>> {
                    let mut tasks = queue.tasks.lock().map_err(AppError::internal)?;
                    let mut active = queue.active.lock().map_err(AppError::internal)?;
                    let limit = queue.settings()?.concurrency;
                    if active.len() >= limit {
                        return Ok(None);
                    }
                    let Some(task) = tasks.iter_mut().find(|t| t.status == Status::Queued) else {
                        return Ok(None);
                    };
                    let mut next = task.clone();
                    next.status = Status::Analyzing;
                    queue.storage.save_task(&next)?;
                    *task = next;
                    let (tx, rx) = watch::channel(false);
                    active.insert(task.id.clone(), tx);
                    (queue.emit)(task);
                    Ok(Some((task.clone(), rx)))
                })();
                match selected {
                    Ok(Some((task, mut cancel))) => {
                        let worker = queue.clone();
                        tokio::spawn(async move {
                            let result = worker.execute(&task, &mut cancel).await;
                            match result {
                                Ok(path) => {
                                    let _ = worker.update(&task.id, |t| {
                                        t.status = Status::Completed;
                                        t.progress = 100.0;
                                        t.path = Some(path.display().to_string());
                                        t.speed = None;
                                        t.eta = None;
                                    });
                                }
                                Err(e) => {
                                    let _ = worker.update(&task.id, |t| {
                                        t.status = if e.code == "DOWNLOAD_CANCELLED" {
                                            Status::Cancelled
                                        } else {
                                            Status::Failed
                                        };
                                        t.error = Some(e.message);
                                        t.speed = None;
                                        t.eta = None;
                                    });
                                }
                            }
                            if let Ok(mut active) = worker.active.lock() {
                                active.remove(&task.id);
                            }
                            worker.notify.notify_one();
                        });
                    }
                    _ => notified.await,
                }
            }
        });
    }
    async fn execute(&self, task: &Task, cancel: &mut watch::Receiver<bool>) -> Result<PathBuf> {
        let root = security::destination(&task.request.destination)?;
        self.tools.verified("ffprobe")?;
        let work = root.join(format!(".audioforge-{}", task.id));
        std::fs::create_dir(&work).map_err(|_| AppError::new("FILE_ACCESS_DENIED", "Impossible de créer le dossier de travail. Vérifiez les droits ou retirez le dossier temporaire d'une ancienne tentative."))?;
        let result = async {
            self.update(&task.id, |t| t.status=Status::Downloading)?;
            let mut last = std::time::Instant::now() - std::time::Duration::from_secs(1);
            let downloaded = engine::download(&self.tools, &task.request, &work, cancel, |line| {
                if last.elapsed() < std::time::Duration::from_millis(400) { return; }
                if let Some(json) = line.strip_prefix("AF_PROGRESS:").and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok()) {
                    last = std::time::Instant::now();
                    let size = json["total_bytes"].as_f64().or_else(|| json["total_bytes_estimate"].as_f64());
                    let done = json["downloaded_bytes"].as_f64().unwrap_or(0.0);
                    let _ = self.update(&task.id, |t| { t.progress = size.filter(|s| *s > 0.0).map(|s| (done/s*100.0).clamp(0.0,99.0)).unwrap_or(0.0); t.speed=json["speed"].as_f64(); t.eta=json["eta"].as_f64(); });
                }
            }).await?;
            self.update(&task.id, |t| {t.status=Status::Processing; t.speed=None; t.eta=None;})?;
            let converted = engine::convert(&self.tools, &downloaded, &task.request, &work, cancel).await?;
            engine::probe(&self.tools, &converted, cancel).await?;
            if *cancel.borrow() { return Err(cancelled()); }
            let root_now = security::destination(&task.request.destination)?;
            if root_now != root { return Err(AppError::new("INVALID_PATH", "La destination a changé pendant le traitement.")); }
            let converted = security::safe_child(&root, &converted)?;
            let ext = converted.extension().and_then(|s|s.to_str()).unwrap_or("bin");
            if !["mp3","m4a","opus","flac","wav","mp4","mkv","webm","ogg","aac","mov","mka"].contains(&ext) { return Err(AppError::new("FORMAT_UNAVAILABLE", "Le fichier final possède une extension non prise en charge.")); }
            let title = security::sanitize_name(&task.request.title);
            let final_path = root.join(format!("{} [{}].{}", title, &task.id[..8], ext));
            // Same-volume hard link is atomic and fails if the final file exists.
            std::fs::hard_link(&converted, &final_path).map_err(|_| AppError::new("FILE_ACCESS_DENIED", "Impossible d'enregistrer le fichier sans écrasement. Vérifiez le disque et choisissez de préférence un dossier NTFS."))?;
            Ok(final_path)
        }.await;
        // Only remove our exact, canonical work directory. Never delete an arbitrary request path.
        if security::destination(&task.request.destination)
            .ok()
            .as_ref()
            == Some(&root)
        {
            if let Ok(canonical) = std::fs::canonicalize(&work) {
                if canonical.parent() == Some(root.as_path())
                    && !std::fs::symlink_metadata(&work)
                        .map(|m| m.file_type().is_symlink())
                        .unwrap_or(true)
                {
                    let _ = std::fs::remove_dir_all(&work);
                }
            }
        }
        result
    }
}
fn missing() -> AppError {
    AppError::new(
        "TASK_NOT_FOUND",
        "Cette tâche ou son fichier n'existe plus.",
    )
}

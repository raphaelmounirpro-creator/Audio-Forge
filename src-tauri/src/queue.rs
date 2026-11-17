use crate::{
    domain::{
        now, Cleanup, DownloadRequest, ExistingFile, Media, MediaDetails, OutputOptions, Profile,
        RetryReport, Settings, Status, Task,
    },
    engine,
    error::{AppError, Result},
    process::cancelled,
    security,
    storage::Storage,
    tools::Tools,
};
use std::{
    cmp::Reverse,
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
    media_keys: Mutex<HashMap<String, String>>,
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
        let mut tasks = storage.tasks()?;
        for task in &mut tasks {
            if task.status == Status::Interrupted && published_output(task) {
                mark_completed(task);
                storage.save_task(task)?;
            }
            if task.status == Status::Completed {
                if let Ok(root) = security::destination(&task.request.destination) {
                    let _ = clean_work(&root, &task.id);
                }
            }
        }
        let settings = storage.settings(default)?;
        settings.validate()?;
        Ok(Arc::new(Self {
            storage,
            tasks: Mutex::new(tasks),
            active: Mutex::new(HashMap::new()),
            settings: Mutex::new(settings),
            media_keys: Mutex::new(HashMap::new()),
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
    pub fn remember_analysis(&self, media: &Media) -> Result<()> {
        let links = std::iter::once((&media.url, media.media_key.as_ref())).chain(
            media
                .entries
                .iter()
                .map(|entry| (&entry.url, entry.media_key.as_ref())),
        );
        let mut keys = self.media_keys.lock().map_err(AppError::internal)?;
        if keys.len() >= 25_000 {
            keys.clear();
        }
        for (url, key) in links {
            if let (Ok(url), Some(key)) = (security::validate_url(url), key) {
                keys.insert(url.into(), key.clone());
            }
        }
        Ok(())
    }
    /// `allow_existing` records the user's confirmation to save again a media
    /// whose file, in the same format, is still on disk.
    pub fn enqueue(&self, request: DownloadRequest, allow_existing: bool) -> Result<Task> {
        self.enqueue_media(request, allow_existing, MediaDetails::default())
    }

    pub fn enqueue_media(
        &self,
        mut request: DownloadRequest,
        allow_existing: bool,
        details: MediaDetails,
    ) -> Result<Task> {
        request.validate()?;
        request.url = security::validate_url(&request.url)?.to_string();
        self.enqueue_task(request, allow_existing, details, None)
    }

    pub fn enqueue_local(&self, output: OutputOptions, path: &Path) -> Result<Task> {
        let path = security::local_file(path, security::MEDIA_EXTENSIONS)?;
        let title = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("Fichier local");
        let request = output.request(title.to_owned());
        request.validate()?;
        if request.format == "original" || (request.kind == "video" && request.format != "mp4") {
            return Err(AppError::new(
                "FORMAT_UNAVAILABLE",
                "Pour convertir un fichier local, choisissez un format audio ou MP4 compatible.",
            ));
        }
        self.enqueue_task(
            request,
            true,
            MediaDetails::default(),
            Some(path.display().to_string()),
        )
    }

    fn enqueue_task(
        &self,
        mut request: DownloadRequest,
        allow_existing: bool,
        details: MediaDetails,
        local_source: Option<String>,
    ) -> Result<Task> {
        let dest = security::destination(&request.destination)?;
        request.destination = dest.display().to_string();
        if request.title.chars().count() > 1000 {
            return Err(AppError::new("INVALID_SETTINGS", "Le titre est trop long."));
        }
        let media_key = self
            .media_keys
            .lock()
            .map_err(AppError::internal)?
            .get(&request.url)
            .cloned()
            .or_else(|| youtube_key(&request.url));
        let mut tasks = self.tasks.lock().map_err(AppError::internal)?;
        for t in tasks.iter().filter(|t| {
            output_profile(&t.request) == output_profile(&request)
                && t.local_source == local_source
                && (t.request.url == request.url
                    || media_key
                        .as_deref()
                        .is_some_and(|key| task_media_key(t).as_deref() == Some(key)))
        }) {
            if !t.status.terminal() && t.request.destination == request.destination {
                return Err(AppError::new(
                    "DUPLICATE",
                    "Ce média est déjà dans la file avec ces réglages.",
                ));
            }
            if !allow_existing && t.status == Status::Completed && existing_file(t).is_some() {
                return Err(AppError::new(
                    "ALREADY_DOWNLOADED",
                    "Ce média a déjà été téléchargé dans ce format et le fichier existe toujours. Confirmez pour l'enregistrer une nouvelle fois.",
                ));
            }
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
            media_key,
            details: checked_details(details),
            local_source,
            error_code: None,
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
        self.retry_locked(&mut tasks, id)
    }
    fn retry_locked(&self, tasks: &mut [Task], id: &str) -> Result<()> {
        let position = tasks.iter().position(|t| t.id == id).ok_or_else(missing)?;
        let task = &tasks[position];
        if !task.status.can_transition(Status::Queued) {
            return Err(AppError::new(
                "INVALID_STATE",
                "Cette tâche ne peut pas être relancée.",
            ));
        }
        let mut next = task.clone();
        if published_output(&next) {
            let task = &mut tasks[position];
            mark_completed(&mut next);
            self.storage.save_task(&next)?;
            *task = next;
            (self.emit)(task);
            if let Ok(root) = security::destination(&task.request.destination) {
                let _ = clean_work(&root, &task.id);
            }
            return Ok(());
        }
        if tasks.iter().filter(|t| !t.status.terminal()).count() >= 500 {
            return Err(AppError::new(
                "QUEUE_FULL",
                "La file contient déjà 500 tâches.",
            ));
        }
        if tasks.iter().any(|other| {
            !other.status.terminal()
                && task.request.destination == other.request.destination
                && output_profile(&task.request) == output_profile(&other.request)
                && task_identity(task) == task_identity(other)
        }) {
            return Err(AppError::new(
                "DUPLICATE",
                "Ce média est déjà dans la file avec ces réglages.",
            ));
        }
        let task = &mut tasks[position];
        next.status = Status::Queued;
        next.progress = 0.0;
        next.error = None;
        next.error_code = None;
        next.path = None;
        self.storage.save_task(&next)?;
        *task = next;
        (self.emit)(task);
        self.notify.notify_one();
        Ok(())
    }
    pub fn retry_failed(&self, ids: &[String]) -> Result<RetryReport> {
        if ids.len() > 500 {
            return Err(AppError::new(
                "INVALID_SETTINGS",
                "Sélectionnez au maximum 500 tâches à relancer.",
            ));
        }
        let mut tasks = self.tasks.lock().map_err(AppError::internal)?;
        let mut seen = std::collections::HashSet::new();
        let mut report = RetryReport::default();
        for id in ids.iter().filter(|id| seen.insert(*id)) {
            let eligible = tasks
                .iter()
                .any(|t| t.id == *id && matches!(t.status, Status::Failed | Status::Interrupted));
            if eligible && self.retry_locked(&mut tasks, id).is_ok() {
                report.restarted += 1;
            } else {
                report.skipped += 1;
            }
        }
        Ok(report)
    }
    pub fn profiles(&self) -> Result<Vec<Profile>> {
        self.storage.profiles()
    }
    pub fn save_profile(&self, mut profile: Profile) -> Result<Vec<Profile>> {
        profile.name = profile.name.trim().to_owned();
        if profile.name.is_empty()
            || profile.name.chars().count() > 60
            || profile.name.chars().any(char::is_control)
        {
            return Err(AppError::new(
                "INVALID_SETTINGS",
                "Donnez au profil un nom de 1 à 60 caractères.",
            ));
        }
        profile.output.clone().request(String::new()).validate()?;
        profile.output.destination = checked_destination(&profile.output.destination)?
            .display()
            .to_string();
        self.storage.save_profile(&profile)?;
        self.profiles()
    }
    pub fn remove_profile(&self, name: &str) -> Result<Vec<Profile>> {
        self.storage.remove_profile(name)?;
        self.profiles()
    }
    pub fn file_sizes(&self, ids: &[String]) -> Result<HashMap<String, Option<u64>>> {
        if ids.len() > 500 {
            return Err(AppError::new(
                "INVALID_SETTINGS",
                "Trop de fichiers à vérifier en une fois.",
            ));
        }
        let ids = ids.iter().collect::<std::collections::HashSet<_>>();
        Ok(self
            .tasks()?
            .into_iter()
            .filter(|t| t.status == Status::Completed && ids.contains(&t.id))
            .map(|t| {
                let size = existing_file(&t)
                    .and_then(|p| std::fs::metadata(p).ok())
                    .map(|m| m.len());
                (t.id, size)
            })
            .collect())
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
    /// Completed downloads of these links whose file is still on disk.
    pub fn existing(&self, urls: &[String]) -> Result<Vec<ExistingFile>> {
        if urls.len() > 5000 {
            return Err(AppError::new(
                "INVALID_SETTINGS",
                "Trop de liens à vérifier en une fois.",
            ));
        }
        // Stored links are normalised at enqueue; compare in the same form.
        let mut matches = HashMap::<String, Vec<&String>>::new();
        let keys = self.media_keys.lock().map_err(AppError::internal)?;
        for url in urls {
            if let Ok(normalized) = security::validate_url(url) {
                matches.entry(normalized.to_string()).or_default().push(url);
                if let Some(key) = keys
                    .get(normalized.as_str())
                    .cloned()
                    .or_else(|| youtube_key(normalized.as_str()))
                {
                    matches.entry(key).or_default().push(url);
                }
            }
        }
        drop(keys);
        let mut found = Vec::new();
        for task in self
            .tasks()?
            .into_iter()
            .filter(|t| t.status == Status::Completed)
        {
            let direct = matches.get(&task.request.url).into_iter().flatten();
            let key = task_media_key(&task);
            let aliases = key
                .as_ref()
                .and_then(|key| matches.get(key))
                .into_iter()
                .flatten();
            let requested_urls: std::collections::HashSet<_> = direct.chain(aliases).collect();
            if !requested_urls.is_empty() && existing_file(&task).is_some() {
                if let Some(path) = task.path {
                    found.extend(requested_urls.into_iter().map(|url| ExistingFile {
                        url: (*url).clone(),
                        path: path.clone(),
                        request: task.request.clone(),
                    }));
                }
            }
        }
        Ok(found)
    }
    pub fn duplicates(&self) -> Result<Vec<String>> {
        Ok(duplicate_ids(&self.tasks()?))
    }
    /// Removes duplicate entries. With `delete_files`, their files go to the
    /// Recycle Bin first; an entry whose file cannot be moved is kept.
    pub fn remove_duplicates(
        &self,
        delete_files: bool,
        recycle: impl Fn(&Path) -> Result<()>,
    ) -> Result<Cleanup> {
        let tasks = self.tasks()?;
        let mut report = Cleanup::default();
        for id in duplicate_ids(&tasks) {
            let file = tasks
                .iter()
                .find(|t| t.id == id && t.status == Status::Completed)
                .and_then(existing_file);
            if let (true, Some(path)) = (delete_files, file) {
                if recycle(&path).is_err() {
                    report.failed += 1;
                    continue;
                }
                report.recycled += 1;
            }
            match self.remove(&id) {
                Ok(()) => report.removed += 1,
                Err(_) => report.failed += 1,
            }
        }
        Ok(report)
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
                    let Some(task) = tasks
                        .iter_mut()
                        .find(|t| t.status == Status::Queued && !active.contains_key(&t.id))
                    else {
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
                            if let Err(e) = worker.execute(&task, &mut cancel).await {
                                let _ = worker.update(&task.id, |t| {
                                    t.status = if published_output(t) {
                                        Status::Interrupted
                                    } else {
                                        t.path = None;
                                        if e.code == "DOWNLOAD_CANCELLED" {
                                            Status::Cancelled
                                        } else {
                                            Status::Failed
                                        }
                                    };
                                    t.error = Some(e.message);
                                    t.error_code = Some(e.code);
                                    t.speed = None;
                                    t.eta = None;
                                });
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
    async fn execute(&self, task: &Task, cancel: &mut watch::Receiver<bool>) -> Result<()> {
        let root = checked_destination(&task.request.destination)?;
        self.tools.verified("ffprobe")?;
        let work = root.join(format!(".audioforge-{}", task.id));
        clean_work(&root, &task.id)?;
        std::fs::create_dir(&work)?;
        let result = async {
            let converted = if let Some(path) = &task.local_source {
                let input = security::local_file(Path::new(path), security::MEDIA_EXTENSIONS)?;
                self.update(&task.id, |t| t.status = Status::Processing)?;
                engine::convert_local(&self.tools, &input, &task.request, &work, cancel).await?
            } else {
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
                engine::convert(&self.tools, &downloaded, &task.request, &work, cancel).await?
            };
            let info = engine::validate_output(&self.tools, &converted, &task.request, cancel).await?;
            if *cancel.borrow() { return Err(cancelled()); }
            let root_now = security::destination(&task.request.destination)?;
            if root_now != root { return Err(AppError::new("INVALID_PATH", "La destination a changé pendant le traitement.")); }
            let converted = security::safe_child(&root, &converted)?;
            let ext = converted.extension().and_then(|s|s.to_str()).unwrap_or("bin");
            if !["mp3","m4a","opus","flac","wav","mp4","mkv","webm","ogg","aac","mov","mka"].contains(&ext) { return Err(AppError::new("FORMAT_UNAVAILABLE", "Le fichier final possède une extension non prise en charge.")); }
            let title = security::sanitize_name(&task.request.title);
            let final_path = root.join(format!("{} [{}].{}", title, &task.id[..8], ext));
            self.update(&task.id, |t| {
                t.path = Some(final_path.display().to_string());
                t.details.duration = info.duration.or(t.details.duration);
                if t.details.creator.is_none() { t.details.creator = info.creator; }
            })?;
            // Same-volume hard link is atomic and fails if the final file exists.
            std::fs::hard_link(&converted, &final_path).map_err(|_| AppError::new("FILE_ACCESS_DENIED", "Impossible d'enregistrer le fichier sans écrasement. Vérifiez le disque et choisissez de préférence un dossier NTFS."))?;
            self.update(&task.id, mark_completed)
        }.await;
        // Keep the staging link if publication may have succeeded but the
        // completed state could not be saved. Recovery checks file identity.
        let keep = result.is_err()
            && self
                .tasks
                .lock()
                .ok()
                .and_then(|tasks| tasks.iter().find(|t| t.id == task.id).map(published_output))
                .unwrap_or(true);
        if !keep {
            let _ = clean_work(&root, &task.id);
        }
        result
    }
}

fn mark_completed(task: &mut Task) {
    task.status = Status::Completed;
    task.progress = 100.0;
    task.speed = None;
    task.eta = None;
    task.error = None;
    task.error_code = None;
}

fn checked_destination(path: &str) -> Result<PathBuf> {
    security::destination(path).map_err(|_| AppError::new("FILE_ACCESS_DENIED", "Le dossier de destination est inaccessible. Vérifiez le dossier et ses droits d’écriture."))
}

fn checked_details(mut details: MediaDetails) -> MediaDetails {
    let clean = |text: String| {
        text.chars()
            .filter(|c| !c.is_control())
            .take(500)
            .collect::<String>()
    };
    details.creator = details
        .creator
        .map(clean)
        .filter(|text| !text.trim().is_empty());
    details.duration = details
        .duration
        .filter(|duration| duration.is_finite() && *duration >= 0.0);
    details.playlist = details
        .playlist
        .filter(|group| {
            !group.id.is_empty()
                && group.id.len() <= 4096
                && !group.id.chars().any(char::is_control)
        })
        .map(|mut group| {
            group.title = clean(group.title);
            if group.title.trim().is_empty() {
                group.title = "Playlist".into();
            }
            group
        });
    details
}

fn task_identity(task: &Task) -> String {
    if let Some(path) = &task.local_source {
        return path.clone();
    }
    task_media_key(task).unwrap_or_else(|| task.request.url.clone())
}

fn checked_work(root: &Path, id: &str) -> Result<Option<PathBuf>> {
    if uuid::Uuid::parse_str(id).is_err() {
        return Err(AppError::new(
            "INVALID_PATH",
            "Identifiant de dossier de travail non valide.",
        ));
    }
    let work = root.join(format!(".audioforge-{id}"));
    match std::fs::symlink_metadata(&work) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
        Ok(_) => {
            let canonical = security::destination(&work.to_string_lossy())?;
            if canonical != work || canonical.parent() != Some(root) {
                return Err(AppError::new(
                    "INVALID_PATH",
                    "Le dossier de travail ne se trouve plus dans la destination.",
                ));
            }
            Ok(Some(canonical))
        }
    }
}

fn clean_work(root: &Path, id: &str) -> Result<()> {
    if let Some(work) = checked_work(root, id)? {
        std::fs::remove_dir_all(work)?;
    }
    Ok(())
}

fn published_output(task: &Task) -> bool {
    let Some(path) = existing_file(task) else {
        return false;
    };
    let Ok(root) = security::destination(&task.request.destination) else {
        return false;
    };
    if path.parent() != Some(root.as_path())
        || task.path.as_deref().map(Path::new) != Some(path.as_path())
    {
        return false;
    }
    let Ok(Some(work)) = checked_work(&root, &task.id) else {
        return false;
    };
    let Some(ext) = path.extension().and_then(|ext| ext.to_str()) else {
        return false;
    };
    ["converted", "source"].iter().any(|stem| {
        let staged = work.join(format!("{stem}.{ext}"));
        security::safe_child(&work, &staged).is_ok_and(|canonical| canonical == staged)
            && same_file::is_same_file(&staged, &path).unwrap_or(false)
    })
}
fn missing() -> AppError {
    AppError::new(
        "TASK_NOT_FOUND",
        "Cette tâche ou son fichier n'existe plus.",
    )
}
/// The task's final file, only if it is still a file inside its destination.
fn existing_file(task: &Task) -> Option<PathBuf> {
    let root = security::destination(&task.request.destination).ok()?;
    let path = security::safe_child(&root, Path::new(task.path.as_deref()?)).ok()?;
    path.is_file().then_some(path)
}

fn youtube_key(source: &str) -> Option<String> {
    let url = security::validate_url(source).ok()?;
    let id = match url.host_str()? {
        "youtu.be" => url.path().strip_prefix('/')?.to_owned(),
        "youtube.com" | "www.youtube.com" | "m.youtube.com" => {
            if url.path() == "/watch" {
                url.query_pairs()
                    .find(|(key, _)| key == "v")?
                    .1
                    .into_owned()
            } else {
                let (kind, id) = url.path().strip_prefix('/')?.split_once('/')?;
                if !["shorts", "live", "embed"].contains(&kind) {
                    return None;
                }
                id.to_owned()
            }
        }
        _ => return None,
    };
    (id.len() == 11
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_-".contains(&c)))
    .then(|| format!("youtube:{id}"))
}

fn task_media_key(task: &Task) -> Option<String> {
    task.media_key
        .clone()
        .or_else(|| youtube_key(&task.request.url))
}

fn output_profile(request: &DownloadRequest) -> (&str, &str, u32, u16) {
    let (_, kind, format, quality, bitrate) = request.output_key();
    (kind, format, quality, bitrate)
}
/// Finished entries repeating the same media, format and folder. Each group
/// keeps its most recent completed entry whose file still exists (otherwise
/// its most recent entry), so the last copy on disk is never a duplicate.
fn duplicate_ids(tasks: &[Task]) -> Vec<String> {
    let mut groups: HashMap<_, Vec<&Task>> = HashMap::new();
    for t in tasks.iter().filter(|t| t.status.terminal()) {
        groups
            .entry((
                task_identity(t),
                output_profile(&t.request),
                t.request.destination.as_str(),
            ))
            .or_default()
            .push(t);
    }
    let mut ids: Vec<String> = groups
        .into_values()
        .filter(|group| group.len() > 1)
        .flat_map(|mut group| {
            group.sort_by_cached_key(|t| {
                let completed = t.status == Status::Completed;
                Reverse((
                    completed && existing_file(t).is_some(),
                    completed,
                    t.created_at,
                ))
            });
            group.into_iter().skip(1).map(|t| t.id.clone())
        })
        .collect();
    ids.sort();
    ids
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture {
        _dir: tempfile::TempDir,
        root: PathBuf,
        queue: Arc<Queue>,
    }
    fn request(url: &str, format: &str, root: &Path) -> DownloadRequest {
        DownloadRequest {
            url: url.into(),
            title: "Titre".into(),
            kind: "audio".into(),
            format: format.into(),
            quality: 0,
            bitrate: 192,
            destination: root.display().to_string(),
            metadata: true,
        }
    }
    /// `(id, url, format, status, file on disk, created_at)`; completed
    /// tasks get a final path, created only when `file on disk` is true.
    fn fixture(tasks: &[(&str, &str, &str, Status, bool, i64)]) -> Fixture {
        let dir = tempfile::tempdir().unwrap();
        let music = dir.path().join("Musique");
        std::fs::create_dir(&music).unwrap();
        let root = security::destination(&music.display().to_string()).unwrap();
        let storage = Storage::open(&dir.path().join("audioforge.sqlite")).unwrap();
        for &(id, url, format, status, file, created_at) in tasks {
            let path = root.join(format!("Titre [{id}].{format}"));
            if file {
                std::fs::write(&path, id).unwrap();
            }
            storage
                .save_task(&Task {
                    id: id.into(),
                    request: request(url, format, &root),
                    status,
                    progress: 0.0,
                    speed: None,
                    eta: None,
                    path: (status == Status::Completed).then(|| path.display().to_string()),
                    error: None,
                    created_at,
                    media_key: None,
                    details: Default::default(),
                    local_source: None,
                    error_code: None,
                })
                .unwrap();
        }
        let settings = Settings {
            destination: root.display().to_string(),
            audio_format: "mp3".into(),
            video_format: "mp4".into(),
            mp3_bitrate: 192,
            concurrency: 2,
            metadata: true,
        };
        let queue = Queue::new(
            storage,
            Tools::load(dir.path().join("tools")),
            settings,
            |_| {},
        )
        .unwrap();
        Fixture {
            _dir: dir,
            root,
            queue,
        }
    }
    fn code(result: Result<Task>) -> String {
        result.map(|_| String::new()).unwrap_or_else(|e| e.code)
    }

    #[test]
    fn batch_retry_respects_state_and_does_not_enqueue_the_same_output_twice() {
        let f = fixture(&[
            ("a", "https://vimeo.com/1", "mp3", Status::Failed, false, 1),
            (
                "b",
                "https://vimeo.com/1",
                "mp3",
                Status::Interrupted,
                false,
                2,
            ),
            (
                "c",
                "https://vimeo.com/2",
                "mp3",
                Status::Completed,
                true,
                3,
            ),
        ]);
        let result = f
            .queue
            .retry_failed(&["a".into(), "b".into(), "c".into(), "a".into()])
            .unwrap();
        assert_eq!((result.restarted, result.skipped), (1, 2));
        let tasks = f.queue.tasks().unwrap();
        assert_eq!(tasks[0].status, Status::Queued);
        assert_eq!(tasks[1].status, Status::Interrupted);
        assert!(f.queue.file_sizes(&["c".into()]).unwrap()["c"].is_some());
        std::fs::remove_file(tasks[2].path.as_deref().unwrap()).unwrap();
        assert_eq!(f.queue.file_sizes(&["c".into()]).unwrap()["c"], None);
    }

    #[test]
    fn profiles_survive_reopening_and_keep_their_output_settings() {
        let f = fixture(&[]);
        let output = OutputOptions {
            kind: "audio".into(),
            format: "flac".into(),
            quality: 0,
            bitrate: 192,
            destination: f.root.display().to_string(),
            metadata: false,
        };
        f.queue
            .save_profile(Profile {
                name: "  Écoute  ".into(),
                output,
            })
            .unwrap();
        let database = f._dir.path().join("audioforge.sqlite");
        let stored = Storage::open(&database).unwrap().profiles().unwrap();
        assert_eq!(stored[0].name, "Écoute");
        assert_eq!(stored[0].output.format, "flac");
        assert!(!stored[0].output.metadata);
        assert!(f.queue.remove_profile("écoute").unwrap().is_empty());
    }

    #[test]
    fn restart_recovers_only_a_published_hard_link() {
        let f = fixture(&[]);
        let mut task = f
            .queue
            .enqueue(request("https://vimeo.com/1", "mp3", &f.root), false)
            .unwrap();
        let work = f.root.join(format!(".audioforge-{}", task.id));
        std::fs::create_dir(&work).unwrap();
        let staged = work.join("converted.mp3");
        std::fs::write(&staged, b"staged output").unwrap();
        let final_path = f.root.join("final.mp3");
        task.path = Some(final_path.display().to_string());
        task.status = Status::Processing;
        f.queue.storage.save_task(&task).unwrap();
        std::fs::write(&final_path, b"unrelated file").unwrap();
        assert!(!published_output(&task));
        std::fs::remove_file(&final_path).unwrap();
        std::fs::hard_link(&staged, &final_path).unwrap();
        let settings = f.queue.settings().unwrap();
        let directory = f._dir;
        drop(f.queue);
        let storage = Storage::open(&directory.path().join("audioforge.sqlite")).unwrap();
        let restarted = Queue::new(
            storage,
            Tools::load(directory.path().join("tools")),
            settings,
            |_| {},
        )
        .unwrap();
        let task = &restarted.tasks().unwrap()[0];
        assert_eq!(task.status, Status::Completed);
        assert_eq!(task.progress, 100.0);
        assert!(!work.exists());
        assert_eq!(std::fs::read(final_path).unwrap(), b"staged output");
    }

    #[test]
    fn recognizes_extractor_identity_and_legacy_youtube_links() {
        let legacy = "https://www.youtube.com/watch?v=ExampleId01";
        let alias = "https://youtu.be/ExampleId01?si=tracking";
        let f = fixture(&[("legacy", legacy, "mp3", Status::Completed, true, 1)]);
        assert_eq!(f.queue.existing(&[alias.into()]).unwrap()[0].url, alias);
        assert_eq!(
            code(f.queue.enqueue(request(alias, "mp3", &f.root), false)),
            "ALREADY_DOWNLOADED"
        );
        assert!(f
            .queue
            .enqueue(request(alias, "flac", &f.root), false)
            .is_ok());

        let first = "https://vimeo.com/12";
        let second = "https://vimeo.com/12?ref=alias";
        for url in [first, second] {
            let media = engine::parse_media(r#"{"id":"12","extractor_key":"Vimeo"}"#, url).unwrap();
            f.queue.remember_analysis(&media).unwrap();
        }
        assert_eq!(
            f.queue
                .enqueue(request(first, "mp3", &f.root), false)
                .unwrap()
                .media_key
                .as_deref(),
            Some("vimeo:12")
        );
        assert_eq!(
            code(f.queue.enqueue(request(second, "mp3", &f.root), false)),
            "DUPLICATE"
        );
    }
    #[test]
    fn enqueue_warns_only_while_the_same_file_exists() {
        let f = fixture(&[
            (
                "kept",
                "https://vimeo.com/1",
                "mp3",
                Status::Completed,
                true,
                1,
            ),
            (
                "gone",
                "https://vimeo.com/2",
                "mp3",
                Status::Completed,
                false,
                2,
            ),
        ]);
        let q = &f.queue;
        let same = request("https://vimeo.com/1", "mp3", &f.root);
        assert_eq!(code(q.enqueue(same.clone(), false)), "ALREADY_DOWNLOADED");
        let unused_quality = DownloadRequest {
            quality: 720,
            ..same.clone()
        };
        assert_eq!(code(q.enqueue(unused_quality, false)), "ALREADY_DOWNLOADED");
        assert_eq!(
            code(q.enqueue(request("https://vimeo.com/1", "flac", &f.root), false)),
            ""
        );
        assert_eq!(code(q.enqueue(same.clone(), true)), "");
        assert_eq!(code(q.enqueue(same, true)), "DUPLICATE");
        assert_eq!(
            code(q.enqueue(request("https://vimeo.com/2", "mp3", &f.root), false)),
            ""
        );

        let found = q
            .existing(&["https://vimeo.com/1".into(), "https://vimeo.com/2".into()])
            .unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].url, "https://vimeo.com/1");
        assert!(found[0].path.ends_with("Titre [kept].mp3"));
    }

    #[test]
    fn duplicates_keep_the_last_copy_and_recycle_the_others() {
        let f = fixture(&[
            (
                "a-old",
                "https://vimeo.com/1",
                "mp3",
                Status::Completed,
                true,
                1,
            ),
            (
                "a-failed",
                "https://vimeo.com/1",
                "mp3",
                Status::Failed,
                false,
                2,
            ),
            (
                "a-new",
                "https://vimeo.com/1",
                "mp3",
                Status::Completed,
                false,
                3,
            ),
            (
                "a-flac",
                "https://vimeo.com/1",
                "flac",
                Status::Completed,
                true,
                4,
            ),
            (
                "b-old",
                "https://vimeo.com/2",
                "mp3",
                Status::Completed,
                true,
                5,
            ),
            (
                "b-new",
                "https://vimeo.com/2",
                "mp3",
                Status::Completed,
                true,
                6,
            ),
            (
                "c-queued",
                "https://vimeo.com/3",
                "mp3",
                Status::Queued,
                false,
                7,
            ),
            (
                "c-done",
                "https://vimeo.com/3",
                "mp3",
                Status::Completed,
                true,
                8,
            ),
        ]);
        let q = &f.queue;
        assert_eq!(q.duplicates().unwrap(), ["a-failed", "a-new", "b-old"]);

        let recycled = Mutex::new(Vec::new());
        let report = q
            .remove_duplicates(true, |path| {
                std::fs::remove_file(path)?;
                recycled.lock().unwrap().push(path.to_owned());
                Ok(())
            })
            .unwrap();
        assert_eq!(
            report,
            Cleanup {
                removed: 3,
                recycled: 1,
                failed: 0
            }
        );
        let recycled = recycled.into_inner().unwrap();
        assert_eq!(recycled.len(), 1);
        assert!(recycled[0].ends_with("Titre [b-old].mp3"));
        for kept in ["a-old", "b-new", "a-flac", "c-done"] {
            let extension = if kept == "a-flac" { "flac" } else { "mp3" };
            assert!(f.root.join(format!("Titre [{kept}].{extension}")).is_file());
        }
        let mut left: Vec<String> = q.tasks().unwrap().into_iter().map(|t| t.id).collect();
        left.sort();
        assert_eq!(left, ["a-flac", "a-old", "b-new", "c-done", "c-queued"]);
        assert!(q.duplicates().unwrap().is_empty());
    }

    #[test]
    fn a_file_that_cannot_be_recycled_keeps_its_entry() {
        let f = fixture(&[
            (
                "old",
                "https://vimeo.com/1",
                "mp3",
                Status::Completed,
                true,
                1,
            ),
            (
                "new",
                "https://vimeo.com/1",
                "mp3",
                Status::Completed,
                true,
                2,
            ),
        ]);
        let report = f
            .queue
            .remove_duplicates(true, |_| Err(AppError::new("RECYCLE_FAILED", "refus")))
            .unwrap();
        assert_eq!(report.failed, 1);
        assert_eq!(report.removed, 0);
        assert_eq!(f.queue.tasks().unwrap().len(), 2);
        assert!(f.root.join("Titre [old].mp3").is_file());

        let report = f
            .queue
            .remove_duplicates(false, |_| unreachable!())
            .unwrap();
        assert_eq!((report.removed, report.recycled), (1, 0));
        assert!(f.root.join("Titre [old].mp3").is_file());
    }

    /// Manual check of the real shell call, run with
    /// `cargo test --lib real_recycle_bin -- --ignored --nocapture`.
    #[cfg(windows)]
    #[test]
    #[ignore = "place un petit fichier temporaire dans la corbeille Windows"]
    fn real_recycle_bin_receives_a_duplicate() {
        let f = fixture(&[
            (
                "old",
                "https://vimeo.com/1",
                "mp3",
                Status::Completed,
                true,
                1,
            ),
            (
                "new",
                "https://vimeo.com/1",
                "mp3",
                Status::Completed,
                true,
                2,
            ),
        ]);
        let old = f.root.join("Titre [old].mp3");
        assert!(old.to_str().unwrap().starts_with(r"\\?\"));
        println!("corbeille : {}", crate::recycle::shell_path(&old).unwrap());

        let report = f
            .queue
            .remove_duplicates(true, crate::recycle::recycle)
            .unwrap();
        assert_eq!(
            report,
            Cleanup {
                removed: 1,
                recycled: 1,
                failed: 0
            }
        );
        assert!(!old.exists());
        assert!(f.root.join("Titre [new].mp3").is_file());
        let left: Vec<String> = f.queue.tasks().unwrap().into_iter().map(|t| t.id).collect();
        assert_eq!(left, ["new"]);
    }
}

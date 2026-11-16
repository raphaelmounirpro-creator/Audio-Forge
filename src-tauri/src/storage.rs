use crate::{
    domain::{Settings, Status, Task},
    error::{AppError, Result},
};
use rusqlite::{params, Connection, OptionalExtension};
use std::{path::Path, sync::Mutex};

pub struct Storage(Mutex<Connection>);
impl Storage {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        conn.execute_batch(include_str!("../migrations/001_initial.sql"))?;
        let store = Self(Mutex::new(conn));
        for mut task in store.tasks()? {
            if !task.status.terminal() && task.status != Status::Queued {
                task.status = Status::Interrupted;
                task.error =
                    Some("L'application s'est arrêtée avant la fin. Vous pouvez réessayer.".into());
                store.save_task(&task)?;
            }
        }
        Ok(store)
    }
    pub fn tasks(&self) -> Result<Vec<Task>> {
        let conn = self.0.lock().map_err(AppError::internal)?;
        let mut statement =
            conn.prepare("SELECT payload FROM downloads ORDER BY created_at ASC, rowid ASC")?;
        let rows = statement.query_map([], |r| r.get::<_, String>(0))?;
        let mut tasks = Vec::new();
        for row in rows {
            tasks.push(serde_json::from_str(&row?)?);
        }
        Ok(tasks)
    }
    pub fn save_task(&self, task: &Task) -> Result<()> {
        let key = format!(
            "{}:{}:{}:{}",
            task.request.kind, task.request.format, task.request.quality, task.request.bitrate
        );
        self.0.lock().map_err(AppError::internal)?.execute(
            "INSERT INTO downloads(id,source_url,output_key,payload,created_at) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
            params![task.id, task.request.url, key, serde_json::to_string(task)?, task.created_at])?;
        Ok(())
    }
    pub fn remove(&self, id: &str) -> Result<()> {
        self.0
            .lock()
            .map_err(AppError::internal)?
            .execute("DELETE FROM downloads WHERE id=?1", [id])?;
        Ok(())
    }
    pub fn settings(&self, default: Settings) -> Result<Settings> {
        let value: Option<String> = self
            .0
            .lock()
            .map_err(AppError::internal)?
            .query_row("SELECT payload FROM settings WHERE id=1", [], |r| r.get(0))
            .optional()?;
        match value {
            Some(v) => Ok(serde_json::from_str(&v)?),
            None => Ok(default),
        }
    }
    pub fn save_settings(&self, settings: &Settings) -> Result<()> {
        settings.validate()?;
        self.0.lock().map_err(AppError::internal)?.execute("INSERT INTO settings(id,payload) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload", [serde_json::to_string(settings)?])?;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::DownloadRequest;
    #[test]
    fn restart_marks_active_interrupted_and_retains_data() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("history.db");
        let task = Task {
            id: "one".into(),
            request: DownloadRequest {
                url: "https://vimeo.com/1".into(),
                title: "Titre é".into(),
                kind: "audio".into(),
                format: "mp3".into(),
                quality: 0,
                bitrate: 192,
                destination: dir.path().display().to_string(),
                metadata: true,
            },
            status: Status::Downloading,
            progress: 20.0,
            speed: None,
            eta: None,
            path: None,
            error: None,
            created_at: 1,
        };
        {
            let store = Storage::open(&path).unwrap();
            store.save_task(&task).unwrap();
        }
        let store = Storage::open(&path).unwrap();
        let tasks = store.tasks().unwrap();
        assert_eq!(tasks[0].status, Status::Interrupted);
        assert_eq!(tasks[0].request.title, "Titre é");
        store.remove("one' OR 1=1 --").unwrap();
        assert_eq!(store.tasks().unwrap().len(), 1);
        store.remove("one").unwrap();
        assert!(store.tasks().unwrap().is_empty());
    }
}

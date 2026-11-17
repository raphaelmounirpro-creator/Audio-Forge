use crate::{
    domain::ToolInfo,
    error::{AppError, Result},
};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    io::Read,
    path::{Path, PathBuf},
};

/// Expected digests, compiled into the program: never read from a writable folder.
const TOOL_LOCK: &str = include_str!("../binaries/tool-lock.json");
pub const NAMES: [&str; 4] = ["yt-dlp", "ffmpeg", "ffprobe", "deno"];

#[derive(Debug, Clone, Deserialize)]
pub struct ToolRecord {
    pub version: String,
    pub sha256: String,
}
#[derive(Debug, Clone)]
pub struct Tools {
    root: PathBuf,
    records: HashMap<String, ToolRecord>,
}
impl Tools {
    /// Components stored in `root`, checked against the embedded lock.
    pub fn load(root: PathBuf) -> Self {
        let records = serde_json::from_str(TOOL_LOCK).expect("tool-lock.json intégré valide");
        Self::with_records(root, records)
    }
    pub fn with_records(root: PathBuf, records: HashMap<String, ToolRecord>) -> Self {
        Self { root, records }
    }
    pub fn root(&self) -> &Path {
        &self.root
    }
    pub fn record(&self, name: &str) -> Option<&ToolRecord> {
        self.records.get(name)
    }
    pub fn verified(&self, name: &str) -> Result<PathBuf> {
        let record = self.records.get(name).ok_or_else(|| missing(name))?;
        if !NAMES.contains(&name) {
            return Err(missing(name));
        }
        let path = self.root.join(format!("{name}.exe"));
        if !Path::new(&path).is_file() {
            return Err(missing(name));
        }
        if sha256_file(&path)? != record.sha256 {
            return Err(AppError::new(
                "TOOL_CORRUPTED",
                format!("{name} a été modifié. Téléchargez à nouveau les composants vérifiés."),
            ));
        }
        Ok(path)
    }
    pub fn status(&self) -> Vec<ToolInfo> {
        NAMES
            .iter()
            .map(|name| {
                let result = self.verified(name);
                ToolInfo {
                    name: name.to_string(),
                    version: self
                        .records
                        .get(*name)
                        .map(|r| r.version.clone())
                        .unwrap_or_else(|| "Absent".into()),
                    ready: result.is_ok(),
                    detail: result
                        .err()
                        .map(|e| e.message)
                        .unwrap_or_else(|| "Intégrité SHA-256 vérifiée".into()),
                }
            })
            .collect()
    }
}

pub fn sha256_file(path: &Path) -> Result<String> {
    let mut file = std::fs::File::open(path)?;
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn missing(name: &str) -> AppError {
    AppError::new(
        "TOOL_MISSING",
        format!(
            "Le composant {name} n'est pas installé. Téléchargez les composants depuis l'accueil ou les paramètres."
        ),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn embedded_lock_covers_every_component() {
        let tools = Tools::load(PathBuf::from("absent"));
        for name in NAMES {
            let record = tools.record(name).expect("composant verrouillé");
            assert_eq!(record.sha256.len(), 64);
        }
    }
    #[test]
    fn rejects_missing_and_tampered_binary() {
        let dir = tempfile::tempdir().unwrap();
        let records = HashMap::from([(
            "ffmpeg".to_string(),
            ToolRecord {
                version: "test".into(),
                sha256: "invalid".into(),
            },
        )]);
        let tools = Tools::with_records(dir.path().to_owned(), records);
        assert!(tools.verified("yt-dlp").is_err());
        std::fs::write(dir.path().join("ffmpeg.exe"), b"tampered").unwrap();
        assert_eq!(tools.verified("ffmpeg").unwrap_err().code, "TOOL_CORRUPTED");
    }
}

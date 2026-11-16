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
    pub fn load(root: PathBuf) -> Self {
        let records = std::fs::read(root.join("tool-lock.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        Self { root, records }
    }
    pub fn verified(&self, name: &str) -> Result<PathBuf> {
        let record = self.records.get(name).ok_or_else(|| missing(name))?;
        if !["yt-dlp", "ffmpeg", "ffprobe", "deno"].contains(&name) {
            return Err(missing(name));
        }
        let path = self.root.join(format!("{name}.exe"));
        if !Path::new(&path).is_file() {
            return Err(missing(name));
        }
        let mut file = std::fs::File::open(&path)?;
        let mut digest = Sha256::new();
        let mut buffer = [0u8; 65536];
        loop {
            let count = file.read(&mut buffer)?;
            if count == 0 {
                break;
            }
            digest.update(&buffer[..count]);
        }
        let hash = format!("{:x}", digest.finalize());
        if hash != record.sha256 {
            return Err(AppError::new(
                "TOOL_CORRUPTED",
                format!("{name} a été modifié. Récupérez à nouveau les composants vérifiés."),
            ));
        }
        Ok(path)
    }
    pub fn status(&self) -> Vec<ToolInfo> {
        ["yt-dlp", "ffmpeg", "ffprobe", "deno"]
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
fn missing(name: &str) -> AppError {
    AppError::new(
        "TOOL_MISSING",
        format!(
            "Le composant {name} manque. Consultez les instructions d'installation dans le README."
        ),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_missing_and_tampered_binary() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("tool-lock.json"),
            r#"{"ffmpeg":{"version":"test","sha256":"invalid"}}"#,
        )
        .unwrap();
        let tools = Tools::load(dir.path().to_owned());
        assert!(tools.verified("yt-dlp").is_err());
        std::fs::write(dir.path().join("ffmpeg.exe"), b"tampered").unwrap();
        assert_eq!(tools.verified("ffmpeg").unwrap_err().code, "TOOL_CORRUPTED");
    }
}

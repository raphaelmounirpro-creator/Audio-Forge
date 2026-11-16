use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Queued,
    Analyzing,
    Downloading,
    Processing,
    Completed,
    Failed,
    Cancelled,
    Interrupted,
}
impl Status {
    pub fn terminal(self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Failed | Self::Cancelled | Self::Interrupted
        )
    }
    pub fn can_transition(self, next: Self) -> bool {
        matches!(
            (self, next),
            (Self::Queued, Self::Analyzing | Self::Cancelled)
                | (
                    Self::Analyzing,
                    Self::Downloading | Self::Failed | Self::Cancelled | Self::Interrupted
                )
                | (
                    Self::Downloading,
                    Self::Processing | Self::Failed | Self::Cancelled | Self::Interrupted
                )
                | (
                    Self::Processing,
                    Self::Completed | Self::Failed | Self::Cancelled | Self::Interrupted
                )
                | (
                    Self::Failed | Self::Cancelled | Self::Interrupted,
                    Self::Queued
                )
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub destination: String,
    pub audio_format: String,
    pub video_format: String,
    pub mp3_bitrate: u16,
    pub concurrency: usize,
    pub metadata: bool,
}
impl Settings {
    pub fn validate(&self) -> Result<()> {
        if !(1..=5).contains(&self.concurrency)
            || ![128, 192, 256, 320].contains(&self.mp3_bitrate)
            || !["original", "mp3", "m4a", "opus", "flac", "wav"]
                .contains(&self.audio_format.as_str())
            || !["original", "mp4", "mkv", "webm"].contains(&self.video_format.as_str())
        {
            return Err(AppError::new(
                "INVALID_SETTINGS",
                "Choisissez des paramètres valides.",
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadRequest {
    pub url: String,
    pub title: String,
    pub kind: String,
    pub format: String,
    pub quality: u32,
    pub bitrate: u16,
    pub destination: String,
    pub metadata: bool,
}
impl DownloadRequest {
    pub fn validate(&self) -> Result<()> {
        let valid_format = match self.kind.as_str() {
            "audio" => {
                ["original", "mp3", "m4a", "opus", "flac", "wav"].contains(&self.format.as_str())
            }
            "video" => ["original", "mp4", "mkv", "webm"].contains(&self.format.as_str()),
            _ => false,
        };
        if !valid_format
            || ![0, 360, 480, 720, 1080, 1440, 2160].contains(&self.quality)
            || ![128, 192, 256, 320].contains(&self.bitrate)
        {
            return Err(AppError::new(
                "INVALID_SETTINGS",
                "Le format ou la qualité n'est pas valide.",
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub request: DownloadRequest,
    pub status: Status,
    pub progress: f64,
    pub speed: Option<f64>,
    pub eta: Option<f64>,
    pub path: Option<String>,
    pub error: Option<String>,
    pub created_at: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Media {
    pub id: String,
    pub url: String,
    pub title: String,
    pub creator: Option<String>,
    pub duration: Option<f64>,
    pub formats: Vec<MediaFormat>,
    pub entries: Vec<PlaylistEntry>,
    pub is_playlist: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaFormat {
    pub id: String,
    pub ext: String,
    pub height: Option<u32>,
    pub audio: bool,
    pub video: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistEntry {
    pub id: String,
    pub url: String,
    pub title: String,
    pub duration: Option<f64>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInfo {
    pub name: String,
    pub version: String,
    pub ready: bool,
    pub detail: String,
}
pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn state_machine_rejects_shortcuts() {
        assert!(Status::Queued.can_transition(Status::Analyzing));
        assert!(!Status::Queued.can_transition(Status::Completed));
        assert!(!Status::Completed.can_transition(Status::Queued));
        assert!(Status::Interrupted.can_transition(Status::Queued));
        assert!(!Status::Downloading.terminal());
    }
    #[test]
    fn invalid_concurrency_rejected() {
        let s = Settings {
            destination: "C:/Downloads".into(),
            audio_format: "mp3".into(),
            video_format: "mp4".into(),
            mp3_bitrate: 320,
            concurrency: 6,
            metadata: true,
        };
        assert!(s.validate().is_err());
    }
}

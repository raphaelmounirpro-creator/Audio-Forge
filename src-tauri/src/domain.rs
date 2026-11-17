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
                    Self::Downloading
                        | Self::Processing
                        | Self::Failed
                        | Self::Cancelled
                        | Self::Interrupted
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
    /// Identifies the produced file; options the engine ignores (quality for
    /// audio, bitrate outside MP3) do not distinguish two requests.
    pub fn output_key(&self) -> (&str, &str, &str, u32, u16) {
        (
            &self.url,
            &self.kind,
            &self.format,
            if self.kind == "video" {
                self.quality
            } else {
                0
            },
            if self.format == "mp3" {
                self.bitrate
            } else {
                0
            },
        )
    }
    pub fn same_output(&self, other: &Self) -> bool {
        self.output_key() == other.output_key()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputOptions {
    pub kind: String,
    pub format: String,
    pub quality: u32,
    pub bitrate: u16,
    pub destination: String,
    pub metadata: bool,
}
impl OutputOptions {
    pub fn request(self, title: String) -> DownloadRequest {
        DownloadRequest {
            url: String::new(),
            title,
            kind: self.kind,
            format: self.format,
            quality: self.quality,
            bitrate: self.bitrate,
            destination: self.destination,
            metadata: self.metadata,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub name: String,
    pub output: OutputOptions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistGroup {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct MediaDetails {
    pub creator: Option<String>,
    pub duration: Option<f64>,
    pub playlist: Option<PlaylistGroup>,
}

#[derive(Debug, Default, Serialize)]
pub struct RetryReport {
    pub restarted: usize,
    pub skipped: usize,
}

/// A completed download of an analysed link whose file is still on disk.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExistingFile {
    /// Link exactly as sent by the interface.
    pub url: String,
    pub request: DownloadRequest,
    pub path: String,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Cleanup {
    pub removed: usize,
    pub recycled: usize,
    pub failed: usize,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media_key: Option<String>,
    #[serde(default)]
    pub details: MediaDetails,
    #[serde(default)]
    pub local_source: Option<String>,
    #[serde(default)]
    pub error_code: Option<String>,
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
    pub media_key: Option<String>,
    pub next_start: Option<u32>,
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
    pub creator: Option<String>,
    pub media_key: Option<String>,
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
    #[test]
    fn same_output_ignores_unused_options() {
        let mp3 = DownloadRequest {
            url: "https://vimeo.com/1".into(),
            title: "A".into(),
            kind: "audio".into(),
            format: "mp3".into(),
            quality: 0,
            bitrate: 192,
            destination: "C:/A".into(),
            metadata: true,
        };
        let other_folder = DownloadRequest {
            quality: 720,
            title: "B".into(),
            destination: "C:/B".into(),
            ..mp3.clone()
        };
        assert!(mp3.same_output(&other_folder));
        assert!(!mp3.same_output(&DownloadRequest {
            bitrate: 320,
            ..mp3.clone()
        }));
        let flac = DownloadRequest {
            format: "flac".into(),
            ..mp3.clone()
        };
        assert!(flac.same_output(&DownloadRequest {
            bitrate: 320,
            ..flac.clone()
        }));
        assert!(!flac.same_output(&mp3));
        let video = DownloadRequest {
            kind: "video".into(),
            format: "mp4".into(),
            ..mp3.clone()
        };
        assert!(!video.same_output(&DownloadRequest {
            quality: 1080,
            ..video.clone()
        }));
    }
}

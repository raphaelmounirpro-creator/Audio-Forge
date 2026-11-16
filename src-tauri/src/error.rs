use serde::Serialize;

#[derive(Debug, Clone, Serialize, thiserror::Error)]
#[error("{message}")]
pub struct AppError {
    pub code: String,
    pub message: String,
}
pub type Result<T> = std::result::Result<T, AppError>;
impl AppError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
    pub fn internal(_: impl std::fmt::Display) -> Self {
        Self::new(
            "INTERNAL_ERROR",
            "L'opération a échoué. Vérifiez les droits d'accès et l'espace disque.",
        )
    }
}
impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self::internal(e)
    }
}
impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        Self::internal(e)
    }
}
impl From<serde_json::Error> for AppError {
    fn from(_: serde_json::Error) -> Self {
        Self::new(
            "INVALID_ENGINE_OUTPUT",
            "Le moteur a renvoyé une réponse illisible.",
        )
    }
}

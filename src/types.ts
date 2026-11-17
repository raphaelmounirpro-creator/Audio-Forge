export type Status =
  | "queued"
  | "analyzing"
  | "downloading"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";
export type Page = "home" | "downloads" | "history" | "settings" | "about";
export interface Settings {
  destination: string;
  audioFormat: string;
  videoFormat: string;
  mp3Bitrate: number;
  concurrency: number;
  metadata: boolean;
}
export interface DownloadRequest {
  url: string;
  title: string;
  kind: "audio" | "video";
  format: string;
  quality: number;
  bitrate: number;
  destination: string;
  metadata: boolean;
}
export type OutputOptions = Omit<DownloadRequest, "url" | "title">;
export interface Profile {
  name: string;
  output: OutputOptions;
}
export interface MediaDetails {
  creator?: string | null;
  duration?: number | null;
  playlist?: { id: string; title: string };
}
export interface Task {
  id: string;
  request: DownloadRequest;
  status: Status;
  progress: number;
  speed: number | null;
  eta: number | null;
  path: string | null;
  error: string | null;
  createdAt: number;
  details?: MediaDetails;
  localSource?: string | null;
  errorCode?: string | null;
}
/** Completed download of an analysed link whose file is still on disk. */
export interface ExistingFile {
  url: string;
  request: DownloadRequest;
  path: string;
}
export interface Cleanup {
  removed: number;
  recycled: number;
  failed: number;
}
export interface MediaFormat {
  id: string;
  ext: string;
  height: number | null;
  audio: boolean;
  video: boolean;
}
export interface PlaylistEntry {
  id: string;
  url: string;
  title: string;
  duration: number | null;
  creator?: string | null;
  mediaKey?: string | null;
}
export interface Media {
  id: string;
  url: string;
  title: string;
  creator: string | null;
  duration: number | null;
  formats: MediaFormat[];
  entries: PlaylistEntry[];
  isPlaylist: boolean;
  mediaKey?: string | null;
  nextStart?: number | null;
}
export interface ToolInfo {
  name: string;
  version: string;
  ready: boolean;
  detail: string;
}
/** A component archive pinned in the program (sources.lock.json). */
export interface ToolSource {
  repository: string;
  version: string;
  url: string;
  sha256: string;
  size: number;
  license: string;
  files: string[];
}
export interface ToolProgress {
  repository: string;
  stage: "download" | "verify" | "extract" | "ready";
  received: number;
  total: number;
}

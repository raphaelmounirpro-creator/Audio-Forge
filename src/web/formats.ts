/** Conversion options and FFmpeg arguments for the browser version. */
export type Kind = "audio" | "video";
export type AudioFormat = "mp3" | "m4a" | "opus" | "flac" | "wav";
export type VideoFormat = "mp4" | "mkv" | "webm";

export interface ConversionOptions {
  kind: Kind;
  format: AudioFormat | VideoFormat;
  /** Audio bitrate in kb/s (MP3, M4A, Opus). */
  bitrate: number;
  /** Re-encode the video instead of copying the streams. */
  reencode: boolean;
  /** Maximum height when re-encoding, 0 to keep the source size. */
  height: number;
  /** Title written to the metadata, empty to skip. */
  title: string;
}

export const audioFormats: [AudioFormat, string][] = [
  ["mp3", "MP3"],
  ["m4a", "M4A / AAC"],
  ["opus", "Opus"],
  ["flac", "FLAC"],
  ["wav", "WAV"],
];
export const videoFormats: [VideoFormat, string][] = [
  ["mp4", "MP4"],
  ["mkv", "MKV"],
  ["webm", "WebM"],
];
export const bitrates = [128, 192, 256, 320];
export const heights = [360, 480, 720, 1080];
/** WebAssembly memory is limited: larger files fail to load in FFmpeg. */
export const MAX_BYTES = 1024 * 1024 * 1024;

export const lossless = (format: string) =>
  format === "flac" || format === "wav";

const audioCodec: Record<AudioFormat, string[]> = {
  mp3: ["-c:a", "libmp3lame"],
  m4a: ["-c:a", "aac"],
  opus: ["-c:a", "libopus"],
  flac: ["-c:a", "flac"],
  wav: ["-c:a", "pcm_s16le"],
};

/** Extension of a file name, lower case, without the dot. */
export function extension(name: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(name);
  return match ? match[1].toLowerCase() : "bin";
}

/** Name proposed for the converted file. */
export function outputName(source: string, format: string): string {
  const base =
    source
      .replace(/\.[^./\\]{1,8}$/, "")
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "audioforge";
  return `${base}.${format}`;
}

/** FFmpeg arguments, for files already written as `input` and `output`. */
export function ffmpegArgs(
  input: string,
  output: string,
  options: ConversionOptions,
): string[] {
  const args = ["-hide_banner", "-nostdin", "-y", "-i", input];
  if (options.kind === "audio") {
    const format = options.format as AudioFormat;
    args.push("-map", "0:a:0", "-vn", ...audioCodec[format]);
    if (!lossless(format)) args.push("-b:a", `${options.bitrate}k`);
  } else if (!options.reencode) {
    args.push("-map", "0:v:0?", "-map", "0:a?", "-sn", "-dn", "-c", "copy");
  } else {
    args.push("-map", "0:v:0", "-map", "0:a?", "-sn", "-dn");
    if (options.height)
      args.push("-vf", `scale=-2:'min(${options.height},ih)'`);
    if (options.format === "webm")
      args.push(
        ...["-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "8"],
        ...["-b:v", "2M", "-c:a", "libopus", "-b:a", "128k"],
      );
    else
      args.push(
        ...["-c:v", "libx264", "-preset", "veryfast", "-crf", "23"],
        ...["-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k"],
      );
  }
  if (options.kind === "video" && options.format === "mp4")
    args.push("-movflags", "+faststart");
  if (options.title.trim())
    args.push("-metadata", `title=${options.title.trim().slice(0, 200)}`);
  args.push(output);
  return args;
}

const pageHosts = ["youtube.com", "youtu.be", "vimeo.com"];

/** Checks a direct media link; returns an error message or null. */
export function validateDirectUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return "Ce lien ne semble pas valide. Collez son adresse HTTPS complète.";
  }
  if (url.protocol !== "https:" || url.username || url.password)
    return "Utilisez un lien HTTPS public, sans identifiants.";
  if (
    pageHosts.some((d) => url.hostname === d || url.hostname.endsWith("." + d))
  )
    return "Les pages YouTube et Vimeo nécessitent l’application Windows. Le site accepte les fichiers de votre ordinateur et les liens directs vers un fichier audio ou vidéo.";
  return null;
}

/** File name suggested by a direct link. */
export function nameFromUrl(input: string): string {
  const last = new URL(input).pathname.split("/").filter(Boolean).pop() ?? "";
  try {
    return decodeURIComponent(last) || "media";
  } catch {
    return last || "media";
  }
}

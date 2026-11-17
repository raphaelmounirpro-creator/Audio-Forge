import type { FFmpeg } from "@ffmpeg/ffmpeg";
import {
  MAX_BYTES,
  extension,
  ffmpegArgs,
  type ConversionOptions,
} from "./formats";

/**
 * FFmpeg compiled to WebAssembly, loaded on first use from this site.
 * Files never leave the browser: they are copied into FFmpeg's in-memory
 * file system, converted, then removed.
 */
let instance: Promise<FFmpeg> | null = null;
let current: FFmpeg | null = null;
let onProgress: ((ratio: number) => void) | null = null;
const logs: string[] = [];

async function create(): Promise<FFmpeg> {
  const [{ FFmpeg }, core, wasm] = await Promise.all([
    import("@ffmpeg/ffmpeg"),
    import("@ffmpeg/core?url"),
    import("@ffmpeg/core/wasm?url"),
  ]);
  const ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => {
    logs.push(message);
    if (logs.length > 40) logs.shift();
  });
  ffmpeg.on("progress", ({ progress }) => {
    if (Number.isFinite(progress))
      onProgress?.(Math.min(1, Math.max(0, progress)));
  });
  await ffmpeg.load({ coreURL: core.default, wasmURL: wasm.default });
  return ffmpeg;
}

export function loadEngine(): Promise<FFmpeg> {
  if (instance) return instance;
  const pending: Promise<FFmpeg> = create().then(
    (ffmpeg) => {
      // Cancelled while loading: this instance is no longer wanted.
      if (instance === pending) current = ffmpeg;
      else ffmpeg.terminate();
      return ffmpeg;
    },
    (error: unknown) => {
      if (instance === pending) instance = null;
      throw new Error(
        "Le moteur de conversion n’a pas pu démarrer. Vérifiez votre connexion et utilisez un navigateur récent (Chrome, Edge, Firefox ou Safari).",
        { cause: error },
      );
    },
  );
  instance = pending;
  return pending;
}

/** Stops the running conversion; the engine is reloaded on next use. */
export function cancelConversion(): void {
  current?.terminate();
  current = null;
  instance = null;
}

function failure(): Error {
  const detail = [...logs]
    .reverse()
    .find((line) =>
      /error|invalid|not supported|could not|unknown/i.test(line),
    );
  return new Error(
    detail
      ? `Conversion impossible : ${detail.trim()}`
      : "Conversion impossible avec ces réglages. Essayez un autre format ou activez le réencodage.",
  );
}

export async function convert(
  file: Blob,
  sourceName: string,
  options: ConversionOptions,
  progress: (ratio: number) => void,
): Promise<Blob> {
  if (file.size > MAX_BYTES)
    throw new Error(
      "Fichier trop volumineux pour le navigateur (1 Go au maximum). Utilisez l’application Windows.",
    );
  const ffmpeg = await loadEngine();
  const input = `input.${extension(sourceName)}`;
  const output = `output.${options.format}`;
  logs.length = 0;
  onProgress = progress;
  try {
    await ffmpeg.writeFile(input, new Uint8Array(await file.arrayBuffer()));
    const code = await ffmpeg.exec(ffmpegArgs(input, output, options));
    if (code !== 0) throw failure();
    const data = await ffmpeg.readFile(output);
    if (typeof data === "string" || data.byteLength === 0) throw failure();
    return new Blob([data as Uint8Array<ArrayBuffer>], {
      type: mimeTypes[options.format] ?? "application/octet-stream",
    });
  } finally {
    if (onProgress === progress) onProgress = null;
    if (current === ffmpeg)
      await Promise.allSettled([
        ffmpeg.deleteFile(input),
        ffmpeg.deleteFile(output),
      ]);
  }
}

const mimeTypes: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  opus: "audio/ogg",
  flac: "audio/flac",
  wav: "audio/wav",
  mp4: "video/mp4",
  mkv: "video/x-matroska",
  webm: "video/webm",
};

/** Downloads a direct link, when the site allows it (CORS). */
export async function fetchMedia(
  url: string,
  progress: (received: number, total: number) => void,
  signal: AbortSignal,
): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(url, { signal, credentials: "omit" });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(
      "Ce site n’autorise pas la lecture directe depuis un navigateur. Enregistrez le fichier sur votre ordinateur, puis ajoutez-le ici.",
      { cause: error },
    );
  }
  if (!response.ok)
    throw new Error(
      `Le serveur a répondu ${response.status}. Vérifiez le lien.`,
    );
  const type = response.headers.get("content-type") ?? "";
  if (/^text\/html/i.test(type))
    throw new Error(
      "Ce lien mène à une page web et non à un fichier audio ou vidéo.",
    );
  const total = Number(response.headers.get("content-length")) || 0;
  if (total > MAX_BYTES)
    throw new Error(
      "Fichier trop volumineux pour le navigateur (1 Go au maximum).",
    );
  if (!response.body) return response.blob();
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (received > MAX_BYTES) {
      await reader.cancel();
      throw new Error(
        "Fichier trop volumineux pour le navigateur (1 Go au maximum).",
      );
    }
    progress(received, total);
  }
  return new Blob(chunks, { type });
}

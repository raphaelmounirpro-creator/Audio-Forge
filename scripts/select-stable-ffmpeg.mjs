// Select the release build from a distributor referenced by ffmpeg.org.
// Windows application-control rules remain fully enforced.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { stableFfmpegSource } from "./tool-sources.mjs";
const root = resolve("src-tauri/binaries");
const selected = await stableFfmpegSource();
const sources = JSON.parse(
  await readFile(join(root, "sources.lock.json"), "utf8"),
);
const old = sources.find((s) => s.files.includes("ffmpeg.exe"));
if (!old) throw new Error("Source FFmpeg initiale absente.");
await mkdir(resolve(".local/provenance"), { recursive: true });
await writeFile(
  resolve(".local/provenance/ffmpeg-previous-source.json"),
  JSON.stringify(old, null, 2) + "\n",
);
await writeFile(
  join(root, "sources.lock.json"),
  JSON.stringify(
    sources.map((s) => (s === old ? selected : s)),
    null,
    2,
  ) + "\n",
);
console.log(
  `FFmpeg ${selected.version} sélectionné avec empreinte publiée. Aucun exécutable lancé.`,
);

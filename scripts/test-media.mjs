import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";

const root = resolve("src-tauri/binaries");
const dir = resolve(".local/media-tests");
await mkdir(dir, { recursive: true });
const records = JSON.parse(
  await readFile(join(root, "tool-lock.json"), "utf8"),
);
for (const name of ["ffmpeg", "ffprobe", "yt-dlp", "deno"]) {
  assert.equal(
    createHash("sha256")
      .update(await readFile(join(root, name + ".exe")))
      .digest("hex"),
    records[name].sha256,
    `${name} altéré`,
  );
}
function run(name, args, expected = 0) {
  const result = spawnSync(join(root, name + ".exe"), args, {
    encoding: "utf8",
    timeout: 45_000,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    expected,
    `${name}: ${result.error?.message ?? result.stderr}`,
  );
  return result.stdout;
}
const log = [];
const source = join(dir, "source.wav");
run("ffmpeg", [
  "-nostdin",
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:duration=1",
  "-c:a",
  "pcm_s16le",
  source,
]);
const formats = {
  mp3: ["libmp3lame", "-b:a", "192k"],
  m4a: ["aac", "-b:a", "192k"],
  opus: ["libopus", "-b:a", "160k"],
  flac: ["flac"],
  wav: ["pcm_s16le"],
};
for (const [ext, codec] of Object.entries(formats)) {
  const path = join(dir, "converted." + ext);
  run("ffmpeg", [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-protocol_whitelist",
    "file,pipe",
    "-i",
    source,
    "-vn",
    "-map",
    "0:a:0",
    "-c:a",
    ...codec,
    path,
  ]);
  const info = JSON.parse(
    run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration,size",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "json",
      path,
    ]),
  );
  assert.ok(info.streams.some((s) => s.codec_type === "audio"));
  assert.ok(Number(info.format.duration) >= 0.9);
  log.push(`Conversion ${ext.toUpperCase()} : OK`);
}
const video = join(dir, "source.mp4");
run("ffmpeg", [
  "-nostdin",
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-f",
  "lavfi",
  "-i",
  "color=c=blue:s=160x90:r=10:d=1",
  "-i",
  source,
  "-c:v",
  "mpeg4",
  "-c:a",
  "aac",
  "-shortest",
  video,
]);
const remux = join(dir, "remux.mkv");
run("ffmpeg", [
  "-nostdin",
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-protocol_whitelist",
  "file,pipe",
  "-i",
  video,
  "-map",
  "0",
  "-c",
  "copy",
  remux,
]);
const streams = JSON.parse(
  run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type",
    "-of",
    "json",
    remux,
  ]),
).streams;
assert.ok(
  streams.some((s) => s.codec_type === "audio") &&
    streams.some((s) => s.codec_type === "video"),
);
log.push("Multiplexage vidéo/audio MP4 vers MKV : OK");
const beforeRefusal = createHash("sha256")
  .update(await readFile(source))
  .digest("hex");
const refusal = spawnSync(
  join(root, "ffmpeg.exe"),
  [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-n",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=997:duration=0.25",
    source,
  ],
  { encoding: "utf8", windowsHide: true, timeout: 10_000 },
);
assert.equal(refusal.error, undefined);
assert.match(refusal.stderr, /already exists/i);
assert.equal(
  createHash("sha256")
    .update(await readFile(source))
    .digest("hex"),
  beforeRefusal,
  "Le fichier existant doit rester inchangé.",
);
log.push("Refus d’écrasement : OK");
const help = run("yt-dlp", ["--help"]);
for (const option of [
  "--no-plugin-dirs",
  "--no-remote-components",
  "--no-js-runtimes",
  "--progress-template",
  "--proxy",
])
  assert.ok(help.includes(option), `Option yt-dlp absente : ${option}`);
log.push("Options de sécurité yt-dlp disponibles : OK");
log.push(`yt-dlp : ${run("yt-dlp", ["--version"]).trim()}`);
log.push(`Deno : ${run("deno", ["--version"]).split("\n")[0]}`);
await writeFile(join(dir, "results.txt"), log.join("\n") + "\n");
console.log(log.join("\n"));

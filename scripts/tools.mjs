import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { unzip } from "fflate";
import { stableFfmpegSource } from "./tool-sources.mjs";
import { syncNotices } from "./tool-notices.mjs";

const root = resolve("src-tauri/binaries");
const sourceFile = join(root, "sources.lock.json");
const finalFile = join(root, "tool-lock.json");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const headers = {
  "User-Agent": "AudioForge-development",
  Accept: "application/vnd.github+json",
};
async function get(url) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(240_000),
  });
  if (!response.ok)
    throw new Error(`Téléchargement refusé (${response.status}) : ${url}`);
  return response;
}
async function pin() {
  if (existsSync(sourceFile))
    throw new Error(
      "sources.lock.json existe déjà. Une mise à jour demande une révision explicite de ce fichier.",
    );
  const specs = [
    { repo: "yt-dlp/yt-dlp", match: /^yt-dlp\.exe$/, files: ["yt-dlp.exe"] },
    {
      repo: "denoland/deno",
      match: /^deno-x86_64-pc-windows-msvc\.zip$/,
      files: ["deno.exe"],
    },
  ];
  const sources = [];
  for (const spec of specs) {
    const release = await (
      await get(`https://api.github.com/repos/${spec.repo}/releases/latest`)
    ).json();
    const asset = release.assets.find((a) => spec.match.test(a.name));
    if (!asset || !asset.digest?.startsWith("sha256:"))
      throw new Error(
        `Empreinte officielle absente : ${spec.repo}. Ne pas exécuter de binaire non vérifié.`,
      );
    sources.push({
      repository: spec.repo,
      version: release.tag_name,
      url: asset.browser_download_url,
      sha256: asset.digest.slice(7),
      files: spec.files,
      release: release.html_url,
    });
  }
  sources.splice(1, 0, await stableFfmpegSource());
  await mkdir(root, { recursive: true });
  await writeFile(sourceFile, JSON.stringify(sources, null, 2) + "\n");
  console.log(
    "Sources verrouillées. Vérifiez sources.lock.json et les licences avant redistribution.",
  );
}
async function fetchTools() {
  const sources = JSON.parse(await readFile(sourceFile, "utf8"));
  const records = {};
  await mkdir(root, { recursive: true });
  for (const source of sources) {
    const url = new URL(source.url);
    if (
      url.protocol !== "https:" ||
      !["github.com", "www.gyan.dev"].includes(url.hostname)
    )
      throw new Error("Source non autorisée.");
    console.log(
      `Récupération vérifiée : ${source.repository} ${source.version}`,
    );
    const cache = resolve(
      ".local/tool-archives",
      source.sha256 + (url.pathname.endsWith(".zip") ? ".zip" : ".exe"),
    );
    let data;
    if (existsSync(cache)) {
      data = await readFile(cache);
    } else {
      data = Buffer.from(await (await get(source.url)).arrayBuffer());
    }
    if (hash(data) !== source.sha256)
      throw new Error(`Empreinte incorrecte : ${source.url}`);
    await mkdir(resolve(".local/tool-archives"), { recursive: true });
    if (!existsSync(cache)) await writeFile(cache, data);
    let files;
    if (url.pathname.endsWith(".zip")) {
      files = await new Promise((ok, fail) =>
        unzip(
          new Uint8Array(data),
          {
            filter: (file) =>
              source.files.some(
                (name) => file.name === name || file.name.endsWith("/" + name),
              ) || /(^|\/)(LICENSE|COPYING|NOTICE)[^/]*$/i.test(file.name),
          },
          (error, result) => (error ? fail(error) : ok(result)),
        ),
      );
    } else {
      files = { [source.files[0]]: data };
    }
    for (const name of source.files) {
      const matches = Object.entries(files).filter(
        ([path]) => path === name || path.endsWith("/" + name),
      );
      if (matches.length !== 1)
        throw new Error(`Fichier absent ou ambigu : ${name}`);
      const bytes = matches[0][1];
      await writeFile(join(root, name), bytes);
      records[name.replace(/\.exe$/, "")] = {
        version: source.version,
        sha256: hash(bytes),
      };
    }
    const licenseDir = join(
      root,
      "licenses",
      source.repository.replace("/", "-"),
    );
    await mkdir(licenseDir, { recursive: true });
    for (const [path, bytes] of Object.entries(files)) {
      if (!path.endsWith(".exe"))
        await writeFile(join(licenseDir, path.split("/").at(-1)), bytes);
    }
    await writeFile(
      join(licenseDir, "SOURCE.txt"),
      `${source.repository}\n${source.version}\n${source.release}\n${source.url}\nsha256:${source.sha256}\n`,
    );
  }
  await writeFile(finalFile, JSON.stringify(records, null, 2) + "\n");
  await notices(true);
  await verify();
}
async function notices(download = false) {
  await syncNotices(
    root,
    JSON.parse(await readFile(sourceFile, "utf8")),
    JSON.parse(await readFile(join(root, "notices.lock.json"), "utf8")),
    download
      ? async (url) => Buffer.from(await (await get(url)).arrayBuffer())
      : undefined,
  );
}
async function verify() {
  const records = JSON.parse(await readFile(finalFile, "utf8"));
  for (const name of ["yt-dlp", "ffmpeg", "ffprobe", "deno"]) {
    const record = records[name];
    if (
      !record ||
      hash(await readFile(join(root, `${name}.exe`))) !== record.sha256
    )
      throw new Error(`${name} absent ou altéré.`);
    console.log(`${name} ${record.version} : SHA-256 valide`);
  }
  await notices();
}
const command = process.argv[2];
try {
  if (command === "pin") await pin();
  else if (command === "fetch") await fetchTools();
  else if (command === "verify") await verify();
  else if (command === "notices") await notices(true);
  else
    throw new Error("Usage : node scripts/tools.mjs pin|fetch|verify|notices");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

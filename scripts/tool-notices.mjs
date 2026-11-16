import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function syncNotices(root, sources, records, download) {
  const active = new Map(sources.map((s) => [s.repository, s.version]));
  const expected = new Set([...active.keys()].map((s) => s.replace("/", "-")));
  if (
    [...active.keys()].some(
      (s) => !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s),
    )
  )
    throw new Error("Nom de composant invalide.");
  // Validate the complete lock before downloading, writing or removing anything.
  for (const record of records) {
    const url = new URL(record.url);
    if (
      active.get(record.component) !== record.version ||
      !/^[A-Za-z0-9_.-]+$/.test(record.file) ||
      record.file === "." ||
      record.file === ".." ||
      !/^[a-f0-9]{64}$/.test(record.sha256) ||
      url.protocol !== "https:" ||
      url.hostname !== "raw.githubusercontent.com" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/[^/]+\/[^/]+\/[a-f0-9]{40}\/.+/.test(url.pathname)
    ) {
      throw new Error(
        "Notice non verrouillée ou incompatible avec les composants actifs.",
      );
    }
  }
  for (const component of active.keys()) {
    if (!records.some((r) => r.component === component))
      throw new Error(`Texte de licence absent du verrou : ${component}`);
  }
  const licenses = resolve(root, "licenses");
  for (const record of records) {
    const dir = join(licenses, record.component.replace("/", "-"));
    const path = join(dir, record.file);
    let bytes;
    try {
      bytes = await readFile(path);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (!bytes || digest(bytes) !== record.sha256) {
      if (!download)
        throw new Error(
          `Notice absente ou altérée : ${record.component}/${record.file}`,
        );
      bytes = await download(record.url);
      if (digest(bytes) !== record.sha256)
        throw new Error(`Empreinte de notice incorrecte : ${record.url}`);
      await mkdir(dir, { recursive: true });
      await writeFile(path, bytes);
    }
  }
  for (const entry of await readdir(licenses, { withFileTypes: true })) {
    if (!expected.has(entry.name)) {
      if (!download) throw new Error(`Notices obsolètes : ${entry.name}`);
      const target = resolve(licenses, entry.name);
      if (
        !target.startsWith(licenses + "/") &&
        !target.startsWith(licenses + "\\")
      )
        throw new Error("Chemin de notice invalide.");
      await rm(target, { recursive: true, force: true });
    }
  }
}

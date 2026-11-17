// Run only inside the authorized Windows Sandbox. No host installation.
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

const exportsRoot = "C:\\Exports";
const folders = (await readdir(exportsRoot))
  .filter((v) => v.startsWith("build-"))
  .sort()
  .reverse();
let build, folder;
for (const candidate of folders) {
  try {
    const value = JSON.parse(
      await readFile(join(exportsRoot, candidate, "result.json"), "utf8"),
    );
    if (value.state === "built") {
      build = value;
      folder = join(exportsRoot, candidate);
      break;
    }
  } catch {}
}
if (!build) throw new Error("Aucun installateur construit.");
const artifact = build.installers[0];
const installer = join(folder, artifact.name);
const checksum = createHash("sha256")
  .update(await readFile(installer))
  .digest("hex");
if (checksum !== artifact.sha256)
  throw new Error("Empreinte de l’installateur incorrecte.");
const installRoot = "C:\\Build\\AudioForgeInstalled";
await mkdir(installRoot, { recursive: true });
const report = {
  installer: artifact.name,
  sha256: checksum,
  installed: false,
  started: false,
  resourcesVerified: false,
  databaseCreated: false,
};
const save = () =>
  writeFile(
    join(folder, "installed-smoke.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
try {
  const result = spawnSync(installer, ["/S", "/D=" + installRoot], {
    windowsHide: true,
    encoding: "utf8",
    timeout: 240_000,
  });
  report.installExitCode = result.status;
  if (result.error || result.status !== 0)
    throw new Error(
      "Installation NSIS : " + (result.error?.message ?? result.status),
    );
  report.installed = true;
  // Third-party programs are downloaded on request, never installed.
  const programs = (await readdir(installRoot, { recursive: true }))
    .map((path) => path.replaceAll("\\", "/").toLowerCase())
    .filter((path) => /\.(?:exe|dll)$/.test(path))
    .sort();
  const unexpected = programs.filter(
    (path) => !["audioforge.exe", "uninstall.exe"].includes(path),
  );
  if (unexpected.length)
    throw new Error("Programmes tiers installés : " + unexpected.join(", "));
  const inventory = JSON.parse(
    await readFile(join(installRoot, "notices", "inventory.json"), "utf8"),
  );
  const notices = await readFile(
    join(installRoot, "notices", "THIRD_PARTY_NOTICES.txt"),
  );
  if (
    createHash("sha256").update(notices).digest("hex") !==
    inventory.notices.sha256
  )
    throw new Error("Notices installées absentes ou altérées.");
  report.programs = programs;
  report.resourcesVerified = true;
  const app = spawn(join(installRoot, "audioforge.exe"), [], {
    windowsHide: true,
    stdio: "ignore",
  });
  let spawnError;
  app.on("error", (error) => {
    spawnError = error;
  });
  await new Promise((resolve) => setTimeout(resolve, 12_000));
  if (spawnError || app.exitCode !== null)
    throw new Error(
      "L’application installée a quitté prématurément : " +
        (spawnError?.message ?? app.exitCode),
    );
  report.started = true;
  report.pid = app.pid;
  const db = join(
    process.env.LOCALAPPDATA,
    "fr.audioforge.desktop",
    "audioforge.sqlite",
  );
  report.databaseCreated = (await stat(db)).size > 0;
  if (!report.databaseCreated)
    throw new Error("La base de données n’a pas été créée.");
  report.status = "passed";
  report.scope =
    "Installation sans programme tiers, notices intactes, démarrage/processus/base ; téléchargement des composants, contrôle visuel et téléchargement complet non effectués.";
  app.unref();
} catch (error) {
  report.status = "failed";
  report.error = error.message;
  process.exitCode = 1;
}
await save();

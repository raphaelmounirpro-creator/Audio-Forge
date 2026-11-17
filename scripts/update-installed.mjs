// Updates the AudioForge already installed for this user with a build of
// these sources, using the installer's update mode: no wizard, no uninstall.
// Data in %LOCALAPPDATA%\fr.audioforge.desktop is never touched by it.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  BINARY,
  UNINSTALL_KEY,
  UPDATE_ARGUMENTS,
  installDirectory,
  isRunning,
  registryValues,
  sameProgram,
  sha256,
} from "./installed-app.mjs";

const project = process.cwd();
const system32 = join(process.env.SystemRoot ?? "C:\\Windows", "System32");
const { productName, version } = JSON.parse(
  readFileSync(join(project, "src-tauri", "tauri.conf.json"), "utf8"),
);

function run(executable, args, stdio = "pipe") {
  const result = spawnSync(executable, args, {
    cwd: project,
    encoding: "utf8",
    stdio,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return result;
}
function installed() {
  const result = run(join(system32, "reg.exe"), ["query", UNINSTALL_KEY]);
  return result.status === 0 ? registryValues(result.stdout) : null;
}
function ensureClosed() {
  const { stdout } = run(join(system32, "tasklist.exe"), [
    "/FI",
    `IMAGENAME eq ${BINARY}`,
    "/FO",
    "CSV",
    "/NH",
  ]);
  if (isRunning(stdout))
    throw new Error(
      "Fermez AudioForge avant la mise à jour : un téléchargement en cours serait interrompu.",
    );
}

try {
  const before = installed();
  if (!before)
    throw new Error(
      "AudioForge n'est pas installé pour cet utilisateur : lancez une première fois son installateur.",
    );
  installDirectory(before);
  ensureClosed();

  const started = Date.now();
  console.log(`Compilation d'AudioForge ${version}…`);
  if (
    run(process.execPath, ["scripts/desktop.mjs", "build"], "inherit")
      .status !== 0
  )
    throw new Error(
      "La compilation a échoué : la version installée n'a pas été modifiée.",
    );
  const release = join(project, "src-tauri", "target", "release");
  const installer = join(
    release,
    "bundle",
    "nsis",
    `${productName}_${version}_x64-setup.exe`,
  );
  if (!existsSync(installer) || statSync(installer).mtimeMs < started)
    throw new Error(
      "Cette compilation n'a pas produit de nouvel installateur.",
    );

  // The build takes minutes: the application may have been opened meanwhile.
  ensureClosed();
  console.log(
    `\nInstallateur : ${installer}\nSHA-256 : ${sha256(readFileSync(installer))}\nMise à jour de la version installée…`,
  );
  const setup = run(installer, UPDATE_ARGUMENTS, "ignore");
  if (setup.status !== 0)
    throw new Error(
      `La mise à jour a été interrompue (code ${setup.status}). Relancez la commande après avoir fermé AudioForge.`,
    );

  const after = installed();
  const directory = installDirectory(after ?? {});
  if (
    after.DisplayVersion !== version ||
    !sameProgram(
      readFileSync(join(directory, BINARY)),
      readFileSync(join(release, BINARY)),
    )
  )
    throw new Error(
      "Le programme installé ne correspond pas à cette compilation.",
    );
  console.log(
    `\nAudioForge ${version} est à jour dans ${directory} et a été relancé.\nHistorique, réglages et composants téléchargés sont conservés.`,
  );
} catch (error) {
  console.error(`\nÉCHEC : ${error.message}`);
  process.exitCode = 1;
}

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";

const root = resolve("src-tauri/binaries");
const environment = {
  ...process.env,
  AUDIOFORGE_BUILD_TOOLS_DIR: resolve(".local/build-tools"),
};
const windows = spawnSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `
$localTools = Join-Path $env:AUDIOFORGE_BUILD_TOOLS_DIR 'VC/Tools/MSVC'
Write-Output ('Outils C++ locaux : ' + (Test-Path -LiteralPath $localTools))
$locator = Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft Visual Studio/Installer/vswhere.exe'
if (Test-Path -LiteralPath $locator) { & $locator -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath }
`,
  ],
  { encoding: "utf8", env: environment, windowsHide: true },
);
console.log(windows.stdout.trim());
const manifest = JSON.parse(readFileSync(join(root, "tool-lock.json"), "utf8"));
let failed = false;
for (const tool of ["yt-dlp", "ffmpeg", "ffprobe", "deno"]) {
  const path = join(root, tool + ".exe");
  if (
    !existsSync(path) ||
    createHash("sha256").update(readFileSync(path)).digest("hex") !==
      manifest[tool]?.sha256
  ) {
    console.log(`${tool} : absent ou intégrité incorrecte`);
    failed = true;
    continue;
  }
  const result = spawnSync(
    path,
    [tool.startsWith("ff") ? "-version" : "--version"],
    { encoding: "utf8", timeout: 30_000, windowsHide: true },
  );
  if (result.status !== 0) {
    console.log(
      `${tool} : lancement refusé ou impossible (${result.error?.code ?? result.status}). Consulter CodeIntegrity/Operational ; aucun réglage de sécurité modifié.`,
    );
    failed = true;
  } else console.log(`${tool} : ${result.stdout.split(/\r?\n/)[0]}`);
}
process.exitCode = failed ? 1 : 0;

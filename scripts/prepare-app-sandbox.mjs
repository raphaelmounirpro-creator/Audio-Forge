import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { createHash } from "node:crypto";
import { sandboxXml } from "./sandbox-config.mjs";
import { spawnSync } from "node:child_process";

const { version } = JSON.parse(await readFile("package.json", "utf8"));
const release = resolve("releases", version);
const result = JSON.parse(
  await readFile(join(release, "build-result.json"), "utf8"),
);
const item = result.installers[0];
if (
  basename(item.name) !== item.name ||
  !/^[A-Za-z0-9_.-]+\.exe$/.test(item.name)
)
  throw new Error("Nom d’installateur invalide.");
if (
  createHash("sha256")
    .update(await readFile(join(release, item.name)))
    .digest("hex") !== item.sha256
)
  throw new Error("Installateur altéré.");
const exports = resolve(".local/app-sandbox/exports");
await mkdir(exports, { recursive: true });
const preferencesPath = resolve(".local/app-sandbox/preferences.json");
let preferences = { clipboardRedirection: false };
try {
  preferences = JSON.parse(await readFile(preferencesPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (process.argv.includes("--enable-clipboard")) {
  preferences.clipboardRedirection = true;
  await writeFile(preferencesPath, JSON.stringify(preferences, null, 2) + "\n");
}
if (process.argv.includes("--disable-clipboard")) {
  preferences.clipboardRedirection = false;
  await writeFile(preferencesPath, JSON.stringify(preferences, null, 2) + "\n");
}
const startup = `$ErrorActionPreference = 'Stop'
$report = @{ state='starting'; nativeHostInstallation=$false }
$status = 'C:\\AudioForgeExport\\launch-result.json'
function Save-Result { $report | ConvertTo-Json | Set-Content -LiteralPath $status -Encoding UTF8 }
try {
  Save-Result
  $existing = @(Get-Process audioforge -ErrorAction SilentlyContinue)
  if ($existing.Count -gt 0) { $report.state='already-running'; $report.pid=$existing[0].Id; Save-Result; exit 0 }
  $installer='C:\\AudioForgePackage\\${item.name}'
  if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant() -ne '${item.sha256}') { throw 'Empreinte incorrecte pour le programme.' }
  $report.state='installing'; Save-Result
  $setup=Start-Process -FilePath $installer -ArgumentList '/S','/D=C:\\AudioForge' -Wait -PassThru
  if ($setup.ExitCode -ne 0) { throw ('Installation : code ' + $setup.ExitCode) }
  $app=Start-Process -FilePath 'C:\\AudioForge\\audioforge.exe' -PassThru
  Start-Sleep -Seconds 10
  if ($app.HasExited) { throw 'Le programme a quitte au demarrage.' }
  $report.state='started'; $report.pid=$app.Id; Save-Result
} catch { $report.state='failed'; $report.error=$_.Exception.Message; Save-Result; exit 1 }
`;
const syntax = spawnSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "$tokens=$null; $issues=$null; [System.Management.Automation.Language.Parser]::ParseInput($env:AUDIOFORGE_GUEST_STARTUP,[ref]$tokens,[ref]$issues) | Out-Null; if ($issues.Count -gt 0) { $issues | Out-String | Write-Error; exit 1 }",
  ],
  {
    env: { ...process.env, AUDIOFORGE_GUEST_STARTUP: startup },
    encoding: "utf8",
    windowsHide: true,
  },
);
if (syntax.error || syntax.status !== 0)
  throw new Error(
    "Syntaxe du lanceur invalide : " + (syntax.error?.message ?? syntax.stderr),
  );
// A local command file runs only in the guest, using the normal built-in tools.
// It does not change execution policies or application-control rules.
const inline = startup.trim().split(/\r?\n/).join("; ").replaceAll('"', '\\"');
await writeFile(
  join(release, "Lancer-dans-Sandbox.cmd"),
  '@echo off\r\npowershell.exe -NoProfile -NonInteractive -Command "' +
    inline +
    '"\r\n',
  "utf8",
);
const xml = sandboxXml(
  [
    { host: release, guest: "C:\\AudioForgePackage", readOnly: true },
    { host: exports, guest: "C:\\AudioForgeExport", readOnly: false },
  ],
  {
    memoryMb: 4096,
    clipboardRedirection: preferences.clipboardRedirection,
    command:
      "C:\\Windows\\System32\\cmd.exe /d /c C:\\AudioForgePackage\\Lancer-dans-Sandbox.cmd",
  },
);
await writeFile(resolve("Ouvrir-AudioForge.wsb"), xml);
console.log(resolve("Ouvrir-AudioForge.wsb"));
console.log(
  "Les fichiers du bureau isolé sont temporaires. Copiez les fichiers à conserver dans C:\\AudioForgeExport avant fermeture.",
);

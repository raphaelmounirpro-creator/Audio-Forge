import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Uses Windows' signature checks and the normal UAC elevation flow. No execution
// policy, application-control rule or antivirus setting is changed.
const environment = {
  ...process.env,
  AUDIOFORGE_INSTALLER_PATH: resolve(".local/installers/vs_BuildTools.exe"),
  AUDIOFORGE_BUILD_TOOLS_DIR: resolve(".local/build-tools"),
  AUDIOFORGE_INSTALL_REQUESTED: process.argv.includes("--install")
    ? "yes"
    : "no",
};
const command = `
$ErrorActionPreference = 'Stop'
$installer = $env:AUDIOFORGE_INSTALLER_PATH
$signature = Get-AuthenticodeSignature -LiteralPath $installer
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') { throw 'Signature Microsoft invalide : installation refusée.' }
$metadata = Get-Content -LiteralPath (Join-Path (Split-Path -Parent $installer) 'build-tools-source.json') -Raw | ConvertFrom-Json
if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant() -ne $metadata.sha256) { throw 'Empreinte modifiée : installation refusée.' }
Write-Output ('Éditeur vérifié : ' + $signature.SignerCertificate.Subject)
Write-Output ('Destination : ' + $env:AUDIOFORGE_BUILD_TOOLS_DIR)
if ($env:AUDIOFORGE_INSTALL_REQUESTED -ne 'yes') { Write-Output 'Pour installer MSVC et le SDK Windows (plusieurs Go) : npm run setup:cpp -- --install'; exit 0 }
$arguments = @('--quiet','--wait','--norestart','--nocache','--installPath',('"' + $env:AUDIOFORGE_BUILD_TOOLS_DIR + '"'),'--add','Microsoft.VisualStudio.Workload.VCTools','--add','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','--add','Microsoft.VisualStudio.Component.Windows11SDK.26100')
$process = Start-Process -FilePath $installer -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -PassThru
$process.Id | Set-Content -LiteralPath (Join-Path (Split-Path -Parent $installer) 'build-tools.pid')
Write-Output ('Installation démarrée, PID ' + $process.Id + '. Consulter le diagnostic après sa fin.')
`;
const result = spawnSync(
  "powershell.exe",
  ["-NoProfile", "-NonInteractive", "-Command", command],
  { stdio: "inherit", env: environment, windowsHide: true },
);
process.exit(result.status ?? 1);

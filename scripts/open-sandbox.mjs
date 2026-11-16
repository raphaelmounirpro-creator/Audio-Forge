import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const config = resolve(".local/sandbox/AudioForge-Build.wsb");
if (!existsSync(config)) throw new Error("Exécutez npm run sandbox:prepare.");
const result = spawnSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `$ErrorActionPreference = 'Stop'
    $status = $env:AUDIOFORGE_SANDBOX_STATUS
    if ((Test-Path -LiteralPath $status) -and (Get-Content -LiteralPath $status) -eq '3010') {
      $boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
      if ($boot -lt (Get-Item -LiteralPath $status).LastWriteTime) { throw 'Windows a demandé un redémarrage pour activer Sandbox. Redémarrez le PC avant cette commande.' }
    }
    Start-Process -FilePath $env:AUDIOFORGE_SANDBOX_CONFIG -WindowStyle Hidden`,
  ],
  {
    env: {
      ...process.env,
      AUDIOFORGE_SANDBOX_CONFIG: config,
      AUDIOFORGE_SANDBOX_STATUS: resolve(
        ".local/sandbox/feature-install.exitcode",
      ),
    },
    stdio: "inherit",
    windowsHide: true,
  },
);
process.exit(result.status ?? 1);

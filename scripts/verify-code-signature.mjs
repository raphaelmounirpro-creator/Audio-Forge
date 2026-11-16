import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateCodeSignature } from "./code-signature.mjs";
const path = process.argv[2];
if (!path) throw new Error("Indiquez le fichier AudioForge à vérifier.");
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const result = spawnSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `
$ErrorActionPreference='Stop'
$file=Get-Item -LiteralPath $env:AUDIOFORGE_SIGNED_FILE
$signature=Get-AuthenticodeSignature -LiteralPath $file.FullName
@{status=$signature.Status.ToString(); subject=$signature.SignerCertificate.Subject; timestamped=($null -ne $signature.TimeStamperCertificate); productName=$file.VersionInfo.ProductName; productVersion=$file.VersionInfo.ProductVersion} | ConvertTo-Json -Compress
`,
  ],
  {
    env: { ...process.env, AUDIOFORGE_SIGNED_FILE: resolve(path) },
    encoding: "utf8",
    windowsHide: true,
  },
);
if (result.error || result.status !== 0)
  throw new Error("Impossible de vérifier la signature Windows.");
const info = JSON.parse(result.stdout.replace(/^\uFEFF/, ""));
validateCodeSignature(info, version);
console.log(
  `Signature et horodatage vérifiés : AudioForge ${version}, ${info.subject}`,
);

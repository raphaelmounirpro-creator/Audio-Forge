import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { sandboxXml } from "./sandbox-config.mjs";

const project = process.cwd();
const root = resolve(".local/sandbox");
// A fresh immutable snapshot per preparation, preserving previous snapshots and results.
const snapshot = join(
  root,
  "input-" + new Date().toISOString().replace(/[:.]/g, "-"),
);
await mkdir(join(snapshot, "project"), { recursive: true });
await mkdir(join(root, "output"), { recursive: true });
for (const item of [
  "src",
  "src-tauri",
  "scripts",
  "tests",
  "assets",
  "docs",
  ".github",
  "package.json",
  "package-lock.json",
  "index.html",
  "tsconfig.json",
  "vite.config.ts",
  "playwright.config.ts",
  ".npmrc",
  "README.md",
  "THIRD_PARTY_LICENSES.md",
  "AGENTS.md",
]) {
  await cp(resolve(item), join(snapshot, "project", item), {
    recursive: true,
    filter: (source) =>
      !["target", "gen"].includes(source.split(/[\\/]/).at(-1)),
    dereference: true,
  });
}
const vcVersions = (
  await readdir(resolve(".local/build-tools/VC/Tools/MSVC"))
).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
const sdkRoot = join(
  process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
  "Windows Kits",
  "10",
);
const sdkVersions = (await readdir(join(sdkRoot, "Lib")))
  .filter((v) => existsSync(join(sdkRoot, "bin", v, "x64", "rc.exe")))
  .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
if (!vcVersions[0] || !sdkVersions[0])
  throw new Error("Outils C++ ou SDK Windows incomplets.");
const toolchain = join(
  process.env.USERPROFILE,
  ".rustup",
  "toolchains",
  "stable-x86_64-pc-windows-msvc",
);
const nodeRoot = resolve(process.execPath, "..");
const mappings = [
  { host: snapshot, guest: "C:\\Inputs\\Source", readOnly: true },
  { host: nodeRoot, guest: "C:\\Inputs\\Node", readOnly: true },
  { host: toolchain, guest: "C:\\Inputs\\Rust", readOnly: true },
  {
    host: resolve(".local/build-tools"),
    guest: "C:\\Inputs\\BuildTools",
    readOnly: true,
  },
  { host: sdkRoot, guest: "C:\\Inputs\\WindowsSDK", readOnly: true },
  {
    host: resolve(".local/cargo/registry"),
    guest: "C:\\Inputs\\CargoRegistry",
    readOnly: true,
  },
  {
    host: resolve("node_modules"),
    guest: "C:\\Inputs\\NodeModules",
    readOnly: true,
  },
  { host: join(root, "output"), guest: "C:\\Exports", readOnly: false },
];
for (const mapping of mappings)
  if (!existsSync(mapping.host))
    throw new Error("Ressource absente : " + mapping.host);
await cp(
  resolve("scripts/sandbox-build.mjs"),
  join(snapshot, "sandbox-build.mjs"),
);
await writeFile(
  join(snapshot, "build-environment.json"),
  JSON.stringify(
    { vcVersion: vcVersions[0], sdkVersion: sdkVersions[0] },
    null,
    2,
  ) + "\n",
);
const config = sandboxXml(mappings);
await writeFile(join(root, "AudioForge-Build.wsb"), config);
await writeFile(
  join(root, "preparation.json"),
  JSON.stringify(
    {
      preparedAt: new Date().toISOString(),
      snapshot,
      mappings,
      hostProtectionsChanged: false,
    },
    null,
    2,
  ) + "\n",
);
console.log("Environnement prêt : " + join(root, "AudioForge-Build.wsb"));
console.log(
  "Sources et outils en lecture seule ; seule la sortie .local/sandbox/output est accessible en écriture.",
);
console.log("Pour lancer la machine isolée : npm run sandbox:open. Le lanceur signale tout redémarrage Windows encore requis.");

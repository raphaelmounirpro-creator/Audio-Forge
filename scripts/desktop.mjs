import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { desktopEnvironment } from "./desktop-environment.mjs";

const env = desktopEnvironment(process.env, process.cwd());
const cli = join(
  process.cwd(),
  "node_modules",
  "@tauri-apps",
  "cli",
  "tauri.js",
);
if (!existsSync(cli))
  throw new Error("Exécutez npm install avant de lancer AudioForge.");
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
});
process.exit(result.status ?? 1);

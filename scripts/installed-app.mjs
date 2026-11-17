// Pure helpers for scripts/update-installed.mjs (kept separate for tests).
import { createHash } from "node:crypto";

export const UNINSTALL_KEY =
  "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AudioForge";
export const BINARY = "audioforge.exe";
// Tauri NSIS options also used by its official updater: progress bar only
// (/P), keep the installed version instead of uninstalling it first (/UPDATE),
// relaunch the application once installed (/R).
export const UPDATE_ARGUMENTS = ["/P", "/UPDATE", "/R"];

/** Values of a `reg.exe query <key>` output, by name. */
export function registryValues(output) {
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s+(\S+)\s+REG_\w+\s+(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

export function installDirectory(values) {
  const directory = (values.InstallLocation ?? "").replace(/^"(.*)"$/, "$1");
  if (!/^[A-Za-z]:\\[^"*?<>|]+$/.test(directory))
    throw new Error("Emplacement d'installation d'AudioForge illisible.");
  return directory;
}

/** True when `tasklist /FO CSV /NH` lists the AudioForge executable. */
export function isRunning(csv) {
  return csv
    .split(/\r?\n/)
    .some(
      (line) => line.split(",")[0].replace(/"/g, "").toLowerCase() === BINARY,
    );
}

const MARKER = Buffer.from("__TAURI_BUNDLE_TYPE_VAR_", "latin1");
/**
 * The bundler writes "NSS" after this marker in the packed program, then
 * restores "UNK" in its build output. Every other byte must be identical.
 */
export function sameProgram(installed, built) {
  const at = installed.indexOf(MARKER);
  if (at < 0 || installed.length !== built.length) return false;
  const tag = at + MARKER.length;
  const end = tag + 3;
  return (
    installed.toString("latin1", tag, end) === "NSS" &&
    ["UNK", "NSS"].includes(built.toString("latin1", tag, end)) &&
    installed.subarray(0, tag).equals(built.subarray(0, tag)) &&
    installed.subarray(end).equals(built.subarray(end))
  );
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

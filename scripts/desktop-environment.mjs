import { join } from "node:path";

export function desktopEnvironment(input, project) {
  const env = { ...input };
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === "PATH");
  const inheritedPath = pathKey ? env[pathKey] : "";
  for (const key of Object.keys(env))
    if (key.toUpperCase() === "PATH") delete env[key];
  const cargoBin = join(env.USERPROFILE ?? "", ".cargo", "bin");
  env.PATH = `${cargoBin};${inheritedPath}`;
  env.CARGO_HOME = join(project, ".local", "cargo");
  env.CARGO_TARGET_DIR = join(project, "src-tauri", "target");
  return env;
}

// Runs INSIDE Windows Sandbox. It never changes host security policy.
import {
  cp,
  mkdir,
  readFile,
  readdir,
  writeFile,
  appendFile,
} from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const project = "C:\\Build\\AudioForge";
const output = join(
  "C:\\Exports",
  "build-" + new Date().toISOString().replace(/[:.]/g, "-"),
);
await mkdir(output, { recursive: true });
const logPath = join(output, "build.log");
const result = {
  startedAt: new Date().toISOString(),
  state: "preparing",
  steps: [],
  installers: [],
};
async function record() {
  await writeFile(
    join(output, "result.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
}
async function log(message) {
  console.log(message);
  await appendFile(logPath, message + "\n");
}
async function run(name, executable, args) {
  await log("\n" + name);
  const stream = createWriteStream(logPath, { flags: "a" });
  const child = spawn(executable, args, {
    cwd: project,
    env: process.env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(stream, { end: false });
  child.stderr.pipe(stream, { end: false });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  const code = await new Promise((ok, fail) => {
    child.once("error", fail);
    child.once("close", ok);
  });
  await new Promise((ok) => stream.end(ok));
  result.steps.push({ name, exitCode: code });
  await record();
  if (code !== 0) throw new Error(name + " : code " + code);
}
try {
  await record();
  await log(
    "Préparation dans la machine isolée ; les dossiers sources ne sont jamais modifiés.",
  );
  await cp("C:\\Inputs\\Source\\project", project, {
    recursive: true,
    dereference: true,
  });
  await log("Copie des dépendances npm locales…");
  await cp("C:\\Inputs\\NodeModules", join(project, "node_modules"), {
    recursive: true,
    dereference: true,
  });
  await log("Copie du cache public Cargo…");
  await mkdir(join(project, ".local", "cargo"), { recursive: true });
  await cp(
    "C:\\Inputs\\CargoRegistry",
    join(project, ".local", "cargo", "registry"),
    { recursive: true, dereference: true },
  );
  const versions = JSON.parse(
    await readFile("C:\\Inputs\\Source\\build-environment.json", "utf8"),
  );
  const vc = "C:\\Inputs\\BuildTools\\VC\\Tools\\MSVC\\" + versions.vcVersion;
  const sdk = "C:\\Inputs\\WindowsSDK";
  const sdkVersion = versions.sdkVersion;
  Object.assign(process.env, {
    PATH: [
      vc + "\\bin\\Hostx64\\x64",
      sdk + "\\bin\\" + sdkVersion + "\\x64",
      "C:\\Inputs\\Rust\\bin",
      "C:\\Inputs\\Node",
      process.env.PATH,
    ].join(";"),
    INCLUDE: [
      vc + "\\include",
      ...["ucrt", "shared", "um", "winrt", "cppwinrt"].map(
        (folder) => sdk + "\\Include\\" + sdkVersion + "\\" + folder,
      ),
    ].join(";"),
    LIB: [
      vc + "\\lib\\x64",
      sdk + "\\Lib\\" + sdkVersion + "\\ucrt\\x64",
      sdk + "\\Lib\\" + sdkVersion + "\\um\\x64",
    ].join(";"),
    VSCMD_VER: "17.14",
    VSCMD_ARG_TGT_ARCH: "x64",
    VSCMD_ARG_HOST_ARCH: "x64",
    VCINSTALLDIR: "C:\\Inputs\\BuildTools\\VC\\",
    VCToolsInstallDir: vc + "\\",
    WindowsSdkDir: sdk + "\\",
    WindowsSDKVersion: sdkVersion + "\\",
    CARGO_HOME: join(project, ".local", "cargo"),
    CARGO_BUILD_JOBS: "2",
  });
  result.state = "building";
  await record();
  const node = "C:\\Inputs\\Node\\node.exe";
  const cargo = "C:\\Inputs\\Rust\\bin\\cargo.exe";
  await run("Intégrité des composants", node, ["scripts/tools.mjs", "verify"]);
  await run("Tests frontend", node, ["node_modules/vitest/vitest.mjs", "run"]);
  await run("Tests des scripts", node, ["--test", "tests/scripts/*.test.mjs"]);
  await run("Tests Rust", cargo, [
    "test",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--no-default-features",
    "--lib",
    "--locked",
    "--offline",
  ]);
  await run("Conversions Rust", cargo, [
    "test",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--no-default-features",
    "--features",
    "native-media-tests",
    "--test",
    "native_media",
    "--locked",
    "--offline",
  ]);
  await run("Conversions et multiplexage", node, ["scripts/test-media.mjs"]);
  await run("Compilation et installateur NSIS", node, [
    "scripts/desktop.mjs",
    "build",
  ]);
  const bundle = join(
    project,
    "src-tauri",
    "target",
    "release",
    "bundle",
    "nsis",
  );
  for (const name of (await readdir(bundle)).filter((n) =>
    n.endsWith(".exe"),
  )) {
    const path = join(bundle, name);
    const bytes = await readFile(path);
    await cp(path, join(output, name));
    result.installers.push({
      name,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      size: bytes.length,
    });
  }
  if (!result.installers.length)
    throw new Error("Le build ne contient aucun installateur NSIS.");
  await writeFile(
    join(output, "SHA256SUMS.txt"),
    result.installers.map((i) => i.sha256 + "  " + i.name).join("\n") + "\n",
  );
  result.state = "built";
  result.finishedAt = new Date().toISOString();
  await record();
  await log(
    "Installateur exporté. Il doit encore être installé et testé ; aucun lancement automatique sur le PC hôte.",
  );
} catch (error) {
  result.state = "failed";
  result.error = error.message;
  result.finishedAt = new Date().toISOString();
  await log("ÉCHEC : " + error.message);
  await record();
  process.exitCode = 1;
}

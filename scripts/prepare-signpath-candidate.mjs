import { cp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { createHash } from "node:crypto";

const target = resolve(".local/signpath-candidate");
await mkdir(target, { recursive: true });
const selections = [
  "src",
  "src-tauri/src",
  "src-tauri/icons",
  "src-tauri/capabilities",
  "src-tauri/migrations",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
  "src-tauri/build.rs",
  "src-tauri/tauri.conf.json",
  "src-tauri/tests",
  "src-tauri/binaries/README.md",
  "src-tauri/binaries/sources.lock.json",
  "src-tauri/binaries/tool-lock.json",
  "src-tauri/binaries/licenses",
  "scripts",
  "tests",
  "assets",
  ".github",
  "package.json",
  "package-lock.json",
  ".npmrc",
  ".gitignore",
  "index.html",
  "tsconfig.json",
  "vite.config.ts",
  "playwright.config.ts",
  "THIRD_PARTY_LICENSES.md",
  "LICENSE",
  "CODE_SIGNING_POLICY.md",
  "PRIVACY.md",
  "docs/signing",
];
// Selection is explicit: no .local, account/session data, build outputs or installers.
for (const source of selections) {
  const destination = join(target, source);
  await mkdir(resolve(destination, ".."), { recursive: true });
  await cp(resolve(source), destination, {
    recursive: true,
    dereference: false,
  });
}
await cp(resolve("docs/GITHUB-README.md"), join(target, "README.md"));
const manifest = [];
const findings = [];
const patterns = [
  ["access-token", /(?:gh[pousr]_|github_pat_)[a-zA-Z0-9_]{20,}/],
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["private-windows-path", /C:[\\/]+Users[\\/]+Darkmoon/i],
  ["personal-email", /[A-Za-z0-9._%+-]+@(?:gmail|hotmail|outlook)\.[A-Za-z]+/i],
];
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(
        "Lien symbolique exclu de la publication : " + relative(target, path),
      );
    if (entry.isDirectory()) {
      await scan(path);
      continue;
    }
    const bytes = await readFile(path);
    const name = relative(target, path).replaceAll("\\", "/");
    if (name === "docs/signing/SOURCE-MANIFEST.json") continue;
    if (
      /\.(?:exe|dll|pfx|p12|key|db|sqlite)$/i.test(name) ||
      /(?:^|\/)\.env(?:\.|$)/.test(name)
    )
      findings.push({ file: name, kind: "excluded-file-type" });
    if (
      /\.(?:ts|tsx|js|mjs|json|toml|yml|yaml|md|txt|rs|html|css|sql|xml)$/.test(
        name,
      )
    ) {
      const text = bytes.toString("utf8");
      for (const [kind, pattern] of patterns)
        if (pattern.test(text)) findings.push({ file: name, kind });
    }
    manifest.push({
      file: name,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
}
await scan(target);
manifest.sort((a, b) => a.file.localeCompare(b.file));
const report = {
  status: findings.length ? "review-required" : "ready-for-user-review",
  published: false,
  licenseApplied: true,
  files: manifest.length,
  totalBytes: manifest.reduce((n, v) => n + v.bytes, 0),
  findings,
  manifest,
};
await writeFile(
  resolve("docs/signing/SOURCE-MANIFEST.json"),
  JSON.stringify(report, null, 2) + "\n",
);
await writeFile(
  join(target, "docs/signing/SOURCE-MANIFEST.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      status: report.status,
      files: report.files,
      totalBytes: report.totalBytes,
      findings,
    },
    null,
    2,
  ),
);
if (findings.length) process.exitCode = 1;

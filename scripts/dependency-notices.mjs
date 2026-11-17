import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { desktopEnvironment } from "./desktop-environment.mjs";

export const TARGET = "x86_64-pc-windows-msvc";
export const NOTICES_DIR = "src-tauri/notices";
const NOTICES_FILE = "THIRD_PARTY_NOTICES.txt";
const INVENTORY_FILE = "inventory.json";
const SUPPLEMENTS_LOCK = "supplements.lock.json";
const INPUTS = [
  "LICENSE",
  "package-lock.json",
  "src-tauri/Cargo.lock",
  `${NOTICES_DIR}/${SUPPLEMENTS_LOCK}`,
];
// Build tools whose own code ends up in the shipped interface.
const BUILD_OUTPUT = {
  tailwindcss: "styles de base et thème générés dans le CSS de l'interface",
  vite: "code d'exécution injecté dans l'interface par le bundler",
};
const CRATES_IO = "registry+https://github.com/rust-lang/crates.io-index";
const LICENSE_NAME =
  /^(?:licen[cs]e|copying|notice|copyright|unlicense)(?:[-._ ].*)?$/i;
const SAFE_SEGMENT = /^[A-Za-z0-9_.+-]+$/;

export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
// Tracked text inputs may change line endings on checkout (core.autocrlf).
const inputDigest = (bytes) =>
  sha256(Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n")));
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const byNameVersion = (a, b) =>
  byText(a.name, b.name) || byText(a.version, b.version);
const safeSegment = (value) =>
  typeof value === "string" &&
  SAFE_SEGMENT.test(value) &&
  value !== "." &&
  value !== "..";

/** Crates linked into the program: normal edges only, without proc-macros. */
export function linkedCrates(metadata) {
  const packages = new Map(metadata.packages.map((p) => [p.id, p]));
  const nodes = new Map(metadata.resolve.nodes.map((n) => [n.id, n]));
  const procMacro = (p) => p.targets.some((t) => t.kind.includes("proc-macro"));
  const linked = new Set();
  const queue = [metadata.resolve.root];
  while (queue.length) {
    for (const dep of nodes.get(queue.pop()).deps) {
      const pkg = packages.get(dep.pkg);
      if (
        linked.has(dep.pkg) ||
        procMacro(pkg) ||
        !dep.dep_kinds.some((k) => k.kind === null)
      )
        continue;
      if (pkg.source !== CRATES_IO)
        throw new Error(
          `Crate hors crates.io non prise en charge : ${pkg.name}`,
        );
      linked.add(dep.pkg);
      queue.push(dep.pkg);
    }
  }
  return [...linked].map((id) => packages.get(id)).sort(byNameVersion);
}

/** npm packages that can reach the bundle: production tree plus build output. */
export function productionPackages(lock) {
  const selected = [];
  for (const [path, info] of Object.entries(lock.packages ?? {})) {
    if (!path.startsWith("node_modules/") || info.dev || info.devOptional)
      continue;
    const name = path.slice(path.lastIndexOf("node_modules/") + 13);
    selected.push({ name, version: info.version, license: info.license, path });
  }
  for (const [name, role] of Object.entries(BUILD_OUTPUT)) {
    const path = `node_modules/${name}`;
    const info = lock.packages?.[path];
    if (!info)
      throw new Error(`Outil de compilation absent du verrou npm : ${name}`);
    selected.push({
      name,
      version: info.version,
      license: info.license,
      path,
      role,
    });
  }
  return selected.sort(byNameVersion);
}

export async function licenseFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const names = entries
    .filter((e) => e.isFile() && LICENSE_NAME.test(e.name))
    .map((e) => e.name)
    .sort(byText);
  return Promise.all(
    names.map(async (name) => ({
      name,
      bytes: await readFile(join(dir, name)),
    })),
  );
}

export function validateSupplements(records) {
  if (!Array.isArray(records))
    throw new Error("Verrou des compléments invalide.");
  for (const r of records) {
    const url = r.url ? new URL(r.url) : null;
    const pinnedUrl =
      url &&
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash;
    const member =
      typeof r.member === "string" &&
      r.member.split("/").every((part) => safeSegment(part));
    const valid =
      safeSegment(r.package) &&
      safeSegment(r.version) &&
      safeSegment(r.file) &&
      /^[a-f0-9]{64}$/.test(r.sha256) &&
      typeof r.reason === "string" &&
      r.reason.length > 0 &&
      ((r.type === "github" &&
        pinnedUrl &&
        url.hostname === "raw.githubusercontent.com" &&
        /^\/[^/]+\/[^/]+\/[a-f0-9]{40}\/.+/.test(url.pathname)) ||
        (r.type === "nuget" &&
          pinnedUrl &&
          url.hostname === "www.nuget.org" &&
          /^\/api\/v2\/package\/[A-Za-z0-9_.-]+\/[0-9][A-Za-z0-9_.-]*$/.test(
            url.pathname,
          ) &&
          /^[a-f0-9]{64}$/.test(r.archiveSha256) &&
          member) ||
        (r.type === "toolchain" &&
          !r.url &&
          safeSegment(r.toolchain) &&
          member));
    if (!valid)
      throw new Error(
        `Complément de licence non verrouillé : ${r.package}/${r.file}`,
      );
  }
}

const supplementRelative = (r) =>
  `supplements/${r.package}-${r.version}/${r.file}`;

export async function loadSupplements(noticesDir, records, fetcher) {
  validateSupplements(records);
  const loaded = [];
  for (const record of records) {
    const path = join(noticesDir, ...supplementRelative(record).split("/"));
    let bytes;
    try {
      bytes = await readFile(path);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (!bytes || sha256(bytes) !== record.sha256) {
      if (!fetcher)
        throw new Error(
          `Complément de licence absent ou altéré : ${record.package}/${record.file}`,
        );
      bytes = Buffer.from(await fetcher(record));
      if (sha256(bytes) !== record.sha256)
        throw new Error(
          `Empreinte incorrecte : ${record.package}/${record.file}`,
        );
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    }
    loaded.push({ ...record, bytes });
  }
  return loaded;
}

/** Attach supplements, refuse any component without licence text, render. */
export function buildNotices({ appLicense, npm, crates, supplements }) {
  const standalone = [];
  for (const s of supplements) {
    const file = {
      name: s.file,
      bytes: s.bytes,
      origin: s.reason,
      inline: s.inline !== false,
      path: supplementRelative(s),
    };
    if (s.standalone) {
      let entry = standalone.find(
        (e) => e.name === s.title && e.version === s.version,
      );
      if (!entry) {
        entry = {
          ecosystem: "complément",
          name: s.title,
          version: s.version,
          license: s.license,
          source: s.source,
          files: [],
        };
        standalone.push(entry);
      }
      entry.files.push(file);
      continue;
    }
    const target = crates.find(
      (c) => c.name === s.package && c.version === s.version,
    );
    if (!target)
      throw new Error(
        `Complément sans crate correspondante : ${s.package} ${s.version}`,
      );
    target.files = [...target.files, file];
  }
  const sections = [
    ["Interface — paquets npm intégrés au bundle", npm],
    [`Programme — crates Rust liées à audioforge.exe (${TARGET})`, crates],
    ["Compléments intégrés au programme", standalone],
  ];
  for (const [, entries] of sections)
    for (const e of entries)
      if (!e.files.length)
        throw new Error(
          `Licence introuvable pour ${e.name} ${e.version} : ajouter un complément verrouillé.`,
        );

  const rule = "=".repeat(78);
  const lines = [
    "AudioForge — licences et notices des composants intégrés",
    rule,
    "",
    "Ce fichier reproduit les licences des bibliothèques compilées dans",
    "audioforge.exe ou intégrées à son interface. Il est généré par",
    "scripts/dependency-notices.mjs à partir de package-lock.json,",
    "src-tauri/Cargo.lock et src-tauri/notices/supplements.lock.json.",
    "",
    "yt-dlp, FFmpeg/ffprobe et Deno sont des programmes séparés : leurs",
    "licences figurent dans le dossier binaries/licenses.",
    "",
    "Les sources de chaque composant sont disponibles à l'adresse indiquée",
    "(crates.io ou registre npm, version exacte).",
    "",
    `Composants : ${npm.length} paquets npm, ${crates.length} crates Rust, ${standalone.length} composant(s) complémentaire(s).`,
    "",
    rule,
    "AudioForge — code propre",
    rule,
    "",
    appLicense.toString("utf8"),
  ];
  const seen = new Map();
  for (const [title, entries] of sections) {
    lines.push("", rule, title, rule);
    for (const e of entries) {
      const label = `${e.name} ${e.version}`;
      lines.push("", "-".repeat(78), label);
      lines.push(`Licence déclarée : ${e.license || "non déclarée"}`);
      if (e.role) lines.push(`Rôle : ${e.role}`);
      if (e.source) lines.push(`Source : ${e.source}`);
      if (e.repository) lines.push(`Dépôt : ${e.repository}`);
      for (const f of e.files) {
        const digest = sha256(f.bytes);
        const origin = f.origin ? ` — ${f.origin}` : "";
        if (f.inline === false) {
          lines.push("", `[${f.name}]${origin}`);
          lines.push(`Fichier joint : ${f.path} (SHA-256 ${digest})`);
        } else if (seen.has(digest)) {
          lines.push(
            "",
            `[${f.name}] Texte identique à ${seen.get(digest)}, reproduit plus haut (SHA-256 ${digest}).`,
          );
        } else {
          seen.set(digest, `${label} / ${f.name}`);
          lines.push("", `[${f.name}]${origin}`, "");
          lines.push(f.bytes.toString("utf8").replace(/^﻿/, ""));
        }
      }
    }
  }
  const text = lines.join("\n") + "\n";
  const packages = sections.flatMap(([, entries]) =>
    entries.map((e) => ({
      ecosystem: e.ecosystem,
      name: e.name,
      version: e.version,
      license: e.license ?? "",
      files: e.files.map((f) => ({
        name: f.name,
        sha256: sha256(f.bytes),
        ...(f.origin ? { origin: f.origin } : {}),
      })),
    })),
  );
  return {
    text,
    packages,
    counts: {
      npm: npm.length,
      cargo: crates.length,
      supplements: supplements.length,
    },
  };
}

export async function writeDependencyNotices(root, built) {
  const dir = join(root, NOTICES_DIR);
  const inputs = {};
  for (const path of INPUTS)
    inputs[path] = inputDigest(await readFile(join(root, path)));
  const notices = Buffer.from(built.text, "utf8");
  const inventory = {
    generator: "scripts/dependency-notices.mjs",
    target: TARGET,
    inputs,
    notices: { file: NOTICES_FILE, sha256: sha256(notices) },
    counts: built.counts,
    packages: built.packages,
  };
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, NOTICES_FILE), notices);
  await writeFile(
    join(dir, INVENTORY_FILE),
    JSON.stringify(inventory, null, 2) + "\n",
  );
  return inventory;
}

async function listFiles(dir, base = dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
  const files = [];
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isDirectory()) files.push(...(await listFiles(path, base)));
    else files.push(relative(base, path).replaceAll("\\", "/"));
  }
  return files;
}

/** Offline check used before distribution: notices match the current locks. */
export async function verifyDependencyNotices(root) {
  const dir = join(root, NOTICES_DIR);
  const stale = "exécuter npm run notices:deps";
  let inventory;
  try {
    inventory = JSON.parse(await readFile(join(dir, INVENTORY_FILE), "utf8"));
  } catch {
    throw new Error(`Notices des dépendances absentes : ${stale}.`);
  }
  const recorded = Object.keys(inventory.inputs ?? {})
    .sort(byText)
    .join();
  if (recorded !== [...INPUTS].sort(byText).join())
    throw new Error(`Inventaire des notices incomplet : ${stale}.`);
  for (const path of INPUTS)
    if (
      inputDigest(await readFile(join(root, path))) !== inventory.inputs[path]
    )
      throw new Error(
        `Notices des dépendances périmées (${path} modifié) : ${stale}.`,
      );
  const notices = await readFile(join(dir, NOTICES_FILE));
  if (sha256(notices) !== inventory.notices?.sha256)
    throw new Error(`${NOTICES_FILE} altéré : ${stale}.`);
  const records = JSON.parse(
    await readFile(join(dir, SUPPLEMENTS_LOCK), "utf8"),
  );
  await loadSupplements(dir, records);
  const expected = new Set(records.map((r) => supplementRelative(r)));
  for (const file of await listFiles(join(dir, "supplements"), dir))
    if (!expected.has(file))
      throw new Error(`Complément non verrouillé : ${file}`);
  return inventory;
}

async function fetchSupplement(record, env) {
  if (record.type === "toolchain") {
    const version = execFileSync("rustc", ["--version"], {
      env,
      encoding: "utf8",
    });
    if (!version.startsWith(`rustc ${record.toolchain} `))
      throw new Error(
        `Toolchain Rust ${record.toolchain} requise pour ${record.file}.`,
      );
    const sysroot = execFileSync("rustc", ["--print", "sysroot"], {
      env,
      encoding: "utf8",
    }).trim();
    return readFile(join(sysroot, ...record.member.split("/")));
  }
  const response = await fetch(record.url);
  if (!response.ok)
    throw new Error(
      `Téléchargement refusé (${response.status}) : ${record.url}`,
    );
  const bytes = Buffer.from(await response.arrayBuffer());
  if (record.type === "github") return bytes;
  if (sha256(bytes) !== record.archiveSha256)
    throw new Error(`Empreinte d'archive incorrecte : ${record.url}`);
  const member = unzipSync(bytes, { filter: (f) => f.name === record.member })[
    record.member
  ];
  if (!member)
    throw new Error(`Fichier absent de l'archive : ${record.member}`);
  return member;
}

async function generate(root) {
  const env = desktopEnvironment(process.env, root);
  const dir = join(root, NOTICES_DIR);
  const records = JSON.parse(
    await readFile(join(dir, SUPPLEMENTS_LOCK), "utf8"),
  );
  const supplements = await loadSupplements(dir, records, (r) =>
    fetchSupplement(r, env),
  );
  const metadata = JSON.parse(
    execFileSync(
      "cargo",
      [
        "metadata",
        "--format-version",
        "1",
        "--manifest-path",
        join(root, "src-tauri", "Cargo.toml"),
        "--filter-platform",
        TARGET,
        "--locked",
      ],
      { env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
    ),
  );
  const crates = await Promise.all(
    linkedCrates(metadata).map(async (p) => ({
      ecosystem: "cargo",
      name: p.name,
      version: p.version,
      license: p.license ?? "",
      repository: p.repository ?? "",
      source: `https://crates.io/crates/${p.name}/${p.version}`,
      files: await licenseFiles(dirname(p.manifest_path)),
    })),
  );
  const lock = JSON.parse(
    await readFile(join(root, "package-lock.json"), "utf8"),
  );
  const npm = await Promise.all(
    productionPackages(lock).map(async (p) => {
      const pkgDir = join(root, ...p.path.split("/"));
      const manifest = JSON.parse(
        await readFile(join(pkgDir, "package.json"), "utf8"),
      );
      if (manifest.version !== p.version)
        throw new Error(
          `node_modules diffère du verrou pour ${p.name} : exécuter npm ci.`,
        );
      const repository =
        typeof manifest.repository === "string"
          ? manifest.repository
          : (manifest.repository?.url ?? "");
      return {
        ecosystem: "npm",
        name: p.name,
        version: p.version,
        license: p.license ?? manifest.license ?? "",
        role: p.role,
        repository,
        source: `https://www.npmjs.com/package/${p.name}/v/${p.version}`,
        files: await licenseFiles(pkgDir),
      };
    }),
  );
  const built = buildNotices({
    appLicense: await readFile(join(root, "LICENSE")),
    npm,
    crates,
    supplements,
  });
  const inventory = await writeDependencyNotices(root, built);
  console.log(
    JSON.stringify(
      { ...inventory.counts, notices: inventory.notices },
      null,
      2,
    ),
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const command = process.argv[2];
  if (command === "generate") await generate(root);
  else if (command === "verify") {
    const inventory = await verifyDependencyNotices(root);
    console.log(`Notices à jour : ${JSON.stringify(inventory.counts)}`);
  } else {
    console.error(
      "Usage : node scripts/dependency-notices.mjs generate|verify",
    );
    process.exitCode = 2;
  }
}

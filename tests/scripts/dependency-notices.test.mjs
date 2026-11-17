import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildNotices,
  licenseFiles,
  linkedCrates,
  loadSupplements,
  productionPackages,
  validateSupplements,
  verifyDependencyNotices,
  writeDependencyNotices,
} from "../../scripts/dependency-notices.mjs";

const CRATES_IO = "registry+https://github.com/rust-lang/crates.io-index";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pkg = (name, kind = "lib") => ({
  id: name,
  name,
  version: "1.0.0",
  license: "MIT",
  source: name === "app" ? null : CRATES_IO,
  manifest_path: `/crates/${name}/Cargo.toml`,
  targets: [{ kind: [kind] }],
});
const edge = (name, kind = null) => ({ pkg: name, dep_kinds: [{ kind }] });
const metadata = {
  packages: [
    pkg("app"),
    pkg("a"),
    pkg("b"),
    pkg("shared"),
    pkg("pm", "proc-macro"),
    pkg("macro-only"),
    pkg("build-only"),
    pkg("dev-only"),
  ],
  resolve: {
    root: "app",
    nodes: [
      {
        id: "app",
        deps: [
          edge("a"),
          edge("pm"),
          edge("build-only", "build"),
          edge("dev-only", "dev"),
        ],
      },
      { id: "a", deps: [edge("b"), edge("shared")] },
      { id: "pm", deps: [edge("macro-only"), edge("shared")] },
      ...["b", "shared", "macro-only", "build-only", "dev-only"].map((id) => ({
        id,
        deps: [],
      })),
    ],
  },
};
const mit = Buffer.from("MIT License\nCopyright (c) Example\n");
const entry = (name, files) => ({
  ecosystem: "cargo",
  name,
  version: "1.0.0",
  license: "MIT",
  files,
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "audioforge-deps-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("seules les crates liées au programme sont retenues", () => {
  assert.deepEqual(
    linkedCrates(metadata).map((p) => p.name),
    ["a", "b", "shared"],
  );
  const git = structuredClone(metadata);
  git.packages[1].source = "git+https://example.invalid/a";
  assert.throws(() => linkedCrates(git), /hors crates.io/);
});

test("les paquets npm de développement sont exclus, le code généré par les outils inclus", () => {
  const lock = {
    packages: {
      "": {},
      "node_modules/react": { version: "19.0.0", license: "MIT" },
      "node_modules/vitest": { version: "5.0.0", dev: true },
      "node_modules/vite": { version: "8.0.0", dev: true, license: "MIT" },
      "node_modules/tailwindcss": {
        version: "4.0.0",
        dev: true,
        license: "MIT",
      },
      "node_modules/react/node_modules/scheduler": { version: "0.1.0" },
    },
  };
  assert.deepEqual(
    productionPackages(lock).map((p) => p.name),
    ["react", "scheduler", "tailwindcss", "vite"],
  );
  assert.throws(
    () => productionPackages({ packages: {} }),
    /Outil de compilation absent/,
  );
});

test("les fichiers de licence sont lus à la racine du paquet uniquement", async (t) => {
  const dir = await fixture(t);
  await writeFile(join(dir, "LICENSE-MIT"), mit);
  await writeFile(join(dir, "README.md"), "readme");
  await mkdir(join(dir, "docs"));
  await writeFile(join(dir, "docs", "LICENSE"), "nested");
  assert.deepEqual(
    (await licenseFiles(dir)).map((f) => f.name),
    ["LICENSE-MIT"],
  );
});

test("une crate sans licence bloque la génération ; les textes identiques sont regroupés", () => {
  const input = () => ({
    appLicense: Buffer.from("AudioForge MIT\n"),
    npm: [],
    crates: [
      entry("a", [{ name: "LICENSE", bytes: mit }]),
      entry("b", [{ name: "LICENSE", bytes: mit }]),
      entry("c", []),
    ],
    supplements: [],
  });
  assert.throws(
    () => buildNotices(input()),
    /Licence introuvable pour c 1.0.0/,
  );
  const supplement = {
    package: "c",
    version: "1.0.0",
    file: "LICENSE",
    bytes: mit,
    reason: "texte amont",
  };
  const first = buildNotices({ ...input(), supplements: [supplement] });
  const second = buildNotices({ ...input(), supplements: [supplement] });
  assert.equal(first.text, second.text);
  assert.equal(first.text.split("Copyright (c) Example").length - 1, 1);
  assert.match(first.text, /Texte identique à a 1.0.0 \/ LICENSE/);
  assert.throws(
    () =>
      buildNotices({
        ...input(),
        supplements: [{ ...supplement, package: "absente" }],
      }),
    /sans crate correspondante/,
  );
});

test("les compléments exigent une source immuable et un nom de fichier sûr", () => {
  const base = {
    package: "c",
    version: "1.0.0",
    file: "LICENSE",
    type: "github",
    url: `https://raw.githubusercontent.com/o/r/${"a".repeat(40)}/LICENSE`,
    sha256: "b".repeat(64),
    reason: "texte amont",
  };
  validateSupplements([base]);
  for (const bad of [
    { url: "https://raw.githubusercontent.com/o/r/main/LICENSE" },
    { url: "https://example.com/o/r/" + "a".repeat(40) + "/LICENSE" },
    { file: ".." },
    { package: "../x" },
    { sha256: "absent" },
    {
      type: "nuget",
      url: "https://www.nuget.org/api/v2/package/Example/1.0.0",
      archiveSha256: "c".repeat(64),
      member: "../LICENSE.txt",
    },
  ])
    assert.throws(
      () => validateSupplements([{ ...base, ...bad }]),
      /non verrouillé/,
    );
});

test("un complément altéré est refusé hors ligne puis restauré avec son empreinte", async (t) => {
  const dir = await fixture(t);
  const record = {
    package: "c",
    version: "1.0.0",
    file: "LICENSE",
    type: "github",
    url: `https://raw.githubusercontent.com/o/r/${"a".repeat(40)}/LICENSE`,
    sha256: digest(mit),
    reason: "texte amont",
  };
  await assert.rejects(loadSupplements(dir, [record]), /absent ou altéré/);
  await loadSupplements(dir, [record], async () => mit);
  await writeFile(join(dir, "supplements/c-1.0.0/LICENSE"), "altéré");
  await assert.rejects(loadSupplements(dir, [record]), /absent ou altéré/);
  await assert.rejects(
    loadSupplements(dir, [record], async () => Buffer.from("autre texte")),
    /Empreinte incorrecte/,
  );
});

test("la vérification détecte des verrous modifiés, accepte les fins de ligne CRLF", async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, "src-tauri/notices"), { recursive: true });
  await writeFile(join(root, "LICENSE"), "AudioForge MIT\n");
  await writeFile(join(root, "package-lock.json"), "{}\n");
  await writeFile(join(root, "src-tauri/Cargo.lock"), "version = 4\n");
  await writeFile(
    join(root, "src-tauri/notices/supplements.lock.json"),
    "[]\n",
  );
  const built = buildNotices({
    appLicense: Buffer.from("AudioForge MIT\n"),
    npm: [],
    crates: [entry("a", [{ name: "LICENSE", bytes: mit }])],
    supplements: [],
  });
  await writeDependencyNotices(root, built);
  await verifyDependencyNotices(root);

  await writeFile(join(root, "src-tauri/Cargo.lock"), "version = 4\r\n");
  await verifyDependencyNotices(root);

  await writeFile(join(root, "src-tauri/Cargo.lock"), "version = 5\n");
  await assert.rejects(
    verifyDependencyNotices(root),
    /périmées \(src-tauri\/Cargo.lock modifié\)/,
  );
  await writeFile(join(root, "src-tauri/Cargo.lock"), "version = 4\n");

  const notices = join(root, "src-tauri/notices/THIRD_PARTY_NOTICES.txt");
  const original = await readFile(notices);
  await writeFile(notices, "altéré");
  await assert.rejects(verifyDependencyNotices(root), /altéré/);
  await writeFile(notices, original);

  await mkdir(join(root, "src-tauri/notices/supplements/x-1.0.0"), {
    recursive: true,
  });
  await writeFile(
    join(root, "src-tauri/notices/supplements/x-1.0.0/LICENSE"),
    mit,
  );
  await assert.rejects(
    verifyDependencyNotices(root),
    /Complément non verrouillé/,
  );
});

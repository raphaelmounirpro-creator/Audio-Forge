import { mkdir, readFile, writeFile, readdir, cp } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { createHash } from "node:crypto";
const source = resolve(".local/sandbox/output");
const candidates = (await readdir(source))
  .filter((name) => name.startsWith("build-"))
  .sort()
  .reverse();
let folder, result, smoke;
for (const candidate of candidates) {
  try {
    const value = JSON.parse(
      await readFile(join(source, candidate, "result.json"), "utf8"),
    );
    const installed = JSON.parse(
      await readFile(join(source, candidate, "installed-smoke.json"), "utf8"),
    );
    if (value.state === "built" && installed.status === "passed") {
      folder = join(source, candidate);
      result = value;
      smoke = installed;
      break;
    }
  } catch {}
}
if (!folder) throw new Error("Aucun build installé et vérifié dans Sandbox.");
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const destination = resolve("releases", version);
await mkdir(destination, { recursive: true });
const sums = [];
for (const item of result.installers) {
  if (basename(item.name) !== item.name)
    throw new Error("Nom d’artefact invalide.");
  const bytes = await readFile(join(folder, item.name));
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== item.sha256 || smoke.sha256 !== hash)
    throw new Error("Empreinte ou preuve d’installation incohérente.");
  const target = join(destination, item.name);
  await cp(join(folder, item.name), target);
  if (
    createHash("sha256")
      .update(await readFile(target))
      .digest("hex") !== hash
  )
    throw new Error("Copie de livraison altérée.");
  sums.push(hash + "  " + item.name);
  console.log(target);
}
await writeFile(join(destination, "SHA256SUMS.txt"), sums.join("\n") + "\n");
await cp(join(folder, "result.json"), join(destination, "build-result.json"));
await cp(
  join(folder, "installed-smoke.json"),
  join(destination, "installed-smoke.json"),
);
const log = (await readFile(join(folder, "build.log"), "utf8")).replace(
  /\u001b\[[0-9;]*m/g,
  "",
);
await writeFile(join(destination, "build.log"), log);
await writeFile(
  join(destination, "README.md"),
  `# AudioForge ${version} — version de développement locale\n\nInstallateur Windows x64 généré dans Windows Sandbox, empreinte vérifiée après copie. Installation et démarrage réellement contrôlés dans Sandbox ; composants et création de la base SQLite vérifiés.\n\nTests : 19 frontend, 14 Rust, un test d’intégration Rust couvrant cinq formats audio, tests des scripts et essais FFmpeg/multiplexage réussis. Consulter build.log pour les résultats exacts.\n\nLimites : aucune validation visuelle native ou de téléchargement complet depuis une plateforme ; version 1.0 incomplète. L’acceptation sur le PC hôte dépend de ses protections Windows, qui restent actives. Aucune signature d’éditeur n’est ajoutée. Les licences et sources correspondantes doivent être complétées avant toute distribution publique. Aucun hébergement ou publication effectué.\n\nLe fichier installed-smoke.json décrit précisément le contrôle d’installation effectué.\n`,
);

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncNotices } from "../../scripts/tool-notices.mjs";

const sources = [{ repository: "owner/tool", version: "1.0" }];
const bytes = Buffer.from("Official licence\n");
const record = {
  component: "owner/tool",
  version: "1.0",
  file: "LICENSE",
  url: `https://raw.githubusercontent.com/owner/tool/${"a".repeat(40)}/LICENSE`,
  sha256: createHash("sha256").update(bytes).digest("hex"),
};
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "audioforge-notices-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
test("une installation neuve reçoit les licences puis passe la vérification hors ligne", async (t) => {
  const root = await fixture(t);
  await syncNotices(root, sources, [record], async () => bytes);
  await syncNotices(root, sources, [record]);
  assert.deepEqual(
    await readFile(join(root, "licenses/owner-tool/LICENSE")),
    bytes,
  );
  await writeFile(join(root, "licenses/owner-tool/LICENSE"), "altéré");
  await assert.rejects(
    syncNotices(root, sources, [record]),
    /absente ou altérée/,
  );
});
test("une notice téléchargée altérée n’est jamais écrite", async (t) => {
  const root = await fixture(t);
  await assert.rejects(
    syncNotices(root, sources, [record], async () => Buffer.from("altéré")),
    /Empreinte/,
  );
  await assert.rejects(readFile(join(root, "licenses/owner-tool/LICENSE")), {
    code: "ENOENT",
  });
});
test("les fournisseurs inactifs sont exclus des ressources sans toucher les autres dossiers", async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, "licenses/BtbN-FFmpeg-Builds"), { recursive: true });
  await writeFile(
    join(root, "licenses/BtbN-FFmpeg-Builds/SOURCE.txt"),
    "ancien",
  );
  await writeFile(join(root, "keep.txt"), "conserver");
  await syncNotices(root, sources, [record], async () => bytes);
  assert.deepEqual(await readdir(join(root, "licenses")), ["owner-tool"]);
  assert.equal(await readFile(join(root, "keep.txt"), "utf8"), "conserver");
});
test("une provenance mobile, une version incompatible ou un chemin sortant sont refusés avant téléchargement", async (t) => {
  const root = await fixture(t);
  for (const change of [
    { url: record.url.replace("a".repeat(40), "main") },
    { version: "2.0" },
    { file: "../LICENSE" },
  ]) {
    await assert.rejects(
      syncNotices(root, sources, [{ ...record, ...change }], () =>
        assert.fail("Téléchargement interdit"),
      ),
      /Notice non verrouillée/,
    );
  }
});
